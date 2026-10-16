# 🗺️ Plan de mejoras — Football Elite 3D

Plan de lo que falta o se puede mejorar, ordenado por fases. Cada punto dice **qué** hacer, **por qué** importa y **dónde** está el código que hay que tocar, para poder tomarlo como tarea suelta. Esfuerzo aproximado: **S** (horas), **M** (1–3 días), **L** (una semana o más).

Ya hecho en esta versión: `jugar.html` (el juego en un solo archivo, se abre con doble clic tras descargar el ZIP), sonidos nuevos del balón (cabezazo, control, toques de conducción, rodar por el césped, vallas, guantes del arquero), bocina de gol, vibración del mando, prueba automática sin servidor y ZIP de Windows publicado en *Releases*. Después: **control de balones aéreos con el pecho y el muslo** y **remates de volea, tijera y chilena** (jugador y IA). Luego: receptores que salen al encuentro del pase, barra de potencia más rápida, arquero que juega con los pies, ley de la ventaja, sonido 3D, volúmenes de balón y árbitro, silencio con M, equipación del visitante a elegir, control aéreo orientado y regeneración automática de `jugar.html` (hook de pre-commit). Y después: logros, tres estadios nuevos, editor de equipos, liga con dos divisiones y mercado, UI de celular que entra en cualquier pantalla, calidad automática, modo foto y repeticiones guardadas, pruebas de audio, instalador de Windows y app de macOS, inglés y portugués, y espectadores y menos retraso en el online.

---

## Fase 1 — Pulir lo que ya existe (corto plazo)

| # | Mejora | Por qué | Dónde | Esfuerzo |
|---|---|---|---|---|
| 1.1 | ~~Publicar el ZIP de Windows en *Releases* junto al APK~~ ✅ hecho | Descarga directa para PC con un enlace fijo, como el APK | `.github/workflows/ci.yml` (trabajo `windows`) | S |
| 1.2 | ~~Regenerar `jugar.html` automáticamente~~ ✅ hecho en `main` (o un *hook* de pre-commit) | Que el ZIP del repositorio nunca quede con una versión vieja | `ci.yml`, `scripts/single-file.mjs` | S |
| 1.3 | ~~Sonido 3D del balón~~ ✅ hecho: panear y atenuar golpeos y botes según la posición respecto a la cámara | Ahora todo suena en el centro; con paneo se "ve" con el oído dónde está la jugada | `src/audio/AudioEngine.ts` (añadir `StereoPannerNode` por voz), `MatchAudio.ts` (pasar `x,z` del evento) | M |
| 1.4 | ~~Volumen separado para el balón~~ ✅ hecho y para el árbitro en *Configuración → Sonido* | Hay jugadores que quieren el público alto y el balón bajo, o al revés | `Settings.ts`, `App.ts` (panel Sonido), un bus `ball` en `AudioEngine` | S |
| 1.5 | **Sonido de lluvia/viento y del césped mojado** (si se añade clima, ver 2.4) | Ambiente | `AudioEngine.startAmbience` | S |
| 1.6 | ~~Tecla de silencio rápido (M)~~ ✅ hecho y botón de silencio en la pausa | Comodidad | `Input.ts` (nueva acción), `MatchRunner.pause` | S |
| 1.7 | ~~Elegir la equipación del visitante a mano~~ ✅ hecho | Limitación conocida del README | `App.ts` (pantalla de partido rápido), `chooseAwayKit` en `data/teams.ts` | S |
| 1.8 | **Probar `jugar.html` en Windows real** (Chrome, Edge y Firefox) y anotar el resultado | Solo se probó en Chromium de Linux | — | S |

## Fase 2 — Más juego (medio plazo)

| # | Mejora | Por qué | Dónde | Esfuerzo |
|---|---|---|---|---|
| 2.1 | ~~Ley de la ventaja~~ ✅ hecho: el árbitro deja seguir si el equipo que recibió la falta conserva el balón y castiga después | Regla clave que falta; los partidos se cortan demasiado | `src/sim/Match.ts` (`foul` → estado "ventaja" con temporizador), `Referee.ts` (gesto de brazos), HUD | M |
| 2.2 | **Mano** (balón que toca el brazo separado del cuerpo) | Regla que falta | `Match.ts` (`touchBall`: altura y posición del brazo según la animación) | M |
| 2.3 | **Multijugador local**: 2 mandos en el mismo PC (1 contra 1 y cooperativo 2 contra IA) | Muy pedido en juegos de fútbol de PC; hoy solo hay online | `Input.ts` (un `Input` por mando con `activePad` por índice), `MatchRunner` (dos `HumanController`), menú de selección de lado | L |
| 2.4 | **Clima**: lluvia (balón más rápido y botes más bajos, césped brillante), nieve (balón naranja) y viento (desvía los balones altos) | Variedad visual y de juego | `Ball.ts` (fricción, rebote y fuerza de viento), `render/stadium/pitch.ts`, partículas en `fanfx.ts` | M |
| 2.5 | **Comentarista con texto** (rótulos tipo transmisión: "¡Qué atajada de…!", "Remate al palo") y, más adelante, voz sintetizada | Da vida al partido | Nuevo `src/ui/Commentary.ts` alimentado por los `MatchEvent` | M |
| 2.6 | **Lesiones leves y tarjetas acumuladas** en torneo y carrera (sanción de un partido) | Profundidad en los modos largos | `modes/Career.ts`, `modes/Tournament.ts`, `sim/Match.ts` | M |
| 2.7 | **Tácticas en vivo**: cambiar formación y mentalidad desde la pausa, instrucciones por jugador | Hoy la mentalidad se cambia con la cruceta pero no la formación | `App.pauseMenu`, `ai/TeamAI.ts` | M |
| 2.8 | **Más regates y celebraciones** (caño, croqueta, rabona; celebraciones elegibles con el stick derecho tras el gol) | Variedad | `types.ts` (`SKILL_KINDS`), `animations.ts`, `Match.ts` | M |
| 2.10 | ~~Control aéreo orientado~~ ✅ hecho: con el stick al recibir de pecho, el balón cae hacia ese lado (como el primer toque orientado a ras de suelo); y *sombrero* al rival con el pecho | Más control para el jugador humano en los balones aéreos | `Match.aerialControl` (usar `firstTouchDir`), `HumanController` | S |
| 2.11 | **Más remates aéreos**: escorpión, remate en plancha (cabezazo en palomita) y taco de primera | Variedad y jugadas espectaculares | `sim/Aerial.ts` (nuevo `AerialKind`), `animations.ts`, `HumanController.tryAerialShot` | M |
| 2.9 | **Mejorar la IA de ataque**: juego por bandas, paredes, tiros lejanos cuando el rival se encierra | Limitación conocida: juega demasiado por el centro | `ai/PlayerAI.ts`, `ai/TeamAI.ts` (puntuación de opciones) | M |

