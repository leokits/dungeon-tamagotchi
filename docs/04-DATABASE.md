# Database Schema

All tables live in **Supabase PostgreSQL** with Row-Level Security (RLS) enabled.

## Enums

```sql
CREATE TYPE tile_type AS ENUM (
  'solid',
  'corridor',
  'packed',
  'solid_regrowing',
  'resource',
  'hatchery',
  'crystal'
);

CREATE TYPE resource_type AS ENUM (
  'mushroom',
  'crystal_shard',
  'bone',
  'mana_orb',
  'moss'
);

CREATE TYPE pet_status AS ENUM (
  'alive',
  'raiding',
  'dead',
  'captured'
);

CREATE TYPE pet_base_type AS ENUM (
  'shroom_slime',
  'crystal_sprite',
  'stone_crawler'
);

CREATE TYPE raid_result AS ENUM (
  'attacker_win',
  'defender_win',
  'draw',
  'timeout'
);
```

## Tables

### players

```sql
CREATE TABLE players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID UNIQUE NOT NULL REFERENCES auth.users(id),
  username    TEXT UNIQUE NOT NULL,
  chrono_dust INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### dungeons

```sql
CREATE TABLE dungeons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID UNIQUE NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  crystal_energy   FLOAT NOT NULL DEFAULT 100.0,
  crystal_tile_x   INT NOT NULL DEFAULT 10,
  crystal_tile_y   INT NOT NULL DEFAULT 7,
  crystal_chunk_x  INT NOT NULL DEFAULT 0,
  crystal_chunk_y  INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### chunks

```sql
CREATE TABLE chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dungeon_id  UUID NOT NULL REFERENCES dungeons(id) ON DELETE CASCADE,
  chunk_x     INT NOT NULL,
  chunk_y     INT NOT NULL,
  width       INT NOT NULL DEFAULT 10,
  height      INT NOT NULL DEFAULT 10,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(dungeon_id, chunk_x, chunk_y)
);
```

Note: The starting chunk (0,0) is 20x15. Expansion chunks are 10x10.

### tiles

```sql
CREATE TABLE tiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id       UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  dungeon_id     UUID NOT NULL REFERENCES dungeons(id) ON DELETE CASCADE,
  local_x        INT NOT NULL,
  local_y        INT NOT NULL,
  chunk_x        INT NOT NULL,
  chunk_y        INT NOT NULL,
  type           tile_type NOT NULL DEFAULT 'solid',
  nutrient       FLOAT NOT NULL DEFAULT 1.0,
  mana           FLOAT NOT NULL DEFAULT 0.0,
  regrow_at      TIMESTAMPTZ,
  traffic_count  INT NOT NULL DEFAULT 0,
  traffic_reset  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(dungeon_id, chunk_x, chunk_y, local_x, local_y)
);

CREATE INDEX idx_tiles_dungeon ON tiles(dungeon_id);
CREATE INDEX idx_tiles_regrow ON tiles(regrow_at) WHERE regrow_at IS NOT NULL;
CREATE INDEX idx_tiles_chunk ON tiles(chunk_id);
```

### resources

```sql
CREATE TABLE resources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tile_id     UUID UNIQUE NOT NULL REFERENCES tiles(id) ON DELETE CASCADE,
  dungeon_id  UUID NOT NULL REFERENCES dungeons(id) ON DELETE CASCADE,
  type        resource_type NOT NULL,
  quantity    INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_resources_dungeon ON resources(dungeon_id);
```

### pets

