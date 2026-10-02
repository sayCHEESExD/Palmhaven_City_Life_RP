# Palmhaven City Life RP

A sunny multiplayer city-life roleplay game in the style of a polished Roblox experience. Palmhaven is a
Miami-inspired island city - pastel Art Deco hotels on Ocean Drive, a beach with lifeguard towers and a pier, a
marina full of boats and yachts, downtown towers, suburbs and waterfront villas - joined by causeways to an
airport on the mainland. Take a job (police, medic, courier, taxi driver, chef, shop clerk), earn money, buy cars,
boats, helicopters and planes, move into a home and furnish it, and roleplay with up to 15 players per server.

Three.js client, authoritative Colyseus server (15 players per room), hosted on Bloxity.

## Play

| Action | PC | Mobile |
| --- | --- | --- |
| Walk / run / jump | WASD / Shift / Space | left stick / RUN / JUMP |
| Camera / zoom | right-drag / wheel | drag |
| Interact (shops, doors, seats, players, jobs) | E | USE or tap the prompt |
| Enter / exit a vehicle | F | CAR |
| Drive / boost / brake | WASD / Shift / Space | stick / BOOST / BRAKE |
| Fly up / down (aircraft) | Space / C | UP / DOWN |
| Lights / horn / siren / lock | L / H / G / K | vehicle buttons |
| Phone / map / emotes / chat | P or Tab / M / B / T | buttons |
| Hotbar | 1-9 | tap a slot |
| Camera mode | V | camera button |

## Develop

```bash
npm install
npm run dev
```

Client on http://localhost:5540, server on :2940. See `CLAUDE.md` for the rules, the verification scripts and the
layout facts.

## Deploy (Bloxity Hosting)

`.github/workflows/deploy.yml` publishes on every push:

| Branch | Channel | Frontend | Backend (WebSocket) |
| --- | --- | --- | --- |
| `dev` | DEV | https://palmhaven-city-life-rp.dev.play.bloxity.io | wss://palmhaven-city-life-rp.dev.host.bloxity.io |
| `main` | PROD | https://palmhaven-city-life-rp.play.bloxity.io | wss://palmhaven-city-life-rp.host.bloxity.io |

- **Backend:** the Colyseus server is built from the root `Dockerfile`, pushed to
  `ghcr.io/<owner>/palmhaven-city-life-rp-server:<channel>-<sha>` and rolled with
  `POST https://legion.bloxity.io/v1/apps/palmhaven-city-life-rp/deploy` (`seatCap` 15, `maxReplicas` 5). Legion injects
  `PORT` and `MONGODB_URI` and probes `/health`.
- **Frontend:** `client/dist` is built with that channel's WebSocket URL baked in, zipped with `index.html` at the
  root, and uploaded to `POST https://api.bloxity.io/v1/hosting/games/palmhaven-city-life-rp/frontend?channel=<channel>&version=<sha>`.

One-time setup:

1. Create the game `palmhaven-city-life-rp` on https://hosting.bloxity.io (My Games).
2. Add the repository secret `LEGION_DEPLOY_TOKEN` (the token from My Games, behind the eye icon).
3. After the first run, make the GHCR package `palmhaven-city-life-rp-server` **public** (Legion pulls anonymously), then
   re-run the workflow.
4. Optional Bux store: create the SKUs `coins_small` ($25K cash) and `coins_large` (250K) in the Bloxity
   catalogue and set `BLOXITY_WEBHOOK_SECRET` on the backend.

Progress lives in the Legion-injected MongoDB, per channel, so deploys never reset anyone's money, cars or homes.
