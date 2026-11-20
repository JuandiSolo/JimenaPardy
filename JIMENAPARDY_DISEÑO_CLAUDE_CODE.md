# JIMENAPARDY — documento de diseño e implementación para Claude Code

## 1. Encargo y forma de trabajar

Construir un juego de preguntas con tres vistas sincronizadas por internet: tablero público, panel del moderador y buzzer de cada capitán. Se espera una sola partida de unos 20 minutos, máximo cinco equipos y un capitán con un celular por equipo. Los teléfonos pueden estar en redes distintas. El moderador no crea equipos: cada capitán se registra y entra por su cuenta. El aspecto visual de los tres HTML proporcionados es la referencia obligatoria; adaptar su lógica, sin rediseñar arbitrariamente las pantallas.

Lee primero este documento, los tres HTML y `Copia de CLAUDE-GLOBAL.md` (o la copia instalada como guía global). Respeta sus reglas de diagnóstico, paradas, un solo proyecto, `ESTADO.md` y pruebas del flujo real. Este documento define las reglas *del juego*; el Markdown global define el método de trabajo. Si una regla genérica de la guía global presupone Electron, app nativa o un servidor local permanente, no aplica a este proyecto web. Ante una duda que cambie la experiencia del juego, formula una pregunta breve y sigue con trabajo independiente; no inventes la regla.

**Primera respuesta de Claude Code:** confirma los archivos encontrados y su ruta, resume el primer hito comprobable y pide solamente los datos de configuración que falten. No implementes todos los módulos antes de la primera prueba con dos teléfonos.

## 2. Archivos base y diferencias conocidas

- Tablero: `Jeopardy Board.html` o `Jeopardy_Board.html`, según el nombre realmente presente. Su animación revela categorías con deslizamiento hacia la izquierda; después muestra tablero y puntajes abajo. Usa el HTML que el usuario suba al repositorio como base visual vigente.
- Capitán: `JimenaPardy Buzzer.html`. Tiene bienvenida, acceso, nombre, puntaje y gran botón de buzzer. Actualmente la contraseña solo sirve a la demo: sustituir por autenticación real.
- Moderador: `JimenaPardy Moderador.html`. Muestra tablero, pregunta, selección, liberación, correcta/incorrecta, volver, siguiente, equipos, edición de puntos y Daily Double. La demo usa `localStorage` y equipos prefijados; dejar de tratarlos como autoridad una vez conectado al backend.
- Guía de trabajo: `Copia de CLAUDE-GLOBAL.md`. Leerla íntegra. Mantener un `CLAUDE.md` específico del repositorio con cómo arrancar, probar, desplegar y qué queda decidido aquí.

Hay diferencias que resolver expresamente: la demo del moderador aplica **2 segundos** a una pulsación temprana, pero la regla final es **100 ms**; su `grade(false)` marca la casilla como gastada y permite seguir respondiendo. Mantener la casilla no seleccionable en el tablero desde el primer veredicto, pero conservar la pregunta activa para nuevos intentos después del error. La estrella de Daily Double que aparece en la demo es de prueba: no revelar la ubicación en el tablero público antes de seleccionarla.

## 3. Tecnologías concretas

| Parte | Opción elegida | Para qué |
| --- | --- | --- |
| Interfaz | HTML, CSS y JavaScript; Vite para servir y empaquetar las tres páginas | Conservar diseño, desarrollar en VS Code y publicar archivos estáticos |
| Autenticación | Supabase Auth, correo y contraseña del capitán; cuenta separada del moderador | ID estable tras reconexión; roles verificables |
| Datos | Supabase Postgres, migraciones SQL versionadas | Puntajes, nombres, preguntas, ronda, apuesta y veredictos persistentes |
| Competencia del buzzer | Función SQL transaccional invocada con `supabase.rpc()` | Una sola adjudicación válida ante pulsaciones simultáneas |
| Sincronización | Supabase Realtime para cambios de estado y Presence para conexión | Actualizar las tres pantallas sin refrescar |
| Publicación | GitHub Pages por GitHub Actions | URL HTTPS que abren los celulares desde cualquier red |
| Pruebas | Pruebas de transiciones y RLS, más pruebas reales en dos teléfonos y moderador | Verificar carrera, seguridad y experiencia visible |

