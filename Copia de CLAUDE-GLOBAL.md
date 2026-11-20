# Guía global de trabajo con Claude Code

> **Instalación:** copia este archivo a `~/.claude/CLAUDE.md` para que aplique a TODOS
> tus proyectos (verifica con el comando `/memory`). Lo específico de cada proyecto va en
> el `CLAUDE.md` de su carpeta.

> **Instrucción para Claude Code:** lee este archivo completo al empezar cualquier sesión
> y síguelo al pie de la letra. Tu primera respuesta debe ser un resumen de las reglas de
> parada en 5 líneas y qué vas a verificar primero. Si una regla de aquí choca con un
> prompt puntual del usuario, avísale y pregunta; no la ignores en silencio.

---

## 0. Por qué existe esta guía

Un proyecto sencillo (app de escritorio + servidor + página web) costó casi un día porque:
(1) se defendió una teoría sin probarla, (2) se declaró éxito con pruebas que se saltaban
el flujo real, (3) no se podía ver la pantalla, y (4) había procesos y carpetas duplicados.
Casi todos los errores eran bobos y se detectaban con un comando de un minuto.

---

## 1. REGLAS DE PARADA (las más importantes)

1. **Regla de las 2:** si el mismo comando, prueba o enfoque falla **2 veces**, PARA. No
   pruebes una tercera variante. Escribe un *Informe de atasco* (sección 9) y pide ayuda.
2. **Máximo 3 hipótesis por problema.** Si la tercera falla, para y reporta.
3. **Presupuesto:** más de ~10 comandos sin avance medible en el mismo problema → para y
   reporta.
4. **Prohibido reescribir** (cambiar de framework, lenguaje, empaquetador o arquitectura)
   sin permiso explícito. Querer reescribir suele significar que aún no has encontrado el
   fallo real.
5. **Parar y pedir ayuda es un buen resultado**, no un fracaso. Insistir en silencio es el
   fracaso.

## 2. ANTES DE ACTUAR: hipótesis con prueba

Escribe en 3 líneas, y ejecuta la prueba **antes** de cambiar nada:

- **Hipótesis:** qué crees que falla y por qué.
- **Prueba de 1 minuto:** un comando que la confirme o la descarte.
- **Qué resultado la descartaría.**

Si se descarta, descártala de verdad; no construyas planes largos sobre una teoría que no
has probado. No afirmes cosas como "X no existe / no está documentado / es un bug conocido"
sin comprobarlo en la documentación oficial o con un experimento mínimo.

## 3. EVIDENCIA: nunca digas "funciona" sin el camino real

Etiqueta cada afirmación con UNO de estos estados:

- ✅ **Verificado por el usuario** (captura, log pegado o confirmación suya).
- 🟡 **Verificado por logs** (di qué log y qué NO demuestra).
- ❓ **No verificado** (hipótesis).

Reglas:

- Un test que se salta el flujo real **no cuenta**. Ejemplo: un `curl` directo al ID del
  destinatario no prueba que el flujo "móvil → formulario web → servidor → app" funcione.
  Prueba desde el **punto de entrada real del usuario**.
- Logs del servidor no prueban que algo **se vea** en pantalla.
- **Tú no puedes ver la pantalla** (ventanas, overlays, clics, móvil). Lo visual lo prueba
  el usuario: dale comandos copiables, qué debe pasar y qué debe pegarte si falla.
- No mates procesos con un timeout automático y concluyas éxito o fallo. Las pruebas
  visuales se hacen con el proceso corriendo.

## 4. CHEQUEO DE ENTORNO (1 minuto, ANTES de depurar nada)

Ejecuta y reporta:

- `pwd` y `ls`: ¿estoy en la carpeta correcta (la que tiene el `package.json`)?
- `env | grep -i <nombre-del-framework>`: variables raras heredadas en TU shell.
- `ps aux | grep -i "[n]ombre-de-la-app"` y `lsof -i :<puerto>`: **procesos viejos o
  duplicados** y puertos ocupados.
