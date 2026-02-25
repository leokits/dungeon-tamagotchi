# Implementation Phases

## Phase 1 - Foundation

**Goal:** Playable dungeon with resource growth. A single player can dig, see resources grow, and watch crystal energy tick.

### Tasks

- [ ] Initialize Next.js 14 project (App Router, TypeScript, Tailwind)
- [ ] Install dependencies: `phaser`, `@supabase/supabase-js`, `@supabase/ssr`
- [ ] Set up Supabase project + auth (Google OAuth)
- [ ] Create `.env.local` template
- [ ] Write initial DB migration SQL (all tables, enums, RLS)
- [ ] Implement Supabase client helpers (browser + server + service role)
- [ ] Build login/landing page
- [ ] Create dungeon on first login (default 20x15 chunk, crystal placed)
- [ ] Build Phaser `DungeonScene`:
  - [ ] Tilemap renderer (colored rectangles as placeholders)
  - [ ] Camera pan (drag) and zoom (scroll)
  - [ ] Click-to-dig interaction
- [ ] Implement `POST /api/dungeon/dig`
- [ ] Implement `GET /api/dungeon/mine`
- [ ] Implement chunk expansion (`POST /api/dungeon/expand`)
- [ ] Implement `/api/tick` endpoint:
  - [ ] Chrono Dust accrual
  - [ ] Crystal energy growth (capped at 100)
  - [ ] Resource regrowth logic (regrow_at timers, crystal energy factor)
  - [ ] Catch-up simulation for missed ticks
- [ ] Set up Supabase Realtime subscription (tiles table)
- [ ] Build HUD overlay:
  - [ ] Chrono Dust display
  - [ ] Crystal energy bar
  - [ ] Expand dungeon button
- [ ] Write Dockerfile for Cloud Run
- [ ] Set up Cloud Scheduler job for `/api/tick`

### Definition of Done
A player can log in, see their dungeon, dig tiles, watch resources regrow over time, and see crystal energy change. Tick runs every 5 minutes via Cloud Scheduler.

---

## Phase 2 - Pets

**Goal:** Pets can be hatched, roam the dungeon, eat resources, evolve, and die.

### Tasks

- [ ] Implement `POST /api/egg/incubate`
- [ ] Implement egg hatching in tick logic
- [ ] Define base stats for 3 starter types
- [ ] Build pet sprite rendering in DungeonScene
- [ ] Implement pet random walk in tick logic:
  - [ ] Adjacent tile selection
  - [ ] Hungry pets prefer resource-adjacent tiles
  - [ ] Traffic count increment
  - [ ] Packed soil detection (traffic >= 3)
- [ ] Implement pet eating in tick logic:
  - [ ] Resource consumption
  - [ ] Hunger increase
  - [ ] Food log append
- [ ] Implement evolution combo checking:
  - [ ] Pattern matching against evolution table
  - [ ] Stat updates on evolution
  - [ ] Stage transitions
- [ ] Implement hunger decay (-0.05 per tick)
- [ ] Implement hunger debuff tiers
- [ ] Implement pet death:
  - [ ] Resource drop at death location
  - [ ] Status change to 'dead'
- [ ] Implement hatchery placement (`POST /api/dungeon/place-hatchery`)
- [ ] Build pet list side panel (React overlay)
- [ ] Build pet detail view (stats, hunger bar, food log)
- [ ] Add pet animations (idle, walk between tiles)

### Definition of Done
Players can incubate eggs, watch pets hatch, see them roam and eat, evolve through food combos, and observe hunger mechanics. Pets that die in future raids will drop resources.

---

## Phase 3 - Raids

**Goal:** Players can browse other dungeons and launch async raids.

### Tasks

- [ ] Implement `GET /api/dungeon/browse`
- [ ] Build Dungeon Browser page/component
- [ ] Implement `GET /api/dungeon/[playerId]` (read-only view)
- [ ] Build `DungeonViewScene` (read-only dungeon preview)
- [ ] Implement A* pathfinding module:
  - [ ] Grid-based pathfinding on tile data
  - [ ] Traversal cost calculation
  - [ ] Path optimization
- [ ] Implement raid simulation engine:
  - [ ] Dungeon snapshot creation
  - [ ] Random seed generation
  - [ ] Pet movement simulation (A* toward crystal)
  - [ ] Traversal damage (fatigue)
  - [ ] Outcome determination (win/lose/draw/timeout)
  - [ ] Loot calculation
  - [ ] Pet capture logic
  - [ ] Crystal energy drain
  - [ ] Replay data generation
- [ ] Implement `POST /api/raid/launch`
- [ ] Implement `GET /api/raid/[id]`
- [ ] Implement `GET /api/raid/[id]/replay`
- [ ] Implement `GET /api/raid/history`
- [ ] Build `RaidReplayScene`:
  - [ ] Dungeon snapshot rendering
  - [ ] Pet movement animation
  - [ ] HP bars
  - [ ] Combat log
  - [ ] Playback controls (play, pause, speed, skip)
  - [ ] End screen with results
- [ ] Implement notification system:
  - [ ] `GET /api/notifications`
  - [ ] `POST /api/notifications/[id]/seen`
  - [ ] Notification bell in HUD
  - [ ] Raid result notifications for both players

### Definition of Done
Players can browse other dungeons, select pets for a raid squad, launch raids, see results, watch replays, and receive notifications. Pets can die or be captured during raids.

---

## Phase 4 - Polish

**Goal:** Complete the game experience with remaining features and quality-of-life improvements.

### Tasks

- [ ] Design and implement full evolution tree (all branches, cross-lineage combos)
- [ ] Implement skill system for evolved pets
- [ ] Add mobile touch controls:
  - [ ] Tap to select/dig
  - [ ] Drag to pan
  - [ ] Pinch to zoom
  - [ ] Responsive HUD layout
- [ ] Build leaderboard:
  - [ ] Ranking by raid wins, crystal energy, pet collection
  - [ ] Leaderboard page
- [ ] Build pet graveyard:
  - [ ] List of all dead/captured pets
  - [ ] Death details (when, where, how)
  - [ ] Memorial page
- [ ] Pixel art sprites (replace placeholder rectangles):
  - [ ] Tile sprites (solid, corridor, packed, crystal, hatchery)
  - [ ] Resource sprites (mushroom, crystal, bone, mana, moss)
  - [ ] Pet sprites (all base types, all evolution forms)
  - [ ] Animations (idle, walk, eat, evolve, death)
- [ ] Sound effects and music (optional)
- [ ] Tutorial/onboarding flow for new players
- [ ] Performance optimization:
  - [ ] Tile culling tuning
  - [ ] DB query optimization
  - [ ] Tick processing batching
- [ ] Error handling and edge case fixes
- [ ] CI/CD pipeline setup (Cloud Build → Cloud Run)

### Definition of Done
Game feels complete, looks good with pixel art, runs smoothly on mobile, and has all planned features implemented.

---

## Priority Summary

```
Phase 1 (Foundation)  ████████████████████  MUST HAVE - Build first
Phase 2 (Pets)        ████████████████████  MUST HAVE - Core gameplay
Phase 3 (Raids)       ████████████████████  MUST HAVE - Multiplayer
Phase 4 (Polish)      ░░░░░░░░░░░░░░░░░░░  NICE TO HAVE - Iterative
```

Each phase builds on the previous. Do not skip phases.