No hace falta servidor Node.js permanente ni aplicación móvil nativa. Vite se usa para desarrollo y build; Supabase hospeda datos, Auth y Realtime. Evitar dependencias, frameworks o servicios extra sin necesidad comprobada. La URL y *publishable key* de Supabase pueden ir en la configuración del cliente; contraseña de Postgres, secret key y `service_role` jamás en archivos publicados, repositorio o capturas. Activamos Data API, desactivamos grants automáticos y activamos RLS automático al crear el proyecto: las migraciones deben conceder **explícitamente** los permisos necesarios.

### Configuración que debe aportar el usuario

1. URL del proyecto Supabase y publishable key (no pedir contraseñas ni claves secretas en el chat). Indicar cómo introducirlas en `.env.local` y en los secretos/variables del despliegue si se necesitan; `.env.local` ignorado por git, `.env.example` con nombres y valores de ejemplo.
2. Identidad del moderador: cuenta de Auth con email del usuario y su `auth.uid()` asignado al rol `moderator` mediante una migración/operación controlada, nunca a través de un botón público de autorregistro.
3. Nombre del repositorio y URL de GitHub Pages para fijar el `base` de Vite y las URLs de redirección de Auth. Pedirlos al llegar al despliegue, no bloquear el desarrollo local por ello.

## 4. Identidades y conexiones

- El capitán se registra con correo, contraseña y nombre de equipo. La interfaz actual dice «Usuario o equipo»: ajustarla para el correo y mostrar el nombre del equipo por separado. La relación `auth.uid() → team.id` se crea una sola vez; el nombre mostrado no es una credencial. Máximo cinco equipos **por partida**, límite validado en la base de datos de manera atómica incluso ante dos registros simultáneos. No insertar equipos de demo al arrancar una partida real.
- Probar desde el principio el flujo de alta y confirmación de correo en el proyecto alojado. El correo saliente predeterminado de Supabase puede estar restringido; si la confirmación externa no llega, reportar la evidencia y pedir decisión sobre SMTP propio o un mecanismo de registro alternativo. No afirmar que el registro funciona por haber rellenado solo el formulario.
- Cada equipo tiene un solo capitán y **un celular activo**. Si inicia sesión en otro teléfono, mostrar: «Ya hay un celular conectado. ¿Seguro que quieres continuar? Se cerrará la sesión del otro celular». Si cancela, no cambia nada. Si confirma, el servidor cambia de forma atómica un `active_device_token` o generación de sesión; la pantalla anterior recibe el cambio, sale de la partida y no puede volver a pulsar aunque conserve un JWT de Auth válido. Validar el token activo en cada RPC del buzzer y de la apuesta, no solo ocultar la interfaz vieja. Probar reemplazo y reconexión.
- Presence indica quién está conectado. Al caer la conexión el equipo desaparece de las listas públicas/moderador tras la detección de la pérdida; su fila, nombre y puntaje **persisten**. Al volver con la misma cuenta aparece con sus puntos. Un nuevo equipo entra con 0 incluso durante una ronda; el diseño acomoda hasta cinco marcadores sin superposición. La presencia no es el registro definitivo del equipo.
- Una reconexión siempre pide una instantánea actual a la base de datos antes de permitir competir. No reenvía pulsaciones almacenadas durante la desconexión y muestra «Sin conexión» hasta estar sincronizada. Si el capitán ganador pierde conexión antes del veredicto, no asignar el turno a otro de forma silenciosa; ofrecer al moderador un control explícito para anular/reabrir ese turno.

## 5. Una sola fuente de verdad

Versionar el esquema en `supabase/migrations/`. Modelo mínimo conceptual (ajustar nombres al código):

- `games`: ID de partida, moderador, estado, número de revisión.
- `teams`: ID, game ID, auth user ID único dentro de la partida, nombre, puntaje entero con signo, fecha de ingreso. Hasta cinco por partida.
- `clues`: categoría, columna, valor, texto de pregunta, indicador Daily Double, estado de la casilla y, opcionalmente, respuesta privada para el moderador. El indicador y las respuestas no salen en las consultas públicas de casillas pendientes.
- `rounds` o `game_state`: casilla actual, fase, `release_generation`, ganador actual, equipo Daily Double y apuesta confirmada; una sola pregunta activa por partida.
- `attempts` o `score_events`: ganador, veredicto y delta de puntaje, con identificador único de intento para impedir doble puntuación por doble clic/reintento. Mantener rastro de edición manual de puntos.

