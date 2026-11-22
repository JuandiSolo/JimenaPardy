-- Migración: Agregar autenticación de moderador (patrón anónimo + RPC)
-- Ejecutar DESPUÉS de 001_init.sql

-- ============================================
-- HACER moderator_id NULLABLE (para crear partida sin moderador asignado)
-- ============================================

alter table public.games
  alter column moderator_id drop not null;

-- ============================================
-- TABLA DE MODERADORES (paralela a teams)
-- ============================================

create table public.moderators (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id),
  name text not null,
  password_hash text not null,
  active_device_token text,
  joined_at timestamptz not null default now(),
  unique (game_id, auth_user_id)
);

create index idx_moderators_game_id on public.moderators(game_id);

-- ============================================
-- RLS PARA MODERADORES
-- ============================================

alter table public.moderators enable row level security;

-- Lectura pública (para mostrar en UI si se necesita)
create policy "moderators_select_all" on public.moderators
  for select using (true);

-- Inserción: solo vía RPC moderator_login
-- Actualización: solo el propio moderador puede actualizar su device_token
create policy "moderators_update_own_device" on public.moderators
  for update using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- ============================================
-- RPC: Login de moderador (permite múltiples sesiones con mismo user/pass)
-- ============================================

create or replace function public.moderator_login(p_game_id uuid, p_name text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, extensions
as $$
declare
  v_moderator public.moderators%rowtype;
  v_game public.games%rowtype;
  v_existing_moderator public.moderators%rowtype;
begin
  -- Normalizar nombre
  p_name := trim(p_name);
  if p_name = '' or length(p_name) > 24 then
    return jsonb_build_object('success', false, 'error', 'Nombre inválido (1-24 chars)');
  end if;
  if p_password = '' or length(p_password) > 64 then
    return jsonb_build_object('success', false, 'error', 'Clave inválida');
  end if;

  -- Verificar que la partida existe
  select * into v_game from public.games where id = p_game_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Partida no encontrada');
  end if;

  -- Buscar moderador existente con este nombre Y auth_user_id (misma persona, mismo dispositivo)
  select * into v_moderator from public.moderators
  where game_id = p_game_id and name = p_name and auth_user_id = auth.uid();

  if found then
    -- Ya existe este moderador en este dispositivo: verificar clave
    if v_moderator.password_hash != extensions.crypt(p_password, v_moderator.password_hash) then
      return jsonb_build_object('success', false, 'error', 'Clave incorrecta');
    end if;
    return jsonb_build_object('success', true, 'moderator_id', v_moderator.id, 'name', v_moderator.name, 'is_new', false);
  end if;

  -- Buscar si existe ALGÚN moderador con este nombre en la partida (para validar clave)
  select * into v_existing_moderator from public.moderators
  where game_id = p_game_id and name = p_name
  limit 1;

  if found then
    -- Hay moderador(es) con este nombre: verificar clave contra el hash almacenado
    if v_existing_moderator.password_hash != extensions.crypt(p_password, v_existing_moderator.password_hash) then
      return jsonb_build_object('success', false, 'error', 'Clave incorrecta');
    end if;
    -- Clave correcta: crear nueva fila para ESTE auth_user_id (nuevo dispositivo/persona)
    insert into public.moderators (game_id, auth_user_id, name, password_hash)
    values (p_game_id, auth.uid(), p_name, v_existing_moderator.password_hash)
    returning * into v_moderator;

    -- Vincular moderador a la partida (actualizar moderator_id al último que entra)
    update public.games
    set moderator_id = auth.uid(),
        updated_at = now()
    where id = p_game_id;

    return jsonb_build_object('success', true, 'moderator_id', v_moderator.id, 'name', v_moderator.name, 'is_new', true);
  else
    -- Primer moderador con este nombre: crear con hash nuevo
    insert into public.moderators (game_id, auth_user_id, name, password_hash)
    values (p_game_id, auth.uid(), p_name, crypt(p_password, extensions.gen_salt('bf')))
    returning * into v_moderator;

    -- Vincular moderador a la partida
    update public.games
    set moderator_id = auth.uid(),
        updated_at = now()
    where id = p_game_id;

    return jsonb_build_object('success', true, 'moderator_id', v_moderator.id, 'name', v_moderator.name, 'is_new', true);
  end if;
end;
$$;

-- ============================================
-- RPC: Registrar/actualizar dispositivo activo del moderador
-- ============================================

create or replace function public.register_moderator_device(p_game_id uuid, p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moderator public.moderators%rowtype;
  v_old_token text;
begin
  select * into v_moderator from public.moderators where game_id = p_game_id and auth_user_id = auth.uid();
  if not found then
    raise exception 'No eres moderador de esta partida';
  end if;

  v_old_token := v_moderator.active_device_token;

  if v_old_token is not null and v_old_token != p_device_token then
    update public.moderators
    set active_device_token = p_device_token
    where id = v_moderator.id;
    return jsonb_build_object('replaced', true, 'message', 'Sesión anterior cerrada');
  else
    update public.moderators
    set active_device_token = p_device_token
    where id = v_moderator.id;
    return jsonb_build_object('replaced', false);
  end if;
end;
$$;

-- ============================================
-- ACTUALIZAR create_game: NO setear moderator_id al crear (NULL)
-- ============================================

create or replace function public.create_game()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_game_id uuid;
begin
  -- Crear partida SIN moderator_id (se asigna en moderator_login)
  insert into public.games (moderator_id, phase)
  values (null, 'idle')
  returning id into new_game_id;

  -- Crear 25 casillas base (5 categorías × 5 valores)
  insert into public.clues (game_id, category, column_index, value, question_text, is_daily_double)
  select
    new_game_id,
    cat.category,
    cat.col_idx,
    val.value,
    '',
    case when val.value in (600, 800) and random() < 0.1 then true else false end
  from (
    values
      ('Edible Rhyme Time', 0),
      ('Books in German', 1),
      ('3 "T"s', 2),
      ('Chop Chop!', 3),
      ('They said it would not last', 4)
  ) as cat(category, col_idx)
  cross join (
    values (200), (400), (600), (800), (1000)
  ) as val(value)
  on conflict do nothing;

  -- Asegurar exactamente 1 Daily Double en $600 o $800
  with dd_candidate as (
    select id from public.clues
    where game_id = new_game_id and value in (600, 800)
    order by random()
    limit 1
  )
  update public.clues
  set is_daily_double = case when id in (select id from dd_candidate) then true else false end
  where game_id = new_game_id and value in (600, 800);

  return new_game_id;
end;
$$;

-- ============================================
-- GRANTS
-- ============================================

grant usage on schema public to anon, authenticated;
grant select on public.moderators to anon, authenticated;
grant update on public.games, public.moderators to authenticated;
grant execute on function public.moderator_login to authenticated;
grant execute on function public.register_moderator_device to authenticated;