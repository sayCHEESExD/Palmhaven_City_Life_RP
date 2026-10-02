# Palmhaven City Life RP

Browser multiplayer city-life roleplay game (Miami-style tropical city, Roblox look): Three.js client, Colyseus
server, npm workspaces (`shared` / `server` / `client`). Networking, persistence, Bloxity SDK/avatars and deploy
came from an earlier game in this series; the world, RP systems, UI and models are this game's own. The user's
reference screenshots (Art Deco pastel streets, double-yellow roads, signal gantries, round minimap top-right,
round dark buttons top-left, phone with Vehicles/Tools categories, vehicle HUD row of round key buttons, radio
bottom-left, "F Door Open" prompts) are the design source of truth.

## Commands

```bash
npm run dev                 # builds shared, then server (tsx watch, :2940, --dev-cheats) + Vite client (:5540)
npm run build               # shared + server + client (client/dist)
npm run typecheck           # all workspaces
npm run verify              # verify:city (layout) + verify:sim (shared sims) + verify:assets (static)
npm run verify:multiplayer  # needs a running server: 3 bots play the full loop and check what the others see
npm run verify:capacity     # needs a running server: 18 clients, expects 15-per-room routing
npm run verify:persistence  # spawns its own server on :2941: guests, accounts, grants, restarts (JSON + Mongo)
npm run size:client         # client/dist size against the 12 MB budget
```

In dev the game exposes `window.__palm.game` (`dev(payload)`, `debugState`). The dev server accepts a `dev`
message (`money`, `tp: [x, z, y]`) only with `--dev-cheats` and never in production.

