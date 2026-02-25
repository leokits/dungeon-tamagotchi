# Dungeon System

## Grid Structure

- **Tile-based 2D grid**
- Starting size: **20x15 tiles** (1 chunk)
- Expandable by **10x10 chunks** (costs stone resource)
- Soft performance cap: ~**80x60 tiles** with viewport culling
- Coordinate system: `(chunk_x, chunk_y, local_x, local_y)` where local is 0-based within chunk

## Tile Types

| Type              | Description                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `solid`           | Undigged wall. Contains resources. Regrows nutrients slowly (~24h) |
| `corridor`        | Digged-out walkable space. Regrows resources faster (~6h)          |
| `packed`          | High-traffic corridor. Regrows resources fastest (~2h)             |
| `solid_regrowing` | Was solid, being restored (transition state)                       |
| `resource`        | Tile containing a harvestable resource node                        |
| `hatchery`        | Placed by player. Eggs incubate here                               |
| `crystal`         | Dungeon Crystal tile. One per dungeon. Central objective            |

### Packed Soil Creation

A corridor tile becomes `packed` when either condition is met:

- **Traffic threshold**: `traffic_count >= 3` within a 24-hour window (pet walks over it 3+ times)
- **Post-eating recovery**: pet eats a resource on or adjacent to the tile

Traffic count resets every 24 hours.

## Dungeon Crystal

The crystal is the **central objective** of each dungeon.

| Property       | Value                                |
| -------------- | ------------------------------------ |
| Energy range   | 0 - 100                             |
| Passive growth | +1.7 per hour                        |
| Max energy     | 100                                  |
| Placement      | One per dungeon, player-positioned   |

### Crystal Energy Effect on Resource Growth

The crystal energy directly modifies how fast resources regrow:

```
resource_grow_rate = base_rate * (crystal_energy / 100)
```

At 100 energy, resources grow at full speed. At 50 energy, half speed. At 0, no growth.

This creates a feedback loop: getting raided drains crystal energy, slowing your resource regeneration, weakening your pets until the crystal recovers.

## Resource Growth

Resources regrow on tiles based on tile type and crystal energy:

| Tile Type  | Base Regrow Time | At 100% Crystal | At 50% Crystal |
| ---------- | ---------------- | ---------------- | --------------- |
| `solid`    | ~24 hours        | 24h              | 48h             |
| `corridor` | ~6 hours         | 6h               | 12h             |
| `packed`   | ~2 hours         | 2h               | 4h              |

### Regrow Timer Mechanics

Each tile has a `regrow_at` timestamp. When the current time passes `regrow_at`, the tile spawns a resource. The tick endpoint uses catch-up simulation:

1. On tick, find all tiles where `regrow_at <= now` and `nutrient > 0`
2. Spawn resource on those tiles
3. Set next `regrow_at` based on tile type and current crystal energy

### Resource Types

Resources that can spawn on tiles (determined by `nutrient` and `mana` tile values):

- **Mushroom** - Common, grows in high-nutrient corridors
- **Crystal Shard** - Grows near crystal or high-mana tiles
- **Bone** - Rare, spawns in low-traffic solid tiles
- **Mana Orb** - Spawns on high-mana tiles
- **Moss** - Very common, grows on any corridor

## Digging

- Player clicks a `solid` tile adjacent to an existing corridor
- API call removes the tile's solid state, converts to `corridor`
- Any resource on that tile is destroyed (dropped as loot? or lost)
- New corridor tile gets `regrow_at` set based on current crystal energy

## Chunk Expansion

- Player clicks "Expand" button and selects direction (N/S/E/W)
- Costs **stone resource** (amount scales with total chunks owned)
- New 10x10 chunk is added, all tiles start as `solid`
- Maximum practical dungeon size: ~80x60 (48 chunks)
