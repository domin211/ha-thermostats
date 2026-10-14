# ha-thermostats

A focused climate-control panel for a Home Assistant installation with ~85
`climate.*` entities (hotel guest rooms, common areas, wellness, staff areas
and AC units). Next.js 15 App Router, TypeScript, no UI framework.

## Design direction

The UI is modelled on the Figma Community file
[**Apple Thermostat** by TAKISTAR](https://www.figma.com/community/file/1323735854821988829/apple-thermostat)
("what if Apple made a thermostat?"). Credit for the visual language goes to
that file; this app adapts it to a multi-zone building.

- **Pure black** (`#000`) dark mode, iOS system greys for surfaces
  (`#1c1c1e`, `#2c2c2e`), separators and secondary text.
- **Apple typography**: system stack (`-apple-system`, SF Pro), falling back
  to Inter. Large bold section titles like "Control Panel"; light-weight
  numerals inside dials.
- **Every thermostat is a round, watch-face dial**: a thick rounded arc on a
  dark grey track (300° sweep, gap at the bottom), a big centred number for
  the current reading and a small icon below: orange flame when heating, blue
  snowflake/drop for cooling/drying, grey when idle. Off zones are greyed out
  with no arc. Cooling arcs use the blue-to-red gradient from the reference.
  AC fan speed is shown as a dashed ring.
- **Inline control** (UI in Czech): drag the ring of any dial (whole degrees, sent on release) or use the −/+ buttons (1 °C). Dials are always active, even when a zone is off. Ring colour carries the state: orange = heating, light blue = not heating, blue gradient = AC cooling, red = sensor fault. AC units have an inline mode selector. Only the ring captures touch, so the page scrolls normally on phones.
- **Areas**: Hlavní budova (office + rooms 2–5), Červený domeček (6–14), Modrý domeček (16–25), Chodby domečků (two dials: Červené chodby and Modré chodby, each driving all three corridor/staircase thermostats, showing their average temperature), Wellness, Personál a kanceláře, Klimatizace, Společné prostory. Rooms 14 and 15 are one physical room shown as "Pokoj 14": one Pokoj dial (14_pokoj + 15_pokoj) and one Koupelna dial (both bathrooms and WCs).
- **Search and filters** are iOS-style: search field, segmented filter, area chips.
- **Sensor faults**: readings above 60 °C show "Sensor fault" in red instead of
  a number; missing readings show `--`.
- Responsive: dense grids on desktop, a 2-column dial grid on phones.

## How it works

- `src/lib/ha.ts` (server-only) talks to Home Assistant: `GET /api/states`
  filtered to `climate.*`, and `POST /api/services/climate/set_temperature` /
  `set_hvac_mode`. The token never reaches the browser.
- The browser polls `GET /api/climates` every 5 s (paused while the tab is
  hidden) and sends changes to `POST /api/control`. Setpoint taps are batched
  and sent after a short pause; values are shown optimistically.
- Without `HA_URL`/`HA_TOKEN` the app runs on an in-memory mock built from
  `src/lib/snapshot.json`, so it can be developed offline.
- `HA_READ_ONLY=1` blocks every write (useful for testing against a live
  system).
- Password gate: `APP_PASSWORD`, session stored in an HMAC-signed, httpOnly
  cookie (`SESSION_SECRET`), checked in `middleware.ts` for pages and API.
- Area grouping is in `src/lib/areas.ts` (regexes on entity ids + friendly
  name overrides). Guest rooms pair `NN_pokoj` + `NN_koupelna` (+ `NN_wc`).

## Run

```bash
cp .env.example .env   # fill in values
npm install
npm run dev            # http://localhost:3000
```

## Deploy (Docker)

```bash
cp .env.example .env   # HA_URL, HA_TOKEN, APP_PASSWORD, SESSION_SECRET, PORT
docker compose up -d --build
```

The image uses Next's `output: 'standalone'` build and runs as a non-root
user. `restart: unless-stopped` keeps it up across reboots. `PORT` in `.env`
selects the published host port.

Caddy (in the same compose file) terminates TLS for `topeni.ufandy.eu` with
automatic Let's Encrypt certificates on ports 80/443 and proxies to the app,
which is only reachable inside the compose network. HTTP and plain-IP requests
redirect to `https://topeni.ufandy.eu`. Change the domain in `Caddyfile`.
