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
| Progreso, objetivos, temporadas | `progress.ts` |
| Estado, guardado y acciones | `Club.ts` |

**Datos generados:** el juego no tiene edad, nacionalidad ni pierna de los jugadores; se generan de forma determinista a partir del id. Las leyendas son ficticias.

**Partidos:** son partidos jugables reales. Los atributos de la carta, el ajuste de puesto, la química y el capitán modifican los atributos del jugador en el partido; los lanzadores designados se usan en penales y tiros libres. Rivals, Champions, Squad Battles y torneos son contra la IA.

**Mercado:** simulado y local, sin otros usuarios. Para hacerlo online habría que implementar `MarketBackend` (`market.ts`) en un servidor con cuentas y validar allí saldos, precios y recompensas: este cliente guarda todo en el dispositivo y no es resistente a trampas.

**Economía:** `ECONOMY` en `economy.ts`. Los sobres rinden menos (venta rápida) que su precio y su valor de mercado medio no supera el precio (hay pruebas). Límites: tope de monedas, 40 operaciones de mercado por día, premios reducidos tras 12 partidos al día o con partes cortas, recompensas únicas por periodo, abandonar cuenta como derrota.

**Temporadas:** fechas configurables en `SEASONS` (`progress.ts`).

**Pendiente:** multijugador real (Rivals/Champions online), traducción al inglés/portugués de este modo (está solo en español).