No almacenar respuestas privadas en el JavaScript publicado ni enviar toda la fila de la pregunta al tablero/capitán antes de que corresponda. El tablero público puede consultar un estado de lectura limitado: títulos, valores, casillas usadas, pregunta visible si fue revelada, puntajes de equipos presentes y ganador. El moderador tiene lectura de preguntas y respuestas si se configuran. RLS y permisos de ejecución impiden que un capitán cambie el puntaje, el ganador, la apuesta de otro o la fase. La pantalla pública nunca recibe permisos de escritura de control. Limitar funciones `SECURITY DEFINER`, fijar `search_path` y validar `auth.uid()` y rol dentro de cada función.

**Acciones atómicas de servidor:** crear equipo, seleccionar/cancelar casilla, liberar, pulsar, calificar, editar puntaje, confirmar apuesta, avanzar. Cada acción recibe una revisión/ID de intento cuando corresponda y rechaza operaciones obsoletas. En `buzz`, bloquear la fila de la ronda (`SELECT ... FOR UPDATE` o actualización condicional): adjudicar solo si la fase está abierta, generación vigente, equipo conectado y sin ganador; dos solicitudes casi simultáneas producen exactamente un ganador. Ordenar por la recepción/procesamiento en el servidor; no confiar en el reloj del celular. Tras escritura confirmada, difundir el nuevo estado por Realtime. Al suscribirse/reconectarse, cargar instantánea primero y descartar eventos de revisión vieja o repetida.

## 6. Reglas exactas del juego

### Pregunta normal

1. El moderador elige una casilla libre: muestra la pregunta en su panel; el buzzer inicia **bloqueado**. Puede pulsar «Volver sin gastar pregunta» si eligió mal, siempre que todavía no haya calificado ninguna respuesta en esa casilla. Esta operación retira la selección sin marcarla usada ni cambiar puntos.
2. Antes de liberar, el botón del capitán acepta pulsaciones para dar feedback: «El moderador no ha terminado de hablar». Cada pulsación aceptada inicia un cooldown de **100 ms para ese equipo**. Se puede volver a pulsar después; no hay cola ni pulsación anticipada que se active automáticamente al liberar. El servidor vuelve a comprobar el cooldown en el momento de adjudicar, incluso si el moderador libera durante esos 100 ms.
3. El moderador libera manualmente. Solo las pulsaciones válidas recibidas después de liberar pueden ganar. El primer intento adjudicado por el servidor fija el ganador y bloquea los demás buzzers. El botón **del ganador se pone verde**; su marcador recibe un contorno verde en el tablero público y el moderador ve su identidad. El resto muestra que el turno está ocupado, sin verde de ganador.
4. Correcta: sumar el valor de la casilla una sola vez, marcar casilla usada, bloquear buzzers y esperar a «Siguiente pregunta». Incorrecta: restar el valor una sola vez, marcar casilla usada/no seleccionable en el tablero, mantener esta pregunta activa y reabrir el buzzer para **todos**, incluido quien falló. El verde del antiguo ganador desaparece; el siguiente ganador recibe el verde. Cada veredicto posterior en esta misma casilla ajusta el puntaje del nuevo intento, sin descontar dos veces un intento anterior.
5. «Siguiente pregunta» es una acción manual del moderador tras terminar la ronda. Limpia ganador y pregunta actual. La próxima casilla arranca bloqueada y requiere una **nueva liberación manual**. Ningún cliente puede liberarla por sí solo.

### Daily Double

Hay **una casilla Daily Double**, elegida por el sistema al iniciar la partida entre las casillas de **$600 o $800**. Guardar esa elección en la base de datos, de forma que no cambie al recargar; no anunciarla con una estrella en el tablero público o el HTML compilado. Al seleccionar esa casilla, el buzzer empieza bloqueado y se libera manualmente como en una pregunta normal. **El equipo que gane ese buzzer es quien descubrió el Daily Double y quien debe apostar**: el sistema lo asigna automáticamente, sin selector de equipo del moderador.

