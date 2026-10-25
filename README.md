# Bot de noticias gaming para Discord

Publica en tu servidor:

- 🎮 **Juegos gratis de Epic Games**: un mensaje por semana con todos los juegos, hasta cuándo se pueden reclamar y los próximos.
- 🪂 **Twitch Drops nuevos**: un mensaje por juego con recompensas y fechas. Cada usuario elige qué juegos seguir o bloquear.
- 🏆 **Pick'em de esports** (LoL, Valorant, Marvel Rivals, CS2, Rainbow Six, Overwatch): un mensaje por pick'em con su fecha límite y un **recordatorio el último día**.

Cada usuario decide de qué quiere que le mencione con `/avisos`. Toda la ayuda está en `/ayuda`.

---

## 1. Crear el bot en Discord

1. Entra en <https://discord.com/developers/applications> → **New Application**.
2. En **General Information** copia el **Application ID** → será `DISCORD_CLIENT_ID`.
3. En **Bot** → **Reset Token** y copia el token → será `DISCORD_TOKEN` (no lo compartas).
   No hace falta activar ningún *Privileged Gateway Intent*.
4. Invita el bot a tu servidor con este enlace (cambia `TU_CLIENT_ID`):

   ```
   https://discord.com/oauth2/authorize?client_id=TU_CLIENT_ID&scope=bot%20applications.commands&permissions=19456
   ```

   Permisos: *Ver canal*, *Enviar mensajes* e *Insertar enlaces*.

## 2. Configurar

```bash
cp .env.example .env
```

Rellena `DISCORD_TOKEN` y `DISCORD_CLIENT_ID`. Opcional: `DEV_GUILD_ID` con el ID de tu servidor
(clic derecho en el servidor → *Copiar ID*, con el modo desarrollador activado) para que los comandos
aparezcan al instante. Sin él se registran globalmente y pueden tardar hasta una hora la primera vez.

## 3. Desplegar en el minipc (Docker)

```bash
git clone <este repo> bot-discord && cd bot-discord
cp .env.example .env   # y rellénalo
docker compose up -d --build
docker compose logs -f # ver qué hace
```

- Los datos (SQLite) se guardan en `./data` y la configuración de pick'em en `./config`, así que
  sobreviven a reinicios y actualizaciones.
- El contenedor corre con el usuario `node` (UID 1000). Si en Linux da error de permisos en `./data`:
  `sudo chown -R 1000:1000 data config`.
- **Actualizar:** `git pull && docker compose up -d --build`.
- **Parar:** `docker compose down`.

### Sin Docker (desarrollo)

Requiere Node 22.12 o superior.

```bash
npm install
npm run dev      # arranca con recarga automática, leyendo .env
npm test         # tests
npm run check-sources            # prueba las fuentes en vivo sin Discord
npm run check-sources -- pickem  # solo una: epic | drops | pickem
```

## 4. Primeros pasos en el servidor

1. Un admin elige el canal: `/config canal canal:#noticias`
   (opcional: un canal por categoría, p. ej. `/config canal canal:#drops categoria:Twitch Drops`).
2. Cada usuario se suscribe: `/avisos activar categoria:Todas`.
3. Para probar ya: `/config forzar categoria:Juegos gratis de Epic`.

## Comandos

