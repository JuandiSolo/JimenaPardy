-- ============================================
-- HITO A: Preguntas con imágenes
-- Migración incremental (no destructiva)
-- ============================================

-- 1. Nuevos campos en public.clues
alter table public.clues
  add column if not exists content_type text not null default 'text'
    check (content_type in ('text', 'image', 'mixed')),
  add column if not exists image_path text,
  add column if not exists image_alt text;

-- Índice para consultas por game + content_type
create index if not exists clues_game_content_type_idx
  on public.clues (game_id, content_type);

-- 2. Bucket Supabase Storage: question-images
-- Nota: El bucket se crea vía Dashboard o CLI. Aquí solo documentamos.
-- supabase storage create bucket question-images --public=false

-- 3. Políticas RLS para clues (ya existen, solo verificamos que cubren nuevos campos)
-- Las políticas existentes "clues_select_public" y "clues_all_moderator" aplican a toda la fila.

-- 4. Función helper: validar integridad content_type vs image_path
create or replace function public.validate_clue_content()
returns trigger
language plpgsql
as $$
begin
  if new.content_type = 'image' and new.image_path is null then
    raise exception 'Pregunta de tipo "image" requiere image_path';
  end if;
  if new.content_type = 'mixed' and (new.image_path is null or new.question_text is null or new.question_text = '') then
    raise exception 'Pregunta de tipo "mixed" requiere image_path y question_text';
  end if;
  if new.content_type = 'text' and new.image_path is not null then
    -- Permitimos image_path en text para compatibilidad, pero limpiamos en save si se desea
    null;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_validate_clue_content on public.clues;
create trigger trigger_validate_clue_content
  before insert or update on public.clues
  for each row execute function public.validate_clue_content();

-- 5. RPC para subir imagen (validación server-side + autorización moderador)
-- Esta función será llamada desde el frontend tras subir a Storage (ver Edge Function alternativa)
create or replace function public.update_clue_image(
  p_game_id uuid,
  p_clue_id uuid,
  p_image_path text,
  p_content_type text,
  p_image_alt text default null,
  p_question_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_clue public.clues%rowtype;
  v_old_image_path text;
begin
  -- Verificar autorización: el usuario debe ser moderador de la partida
  select * into v_game from public.games where id = p_game_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Partida no encontrada');
  end if;

  if v_game.moderator_id != auth.uid() then
    return jsonb_build_object('success', false, 'error', 'No autorizado: solo el moderador puede cambiar imágenes');
  end if;

  -- Obtener pista actual
  select * into v_clue from public.clues where id = p_clue_id and game_id = p_game_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Casilla no encontrada');
  end if;

  v_old_image_path := v_clue.image_path;

  -- Validar content_type
  if p_content_type not in ('text', 'image', 'mixed') then
    return jsonb_build_object('success', false, 'error', 'content_type inválido');
  end if;

  -- Validar requisitos según tipo
  if p_content_type = 'image' and p_image_path is null then
    return jsonb_build_object('success', false, 'error', 'Tipo "image" requiere image_path');
  end if;
  if p_content_type = 'mixed' and (p_image_path is null or p_question_text is null or p_question_text = '') then
    return jsonb_build_object('success', false, 'error', 'Tipo "mixed" requiere image_path y question_text');
  end if;

  -- Actualizar
  update public.clues
  set content_type = p_content_type,
      image_path = p_image_path,
      image_alt = p_image_alt,
      question_text = coalesce(p_question_text, question_text),
      updated_at = now()
  where id = p_clue_id;

  -- Devolver éxito con ruta antigua para limpieza opcional
  return jsonb_build_object(
    'success', true,
    'old_image_path', v_old_image_path,
    'content_type', p_content_type,
    'image_path', p_image_path
  );
end;
$$;

grant execute on function public.update_clue_image(uuid, uuid, text, text, text, text) to authenticated;

-- 6. RPC para eliminar imagen de una pregunta (vuelve a solo texto)
create or replace function public.remove_clue_image(
  p_game_id uuid,
  p_clue_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_clue public.clues%rowtype;
  v_old_image_path text;
begin
  select * into v_game from public.games where id = p_game_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Partida no encontrada');
  end if;

  if v_game.moderator_id != auth.uid() then
    return jsonb_build_object('success', false, 'error', 'No autorizado');
  end if;

  select * into v_clue from public.clues where id = p_clue_id and game_id = p_game_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Casilla no encontrada');
  end if;

  v_old_image_path := v_clue.image_path;

  update public.clues
  set content_type = 'text',
      image_path = null,
      image_alt = null,
      updated_at = now()
  where id = p_clue_id;

  return jsonb_build_object('success', true, 'old_image_path', v_old_image_path);
end;
$$;

grant execute on function public.remove_clue_image(uuid, uuid) to authenticated;

-- 7. Actualizar get_game_state para incluir nuevos campos
-- (La función existente usa row_to_json, debería incluir automáticamente las nuevas columnas)
-- Verificar: si get_game_state hace SELECT * o row_to_json(clues), ya incluye los nuevos campos.

-- 8. Limpieza de imágenes huérfanas (opcional, job programado)
-- create or replace function public.cleanup_orphan_question_images() ...
-- Se puede implementar como pg_cron job si se desea.

-- ============================================
-- INSTRUCCIONES POST-MIGRACIÓN (ejecutar en Dashboard)
-- ============================================
/*
1. Crear bucket en Supabase Storage:
   - Nombre: question-images
   - Público: NO (private)
   - Políticas de Storage (ver abajo)

2. Políticas de Storage para question-images (ejecutar en SQL Editor tras crear bucket):

   -- Lectura pública (para que tablero/capitanes vean imágenes)
   create policy "question_images_public_read" on storage.objects
     for select using (bucket_id = 'question-images');

   -- Escritura solo vía Edge Function / RPC autorizada (no directamente desde cliente)
   -- NO crear policy de insert/update/delete pública.
   -- La subida real se hará via Edge Function que valida moderador.
*/

-- ============================================
-- EDGE FUNCTION PARA SUBIDA SEGURA (crear en Supabase Dashboard > Edge Functions)
-- Nombre: upload-question-image
-- Ver archivo: supabase/functions/upload-question-image/index.ts
-- ============================================