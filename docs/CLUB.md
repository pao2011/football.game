# Soffti Club (modo coleccionable)

Código: `src/modes/club/` (motor, sin interfaz) y `src/ui/club/` (pantallas). Guardado: `localStorage` clave `club` (misma capa que el resto del juego, `src/save/Storage.ts`); no hace falta IndexedDB para ~500 cartas.

| Sistema | Archivo |
|---|---|
| Cartas (catálogo, precios, rarezas) | `catalog.ts` |
| Química y entrenadores | `chemistry.ts`, `roles.ts` |
| Plantillas y paso al partido | `squads.ts` (`buildClubTeam`) |
| Economía y libro contable | `economy.ts` |
| Sobres (probabilidades públicas) | `packs.ts` |
| Mercado local simulado | `market.ts` |
| Competiciones y desafíos | `competitions.ts` |
| Progreso, objetivos, pase de temporada y misiones | `progress.ts` |
| Evoluciones (datos y lógica) | `evoDefs.ts`, `evos.ts` |
| Estado, guardado y acciones | `Club.ts` |

**Tipos de carta:** bronce, plata y oro (según la valoración) para todos los jugadores de todos los clubes del juego; Promesa (≤21 años), Especial (83+), Evento (por temporada), Leyenda (ficticias) y Héroe (veteranos de 31+), Ídolo (el mejor de cada club), Relámpago (rápidos), Titán (defensas y porteros 78+) y Maestro (medios de buen pase). Se generan en `catalog.ts` (`KIND_BOOST`), así que un club o una liga nueva del juego aparece sola en el modo.

**Datos generados:** el juego no tiene edad, nacionalidad ni pierna de los jugadores; se generan de forma determinista a partir del id. Las leyendas son ficticias.

**Partidos:** son partidos jugables reales. Los atributos de la carta, el ajuste de puesto, la química y el capitán modifican los atributos del jugador en el partido; los lanzadores designados se usan en penales y tiros libres. Rivals, Champions, Squad Battles y torneos son contra la IA. **Online** (club contra club): la cola `club` del servidor (`server/lobby.mjs`) empareja y reenvía la plantilla de cada jugador; el anfitrión simula el partido y valida la plantilla rival con `sanitizeOnlineTeam` (atributos 1..99). El resultado confirmado por los dos se contabiliza en el club (monedas, XP, puntos online, misiones y evoluciones). Los atributos los manda cada cliente: sin cuentas en el servidor no es resistente a trampas.

**Mercado:** simulado y local, sin otros usuarios. Para hacerlo online habría que implementar `MarketBackend` (`market.ts`) en un servidor con cuentas y validar allí saldos, precios y recompensas: este cliente guarda todo en el dispositivo y no es resistente a trampas.

**Economía:** `ECONOMY` en `economy.ts`. Los sobres rinden menos (venta rápida) que su precio y su valor de mercado medio no supera el precio (hay pruebas). Límites: tope de monedas, 40 operaciones de mercado por día, premios reducidos tras 12 partidos al día o con partes cortas, recompensas únicas por periodo, abandonar cuenta como derrota.

**Temporadas y pase:** fechas configurables en `SEASONS` (`progress.ts`). El pase tiene 30 niveles (`PASS_LEVEL_POINTS` puntos de temporada cada uno) con pista gratis y premium; la premium se desbloquea con monedas del juego (`PASS_PREMIUM_COST`).

**Misiones:** `MISSIONS` (`progress.ts`): grupos de tareas permanentes con premio por tarea y por grupo; avanzan con `track()`.

**Evoluciones:** `EVOS` (`evoDefs.ts`). Una carta en evolución progresa jugando de titular; al completar un nivel su `defId` pasa a `<base>~evo~<evo>~<nivel>` y `getCardDef` calcula la carta mejorada al vuelo (plantillas y química no cambian). Las cartas evolucionadas no se pueden vender en el mercado.

**Sobres:** además de básico, premium y especial: de oro, mega (12 cartas) y, solo como recompensa, 82+ (`minOvr`) y de leyenda.

**Pendiente:** mercado online real, traducción al inglés/portugués de este modo (está solo en español).
