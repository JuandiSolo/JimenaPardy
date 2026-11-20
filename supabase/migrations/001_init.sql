-- Habilitar extensiones necesarias
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLAS PRINCIPALES
-- ============================================

-- Partidas
create table public.games (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references auth.users(id),
  state jsonb not null default '{}'::jsonb,
  current_clue_id uuid,
  phase text not null default 'idle', -- idle, blocked, open, won, wrong, correct, chooseDouble, awaitWager, doubleReady
  winner_team_id uuid,
  double_team_id uuid,
  wager_amount integer,
  wager_cap integer,
  release_generation integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Equipos (máx 5 por partida)
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id),
  name text not null,
  score integer not null default 0,
  active_device_token text, -- token único del dispositivo activo
  joined_at timestamptz not null default now(),
  unique (game_id, auth_user_id)
);

-- Índice para consultar equipos de una partida ordenados
create index idx_teams_game_id on public.teams(game_id);

-- Casillas / Preguntas
create table public.clues (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  category text not null,
  column_index integer not null check (column_index >= 0 and column_index <= 4),
  value integer not null check (value in (400, 600, 800, 1000)),
  question_text text not null default '',
  is_daily_double boolean not null default false,
  state text not null default 'available', -- available, playing, used
  created_at timestamptz not null default now(),
  unique (game_id, column_index, value)
);

-- Intentos / Eventos de puntuación (para evitar doble puntuación)
create table public.score_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  clue_id uuid not null references public.clues(id) on delete cascade,
  attempt_number integer not null default 1,
  verdict text not null check (verdict in ('correct', 'incorrect')),
  points_delta integer not null,
  created_at timestamptz not null default now(),
  unique (game_id, clue_id, attempt_number)
);