Al ganar, los buzzers se bloquean y su celular cambia al formulario de apuesta. **La apuesta máxima es el puntaje de ese equipo en el instante en que ganó el buzzer**: guardar ese monto como `wager_cap` de la ronda, mostrarlo en su teléfono y validar la apuesta en el servidor. Si sus puntos son positivos, admitir enteros de 1 hasta `wager_cap`. Si tiene cero o puntos negativos, el único importe posible es 0; mostrarlo claramente y permitir continuar sin cambiar su puntaje. Así se respeta el máximo sin inventar puntos prestados. Una edición posterior del puntaje no cambia el máximo ya fijado.

Confirmar la apuesta en ese mismo celular; el moderador ve el importe y después revela/lee la pregunta. Nadie más apuesta ni compite en esta casilla. Calificar suma o resta el importe una sola vez, marca la casilla usada y deja la ronda cerrada hasta el siguiente avance manual. El formulario de apuesta de la demo del moderador es solo una simulación y debe retirarse del flujo real.

### Contenido editable

Conservar «Escribir / editar pregunta» en el panel del moderador y permitir editar el texto de cualquier casilla antes de jugarla; guardarlo en Supabase para que aparezca igual en todos los dispositivos y tras recarga. Ofrecer una pantalla simple de preparación para editar categoría, valor y pregunta de las 20 casillas antes del evento, o un único archivo privado de importación documentado. El usuario **no debe buscar texto repartido en tres HTML**. Si se usa archivo de importación, dejar un ejemplo `preguntas.ejemplo.json` y explicar exactamente dónde cambiarlo y cómo subirlo; nunca publicar respuestas ni la posición secreta del Daily Double en el sitio de GitHub Pages. Los textos de interfaz (avisos y botones) pueden quedar en un archivo `src/textos.js` fácil de encontrar. No publicar preguntas futuras en un bundle visible si el juego necesita mantenerlas secretas.

### Moderador y tablero

- El moderador ve el tablero, pregunta y valor actuales, estado de buzzer, ganador, equipos conectados y puntajes; puede editar cualquier puntaje mediante acción autorizada y registrada. No puede añadir equipos manualmente.
- Si todos han respondido mal, el moderador puede pulsar «Cerrar pregunta sin más respuestas»: conserva los descuentos ya hechos, cierra la ronda, quita el verde, deja la casilla usada y permite «Siguiente pregunta». No cerrar automáticamente por contar equipos, pues un equipo que falló puede volver a competir.
- Las casillas desaparecen del tablero jugable tras el **primer veredicto** correcto o incorrecto. Una incorrecta no cierra la pregunta actual: puede haber nuevos ganadores y veredictos en ella. Volver sin gastar solo antes de calificar. Preguntas aún no seleccionadas no se consumen.
- Conservar en tablero público el inicio con categorías tapadas, animación de revelación hacia la izquierda y transición a tablero. Coordinar una única fase de inicio entre displays; no permitir que el tablero público abra preguntas o cambie la partida por clic local. El moderador controla cuál se juega y cuándo se ve públicamente. Mantener el marcador inferior con hasta cinco equipos conectados sin solapamiento, incluido ingreso/salida a mitad de juego.
- Incluir controles de teclado razonables en moderador y buzzer, documentar teclas elegidas, evitar activarlos mientras el foco esté en input/modal, y comprobar click/tap y teclado real. No depender de atajos de navegador o de teclas que iOS no ofrece sin teclado externo.

## 7. Entrega por hitos pequeños y pruebas con el usuario

Claude Code debe completar **un hito, mostrar cómo probarlo, esperar el resultado visible del usuario, anotar `ESTADO.md` y hacer commit** antes de extender la siguiente función importante. Puede preparar trabajo independiente durante la espera; no declarar verificado lo que solo prueban logs. En VS Code, comandos cortos copiables, sin procesos ocultos que se cierren solos. Si falla dos veces el mismo enfoque, aplicar el informe de atasco de la guía global.

