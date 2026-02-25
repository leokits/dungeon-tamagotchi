# API Routes

All routes are Next.js App Router API routes (`app/api/...`).

## Authentication

All endpoints (except `/api/tick`) require a valid Supabase session. The session is extracted from cookies using `@supabase/ssr`.

The `/api/tick` endpoint is protected by a **shared secret** header (`X-Tick-Secret`) set in Cloud Scheduler.

## Dungeon Routes

### `POST /api/dungeon/dig`

Dig a solid tile to create a corridor.

**Body:**
```json
{
  "chunk_x": 0,
  "chunk_y": 0,
  "local_x": 5,
  "local_y": 3
}
```

**Logic:**
1. Validate tile is `solid` and adjacent to an existing `corridor`/`packed`/`crystal`/`hatchery`
2. Update tile type to `corridor`
3. Set `regrow_at` based on corridor base time + crystal energy
4. Remove any resource on that tile
5. Return updated tile

### `POST /api/dungeon/expand`

Add a new 10x10 chunk to the dungeon.

**Body:**
```json
{
  "direction": "east"
}
```

**Logic:**
1. Check player has enough stone resources
2. Determine new chunk coordinates based on direction
3. Verify chunk doesn't already exist
4. Create chunk + 100 solid tiles
5. Deduct stone cost

### `POST /api/dungeon/place-hatchery`

Designate a corridor tile as a hatchery.

**Body:**
```json
{
  "chunk_x": 0,
  "chunk_y": 0,
  "local_x": 3,
  "local_y": 3
}
```

**Logic:**
1. Validate tile is `corridor` or `packed`
2. Update tile type to `hatchery`

### `GET /api/dungeon/mine`

Get the authenticated player's dungeon data (all chunks, tiles, resources).

**Response:** Full dungeon object with nested chunks, tiles, resources, crystal info.

### `GET /api/dungeon/[playerId]`

Get another player's dungeon (read-only, for browsing/raid preview).

**Response:** Same structure as `/mine` but read-only.

### `GET /api/dungeon/browse`

List dungeons available for raiding.

**Response:**
```json
{
  "dungeons": [
    {
      "player_id": "...",
      "username": "...",
      "crystal_energy": 85,
      "chunk_count": 3,
      "pet_count": 12
    }
  ]
}
```

## Egg Routes

### `POST /api/egg/incubate`

Start incubating a new egg.

**Body:**
```json
{
  "base_type": "shroom_slime",
  "hatchery_tile_id": "uuid"
}
```

**Logic:**
1. Validate player has enough Chrono Dust + type-specific resources
2. Validate hatchery tile exists and is type `hatchery`
3. Validate alive pet count < 20
4. Deduct costs
5. Create egg record with `hatches_at = now() + 1 hour`

### `POST /api/egg/[id]/hatch`

Manually trigger hatch check (also done automatically in tick).

**Logic:**
1. Check `hatches_at <= now()`
2. Create new pet with base stats for the type
3. Place pet on hatchery tile
4. Mark egg as hatched

## Pet Routes

### `GET /api/pets`

Get all pets for the authenticated player.

**Response:** Array of pet objects (all statuses).

## Raid Routes

### `POST /api/raid/launch`

Launch a raid against another player.

**Body:**
```json
{
  "defender_id": "uuid",
  "pet_ids": ["uuid", "uuid", "uuid"]
}
```

**Logic:**
1. Validate 1-3 pets, all `alive`, all `hunger >= 0.2`
2. Set pets to `status = 'raiding'`
3. Snapshot defender's dungeon
4. Generate random seed
5. **Run simulation** (A* pathfinding, traversal damage, crystal approach)
6. Store results + replay data
7. Apply outcomes:
   - Update crystal energy
   - Handle pet deaths
   - Generate loot
   - Handle captures
   - Set surviving pets back to `alive`
8. Create notifications for both players
9. Return raid result

### `GET /api/raid/[id]`

Get raid details and result.

### `GET /api/raid/[id]/replay`

Get replay data for the raid viewer.

### `GET /api/raid/history`

Get raid history for the authenticated player (as attacker or defender).

**Query params:** `?role=attacker|defender&limit=20&offset=0`

## Notification Routes

### `GET /api/notifications`

Get unseen notifications for the authenticated player.

### `POST /api/notifications/[id]/seen`

Mark a notification as seen.

---

## `/api/tick` Endpoint

### `POST /api/tick`

Called by Cloud Scheduler every 5 minutes. Uses service role key (bypasses RLS).

**Auth:** `X-Tick-Secret` header must match `TICK_SECRET` env var.

### Tick Processing Order

For **each active dungeon** (player has logged in within last 7 days):

#### 1. Chrono Dust Accrual

```
player.chrono_dust += 1  (per tick = +1 every 5 min)
```

#### 2. Crystal Energy Growth

```
dungeon.crystal_energy = MIN(100, crystal_energy + (1.7 / 12))
```

(1.7 per hour / 12 ticks per hour = ~0.1417 per tick)

#### 3. Resource Regrowth

```sql
-- Find tiles ready to regrow
SELECT * FROM tiles
WHERE dungeon_id = :dungeon_id
  AND regrow_at IS NOT NULL
  AND regrow_at <= now()
  AND type IN ('corridor', 'packed', 'solid');
```

For each:
1. Determine resource type based on tile's `nutrient` and `mana` values
2. Create resource record on tile
3. Calculate next `regrow_at`:
   ```
   base_time = { solid: 24h, corridor: 6h, packed: 2h }
   actual_time = base_time / (crystal_energy / 100)
   tile.regrow_at = now() + actual_time
   ```

#### 4. Pet Movement + Eating

For each alive pet in the dungeon:

1. Determine adjacent walkable tiles
2. If `hunger < 0.5`, prefer tiles near resources
3. Move pet to selected tile
4. Increment `traffic_count` on destination tile
5. Check if destination tile's `traffic_count >= 3` within 24h → convert to `packed`
6. If adjacent to resource and `hunger < 0.9`:
   - Eat resource (remove from DB)
   - Increase hunger by resource value
   - Append to `food_log`
   - **Check evolution combo** against evolution table
   - If combo matches → evolve pet (update stats, stage, form)

#### 5. Hunger Decay

```
pet.hunger = MAX(0, hunger - 0.05)
```

#### 6. Egg Hatching

```sql
SELECT * FROM eggs WHERE hatches_at <= now() AND hatched = false;
```

For each: hatch into new pet, place on hatchery tile.

### Catch-Up Simulation

If the tick hasn't run for a while (e.g., Cloud Run was cold), the tick endpoint calculates how many ticks were missed and simulates them:

```
missed_ticks = FLOOR((now() - last_tick_at) / 5 minutes)
```

For efficiency, resource regrowth can be batch-calculated. Pet movement is simplified (random walk N steps) rather than simulated tick-by-tick.

### Performance Considerations

- Process dungeons in parallel (Promise.all)
- Batch DB updates where possible
- Skip inactive dungeons (no login in 7 days)
- Target: complete all processing within 30 seconds
- If processing exceeds timeout, log warning and continue on next tick