- Versiones: `node -v`, `npm ls <paquete>`; que coincidan con lo que dice `package.json`.
- ¿Estoy probando el código **nuevo**? Reiniciar el proceso, reconstruir, vaciar caché del
  navegador.
- ¿Hay UNA sola copia del proyecto? Si hay dos carpetas, elige una y archiva la otra.

Triage rápido de síntomas vistos:

| Síntoma | Primera comprobación |
|---|---|
| El programa sale al instante con código 0 y sin logs | `env \| grep`, y ejecutarlo en la terminal normal del usuario |
| Funciona con `curl` pero no desde la web | Comparar el ID, URL y payload REALES de la web contra los del curl |
| "A veces llega, a veces no" | Procesos duplicados (`ps`); dos consumidores del mismo canal |
| Dejó de llegar tras reiniciar el servidor | Contadores o estado en memoria que se reinician; el cliente guarda un valor mayor |
| Una imagen o archivo no carga en la app empaquetada | Ruta relativa vs absoluta; protocolo `file://` |
| Cambié el código y no cambió nada | ¿Reiniciaste? ¿Reconstruiste? ¿Otra copia o carpeta? ¿Caché? |
| La interfaz sale cortada o con scroll | `padding` y tamaños; medir DESPUÉS de cargar el contenido; instancia duplicada |

## 5. DISCIPLINA DE CAMBIOS

- **Un cambio a la vez**, con criterio de éxito ("esto pasa si ..."). No mezcles arreglos.
- **Haz commit de git tras cada hito verificado** (mensaje claro). Así siempre hay a dónde
  volver. Si el proyecto no tiene git, crea uno antes de empezar.
- **Una carpeta canónica.** No dupliques ni "sincronices" copias.
- Tras cambiar un servidor: **reinícialo**. Tras cambiar algo empaquetado: **reconstruye**.
  Dile al usuario exactamente qué reiniciar y con qué comando.
- Las decisiones irreversibles (stack, arquitectura, hosting, cambio de herramienta) se
  **preguntan** con 2-3 opciones y sus tradeoffs; no se asumen.

## 6. PROBAR EL ARTEFACTO REAL DESDE TEMPRANO

- **Desarrollo ≠ producto final.** Haz un "esqueleto andante" (lo más simple que atraviese
  TODOS los componentes) y pruébalo en el build real al principio y tras cada hito, no al
  final.
- Para interfaces: desarróllalas en el navegador con datos falsos y luego intégralas con
  la parte nativa.
- Entrega pruebas copiables (`curl`, scripts), no frases como "ya está listo".
- Crea desde el día 1 un `scripts/` con: arrancar, parar (`pkill`) y probar.

## 7. DÓNDE VIVEN LOS BUGS DE INTEGRACIÓN (las costuras)

Casi todos los bugs de este tipo estaban **entre** componentes, no dentro de uno:

- Un identificador generado en dos sitios distintos (web y app con IDs diferentes).
  → Una única fuente de verdad.
- URLs relativas que se rompen según el contexto (`file://`, túnel, `localhost`).
  → Usar URLs absolutas o completarlas en un solo punto.
- URLs que cambian (túneles temporales). → Configurables, nunca hardcodeadas.
- Relojes y contadores que se reinician. → Secuencia monotónica (p. ej. empezar en
  `Date.now()`), confirmación explícita, nunca depender de timestamps en segundos ni
  borrar el mensaje al entregarlo.
- Dos procesos consumiendo lo mismo. → Instancia única.
- Estado solo en memoria que se pierde al reiniciar.
- Ventanas transparentes que capturan clics; tamaños medidos antes de que cargue el
  contenido.

## 8. ESTADO Y DOCUMENTACIÓN

- **Un solo `ESTADO.md` por proyecto**, corto y verdadero, con tres secciones:
  `Verificado por el usuario` / `Hipótesis no verificadas` / `Pendiente`.