| Comando | Quién | Qué hace |
|---|---|---|
| `/ayuda [tema]` | todos | Documentación |
| `/avisos activar\|desactivar categoria` | todos | Recibir o dejar de recibir menciones (Epic, Drops, Pick'em o Todas) |
| `/avisos ver` | todos | Tus suscripciones y filtros |
| `/drops seguir\|bloquear\|quitar juego` | todos | Filtrar de qué juegos te aviso (autocompleta) |
| `/drops filtros` · `/drops activos` | todos | Tus filtros · campañas activas |
| `/epic` | todos | Juegos gratis ahora mismo |
| `/pickem activos` | todos | Pick'em abiertos y su cierre |
| `/pickem descartar id` | admins | Borra un pick'em detectado por error |
| `/config canal\|quitar-canal\|activar\|desactivar\|ver\|forzar` | admins | Configuración del servidor |

Reglas de los drops: si no sigues ningún juego, te aviso de todos menos los bloqueados; si sigues
alguno, solo de esos. Los mensajes de drops traen botones **🔔 Seguir** / **🚫 Bloquear**.

## Cómo funciona cada fuente

| Fuente | De dónde sale |
|---|---|
| Epic | API pública de la tienda (`freeGamesPromotions`) |
| Twitch Drops | agregador comunitario [`twitch-drops-api.sunkwi.com`](https://twitch-drops-api.sunkwi.com/drops) |
| Pick'em | RSS de Google News y Bing News + lectura del artículo |

- **Frecuencia:** las tres fuentes se consultan **una vez al día**, a la hora de `DAILY_RUN_TIME`
  (por defecto las 18:00, justo después del cambio semanal de Epic de los jueves a las 17:00), y
  también al arrancar el bot. Para consultar en cualquier momento: `/config forzar`.
  Los recordatorios de pick'em se comprueban cada 10 min, pero solo miran la base de datos (no hacen
  peticiones a internet), para poder avisar a su hora.
- **Drops:** la primera vez que se configura un servidor no se publican los drops que ya existían
  (para no llenar el canal); solo los nuevos. Están en `/drops activos`. Al consultar una vez al día,
  una campaña que empiece y termine entre dos consultas (algunas duran solo unas horas) no se publica.
- **Pick'em:** es 100 % automático. El bot busca noticias recientes con "pick'em" y el nombre del juego,
  lee el artículo y extrae la fecha de cierre (entiende inglés y español, y zonas como "10:00 a.m. PT").
  - Si la fuente solo da el día, se asume las 23:59 (hora de Madrid) y se marca como *aproximada*.
  - Si no se encuentra fecha, se publica "fecha no indicada" (solo con noticias de menos de 36 h) y no hay recordatorio.
  - Si el artículo solo habla de cierres ya pasados, no se publica.
  - El recordatorio se envía a las 09:00 del día de cierre (24 h antes si cierra antes de las 11:00).
  - Algunos medios bloquean la lectura automática (Cloudflare); entonces se usa solo el título. Si sale
    algo erróneo, `/pickem descartar`.
- **Añadir juegos de pick'em:** edita `config/pickem-sources.json` (alias y búsquedas). Se aplica en la
  siguiente consulta, sin reiniciar.

## Problemas conocidos

- **Bloqueos de LaLiga en España:** en días de partido algunos ISP bloquean IPs de Cloudflare y fuentes
  como la de drops pueden fallar durante horas. El bot conserva los últimos datos buenos y reintenta;
  nunca interpreta un fallo como "no hay novedades". Si te afecta a menudo, configura un proxy en `.env`
  (`HTTPS_PROXY=...` y `NODE_USE_ENV_PROXY=1`).
- **"La aplicación no ha respondido" en los comandos:** Discord solo da 3 s para contestar y no se
  puede ampliar. Si la red tarda en abrir conexiones (con la VPN del minipc, a veces 4 s), el bot
  mantiene abierta la conexión con la API de Discord mediante un ping cada 30 s
  (`src/discordRest.ts`), para no tener que abrir una nueva en cada comando. Si vuelve a pasar, el
  log indica cuánto tardó la respuesta (`respuestaTrasMs`).
- La fuente de drops y la extracción de fechas de pick'em no son APIs oficiales: si cambian, el bot lo
  registra en los logs en lugar de publicar datos erróneos. El adaptador de drops está aislado en
  `src/sources/drops/` para poder cambiar de proveedor.

## Estructura

```
src/
  index.ts             arranque (cliente, BD, comandos, tareas)
  commands/            comandos slash
  interactions/        botones
  jobs/                tareas programadas (epic, drops, pickem, recordatorios)
  sources/             fuentes: epic.ts, drops/, pickem/
  notifier/            mensajes (embeds), menciones y publicación
  db/                  SQLite: migraciones y repositorios
config/pickem-sources.json
tests/                 vitest + fixtures reales
```
