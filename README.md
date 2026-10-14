# ha-thermostats

A focused climate-control panel for a Home Assistant installation with ~85
`climate.*` entities (hotel guest rooms, common areas, wellness, staff areas
and AC units). Next.js 15 App Router, TypeScript, no UI framework.

## Design direction

The brief was "must not look AI-generated", so the app is designed like a
piece of building hardware instead of a SaaS dashboard.

- **References.** Braun / Dieter Rams (T3, ET66): warm grey housing,
  off-white faceplates, a single signal colour, controls that look like
  controls. Nest / ecobee: the current temperature is the hero, the setpoint is
  secondary. Honeywell / Siemens building panels: dense, labelled zones, letter
  codes per area (A Guest rooms, B Common, C Wellness, D Staff, E AC).
- **Palette.** Housing `#e9e6df`, faceplate `#f7f5f0`, ink `#1f1e1c`,
  hairlines `#d4d0c7`. Braun orange `#e3591f` is reserved for *heating* (left
  edge stripe, status, counter). Petrol `#2e6a86` only for cooling. Oxide red
  for faults. No gradients, no glass, no shadows, no emoji.
- **Type.** IBM Plex Sans for labels, IBM Plex Mono with tabular figures for
  every number, so readings line up like a segment display. Decimals and units
  are set smaller, the way instrument readouts do it.
- **Controls.** Square-ish stepper with hairline divisions for ±0.5 °C, a
  rocker switch for on/off, a segmented mode selector for AC units. Group
  actions live behind a "Group" toggle with a confirmation, so you can't switch
  off the whole hotel by accident.
- **Faults.** Any reading above 60 °C (several sensors report ~2070 °C) is
  shown as a hatched "Sensor fault" tag instead of a number; a missing reading
  shows `--.-`.
- **Phones first-class.** One column, full-width search and filters, a
  horizontally scrolling area bar, 36 px touch targets.

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

Note: the app is served over plain HTTP unless you put a TLS proxy (Caddy,
Traefik, nginx) in front of it. Do that before using it outside a trusted
network.