| Hito | Implementación | Prueba observable desde la entrada real |
| --- | --- | --- |
| 0. Base | Un repositorio, Vite multipágina, tres HTML conservados visualmente, `.env.example`, `CLAUDE.md`, `ESTADO.md`, migración inicial. | Abrir las tres vistas en navegador; sin datos fijos presentados como equipos reales. |
| 1. Corte vertical | Supabase conectado, moderador autenticado, dos capitanes registrados, página publicada tempranamente. | Moderador en computador, dos celulares en redes distintas: alta/login y nombres visibles en el tablero. Probar correo de confirmación real. |
| 2. Pregunta y sincronía | Seleccionar, mostrar/cancelar sin gastar; Realtime y carga de instantánea. | Elegir una pregunta en moderador; verla en tablero/celulares según la fase; volver y confirmar que la casilla sigue disponible. Recargar una pantalla y obtener el estado actual. |
| 3. Buzzer | Bloqueo, mensaje anticipado, 100 ms, liberación, adjudicación atómica, verde y bloqueo global. | Pulsar antes de liberación; luego probar dos celulares casi a la vez y pulsación por tecla/tap. Exactamente un verde consistente en tres displays; los demás no ganan. |
| 4. Puntajes | Correcta/incorrecta, pregunta usada, reintentos tras error, edición del moderador. | Marcar mal: resta valor, casilla no se puede reelegir y ambos pueden volver a pulsar en la misma pregunta. Marcar bien al siguiente: suma valor. Doble clic no duplica puntaje. |
| 5. Presencia | Salida por pérdida de red y reconexión; ingreso tardío; cinco marcadores; reemplazo de teléfono. | Desactivar internet, reconectar y ver puntaje intacto. Registrar otro capitán durante partida: aparece con 0 sin solapamiento. Iniciar sesión con el mismo equipo en otro teléfono: aviso, confirmación y teléfono anterior expulsado. |
| 6. Daily Double | Elección secreta por sistema en $600/$800, primer buzzer gana la casilla, apuesta máxima igual a puntos del descubridor al ganar, validación y calificación. | Nadie ve la estrella antes. El capitán apuesta desde su teléfono, el moderador ve el importe y correcta/incorrecta suma/resta la apuesta. Probar que no se admite superar el máximo y el caso de 0 puntos. |
| 7. Ensayo | GitHub Pages estable, revisión de RLS, pruebas de concurrencia y fallos, instrucciones finales. | Ensayo completo de 20 minutos, con recarga, desconexión, dos redes, cambio de pregunta, apuestas y puntajes. |

Automatizar lo que protege reglas difíciles: pruebas para carrera simultánea, transiciones de ronda, revisión obsoleta, doble veredicto, límite de cinco equipos y permisos/RLS. La prueba automatizada complementa la comprobación visual del usuario, no la reemplaza. Si Claude no puede ver directamente los teléfonos, dar pasos numerados y preguntar qué apareció en cada uno; marcarlo como pendiente hasta recibir confirmación.

## 8. Publicación y operación

Preparar GitHub Pages mediante Actions usando el build de Vite con `base` correspondiente al nombre del repositorio. Rutas estables para `/tablero`, `/capitan` y `/moderador` (o páginas HTML equivalentes compatibles con Pages); compartir enlaces HTTPS reales. Configurar en Supabase las URLs de redirección y sitio para el dominio de Pages. Verificar desde un celular con datos móviles, no solo desde `localhost`; un servidor local puede servir para desarrollo, pero no es la URL de la partida entre redes distintas.

Antes del evento: comprobar que el proyecto Free está activo, iniciar sesión en moderador y capitanes, hacer una ronda de prueba, confirmar el número de equipos y volver a cero solo con acción administrativa explícita. Mantener un registro corto de cómo iniciar una nueva partida y recuperar un cliente desconectado. En GitHub Pages el código fuente del frontend puede verse: jamás publicar respuestas privadas o credenciales en HTML, JS, configuración compilada o historial git.

## 9. Errores previsibles y solución corta