-- Log de ediciones manuales de puntaje por el moderador
create table public.score_edits (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  moderator_id uuid not null references auth.users(id),
  old_score integer not null,
  new_score integer not null,
  reason text,
  created_at timestamptz not null default now()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.games enable row level security;
alter table public.teams enable row level security;
alter table public.clues enable row level security;
alter table public.score_events enable row level security;
alter table public.score_edits enable row level security;

-- Políticas: juegos
create policy "games_select_all" on public.games
  for select using (true);

create policy "games_insert_moderator" on public.games
  for insert with check (auth.uid() = moderator_id);

create policy "games_update_moderator" on public.games
  for update using (auth.uid() = moderator_id);

-- Políticas: equipos
create policy "teams_select_all" on public.teams
  for select using (true);

create policy "teams_insert_captain" on public.teams
  for insert with check (
    auth.uid() = auth_user_id
    and (
      select count(*) from public.teams where game_id = new.game_id
    ) < 5
  );

create policy "teams_update_own" on public.teams
  for update using (auth.uid() = auth_user_id);

-- Políticas: pistas (lectura pública limitada, escritura solo moderador)
create policy "clues_select_public" on public.clues
  for select using (true);

create policy "clues_all_moderator" on public.clues
  for all using (
    exists (
      select 1 from public.games
      where games.id = clues.game_id
      and games.moderator_id = auth.uid()
    )
  );

-- Políticas: eventos de puntuación
create policy "score_events_select_all" on public.score_events
  for select using (true);

create policy "score_events_insert_server" on public.score_events
  for insert with check (true); -- se inserta vía RPC

-- Políticas: ediciones de puntaje
create policy "score_edits_select_all" on public.score_edits
  for select using (true);

create policy "score_edits_insert_moderator" on public.score_edits
  for insert with check (
    exists (
      select 1 from public.games
      where games.id = score_edits.game_id
      and games.moderator_id = auth.uid()
    )
  );

-- ============================================
-- FUNCIONES RPC (SECURITY DEFINER)
-- ============================================

-- Crear partida (solo moderador autenticado)
create or replace function public.create_game()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_game_id uuid;
begin
  insert into public.games (moderator_id, phase)
  values (auth.uid(), 'idle')
  returning id into new_game_id;

  -- Crear 20 casillas base (5 categorías × 4 valores)
  insert into public.clues (game_id, category, column_index, value, question_text, is_daily_double)
  select
    new_game_id,
    cat.category,
    cat.col_idx,
    val.value,
    '',
    case when val.value in (600, 800) and random() < 0.125 then true else false end -- ~1/8 por casilla $600/$800
  from (
    values
      ('Edible Rhyme Time', 0),
      ('Books in German', 1),
      ('3 "T"s', 2),
      ('Chop Chop!', 3),
      ('They said it would not last', 4)
  ) as cat(category, col_idx)
  cross join (
    values (400), (600), (800), (1000)
  ) as val(value)
  on conflict do nothing;

  -- Asegurar exactamente 1 Daily Double en $600 o $800
  -- Si no salió ninguno, poner uno aleatorio; si salieron varios, dejar solo uno
  update public.clues
  set is_daily_double = false
  where game_id = new_game_id and is_daily_double = true
  and id not in (
    select id from public.clues
    where game_id = new_game_id and value in (600, 800) and is_daily_double = true
    order by random()
    limit 1
  );

  -- Si no hay ninguno, crear uno
  if not exists (
    select 1 from public.clues
    where game_id = new_game_id and is_daily_double = true
  ) then
    update public.clues
    set is_daily_double = true
    where game_id = new_game_id and value in (600, 800)
    order by random()
    limit 1;
  end if;

  return new_game_id;
end;
$$;

-- Seleccionar casilla (moderador)
create or replace function public.select_clue(p_game_id uuid, p_clue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_clue public.clues%rowtype;
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.moderator_id != auth.uid() then
    raise exception 'No autorizado';
  end if;

  if v_game.phase != 'idle' then
    raise exception 'Ya hay una pregunta en curso';
  end if;

  select * into v_clue from public.clues where id = p_clue_id and game_id = p_game_id;
  if not found then
    raise exception 'Casilla no encontrada';
  end if;

  if v_clue.state != 'available' then
    raise exception 'Casilla no disponible';
  end if;

  -- Actualizar casilla y partida
  update public.clues set state = 'playing' where id = p_clue_id;
  update public.games
  set current_clue_id = p_clue_id,
      phase = case when v_clue.is_daily_double then 'chooseDouble' else 'blocked' end,
      winner_team_id = null,
      double_team_id = null,
      wager_amount = null,
      wager_cap = null,
      release_generation = release_generation + 1,
      updated_at = now()
  where id = p_game_id;

  return jsonb_build_object(
    'clue', row_to_json(v_clue),
    'phase', case when v_clue.is_daily_double then 'chooseDouble' else 'blocked' end,
    'release_generation', v_game.release_generation + 1
  );
end;
$$;

-- Cancelar selección sin gastar pregunta (moderador)
create or replace function public.cancel_clue(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_clue public.clues%rowtype;
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.moderator_id != auth.uid() then
    raise exception 'No autorizado';
  end if;

  if v_game.current_clue_id is null then
    raise exception 'No hay pregunta seleccionada';
  end if;

  if v_game.phase in ('won', 'correct', 'doubleReady') then
    raise exception 'Ya se calificó una respuesta, no se puede cancelar';
  end if;

  select * into v_clue from public.clues where id = v_game.current_clue_id;
  if found then
    update public.clues set state = 'available' where id = v_game.current_clue_id;
  end if;

  update public.games
  set current_clue_id = null,
      phase = 'idle',
      winner_team_id = null,
      double_team_id = null,
      wager_amount = null,
      wager_cap = null,
      release_generation = release_generation + 1,
      updated_at = now()
  where id = p_game_id;
end;
$$;

-- Liberar buzzer (moderador)
create or replace function public.release_buzzer(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_clue public.clues%rowtype;
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.moderator_id != auth.uid() then
    raise exception 'No autorizado';
  end if;

  if v_game.current_clue_id is null then
    raise exception 'No hay pregunta seleccionada';
  end if;

  if v_game.phase not in ('blocked', 'awaitWager') then
    raise exception 'Buzzer no se puede liberar en esta fase';
  end if;

  if v_game.phase = 'awaitWager' then
    -- Para Daily Double: abrir formulario de apuesta en el celular del equipo asignado
    update public.games
    set phase = 'awaitWager',
        updated_at = now()
    where id = p_game_id;
    return jsonb_build_object('phase', 'awaitWager');
  end if;

  update public.games
  set phase = 'open',
      updated_at = now()
  where id = p_game_id;

  return jsonb_build_object('phase', 'open', 'release_generation', v_game.release_generation);
end;
$$;

-- Pulsar buzzer (capitán) - ADJUDICACIÓN ATÓMICA
create or replace function public.buzz(p_game_id uuid, p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_team public.teams%rowtype;
  v_clue public.clues%rowtype;
  v_cooldown interval := '100 milliseconds';
  v_last_buzz timestamptz;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Partida no encontrada');
  end if;

  -- Verificar dispositivo activo
  select * into v_team from public.teams
  where game_id = p_game_id and active_device_token = p_device_token and auth_user_id = auth.uid();
  if not found then
    return jsonb_build_object('success', false, 'error', 'Dispositivo no autorizado o sesión reemplazada');
  end if;

  if v_game.current_clue_id is null then
    return jsonb_build_object('success', false, 'error', 'No hay pregunta activa');
  end if;

  select * into v_clue from public.clues where id = v_game.current_clue_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Casilla no encontrada');
  end if;

  -- Verificar fase
  if v_game.phase = 'blocked' then
    -- Pulsación anticipada: feedback local, no queda en cola
    return jsonb_build_object('success', false, 'error', 'El moderador no ha terminado de hablar', 'early', true);
  end if;

  if v_game.phase not in ('open', 'wrong') then
    return jsonb_build_object('success', false, 'error', 'Buzzer no disponible en esta fase');
  end if;

  -- Bloqueo de fila para adjudicación atómica
  lock table public.games in row exclusive mode;

  -- Releer bajo bloqueo
  select * into v_game from public.games where id = p_game_id;

  -- Verificar que la fase sigue vigente y no hay ganador
  if v_game.phase not in ('open', 'wrong') or v_game.winner_team_id is not null then
    return jsonb_build_object('success', false, 'error', 'Buzzer ya adjudicado o fase cambiada');
  end if;

  -- Verificar cooldown 100ms en servidor (tabla auxiliar o último intento)
  -- Usamos score_events para ver último intento de este equipo en esta casilla
  select max(created_at) into v_last_buzz
  from public.score_events
  where game_id = p_game_id and team_id = v_team.id and clue_id = v_game.current_clue_id;

  if v_last_buzz is not null and (now() - v_last_buzz) < v_cooldown then
    return jsonb_build_object('success', false, 'error', 'Cooldown activo, espera 100ms');
  end if;

  -- Adjudicar ganador
  update public.games
  set winner_team_id = v_team.id,
      phase = 'won',
      updated_at = now()
  where id = p_game_id;

  -- Para Daily Double: fijar wager_cap = puntos actuales del equipo
  if v_clue.is_daily_double then
    update public.games
    set wager_cap = v_team.score,
        phase = 'awaitWager',
        double_team_id = v_team.id
    where id = p_game_id;
    return jsonb_build_object('success', true, 'winner', true, 'daily_double', true, 'wager_cap', v_team.score);
  end if;

  return jsonb_build_object('success', true, 'winner', true, 'daily_double', false);
end;
$$;

-- Confirmar apuesta Daily Double (capitán del equipo asignado)
create or replace function public.confirm_wager(p_game_id uuid, p_wager integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_team public.teams%rowtype;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'Partida no encontrada';
  end if;

  select * into v_team from public.teams
  where game_id = p_game_id and auth_user_id = auth.uid();
  if not found then
    raise exception 'Equipo no encontrado';
  end if;

  if v_game.double_team_id != v_team.id then
    raise exception 'No es tu turno para apostar';
  end if;

  if v_game.phase != 'awaitWager' then
    raise exception 'Fase incorrecta para apostar';
  end if;

  if p_wager < 0 or p_wager > v_game.wager_cap then
    raise exception 'Apuesta inválida: debe ser entre 0 y ' || v_game.wager_cap;
  end if;

  update public.games
  set wager_amount = p_wager,
      phase = 'doubleReady',
      updated_at = now()
  where id = p_game_id;

  return jsonb_build_object('success', true, 'wager', p_wager);
end;
$$;

-- Calificar respuesta (moderador)
create or replace function public.grade_answer(p_game_id uuid, p_correct boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_team public.teams%rowtype;
  v_clue public.clues%rowtype;
  v_points integer;
  v_attempt integer;
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.moderator_id != auth.uid() then
    raise exception 'No autorizado';
  end if;

  if v_game.current_clue_id is null then
    raise exception 'No hay pregunta activa';
  end if;

  if v_game.phase not in ('won', 'doubleReady') then
    raise exception 'No se puede calificar en esta fase';
  end if;

  select * into v_clue from public.clues where id = v_game.current_clue_id;

  -- Determinar equipo y puntos
  if v_game.phase = 'doubleReady' then
    select * into v_team from public.teams where id = v_game.double_team_id;
    v_points := v_game.wager_amount;
  else
    select * into v_team from public.teams where id = v_game.winner_team_id;
    v_points := v_clue.value;
  end if;

  if not found then
    raise exception 'Equipo no encontrado';
  end if;

  -- Calcular número de intento
  select coalesce(max(attempt_number), 0) + 1 into v_attempt
  from public.score_events
  where game_id = p_game_id and clue_id = v_game.current_clue_id;

  -- Registrar evento de puntuación
  insert into public.score_events (game_id, team_id, clue_id, attempt_number, verdict, points_delta)
  values (p_game_id, v_team.id, v_game.current_clue_id, v_attempt,
          case when p_correct then 'correct' else 'incorrect' end,
          case when p_correct then v_points else -v_points end);

  -- Actualizar puntaje del equipo
  update public.teams
  set score = score + case when p_correct then v_points else -v_points end
  where id = v_team.id;

  -- Marcar casilla como usada
  update public.clues set state = 'used' where id = v_game.current_clue_id;

  -- Determinar nueva fase
  if p_correct then
    update public.games
    set phase = 'correct',
        winner_team_id = null,
        updated_at = now()
    where id = p_game_id;
    return jsonb_build_object('correct', true, 'points', v_points, 'new_score', v_team.score + v_points);
  else
    if v_game.phase = 'doubleReady' then
      -- Daily Double incorrecta: cierra la ronda
      update public.games
      set phase = 'correct', -- usa correct como "ronda terminada"
          double_team_id = null,
          wager_amount = null,
          wager_cap = null,
          updated_at = now()
      where id = p_game_id;
    else
      -- Pregunta normal incorrecta: reabrir buzzer para todos
      update public.games
      set phase = 'wrong',
          winner_team_id = null,
          updated_at = now()
      where id = p_game_id;
    end if;
    return jsonb_build_object('correct', false, 'points', -v_points, 'new_score', v_team.score - v_points);
  end if;
end;
$$;

-- Siguiente pregunta (moderador)
create or replace function public.next_question(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.moderator_id != auth.uid() then
    raise exception 'No autorizado';
  end if;

  if v_game.current_clue_id is null then
    raise exception 'No hay pregunta actual';
  end if;

  if v_game.phase in ('won', 'doubleReady', 'awaitWager') then
    raise exception 'Califica la respuesta antes de avanzar';
  end if;

  update public.games
  set current_clue_id = null,
      phase = 'idle',
      winner_team_id = null,
      double_team_id = null,
      wager_amount = null,
      wager_cap = null,
      release_generation = release_generation + 1,
      updated_at = now()
  where id = p_game_id;
end;
$$;

-- Cerrar pregunta sin más respuestas (moderador)
create or replace function public.close_question(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.moderator_id != auth.uid() then
    raise exception 'No autorizado';
  end if;

  if v_game.current_clue_id is null then
    raise exception 'No hay pregunta activa';
  end if;

  if v_game.phase not in ('wrong', 'won') then
    raise exception 'Solo se puede cerrar tras un veredicto';
  end if;

  update public.games
  set phase = 'correct',
      winner_team_id = null,
      updated_at = now()
  where id = p_game_id;
end;
$$;

-- Editar puntaje (moderador)
create or replace function public.edit_score(p_game_id uuid, p_team_id uuid, p_new_score integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_team public.teams%rowtype;
  v_old_score integer;
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.moderator_id != auth.uid() then
    raise exception 'No autorizado';
  end if;

  select * into v_team from public.teams where id = p_team_id and game_id = p_game_id;
  if not found then
    raise exception 'Equipo no encontrado';
  end if;

  v_old_score := v_team.score;

  update public.teams set score = p_new_score where id = p_team_id;

  insert into public.score_edits (game_id, team_id, moderator_id, old_score, new_score)
  values (p_game_id, p_team_id, auth.uid(), v_old_score, p_new_score);

  return jsonb_build_object('success', true, 'old_score', v_old_score, 'new_score', p_new_score);
end;
$$;

-- Registrar/actualizar dispositivo activo (capitán al iniciar sesión)
create or replace function public.register_device(p_game_id uuid, p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
  v_old_token text;
begin
  select * into v_team from public.teams where game_id = p_game_id and auth_user_id = auth.uid();
  if not found then
    raise exception 'No eres capitán de esta partida';
  end if;

  v_old_token := v_team.active_device_token;

  if v_old_token is not null and v_old_token != p_device_token then
    -- Hay otro dispositivo activo: invalidar el anterior
    update public.teams
    set active_device_token = p_device_token
    where id = v_team.id;
    return jsonb_build_object('replaced', true, 'message', 'Sesión anterior cerrada');
  else
    update public.teams
    set active_device_token = p_device_token
    where id = v_team.id;
    return jsonb_build_object('replaced', false);
  end if;
end;
$$;

-- Obtener estado completo de la partida (para sincronización inicial)
create or replace function public.get_game_state(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_teams jsonb;
  v_clues jsonb;
  v_current_clue jsonb;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    raise exception 'Partida no encontrada';
  end if;

  select jsonb_agg(row_to_json(t)) into v_teams
  from public.teams t where t.game_id = p_game_id order by t.joined_at;

  select jsonb_agg(row_to_json(c)) into v_clues
  from public.clues c where c.game_id = p_game_id order by c.column_index, c.value;

  if v_game.current_clue_id is not null then
    select row_to_json(c) into v_current_clue from public.clues c where c.id = v_game.current_clue_id;
  end if;

  return jsonb_build_object(
    'game', row_to_json(v_game),
    'teams', v_teams,
    'clues', v_clues,
    'current_clue', v_current_clue
  );
end;
$$;

-- Trigger para updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger games_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

-- Grants explícitos (RLS automático no da grants)
grant usage on schema public to anon, authenticated;
grant select on public.games, public.teams, public.clues, public.score_events, public.score_edits to anon, authenticated;
grant insert on public.teams, public.score_events to authenticated;
grant update on public.teams to authenticated;
grant execute on function public.create_game to authenticated;
grant execute on function public.select_clue to authenticated;
grant execute on function public.cancel_clue to authenticated;
grant execute on function public.release_buzzer to authenticated;
grant execute on function public.buzz to authenticated;
grant execute on function public.confirm_wager to authenticated;
grant execute on function public.grade_answer to authenticated;
grant execute on function public.next_question to authenticated;
grant execute on function public.close_question to authenticated;
grant execute on function public.edit_score to authenticated;
grant execute on function public.register_device to authenticated;
grant execute on function public.get_game_state to authenticated;