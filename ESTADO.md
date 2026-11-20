# ESTADO — JIMENAPARDY

**Actualizado:** 2026-11-19

---

## ✅ Verificado por el usuario

*(pendiente — primera prueba visual)*

---

## 🟡 Verificado por logs / build

- [x] `git init` + `.gitignore`
- [x] `package.json` con Vite, Supabase, gh-pages
- [x] `vite.config.ts` con `base: '/JeopardyEvento/'` y 3 entry points
- [x] `.env.example` + `.env.local` (Supabase URL + publishable key)
- [x] `src/lib/supabase.ts` cliente configurado
- [x] `supabase/migrations/001_init.sql` esquema completo (games, teams, clues, score_events, score_edits, RLS, RPCs)
- [x] `src/pages/tablero.html/ts` — tablero público con intro animada, Realtime
- [x] `src/pages/capitan.html/ts` — login/registro, buzzer, apuesta DD, reemplazo dispositivo
- [x] `src/pages/moderador.html/ts` — panel completo con controles, modales, Realtime
- [x] `CLAUDE.md` documentación del proyecto

---

## ❓ Hipótesis no verificadas

- La migración SQL se ejecuta sin errores en Supabase (RLS, grants, RPCs)
- El cliente Supabase conecta correctamente con las credenciales dadas
- El buzzer RPC `buzz()` resuelve la carrera atómicamente (lock + cooldown 100ms)
- `register_device()` invalida correctamente el dispositivo anterior
- Realtime sincroniza las 3 vistas sin conflictos
- Build de Vite genera 3 HTMLs en `dist/` con rutas correctas
- GitHub Pages deploy funciona con el `base` configurado

---

## ⏳ Pendiente (próximos pasos)

1. **Ejecutar migración** en Supabase Dashboard → SQL Editor
2. `npm install` y `npm run dev` — verificar que compila sin errores
3. Abrir `/moderador` → crear partida → copiar `gameId`
4. Abrir `/tablero?game=<ID>` y `/capitan?game=<ID>` en dos dispositivos/redes
5. Registrar 2 capitanes (probar correo de confirmación real)
6. Moderador: seleccionar casilla → "Liberar buzzer"
7. Capitanes: pulsar buzzer casi simultáneo → verificar **un solo ganador** (verde en celular, contorno en tablero, moderador ve nombre)
8. Marcar correcta/incorrecta → verificar puntos y fase
9. Probar "Volver sin gastar", "Siguiente pregunta", "Cerrar pregunta"
10. Probar reconexión, reemplazo de dispositivo, ingreso tardío
11. Probar Daily Double (apuesta en celular, validación servidor)
12. `npm run build` → `npm run deploy` → probar en HTTPS real desde celulares

---

## 🐛 Errores conocidos / riesgos

- **Auth email confirmation**: plan gratis de Supabase puede no enviar emails → necesitar SMTP propio o desactivar confirmación
- **RLS policies**: grants explícitos en migración; probar que `anon` puede leer y `authenticated` puede insertar teams/score_events
- **Race condition buzzer**: `lock table games in row exclusive mode` + verificación de fase/ganador bajo lock
- **Device token**: almacenado en `localStorage` del navegador; si usuario limpia datos, se genera uno nuevo → `register_device` lo maneja
- **Vite base path**: `/JeopardyEvento/` debe coincidir con repo Pages; assets referenciados relativamente