| Error frecuente | Cómo evitarlo / comprobarlo |
| --- | --- |
| Copiar `localStorage`, equipos ficticios o la demo de puntajes como fuente de verdad | Usar instantánea de Supabase; probar recarga en dos dispositivos y que el nuevo equipo empiece en 0. |
| Contar como ganador un evento del celular emitido antes de liberar | Registrar generación y estado en servidor; validar bajo bloqueo. Los intentos anticipados no quedan en cola. |
| Resolver la carrera de buzzers con `Date.now()` o con estado React/JS del navegador | Adjudicar en una única función SQL transaccional. Dos pulsaciones simultáneas deben devolver un solo ganador. |
| Dejar 2 segundos de cooldown por copiar la demo del moderador | Cambiar a 100 ms; probar pulsación antes, durante y después del cooldown. |
| Descontar dos veces por doble clic o repetir una petición tras reconectar | ID único por intento y veredicto; prueba de reenvío idéntico. |
| Marcar incorrecta y cerrar automáticamente la pregunta | La casilla sale del tablero, pero la ronda sigue para todos; solo el moderador la cierra o alguien acierta. |
| Mostrar la estrella Daily Double en HTML o elegir equipo desde el moderador | Ubicación persistida y secreta ($600/$800); ganador del buzzer es asignado automáticamente como apostador. |
| Validar la apuesta solo en el formulario o usar puntaje cambiado después | Congelar `wager_cap` al ganar; validar entero y máximo en servidor. Con 0 o menos puntos, permitir solo 0. |
| Poner las preguntas futuras o respuestas en el JavaScript público | Editar/guardar en Supabase y servir solo el texto que ya se pueda revelar. |
| Creer que cerrar el modal del teléfono anterior revoca su capacidad | Revisar `active_device_token` en cada petición al servidor; probar pulsar desde el dispositivo expulsado. |
| Usar Presence como puntaje, o mostrar equipo desconectado para siempre | Presence solo indica conexión; puntos persistidos en DB; tras reconectar recargar instantánea. |
| Exponer `service_role` o habilitar todos los grants/RLS permisivos para que funcione | Solo publishable key en navegador; grants explícitos y pruebas de permisos denegados. |
| Suponer que el registro por email funciona en el plan gratis | Probar confirmación con correo real temprano; resolver envío antes de invitar a cinco equipos. |
| En GitHub Pages se ve una pantalla en blanco | Confirmar `base` de Vite, rutas del build y URL de redirección Auth con el enlace HTTPS real desde un celular. |
| Decir «funciona» porque `curl` o los logs pasan | Hacer el flujo desde los tres displays reales; registrar qué confirmó el usuario. |

## 10. Decisiones pendientes y criterio de terminado

Las reglas del Daily Double, el cierre manual tras errores y el reemplazo de celular ya están decididas. Si al ensayar el usuario prefiere otra regla para equipos con cero o puntaje negativo, cambiarla con su indicación antes de la partida. Faltan como insumos la cuenta del moderador y los textos reales de preguntas/respuestas; esos son insumos, no decisiones sobre las reglas. La ubicación $600/$800, el descubridor, el cierre manual tras errores y el reemplazo de celular ya están decididos.

El proyecto está terminado cuando el usuario confirme el ensayo desde el flujo completo: moderador selecciona y libera, dos móviles compiten, un único ganador aparece verde en su teléfono y tablero, las decisiones correcta/incorrecta actualizan puntos y desbloqueos, la siguiente pregunta vuelve a bloquear, reconexión conserva puntaje, el ingreso tardío entra con cero, Daily Double se apuesta en el teléfono elegido, y los tres displays coinciden tras refrescar.

## Fuentes técnicas de referencia

- Supabase Auth: https://supabase.com/docs/guides/auth/passwords
- API keys y RLS: https://supabase.com/docs/guides/getting-started/api-keys y https://supabase.com/docs/guides/database/postgres/row-level-security
- Funciones de base de datos: https://supabase.com/docs/guides/database/functions
- Realtime y Presence: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes y https://supabase.com/docs/guides/realtime/presence
- GitHub Pages con Actions: https://docs.github.com/en/get-started/start-your-journey/deploying-your-website-automatically

Usar la documentación oficial vigente cuando se implemente; los nombres de menús, cuotas y API pueden cambiar.