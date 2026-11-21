# JIMENAPARDY — Estado actual y próximos pasos

**Fecha:** 2025-11-20
**Último commit:** `b8c0054` + cambios sin commitear

---

## ✅ Hitos completados

| Hito | Funcionalidad | Detalle |
|------|---------------|---------|
| **0. Base** | Vite multipágina, 3 vistas | `tablero`, `capitan`, `moderador` visualmente fieles a los HTML originales |
| **1. Corte vertical** | Supabase conectado | Auth anónimo + RPC `captain_login` / `moderator_login`; multi-sesión moderador (mismo user/pass, distintos dispositivos) |
| **2. Pregunta y sincronía** | Seleccionar/cancelar casilla | Realtime en `games`, `teams`, `clues`; intro controlada por moderador (`start_intro`, `advance_intro`) |
| **3. Buzzer** | Bloqueo, 100ms, liberación | `buzz` atómico con `LOCK TABLE`; cooldown 100ms por equipo; verde en ganador (celular + tablero + moderador) |
| **4. Puntajes** | Correcta/incorrecta/skip | `grade_answer`, `next_question`, `close_question`, `skip_question` (nadie respondió), `edit_score` |
| **6. Daily Double (modificado)** | Asignación manual | En fase `chooseDouble`, moderador elige equipo desde selector → va directo a `awaitWager` (sin buzzer) |

---

## ⚠️ Pendientes (Hito 5 + 7)

| Tarea | Prioridad | Detalle |
|-------|-----------|---------|
| **Reconexión capitán** | Alta | Al recargar/perder red: recargar `get_game_state`, mantener puntaje, no reenviar buzzes viejos |
| **Ingreso tardío** | Alta | Nuevo equipo puede unirse mid-game → aparece con 0 puntos, sin solapamiento visual (máx 5) |
| **Tablero: 5 equipos persistentes** | Media | Mostrar todos los equipos de la partida (no solo `active_device_token`), scores guardados en BD |
| **Editar pregunta** | Media | Verificar botón "Escribir / editar pregunta" guarda en `clues.question_text` via Supabase |
| **Deploy GitHub Pages** | Alta | `vite.config.ts` base `/JeopardyEvento/`, Actions workflow, secrets `VITE_SUPABASE_URL/ANON_KEY`, URLs Auth redirect |
| **Ensayo 20 min completo** | Final | 2 redes, recargas, desconexiones, cambio pregunta, Daily Double, puntajes, 3 displays sincronizados |

---

## 🔧 Cambios importantes vs diseño original

1. **Auth**: Anónima + RPC (no email/password) — capitanes y moderador usan `signInAnonymously()` + `captain_login`/`moderator_login` con `crypt()`
2. **Multi-sesión moderador**: Varios dispositivos con mismo `juandi`/`123` → cada uno crea fila en `moderators` con su `auth_user_id`
3. **Daily Double asignado manualmente**: Moderador elige equipo en `chooseDouble` (selector) → no automático al ganar buzzer
4. **Intro controlada**: Moderador pulsa "▶ Iniciar partida" → `intro` phase → "Siguiente categoría" 5 veces
5. **Skip question**: Botón "⏭ Nadie respondió" en fases `open`/`blocked`/`chooseDouble` → marca casilla usada, vuelve a `idle`
6. **Reemplazo dispositivo**: `register_device` actualiza `auth_user_id` + `active_device_token` atómicamente; modal de confirmación en capitán

---

## 📁 Archivos clave modificados (sin commitear)

```
supabase/migrations/001_init.sql     # + start_intro, advance_intro, assign_daily_double, skip_question, intro_progress, Realtime publication
supabase/migrations/002_add_moderator_auth.sql  # multi-sesión moderador
src/pages/moderador.ts              # intro btn, DD team selector, advanceIntro, assignDailyDouble
src/pages/tablero.ts                # runIntroAnimation sincronizada con intro_progress
src/pages/capitan.ts                # login forzado cada recarga, register_device(teamId), logs debug
```

---

## 🚀 Para continuar mañana

1. **Ejecutar migraciones** en Supabase SQL Editor (orden):
   ```
   000_reset.sql → 001_init.sql → 002_add_moderator_auth.sql
   ```

2. **Probar reconexión capitán**:
   - Capitán entra, gana puntos
   - Recarga página / cierra pestaña / modo avión
   - Vuelve a entrar → debe ver su puntaje, fase actual, buzzer correcto

3. **Probar ingreso tardío**:
   - Partida en curso (fase `open` o `blocked`)
   - Nuevo capitán entra con equipo nuevo → aparece en moderador/tablero con 0

4. **Deploy GitHub Pages** cuando estén listos los tests

---

## 🎮 Flujo de prueba completo (checklist)

- [ ] Moderador: crea partida → "▶ Iniciar partida" → 5× "Siguiente categoría"
- [ ] Tablero: ve intro animada sincronizada
- [ ] 2 Capitanes: entran desde dispositivos distintos → nombres + scores en moderador/tablero
- [ ] Moderador: selecciona casilla normal → "Liberar buzzer"
- [ ] Capitanes: buzz → 1 verde, otros bloqueados
- [ ] Moderador: ✓ Correcta → suma puntos → "Siguiente pregunta"
- [ ] Moderador: selecciona Daily Double → elige equipo en selector → "Asignar y abrir apuesta"
- [ ] Capitán elegido: ve formulario apuesta (max = sus puntos) → confirma
- [ ] Moderador: ve apuesta → ✓/✕ → puntos ajustados
- [ ] Skip: moderador "⏭ Nadie respondió" en `open` → casilla usada, vuelve `idle`
- [ ] Reemplazo: 2do dispositivo mismo equipo → modal confirmación → 1ro expulsado
- [ ] Reconexión: capitán recarga → estado intacto
- [ ] Ingreso tardío: 3er equipo entra mid-game → 0 puntos, visible