## Fase 3 — Modos y contenido (largo plazo)

| # | Mejora | Por qué | Dónde | Esfuerzo |
|---|---|---|---|---|
| 3.1 | ~~**Editor de equipos**: nombre, colores, escudo, jugadores y atributos, guardado local y exportable~~ ✅ hecho: crear y editar equipos (colores, escudo, jugadores, atributos), exportar e importar | Que cada uno juegue con "su" equipo | Nuevo `src/ui/Editor.ts`, `data/teams.ts`, `save/Storage.ts` | L |
| 3.2 | ~~**Modo Liga completa** con varias divisiones, ascensos y descensos, y mercado de fichajes en la carrera~~ ✅ hecho: dos divisiones con ascensos y descensos, presupuesto, noticias y mercado de fichajes | Rejugabilidad | `modes/Career.ts`, `modes/Competition.ts` | L |
| 3.3 | ~~**Más estadios** (tamaños distintos, estadio pequeño de barrio, estadio de noche con niebla)~~ ✅ hecho: cancha de barrio, puerto de noche con niebla y Gran Monumental | Variedad visual | `data/stadiums.ts`, `render/stadium/*` | M |
| 3.4 | ~~**Repeticiones guardables** y modo foto (cámara libre en la pausa)~~ ✅ hecho: modo foto en la pausa (cámara libre y captura PNG) y galería de repeticiones guardadas | Compartir jugadas | `render/CameraDirector.ts`, grabación de estados que ya usa la repetición | M |
| 3.5 | ~~**Logros y desafíos** (marcar de vaselina, ganar sin recibir goles, remontar…)~~ ✅ hecho: 20 logros con su pantalla y avisos durante el partido | Objetivos a corto plazo | Nuevo `src/modes/Achievements.ts` escuchando `MatchEvent` | M |
| 3.6 | ~~**Online mejorado**: predicción del lado del invitado (menos retraso), espectadores y torneos online~~ ✅ hecho en parte: colchón adaptativo, predicción del invitado y espectadores en salas privadas (los torneos online quedan pendientes) | Limitación conocida del online | `net/NetSync.ts`, `server/` | L |
| 3.7 | ~~**Traducción al inglés y portugués**~~ ✅ hecho: inglés y portugués (Brasil), selector en Configuración | Más jugadores | Extraer textos de `App.ts`/`HUD.ts` a un `src/i18n/` | M |

## Fase 4 — Técnica y calidad

| # | Mejora | Por qué | Dónde | Esfuerzo |
|---|---|---|---|---|
| 4.1 | **Medir el rendimiento en GPU real** (portátil con gráfica integrada y móvil de gama baja) y ajustar los valores por defecto | Solo se probó con renderizado por software | `config/Settings.ts` (`mobileDefaults`) | S |
| 4.2 | ~~**Ajuste automático de calidad** según los FPS de los primeros segundos~~ ✅ hecho: baja resolución y sombras si no llega a 40 FPS, y lo recuerda | Que funcione bien en cualquier equipo sin tocar opciones | `MatchRunner.frame`, `MatchView` | M |
| 4.3 | ~~**Dividir los archivos grandes** (`Match.ts`, `App.ts`, `AudioEngine.ts` superan las 1.300 líneas)~~ ✅ hecho en parte: la música del menú salió de `AudioEngine.ts` a `MenuMusic.ts` (`Match.ts` y `App.ts` siguen grandes) | Mantenimiento | `src/sim/`, `src/ui/`, `src/audio/` | M |
| 4.4 | ~~**Pruebas de audio por análisis de señal** en CI (cada sonido produce señal, sin saturar)~~ ✅ hecho: `scripts/e2e-audio.mjs` (29 comprobaciones, también en CI) | Que un cambio no deje un sonido mudo | `tests/` + `OfflineAudioContext` en el navegador | S |
| 4.5 | ~~**Instalador de Windows** (`.exe` con acceso directo) y versión para **macOS**~~ ✅ hecho: instalador `FootballElite3D-Setup.exe` (Inno Setup) y app universal de macOS en CI | Instalación más cómoda en PC | `scripts/package.mjs`, `ci.yml` (`macos-latest`) | M |

---

### Cómo proponer o tomar una tarea

1. Elige un punto (por ejemplo **2.1 Ley de la ventaja**).
2. Crea una rama, implementa y añade una prueba en `tests/` (la simulación funciona sin gráficos, así que casi todo se puede probar con `makeMatch()` de `tests/helpers.ts`).
3. Ejecuta `npx tsc --noEmit`, `npm test` y `npm run build` (regenera `jugar.html`) antes de subir.
4. Marca el punto como hecho en este archivo.