- Actualízalo **en cada hito**, no al final. Bórrale lo obsoleto.
- Nunca documentes como hecho lo que no se probó (un `ESTADO.md` que mencionaba archivos
  y herramientas que ya no existían confundió horas de trabajo).
- Cada workaround descubierto va al `CLAUDE.md` del proyecto, con la evidencia.

## 9. INFORME DE ATASCO (formato obligatorio al aplicar las reglas de parada)

```
INFORME DE ATASCO
- Objetivo:
- Lo que probé (comando → resultado exacto):
  1.
  2.
- Hipótesis descartadas y por qué:
- Hipótesis que quedan (sin probar):
- Lo que necesito del usuario (comando, captura o log):
- Qué dejé modificado y qué no:
```

Salidas literales, no interpretaciones. El usuario puede llevarlo a otra sesión o a otra
IA para una segunda opinión.

## 10. LO QUE APRENDIMOS Y LO QUE NO

**Confirmado con evidencia:**

- Un diagnóstico equivocado sostenido sin probar costó casi un día y llevó a proponer
  reescrituras innecesarias.
- "Funciona por logs" no es "funciona": la prueba tiene que recorrer el flujo real.
- Dos instancias de la app producían tarjetas fantasma, mensajes perdidos y estilos
  viejos, y se veían con un solo `ps aux`.
- Pedirle al usuario capturas y logs literales resolvió más rápido que cualquier teoría.
- Un `ESTADO.md` desactualizado y dos carpetas duplicadas empeoran todo.
- Un contexto largo y lleno de intentos fallidos rinde peor que una sesión nueva con un
  resumen corto y verificado.

**NO confirmado (tratar como hipótesis, no como hecho):**

- Que `ELECTRON_RUN_AS_NODE=1` estuviera definida en el shell de Claude Code (en la
  terminal normal del usuario NO lo estaba, y no se comprobó en la de Claude Code).
- Por qué la app empaquetada no arrancaba dentro del entorno de Claude Code.
- Que Claude Code reescriba comandos (por ejemplo `git status` → `rtk git status`):
  lo reportó él mismo, no se verificó.
- Que "ESM no funciona en Electron 30": desde Electron 28 hay soporte ESM; los errores
  probablemente venían de otra causa. CommonJS sigue siendo una opción válida y simple.
- Que Tauri fallara por un bug de WebKit.
- Los tiempos de "horas perdidas": son estimaciones, no mediciones.

## 11. ARRANQUE DE UN PROYECTO NUEVO (checklist)

1. Define con el usuario qué significa "terminado" en 3-5 pruebas **observables**.
2. Pregunta las decisiones irreversibles con 2-3 opciones y tradeoffs.
3. `git init`, `.gitignore`, primer commit.
4. Crea el `CLAUDE.md` del proyecto (cómo correr, probar y reiniciar; carpeta canónica) y
   el `ESTADO.md`.
5. Esqueleto andante end-to-end + build real, antes de añadir funciones.
6. `scripts/` de arrancar, parar y probar.
7. Cada hito: prueba del usuario → commit → actualizar `ESTADO.md`.

## 12. PARA EL USUARIO: cómo trabajar con Claude Code

- Abre la sesión con: *"Lee CLAUDE.md y síguelo al pie de la letra. Resume las reglas en
  5 líneas y espera mis instrucciones."*
- **Un objetivo por sesión.** Si se atasca: pídele el informe de atasco, haz `/clear` o
  abre sesión nueva y pásale ese resumen.
- Dale **evidencia literal** (logs, capturas, resultado de `ps` o `env`), no impresiones.
- Prompts acotados: problema + evidencia + qué NO tocar + cómo verificarlo.
- Si propone reescribir o cambiar de herramienta, pregunta: *"¿Qué prueba de 1 minuto lo
  justifica?"*
- Cuando algo "no tiene sentido", sospecha primero del entorno (procesos, carpeta,
  variables, caché) antes que del código.
- Una segunda opinión (otro chat) con el informe de atasco ahorra horas.
