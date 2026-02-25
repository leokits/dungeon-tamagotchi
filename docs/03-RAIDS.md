# Raid System

## Overview

Raids are **async PvP** — the defender does not need to be online. The attacker selects up to 3 pets, targets another player's dungeon, and the server simulates the entire raid.

## Raid Flow

### 1. Launch

- Attacker browses available dungeons via Dungeon Browser
- Selects up to **3 pets** for the raid squad
- Selected pets must be `alive` status and `hunger >= 0.2`
- Pets are set to `status = 'raiding'` (cannot be used elsewhere)
- API creates a `raid` record and begins simulation

### 2. Simulation

The raid is a **deterministic simulation** using a stored random seed:

1. **Snapshot** the defender's dungeon state (tile layout, crystal position)
2. Generate a **random seed** for the simulation
3. Attacker pets spawn at dungeon entrance (edge of grid)
4. Each tick of simulation:
   a. Pets use **A\* pathfinding** toward the crystal
   b. Pets move through corridors (cannot pass through solid tiles)
   c. Longer/more complex paths = more danger (future: traps, environmental hazards)
   d. Pets take damage from traversal (fatigue: -1 HP per N tiles walked)
5. Simulation ends when:
   - All pets reach the crystal, OR
   - All pets die, OR
   - Max simulation ticks reached (timeout)

### 3. Defense

**No defender pets** — defense is purely based on:

- Dungeon maze layout (complex paths = more traversal damage)
- Crystal position (deeper = harder to reach)
- Dead ends and misleading corridors

Future phases may add traps, environmental hazards, or defender pet patrols.

## No Cooldown

Raids can be launched at any time. No cooldown between raids. This encourages active play and makes dungeon design critical.

## Outcomes

### All Attackers Die

- Defender wins
- Defender gets **death-drop resources** from each dead pet
- Attacker loses all sent pets permanently
- Crystal energy: no drain

### Partial Survival, Crystal NOT Reached

- Draw / partial success
- Attacker gets **resource loot proportional to depth reached**
  - Deeper penetration = more loot
- Surviving pets return home (status back to `alive`)
- Dead pets are permanently lost
- Crystal energy: **-10 to -30** (based on depth reached)

### Crystal Reached

- Attacker wins
- Attacker **chooses one** of:
  - **Heavy resource loot** — large resource payout
  - **Capture one defender pet** — permanently transfer a random defender pet to attacker
- Surviving attacker pets return home
- Dead attacker pets are permanently lost
- Crystal energy: **-40 to -60**

### Captured Pets

- Captured pet is permanently transferred to the attacker's dungeon
- Pet retains all stats, evolution stage, skills, and food log
- Pet spawns at a random corridor tile in attacker's dungeon
- Original owner receives a notification
- Captured pet's status changes from `alive` → `captured` in defender's records

## Raid Data Storage

### Raid Record

```
raid {
  id: UUID
  attacker_id: UUID (player)
  defender_id: UUID (player)
  pets_sent: JSONB [pet_id, pet_id, pet_id]
  dungeon_snapshot: JSONB (full tile layout at time of raid)
  random_seed: BIGINT
  result: ENUM (attacker_win, defender_win, draw, timeout)
  depth_reached: INT (tiles deep the furthest pet got)
  loot: JSONB (resources gained)
  captured_pet_id: UUID (nullable)
  energy_drained: INT
  replay_data: JSONB (frame-by-frame simulation data)
  created_at: TIMESTAMP
}
```

### Replay System

The `replay_data` field stores frame-by-frame simulation data:

```json
{
  "frames": [
    {
      "tick": 0,
      "pets": [
        { "id": "...", "x": 0, "y": 7, "hp": 100, "action": "move" }
      ]
    },
    {
      "tick": 1,
      "pets": [
        { "id": "...", "x": 1, "y": 7, "hp": 99, "action": "move" }
      ]
    }
  ],
  "events": [
    { "tick": 15, "type": "pet_death", "pet_id": "...", "cause": "fatigue" },
    { "tick": 42, "type": "crystal_reached", "pet_id": "..." }
  ]
}
```

Since the simulation is deterministic (same seed + same snapshot = same result), replays can optionally be re-simulated client-side instead of stored.

## Notifications

After a raid completes, both players receive notifications:

- **Attacker**: raid result, loot gained, pets lost/survived
- **Defender**: who raided, damage to crystal, pets captured (if any), resources dropped by dead attackers

## Dungeon Browser

Players can browse other dungeons to find raid targets:

- Shows list of players with basic dungeon info
- Can preview dungeon layout (read-only view)
- Shows crystal energy level (gives hint of dungeon health)
- Matchmaking is simple: browse and pick (no ELO, no tiers for now)