```sql
CREATE TABLE pets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  dungeon_id       UUID NOT NULL REFERENCES dungeons(id) ON DELETE CASCADE,
  name             TEXT,
  base_type        pet_base_type NOT NULL,
  evolution_stage  INT NOT NULL DEFAULT 1 CHECK (evolution_stage BETWEEN 1 AND 3),
  evolved_form     TEXT,
  status           pet_status NOT NULL DEFAULT 'alive',

  -- Stats
  hp               INT NOT NULL,
  max_hp           INT NOT NULL,
  mp               INT NOT NULL DEFAULT 0,
  max_mp           INT NOT NULL DEFAULT 0,
  atk              INT NOT NULL,
  def              INT NOT NULL,
  spd              INT NOT NULL,

  -- Hunger
  hunger           FLOAT NOT NULL DEFAULT 1.0 CHECK (hunger BETWEEN 0.0 AND 1.0),

  -- Position in dungeon
  tile_x           INT,
  tile_y           INT,
  chunk_x          INT NOT NULL DEFAULT 0,
  chunk_y          INT NOT NULL DEFAULT 0,

  -- Evolution tracking
  food_log         JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills           JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Death info
  died_at          TIMESTAMPTZ,
  death_location_x INT,
  death_location_y INT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pets_player ON pets(player_id);
CREATE INDEX idx_pets_dungeon_alive ON pets(dungeon_id) WHERE status = 'alive';
```

### eggs

```sql
CREATE TABLE eggs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  dungeon_id    UUID NOT NULL REFERENCES dungeons(id) ON DELETE CASCADE,
  base_type     pet_base_type NOT NULL,
  hatchery_tile_id UUID NOT NULL REFERENCES tiles(id),
  incubation_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  hatches_at    TIMESTAMPTZ NOT NULL,
  hatched       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eggs_hatch ON eggs(hatches_at) WHERE hatched = false;
```

### raids

```sql
CREATE TABLE raids (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id       UUID NOT NULL REFERENCES players(id),
  defender_id       UUID NOT NULL REFERENCES players(id),
  pets_sent         JSONB NOT NULL,
  dungeon_snapshot  JSONB NOT NULL,
  random_seed       BIGINT NOT NULL,
  result            raid_result,
  depth_reached     INT,
  loot              JSONB,
  captured_pet_id   UUID REFERENCES pets(id),
  energy_drained    INT,
  replay_data       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX idx_raids_attacker ON raids(attacker_id);
CREATE INDEX idx_raids_defender ON raids(defender_id);
```

### notifications

```sql
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  seen        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_player ON notifications(player_id) WHERE seen = false;
```

## Row-Level Security (RLS) Policies

```sql
-- Players can only read/update their own record
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read own" ON players FOR SELECT USING (auth_id = auth.uid());
CREATE POLICY "Players update own" ON players FOR UPDATE USING (auth_id = auth.uid());

-- Dungeons: read any (for browsing), write own
ALTER TABLE dungeons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dungeons read all" ON dungeons FOR SELECT USING (true);
CREATE POLICY "Dungeons write own" ON dungeons FOR UPDATE
  USING (player_id IN (SELECT id FROM players WHERE auth_id = auth.uid()));

-- Tiles: read any dungeon's tiles, write own
ALTER TABLE tiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tiles read all" ON tiles FOR SELECT USING (true);
CREATE POLICY "Tiles write own" ON tiles FOR ALL
  USING (dungeon_id IN (
    SELECT d.id FROM dungeons d JOIN players p ON d.player_id = p.id
    WHERE p.auth_id = auth.uid()
  ));

-- Pets: read any (visible in raids), write own
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pets read all" ON pets FOR SELECT USING (true);
CREATE POLICY "Pets write own" ON pets FOR ALL
  USING (player_id IN (SELECT id FROM players WHERE auth_id = auth.uid()));

-- Notifications: own only
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notifications own" ON notifications FOR ALL
  USING (player_id IN (SELECT id FROM players WHERE auth_id = auth.uid()));
```

## Notes

- All JSONB columns should have GIN indexes if queried frequently
- The `dungeon_snapshot` in raids can be large; consider compressing or storing only diff
- Supabase Realtime can be enabled on `tiles` and `pets` tables for live UI updates
- The tick endpoint uses a **service role key** that bypasses RLS
