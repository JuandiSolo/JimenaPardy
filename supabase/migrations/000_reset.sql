-- LIMPIEZA COMPLETA (ejecutar ANTES de 001_init.sql)
-- Cuidado: borra todos los datos de las tablas del proyecto

-- Eliminar triggers
drop trigger if exists games_updated_at on public.games;

-- Eliminar funciones
drop function if exists public.set_updated_at();
drop function if exists public.get_game_state(uuid);
drop function if exists public.register_device(uuid, text);
drop function if exists public.register_moderator_device(uuid, text);
drop function if exists public.edit_score(uuid, uuid, integer);
drop function if exists public.close_question(uuid);
drop function if exists public.next_question(uuid);
drop function if exists public.grade_answer(uuid, boolean);
drop function if exists public.confirm_wager(uuid, integer);
drop function if exists public.buzz(uuid, text);
drop function if exists public.release_buzzer(uuid);
drop function if exists public.cancel_clue(uuid);
drop function if exists public.select_clue(uuid, uuid);
drop function if exists public.captain_login(uuid, text, text);
drop function if exists public.moderator_login(uuid, text, text);
drop function if exists public.create_game();

-- Eliminar tablas (CASCADE borra políticas, índices, constraints)
drop table if exists public.score_edits cascade;
drop table if exists public.score_events cascade;
drop table if exists public.clues cascade;
drop table if exists public.teams cascade;
drop table if exists public.moderators cascade;
drop table if exists public.games cascade;