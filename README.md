# collaborate.so

A public, ephemeral, collaborative whiteboard. Open `collaborate.so/<word>`
and you are in a room — no account, no signup, no payment. Draw, write, drop
stickies and shapes, embed media. Everything syncs live. Rooms self-destruct
24h after they go quiet.

This repo is the **backend + real-time sync layer** wired onto a finished
static frontend (`public/landing.html`, `public/room.html`).

---

## Architecture at a glance

One Node process. No database, no Redis, no microservices. Room state lives in
a plain `Map` in memory; rooms are ephemeral by design, so there is nothing to
persist. CRDT sync is [Yjs](https://yjs.dev); transport is `y-websocket`.

```
                      ┌──────────────┐
    browser  ───────► │  Cloudflare  │   public TLS, edge cache, DDoS shield
                      └──────┬───────┘
                             │  HTTPS  (Cloudflare Origin Certificate)
                      ┌──────▼───────┐
                      │    Nginx     │   TLS termination, reverse proxy
                      └──────┬───────┘
                             │  HTTP + WebSocket  →  app:3000
              ┌──────────────▼───────────────────────────┐
              │            Node process (one)            │
              │                                          │
              │  HTTP   GET /              landing.html   │
              │         GET /<room>        room.html      │
              │         GET /vendor/*      collab.js      │
              │         GET /healthz,/stats   JSON        │
              │                                          │
              │  WS     /<room>   ─ Yjs sync (document)   │
              │                   ─ awareness (presence,  │
              │                     cursors, live ink)    │
              │                                          │
              │  Rooms  Map<name → { Y.Doc, Awareness,    │
              │                      conns }>  — memory   │
              │  Sweeper  every 60s: drop empty rooms     │
              │           idle > 24h                      │
              └──────────────────────────────────────────┘
```

### Request flow

- **Open a room** — `GET collaborate.so/team-offsite` → Nginx → Node serves
  `room.html`. The page loads `/vendor/collab.js` (Yjs + sync glue, bundled).
- **Join sync** — `collab.js` opens a WebSocket to `wss://collaborate.so/team-offsite`.
  Node validates the room name, checks per-IP limits, then attaches the socket
  to that room's `Y.Doc`.
- **Edit** — a stroke/shape/object is a CRDT change. Yjs broadcasts the binary
  update to every other socket in the room. Persisted edits live in the doc.
- **Presence** — cursors, names, and *in-progress* (not-yet-committed) strokes
  travel over **awareness**, which is ephemeral and never stored.
- **Expiry** — the server publishes the room's expiry time over awareness; the
  client renders the "poofs in Xh Ym" clock from it.

### What syncs where

| Channel | Carries | Persisted? |
|---|---|---|
| Yjs document | finished strokes, shapes, objects, connectors, activity log | in memory, until the room expires |
| Awareness | cursor position, display name, in-progress (live) stroke/shape, room expiry | no — ephemeral |
| Local only | pan/zoom viewport, theme, undo history scope, creator id | never leaves the browser |

The document has five shared types (see `src/shared/schema.ts`):

- `strokes` — `Y.Array` (ordered: the eraser paints over earlier strokes)
- `shapes` — `Y.Map` keyed by id
- `objects` — `Y.Map` keyed by id; each value is a nested `Y.Map`, and its
  `text` field is a `Y.Text` so two people typing in the same sticky merge
  character-by-character.
- `edges` — `Y.Map` of connectors, each anchored to two artifacts by id
- `log` — `Y.Array` activity log, capped at the last 80 entries

Each artifact is stamped with a stable per-browser creator id, so only the
person who made it can delete it. That id is the only client-side identity —
no accounts, spoofable, a social signal rather than security.

---

## Project layout

```
public/            static site — served as-is
  landing.html       landing page (real /stats counts + room marquee)
  room.html          the canvas (loads vendor/collab.js)
  changelog.html     changelog page
  vendor/collab.js   built client bundle (gitignored)
src/
  server/            the Node backend
    index.ts           HTTP server, routing, WebSocket upgrades
    rooms.ts           in-memory room registry + 24h TTL sweeper
    ws.ts              Yjs sync + awareness wire protocol
    ratelimit.ts       per-IP limits (rooms, new rooms, message rate)
    blocklist.ts       room-name validation
    caps.ts            per-room object-cap backstop
    stats.ts           aggregate /stats payload
    static.ts          static-file serving (no-cache + ETag)
  client/            the browser app (bundled into collab.js)
    sync.ts            Yjs doc, provider, awareness, undo, creator id
    canvas.ts          viewport + canvas rendering
    draw.ts            pointer input, live-ink streaming
    objects.ts         DOM objects + Y.Text binding
    selection.ts       selection box, resize, properties panel
    connectors.ts      connectors between artifacts (hover handles)
    templates.ts       instant room templates (kanban / mind-map / …)
    presence.ts        cursors, avatars, peers' live ink
    log.ts             shared activity log
    colors.ts          shared palette + swatch builders
    state.ts           current tool / brush state
    index.ts           bootstrap + UI wiring
  shared/schema.ts   limits & constants — imported by both sides
config/blocklist.txt blocked room-name terms (extensible)
deploy/              Dockerfile, compose, nginx, systemd, deploy script
build.mjs            esbuild — builds both bundles
```

---

## Local development

Requires Node 20+.

```bash
npm install
npm run dev          # esbuild --watch + tsx watch on the server
```

Open <http://localhost:3000>. The server serves the static files itself in
development. Type a word, enter a room, open the same URL in a second window —
edits and cursors sync.

```bash
npm run build        # produce dist/server.cjs + public/vendor/collab.js
npm run typecheck    # tsc, no emit
npm start            # run the built server
```

---

## Configuration

All optional — see `.env.example`. In production these are set by the compose
file / systemd unit, not a committed `.env`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | port the Node process listens on |
| `HOST` | `127.0.0.1` | bind address (`0.0.0.0` inside Docker) |
| `NODE_ENV` | `production` | `development` also serves static from Node |
| `TRUST_PROXY` | `true` | read `CF-Connecting-IP` / `X-Forwarded-For` for per-IP limits |

Tunable limits live in one place — `src/shared/schema.ts`:

| Limit | Value |
|---|---|
| Objects per room | 5,000 |
| New rooms per IP | 5 / minute |
| Messages per IP | 200 / second |
| Concurrent rooms per IP | 5 |
| Room TTL after going quiet | 24 hours |

### Abuse handling

- **Room names** — validated against `config/blocklist.txt` (slurs, trademarks).
  One term per line, `#` for comments; substring + de-hyphenated matching.
  Edit the file and restart. The slur section is intentionally a starter —
  extend it from a maintained source before launch.
- **Per-IP** — connection and message-rate caps (above). A refused upgrade
  closes with an app-private WebSocket code so the client can show why.
- **Per-room** — the 5,000-object cap is enforced client-side (UX) *and*
  server-side (`caps.ts` trims overflow), so a client bypassing the UI cannot
  grief a room.

---

## Deployment

Target: one $12 DigitalOcean droplet (1 vCPU / 2GB / Ubuntu 24.04) behind
Cloudflare. Total infra cost ≈ **$12/mo** (Cloudflare free tier) — within the
$20 budget.

### One-time droplet setup

1. Install Docker + the compose plugin.
2. Clone the repo to `/opt/collaborate`.
3. Create a Cloudflare **Origin Certificate** and drop `origin.pem` /
   `origin.key` into `deploy/certs/` (see `deploy/certs/README.md`). Set
   Cloudflare SSL/TLS mode to **Full (strict)**.
4. Point the `collaborate.so` DNS A record at the droplet (proxied — orange
   cloud).

### Deploy

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

This runs two containers: `app` (the bundled Node server) and `nginx` (TLS +
proxy). The server is bundled into a single file, so the `app` image carries
no `node_modules`.

### Subsequent deploys

```bash
DEPLOY_HOST=root@<droplet-ip> ./deploy/deploy.sh
```

…or push to `main` — `.github/workflows/deploy.yml` type-checks, builds, then
SSHes in and restarts (set the `DEPLOY_*` repo secrets first).

### systemd alternative

Prefer running on the host without Docker? Use `deploy/collaborate.service`
(instructions in the file) and change the Nginx upstream to `127.0.0.1:3000`.

### Health

`GET /healthz` → `{"status":"ok","rooms":N,"users":N,"uptime":N}`. The Docker
healthcheck and any uptime monitor can poll it.

### Static assets

Nginx proxies everything to the app, which serves the static site; Cloudflare
caches it at the edge (the app sends correct `Cache-Control` headers). This
keeps the build a single artifact. To have Nginx serve static directly
instead, build on the host and point `root` at `public/` — see the commented
note in `deploy/nginx.conf`.

### Why no Redis / no database

A room is owned wholly by one process and lives only in memory. Rooms are
ephemeral — losing open rooms on a (rare) restart is acceptable, and the spec
says no backups. Redis would add ~50–150 MB of RAM pressure on a 2 GB box and
a moving part, buying only crash recovery we explicitly do not need. In-memory
is the correct choice at this scale.

---

## Capacity & scaling past one droplet

**Expected launch load** — 10K DAU, ~1,000 concurrent, comfortably handled by
one droplet. The real RAM ceiling is `active rooms × objects per room`; the
5,000-object cap exists partly to bound it. 1,000 typical rooms use well under
1 GB.

When you outgrow one droplet, in order:

1. **Resize the droplet.** A 2 vCPU / 4 GB box (~$24/mo) doubles headroom.
   Simplest possible step.
2. **Multiple processes, shard by room.** A room must live on exactly one
   process (its state is in-memory). Run N processes and route by a hash of
   the room name — Nginx `hash $uri consistent` upstream, or a tiny router.
   Still no shared state: each process owns a disjoint set of rooms.
3. **Multiple droplets, same sharding.** Hash the room name at Cloudflare or a
   load balancer to pick a droplet. Each droplet owns a shard of rooms. Still
   no database, still no Redis — because rooms never span machines.
4. **Only if a single room becomes too hot** for one core (an unusually
   popular room) do you need cross-process sharing of *one* room — that is
   where `y-redis` / Redis pub-sub for Yjs updates would come in. For this
   product that is unlikely; address it if it ever happens, not before.

The architecture is deliberately shard-friendly: independent rooms, no global
state. Scaling is a routing change, not a rewrite.

---

## Privacy

No accounts and no sign-up. The product stores no user data — rooms are
ephemeral and `/stats` exposes only aggregate counts and active room names
(rooms are public by URL). The client uses `localStorage` for the optional
display name, theme, and creator id only, and degrades gracefully when
storage is blocked. Media is referenced by URL — never uploaded or proxied.

Page analytics use Google Analytics (gtag) — this is the one place cookies
are set. Swap it for a cookieless option (e.g. Cloudflare Web Analytics) if
you want to keep the surface fully cookie-free.
