-- Dungeon Tamagotchi: Initial Schema
-- Run this migration against your Supabase project

-- =============================================================================
-- ENUMS
-- =============================================================================

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

-- =============================================================================
-- TABLES
-- =============================================================================

-- Players
CREATE TABLE players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  chrono_dust INT NOT NULL DEFAULT 0,
  last_tick_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dungeons (one per player)
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

-- Chunks (subdivisions of a dungeon grid)
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

-- Tiles
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

-- Resources (one per tile at most)
CREATE TABLE resources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tile_id     UUID UNIQUE NOT NULL REFERENCES tiles(id) ON DELETE CASCADE,
  dungeon_id  UUID NOT NULL REFERENCES dungeons(id) ON DELETE CASCADE,
  type        resource_type NOT NULL,
  quantity    INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_resources_dungeon ON resources(dungeon_id);

-- Pets
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

  -- Hunger (0.0 = starving, 1.0 = full)
  hunger           FLOAT NOT NULL DEFAULT 1.0 CHECK (hunger >= 0.0 AND hunger <= 1.0),

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

-- Eggs
CREATE TABLE eggs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  dungeon_id       UUID NOT NULL REFERENCES dungeons(id) ON DELETE CASCADE,
  base_type        pet_base_type NOT NULL,
  hatchery_tile_id UUID NOT NULL REFERENCES tiles(id),
  incubation_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  hatches_at       TIMESTAMPTZ NOT NULL,
  hatched          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eggs_hatch ON eggs(hatches_at) WHERE hatched = false;

-- Raids
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

-- Notifications
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  seen        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_player_unseen ON notifications(player_id) WHERE seen = false;

-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE dungeons ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE eggs ENABLE ROW LEVEL SECURITY;
ALTER TABLE raids ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Players: read own, update own
CREATE POLICY "players_select_own" ON players
  FOR SELECT USING (auth_id = auth.uid());
CREATE POLICY "players_update_own" ON players
  FOR UPDATE USING (auth_id = auth.uid());
CREATE POLICY "players_insert_own" ON players
  FOR INSERT WITH CHECK (auth_id = auth.uid());

-- Dungeons: read any (browsing), write own
CREATE POLICY "dungeons_select_all" ON dungeons
  FOR SELECT USING (true);
CREATE POLICY "dungeons_update_own" ON dungeons
  FOR UPDATE USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );
CREATE POLICY "dungeons_insert_own" ON dungeons
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

-- Chunks: read any, write own dungeon's
CREATE POLICY "chunks_select_all" ON chunks
  FOR SELECT USING (true);
CREATE POLICY "chunks_insert_own" ON chunks
  FOR INSERT WITH CHECK (
    dungeon_id IN (
      SELECT d.id FROM dungeons d
      JOIN players p ON d.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Tiles: read any, write own dungeon's
CREATE POLICY "tiles_select_all" ON tiles
  FOR SELECT USING (true);
CREATE POLICY "tiles_insert_own" ON tiles
  FOR INSERT WITH CHECK (
    dungeon_id IN (
      SELECT d.id FROM dungeons d
      JOIN players p ON d.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );
CREATE POLICY "tiles_update_own" ON tiles
  FOR UPDATE USING (
    dungeon_id IN (
      SELECT d.id FROM dungeons d
      JOIN players p ON d.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Resources: read any, write own dungeon's
CREATE POLICY "resources_select_all" ON resources
  FOR SELECT USING (true);
CREATE POLICY "resources_insert_own" ON resources
  FOR INSERT WITH CHECK (
    dungeon_id IN (
      SELECT d.id FROM dungeons d
      JOIN players p ON d.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );
CREATE POLICY "resources_delete_own" ON resources
  FOR DELETE USING (
    dungeon_id IN (
      SELECT d.id FROM dungeons d
      JOIN players p ON d.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Pets: read any (visible in raids), write own
CREATE POLICY "pets_select_all" ON pets
  FOR SELECT USING (true);
CREATE POLICY "pets_insert_own" ON pets
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );
CREATE POLICY "pets_update_own" ON pets
  FOR UPDATE USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

-- Eggs: own only
CREATE POLICY "eggs_select_own" ON eggs
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );
CREATE POLICY "eggs_insert_own" ON eggs
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

-- Raids: read own (as attacker or defender)
CREATE POLICY "raids_select_own" ON raids
  FOR SELECT USING (
    attacker_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
    OR defender_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );
CREATE POLICY "raids_insert_attacker" ON raids
  FOR INSERT WITH CHECK (
    attacker_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

-- Notifications: own only
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

-- =============================================================================
-- ENABLE REALTIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE tiles;
ALTER PUBLICATION supabase_realtime ADD TABLE resources;
ALTER PUBLICATION supabase_realtime ADD TABLE pets;
ALTER PUBLICATION supabase_realtime ADD TABLE dungeons;
