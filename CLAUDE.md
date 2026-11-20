# JIMENAPARDY — Guía del proyecto para Claude Code

## Arranque rápido

```bash
cd /Users/juandi/ProyectosClaudeCode/JimenaPardy
npm install
npm run dev          # Servidor Vite en http://localhost:5173
```

## URLs de desarrollo (con gameId)

- Tablero público: `http://localhost:5173/tablero?game=<GAME_ID>`
- Capitán (celular): `http://localhost:5173/capitan?game=<GAME_ID>`
- Moderador: `http://localhost:5173/moderador?game=<GAME_ID>`

## Crear una partida nueva

1. Abrir `/moderador` sin `?game=` → sale modal "Nueva partida"
2. Click "Crear partida" → redirige a `/moderador?game=<ID>`
3. Copiar ese `gameId` y usarlo en las otras dos vistas

## Flujo de prueba mínimo (Hito 0–1)

1. **Moderador**: abre `/moderador`, crea partida, selecciona una casilla → fase "blocked"
2. **Capitán 1**: abre `/capitan?game=<ID>`, inicia sesión (registro+confirmación email o login)
3. **Capitán 2**: mismo en otro dispositivo/red
4. Verificar: nombres y scores aparecen en tablero y moderador
5. **Moderador**: "Liberar buzzer" → fase "open"
6. **Capitanes**: pulsan buzzer → uno gana (verde en su celular, contorno en tablero, moderador ve ganador)

## Estructura del proyecto

```
├── src/
│   ├── lib/supabase.ts          # Cliente Supabase
│   ├── pages/
│   │   ├── tablero.html/ts      # Tablero público (solo lectura)
│   │   ├── capitan.html/ts      # Celular del capitán (buzzer + apuesta)
│   │   └── moderador.html/ts    # Panel del moderador (control total)
├── supabase/migrations/
│   └── 001_init.sql             # Esquema + RLS + RPCs
├── vite.config.ts               # base: '/JeopardyEvento/'
├── .env.local                   # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
└── package.json
```

## Supabase: configuración requerida

1. **Auth → Providers → Email**: habilitado
2. **Auth → URL Configuration**:
   - Site URL: `https://juandisolo.github.io/JeopardyEvento/`
   - Redirect URLs: `https://juandisolo.github.io/JeopardyEvento/**`
3. **Database → Extensions**: `pgcrypto`, `uuid-ossp` habilitadas
4. **SQL Editor**: ejecutar `supabase/migrations/001_init.sql`

## Despliegue a GitHub Pages

```bash
npm run build        # Genera dist/
npm run deploy       # Publica a gh-pages branch
```

GitHub Actions (`.github/workflows/deploy.yml`) hace build + deploy automático en push a main.

## Variables de entorno

| Archivo | Variables |
|---------|-----------|
| `.env.local` (gitignored) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `.env.example` | Nombres de ejemplo |
| GitHub Actions secrets | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

## Reglas de desarrollo (de CLAUDE-GLOBAL.md)

- **Un cambio a la vez**, commit tras hito verificado
- **Probar desde el flujo real**: 3 pantallas, 2 redes, recarga
- **No declarar "funciona" sin confirmación visual del usuario**
- **ESTADO.md** actualizado en cada hito

## RPCs principales (ver migración)

| Función | Quién | Qué hace |
|---------|-------|----------|
| `create_game` | Moderador | Crea partida + 20 clues + Daily Double secreto |
| `select_clue` | Moderador | Elige casilla, pone fase blocked/chooseDouble |
| `cancel_clue` | Moderador | Vuelve sin gastar (solo si no hay veredicto) |
| `release_buzzer` | Moderador | Abre buzzer (o abre apuesta en DD) |
| `buzz` | Capitán | **Adjudicación atómica** con lock, cooldown 100ms |
| `confirm_wager` | Capitán (DD) | Confirma apuesta ≤ wager_cap |
| `grade_answer` | Moderador | Correcta/incorrecta → puntos + marca used |
| `next_question` | Moderador | Limpia ronda, fase idle |
| `close_question` | Moderador | Cierra sin más respuestas (tras wrong) |
| `edit_score` | Moderador | Edición manual registrada |
| `register_device` | Capitán | Invalida dispositivo anterior si hay reemplazo |
| `get_game_state` | Todos | Snapshot inicial para sincronizar |

## Próximos hitos (ver JIMENAPARDY_DISEÑO_CLAUDE_CODE.md)

- Hito 1: Corte vertical (Supabase conectado, 2 capitanes, publicado)
- Hito 2: Pregunta y sincronía (seleccionar, mostrar/cancelar, Realtime)
- Hito 3: Buzzer (bloqueo, 100ms, liberación, adjudicación atómica, verde)
- Hito 4: Puntajes (correcta/incorrecta, reintentos, edición moderador)
- Hito 5: Presencia (reconexión, ingreso tardío, reemplazo teléfono)
- Hito 6: Daily Double (secreto, asignación automática, apuesta validada)
- Hito 7: Ensayo completo 20 min