Do NOT use python from the Bash tool. Use node/sed/perl. Never embed backticks in shell strings: write a .cjs file
to the scratchpad and run it (node resolves `/tmp` to `D:\tmp`, so use the scratchpad's Windows path).

## Non-negotiable rules

- Ports: server **2940**, Vite **5540**, preview 4540. Room `palmhaven`, Bloxity slug `palmhaven-city-life-rp`,
  **15 players per room** (`MAX_PLAYERS_PER_ROOM`).
- **Client build under 12 MB.** Only `assets/` ships as files (avatar FBX + atlas, a few mp3s); `verify-assets`
  pins digests; `assets/ui` and unused audio are pruned in `vite.config.ts`. Everything else - buildings, cars,
  props, icons, most sounds - is generated at runtime. Shipped names: letters, digits, `. _ -`.
- **Server-authoritative.** Money, jobs, tasks, purchases, house ownership/furniture, vehicle ownership/spawning/
  seats, seats and interactions are decided by `server/src/city/*` services (`VehicleService`, `JobService`,
  `ShopService`, `HouseService`, `SocialService`) against the server's own positions. A player's wallet, bag,
  task, garage and storage are PRIVATE (`self` message, `SelfState`); players, vehicles, houses and staffed shops
  are public schema.
- **Movement is input, never transforms.** Clients send `MoveMessage` (60 Hz, seq + dt, time-budgeted). The same
  shared sims (`shared/src/sim/PlayerSim.ts`, `VehicleSim.ts`) run on the server and for client prediction with
  replay/reconcile. A driver's input steps their vehicle; passengers and sitters are placed by the server.
- **One city, generated, shared.** `shared/src/world/plan.ts` (Planner) builds every building, prop, palm, signal,
  dock, patch and house plot deterministically from `layout.ts`; `city.ts` derives solids, ramps, seats,
  interactables, doors and places. Server collision (`WorldCollision`) and the client scene read the same data.
  Interiors come from `interiors.ts`; furniture rules from `furniture.ts` (server enforces, client previews).
- **Coordinates:** +X east, +Z south; forward = (sin yaw, cos yaw). Buildings face compass directions only
  (rot 0 south, pi north, pi/2 east, -pi/2 west); a building's door is on its local +z face.
- **Art style: a polished Roblox game.** `PartBuilder` parts (`stud`/`smooth`/`glow`/`flat`/`leaf`), shader
  facades (windows from metric UVs), road-marking and pavement shaders, chunked static merges, instanced palms/
  trees/lamps/signal masts. Models: `client/src/models/` (`vehicles.ts`, `props.ts`, `items.ts`). Icons are
  rendered from models (`IconFactory`). UI uses `ph-` classes in `client/src/ui/styles.ts`, one unit `--u`.
- **No z-fighting.** `PartBuilder` resolves flush coplanar faces at merge time (the smaller part is nudged out
  a few mm). Flat ground decals never rely on tiny height gaps: patches/markings go in depth layers
  (`groundMaterial(layer)` / `pavementMaterial(layer)`, negative polygon offsets; nested patches stack higher).
  Interior floors sit `FLOOR_LIFT` above the lot and furniture stands on them. Facade ornament (ledges, fins)
  keeps out of the sign band (`signBand`). Check with the dev scanner in the console:
  `(await import('/src/dev/anomalies.ts')).zFights(scene)` / `.blockedSigns(scene)` (dev only, never shipped).
- **The top-left corner belongs to the Bloxity portal**: no game UI there (icons are top-centre, or a left
  column on portrait phones).
- **Cosmetic life is client-side**: traffic (`world/Traffic.ts`) and pedestrians/staff (`world/Life.ts`) cost no
  bandwidth. Job NPCs (suspects, patients, fares, customers) are drawn from server task/shop state.

## Layout facts

- Island x -300..385, z -860..660; beach east of x 268; mainland west of x -640 with the airport (runway x
  -1300..-760, z 30..70; helipad -820,-80). Two causeways (z -260 and 340) cross the bay on bridges.
- Avenues (N-S, x): Bayshore Dr -200, Palm Ave -60, Coral Ave 90, Ocean Dr 240. Streets (E-W) every ~120 from z
  -740 to 560. Roads 22 wide, sidewalks 6, curbs 0.3.
- Spawn: City Hall plaza (row 5, col 1). Police r5c0, fire r3c0, hospital r3c1, Palm Motors r8c0, FreshMart +
  Casa Home r7c0, Coastline Threads + bank r6c0, Palm Burger r6c1, Sunset Cafe r5c2, Sun Fuel + Taxi r8c1,
  PalmPost depot r9c0, marina + Bay Club on the bayfront, pier with ferris wheel on the beach.
- 28 claimable homes: 12 free townhouses, 4 bungalows, 8 family homes, 4 waterfront villas (`HOUSE_STYLES`).

## Bloxity

- Client SDK bridge: `client/src/bloxity/Bloxity.ts` (the ONE `onUserChanged` subscription; settings, lifecycle,
  rooms, invites, Bux, player events). `registerFeature('emotes')` runs at boot; the portal draws the emote picker
  and sends `play_emote`; the game builds no UI for those (its own phone emotes are separate RP gestures).
- Bloxity emotes: catalogue fetched once (`animation/BloxityEmotes.ts`), clips applied as bind * euler(XYZ deg)
  deltas by bone name via the rig overlay (`PlayerRig.applyPose(pose, overlay)`); replicated as
  `PlayerState.bxEmote` + `bxEmoteAt` (server ms) and cleared by the server when the player moves, sits, drives
  or is cuffed (`SocialService.tickBloxityEmote`).
- Profile stats: `server/src/bloxity/statReporter.ts` (every 60s + on shutdown, verified accounts only, values from
  the server's profile). Inert without `BLOXITY_REPORT_TOKEN` / `BLOXITY_GAME_ID`.
- Store-page Servers panel: `GET /api/coly-matchmaker/all-rooms?mode=0` (`server/src/routes/rooms.ts`). Point the
  catalogue row's `allRoomsUrl` at `https://<BLOXITY_GAME_ID>.host.bloxity.io/api/coly-matchmaker/all-rooms?mode=0`.
  With `MATCHMAKER_REPORT_URL` set it needs Legion's cross-pod directory reader (`installDirectoryReader`), which
  ships with `legion-room-reporter.ts` - not in this repo yet; until then it answers 502 rather than undercount.
- `?roomId=` links (invites, Join) are joined first (`client/src/net/deepLink.ts`), falling back to matchmaking.

## Progress and identity

Per-key storage (`server/src/persistence/`), Mongo via `MONGODB_URI` else JSON (`PALMHAVEN_DATA_DIR`), profile read
at join, Bloxity token verified server-side, guest -> account migration, webhook cash grants (`coins_small`
$25K, `coins_large` $250K). Profile: `StoredProfile.ts` (money, earned, job, items, accessories, vehicles, house
styles + per-style furniture, storage, stats, daily bonus).
