# Pet System

## Overview

Pets are autonomous creatures that live inside your dungeon. They roam corridors, eat resources, evolve based on food combos, and can be sent on raids. **Death is permanent.**

## Limits

- Max **20 alive pets** simultaneously per player
- Pets with status `alive` or `raiding` count toward this cap
- Dead and captured pets do not count

## Starter Types

| Type            | Archetype           | Stats Bias               |
| --------------- | ------------------- | ------------------------ |
| Shroom Slime    | Balanced            | Even HP/ATK/DEF/SPD      |
| Crystal Sprite  | Magic / Fragile     | High MP/ATK, low HP/DEF  |
| Stone Crawler   | Tanky / Slow        | High HP/DEF, low SPD/ATK |

## Stats

Each pet has the following RPG stats:

| Stat             | Description                                    |
| ---------------- | ---------------------------------------------- |
| `hp`             | Current hit points                             |
| `max_hp`         | Maximum hit points                             |
| `mp`             | Current mana points                            |
| `max_mp`         | Maximum mana points                            |
| `atk`            | Attack power                                   |
| `def`            | Defense                                        |
| `spd`            | Speed (affects turn order in raids)            |
| `hunger`         | 0.0 - 1.0 (1.0 = full)                        |
| `evolution_stage` | 1, 2, or 3                                    |
| `skills`         | JSONB array of learned skills                  |
| `food_log`       | JSONB array of last N food items eaten         |

## Egg Hatching

### Cost

New eggs require:
- **Chrono Dust** — accrues passively at +1 per 5 minutes
- **Specific resources** depending on starter type:
  - Shroom Slime egg: 5 Chrono Dust + 3 Mushroom
  - Crystal Sprite egg: 8 Chrono Dust + 2 Crystal Shard + 1 Mana Orb
  - Stone Crawler egg: 6 Chrono Dust + 4 Bone

### Incubation

1. Player selects egg type and pays cost
2. Egg is placed on a `hatchery` tile
3. Incubation time: ~1 hour (real time)
4. On next tick after incubation completes, egg hatches into stage 1 pet

## Hunger System

### Decay

- Hunger decreases by **-0.05 per tick** (every 5 minutes)
- From full (1.0) to empty (0.0) takes ~100 ticks = ~8.3 hours

### Debuff Tiers

Hunger affects combat and movement stats multiplicatively:

| Hunger Level | Stat Multiplier | Effect            |
| ------------ | --------------- | ----------------- |
| >= 0.7       | x1.00           | No debuff         |
| 0.4 - 0.7   | x0.85           | Slightly weakened |
| 0.2 - 0.4   | x0.65           | Noticeably weak   |
| < 0.2       | x0.40           | Severely weakened |

### No Starvation Death

Hunger reaching 0 does **not** kill the pet. It only applies the maximum stat debuff. Pets can only die in raids or from future combat mechanics.

## Movement (Autonomous)

Pets move during each tick:

1. Pet is on a corridor/packed tile
2. Look at all adjacent walkable tiles (up/down/left/right)
3. **If hungry (hunger < 0.5)**: prefer tiles adjacent to resources
4. **Otherwise**: random walk (equal probability for each valid direction)
5. Move to selected tile
6. Increment `traffic_count` on the destination tile

### Eating

- If pet is **adjacent to a resource tile** after moving, and `hunger < 0.9`:
  - Pet eats the resource
  - Hunger increases (amount depends on resource type)
  - Resource item is appended to `food_log`
  - Resource is removed from tile
  - Tile's `regrow_at` timer resets
  - Check for evolution combo

## Evolution System

### Food Log Matching

The last **3-5 items** in `food_log` are pattern-matched against an evolution table.

### Evolution Stages

```
Stage 1 (Hatchling) → Stage 2 (Adolescent) → Stage 3 (Adult)
```

Each stage has a branch fork based on food combos consumed.

### Evolution Tree Framework

**3 lineages**, each with branching paths:

#### Shroom Lineage
```
Shroom Slime (S1)
├── Mushroom x2 → Spore Slime (S2a)
│   ├── Mushroom x3 → Fungal Lord (S3a)
│   └── Mushroom + Mana Orb + Mushroom → Mycelium Mage (S3b)
└── Mushroom + Bone → Rot Slime (S2b)
    ├── Bone x3 → Undead Ooze (S3c)
    └── Bone + Crystal Shard + Bone → Fossil Slime (S3d)
```

#### Crystal Lineage
```
Crystal Sprite (S1)
├── Crystal Shard x2 → Prism Sprite (S2a)
│   ├── Crystal Shard x3 → Diamond Sentinel (S3a)
│   └── Crystal Shard + Mana Orb → Mana Sprite (S3b)
└── Crystal Shard + Mana Orb → Arcane Wisp (S2b)
    ├── Mana Orb x3 → Void Oracle (S3c)
    └── Mana Orb + Mushroom + Mana Orb → Spore Phantom (S3d)
```

#### Stone Lineage
```
Stone Crawler (S1)
├── Bone x2 → Bone Crawler (S2a)
│   ├── Bone x3 → Ancient Bone Lord (S3a)
│   └── Bone + Mushroom + Bone → Grave Wurm (S3b)
└── Bone + Moss → Moss Golem (S2b)
    ├── Moss x3 → Ancient Treant (S3c)
    └── Moss + Crystal Shard + Moss → Crystal Golem (S3d)
```

#### Cross-Lineage Combos (Rare)

Specific rare food sequences can produce unique species that don't belong to any single lineage. These are to be fully designed later.

### Evolution Stat Changes

On evolution:
- Base stats increase by a multiplier (e.g., S2 = 1.5x, S3 = 2.2x)
- New skills may be learned (added to `skills` JSONB)
- Appearance changes (sprite swap in Phaser)

## Death

- **Permanent** — dead pets cannot be revived
- On death, pet drops resources at its death location in the dungeon
  - Drop contents based on pet's evolution stage and food history
- Dead pets remain in DB with `status = 'dead'` for graveyard/history
- Pet slot is freed (does not count toward 20 cap)

## Pet Status Enum

| Status     | Description                                |
| ---------- | ------------------------------------------ |
| `alive`    | Living in your dungeon, roaming            |
| `raiding`  | Currently sent on a raid (locked)          |
| `dead`     | Permanently dead                           |
| `captured` | Stolen by another player via raid          |
