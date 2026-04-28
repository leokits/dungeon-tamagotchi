-- Migration: Deepborn Extensions
-- Adds columns for progression/cosmetics, new gameplay tables (traps, skills,
-- achievements, quests, trades, battle pass, leaderboards), seed data, and RLS.

-- =============================================================================
-- 1. EXTEND EXISTING TABLES
-- =============================================================================

-- Players: progression & cosmetics
ALTER TABLE players ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1;
ALTER TABLE players ADD COLUMN IF NOT EXISTS xp INT NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_cosmetic TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS tutorial_progress JSONB DEFAULT '{}'::jsonb;

-- Pets: element affinity, bond, cosmetics
ALTER TABLE pets ADD COLUMN IF NOT EXISTS element TEXT DEFAULT 'neutral'
  CHECK (element IN ('fire', 'nature', 'crystal', 'shadow', 'neutral'));
ALTER TABLE pets ADD COLUMN IF NOT EXISTS bond_level INT NOT NULL DEFAULT 0;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS skin_cosmetic TEXT;

-- Dungeons: visual themes
ALTER TABLE dungeons ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'default';
ALTER TABLE dungeons ADD COLUMN IF NOT EXISTS crystal_effect TEXT NOT NULL DEFAULT 'default';

-- =============================================================================
-- 2. NEW TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Traps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS traps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dungeon_id  UUID NOT NULL REFERENCES dungeons(id) ON DELETE CASCADE,
  tile_id     UUID NOT NULL REFERENCES tiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('spike_floor', 'poison_gas', 'decoy_crystal', 'wall_mimic', 'mana_drain')),
  damage      INT NOT NULL DEFAULT 10,
  triggered   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_traps_dungeon ON traps(dungeon_id);
CREATE INDEX IF NOT EXISTS idx_traps_tile ON traps(tile_id);
CREATE INDEX IF NOT EXISTS idx_traps_untriggered ON traps(dungeon_id) WHERE triggered = false;

ALTER TABLE traps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "traps_select_all" ON traps
  FOR SELECT USING (true);

CREATE POLICY "traps_insert_own" ON traps
  FOR INSERT WITH CHECK (
    dungeon_id IN (
      SELECT d.id FROM dungeons d
      JOIN players p ON d.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );

CREATE POLICY "traps_update_own" ON traps
  FOR UPDATE USING (
    dungeon_id IN (
      SELECT d.id FROM dungeons d
      JOIN players p ON d.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );

CREATE POLICY "traps_delete_own" ON traps
  FOR DELETE USING (
    dungeon_id IN (
      SELECT d.id FROM dungeons d
      JOIN players p ON d.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Guard Assignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guard_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dungeon_id    UUID NOT NULL REFERENCES dungeons(id) ON DELETE CASCADE,
  pet_id        UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  chunk_x       INT NOT NULL,
  chunk_y       INT NOT NULL,
  patrol_radius INT NOT NULL DEFAULT 2,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guard_assignments_dungeon ON guard_assignments(dungeon_id);
CREATE INDEX IF NOT EXISTS idx_guard_assignments_pet ON guard_assignments(pet_id);
CREATE INDEX IF NOT EXISTS idx_guard_assignments_position ON guard_assignments(dungeon_id, chunk_x, chunk_y);

ALTER TABLE guard_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guard_assignments_select_all" ON guard_assignments
  FOR SELECT USING (true);

CREATE POLICY "guard_assignments_insert_own" ON guard_assignments
  FOR INSERT WITH CHECK (
    dungeon_id IN (
      SELECT d.id FROM dungeons d
      JOIN players p ON d.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );

CREATE POLICY "guard_assignments_update_own" ON guard_assignments
  FOR UPDATE USING (
    dungeon_id IN (
      SELECT d.id FROM dungeons d
      JOIN players p ON d.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );

CREATE POLICY "guard_assignments_delete_own" ON guard_assignments
  FOR DELETE USING (
    dungeon_id IN (
      SELECT d.id FROM dungeons d
      JOIN players p ON d.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Skills (monster ability definitions)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skills (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monster_family_id TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  type              TEXT NOT NULL CHECK (type IN ('attack', 'heal', 'buff', 'debuff', 'aoe', 'stealth')),
  mp_cost           INT NOT NULL DEFAULT 0,
  cooldown          INT NOT NULL DEFAULT 0,
  power             INT NOT NULL DEFAULT 10,
  unlock_stage      INT NOT NULL DEFAULT 1,
  element           TEXT CHECK (element IN ('fire', 'nature', 'crystal', 'shadow', 'neutral'))
);

CREATE INDEX IF NOT EXISTS idx_skills_family ON skills(monster_family_id);
CREATE INDEX IF NOT EXISTS idx_skills_type ON skills(type);
CREATE INDEX IF NOT EXISTS idx_skills_element ON skills(element);

-- Skills are read-only game data; no RLS insert/update needed, but enable for consistency
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skills_select_all" ON skills
  FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- Player Skills (pets learning skills)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id      UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  skill_id    UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(pet_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_player_skills_pet ON player_skills(pet_id);
CREATE INDEX IF NOT EXISTS idx_player_skills_skill ON player_skills(skill_id);

ALTER TABLE player_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_skills_select_own" ON player_skills
  FOR SELECT USING (
    pet_id IN (
      SELECT pt.id FROM pets pt
      JOIN players p ON pt.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );

CREATE POLICY "player_skills_insert_own" ON player_skills
  FOR INSERT WITH CHECK (
    pet_id IN (
      SELECT pt.id FROM pets pt
      JOIN players p ON pt.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );

CREATE POLICY "player_skills_delete_own" ON player_skills
  FOR DELETE USING (
    pet_id IN (
      SELECT pt.id FROM pets pt
      JOIN players p ON pt.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Achievements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS achievements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL CHECK (category IN ('exploration', 'collection', 'combat', 'social')),
  target_value   INT NOT NULL DEFAULT 1,
  reward_dust    INT NOT NULL DEFAULT 0,
  reward_title   TEXT,
  reward_cosmetic TEXT,
  icon           TEXT NOT NULL DEFAULT 'trophy'
);

CREATE INDEX IF NOT EXISTS idx_achievements_category ON achievements(category);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "achievements_select_all" ON achievements
  FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- Player Achievements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_achievements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  progress       INT NOT NULL DEFAULT 0,
  completed_at   TIMESTAMPTZ,
  claimed_at     TIMESTAMPTZ,

  UNIQUE(player_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON player_achievements(player_id);
CREATE INDEX IF NOT EXISTS idx_player_achievements_achievement ON player_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_player_achievements_completed ON player_achievements(player_id) WHERE completed_at IS NOT NULL;

ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_achievements_select_own" ON player_achievements
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

CREATE POLICY "player_achievements_insert_own" ON player_achievements
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

CREATE POLICY "player_achievements_update_own" ON player_achievements
  FOR UPDATE USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Quests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN ('daily', 'weekly')),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  target_value    INT NOT NULL DEFAULT 1,
  reward_dust     INT NOT NULL DEFAULT 0,
  reward_xp       INT NOT NULL DEFAULT 0,
  reward_cosmetic TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,

  UNIQUE(type, code)
);

CREATE INDEX IF NOT EXISTS idx_quests_type ON quests(type);
CREATE INDEX IF NOT EXISTS idx_quests_active ON quests(type, code) WHERE is_active = true;

ALTER TABLE quests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quests_select_all" ON quests
  FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- Player Quests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_quests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quest_id     UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  progress     INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  claimed_at   TIMESTAMPTZ,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(player_id, quest_id, refreshed_at)
);

CREATE INDEX IF NOT EXISTS idx_player_quests_player ON player_quests(player_id);
CREATE INDEX IF NOT EXISTS idx_player_quests_quest ON player_quests(quest_id);
CREATE INDEX IF NOT EXISTS idx_player_quests_unclaimed ON player_quests(player_id) WHERE completed_at IS NOT NULL AND claimed_at IS NULL;

ALTER TABLE player_quests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_quests_select_own" ON player_quests
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

CREATE POLICY "player_quests_insert_own" ON player_quests
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

CREATE POLICY "player_quests_update_own" ON player_quests
  FOR UPDATE USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Trades
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trades (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id                   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recipient_id                   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status                         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'completed')),
  initiator_offered_dust         INT NOT NULL DEFAULT 0,
  recipient_offered_dust         INT NOT NULL DEFAULT 0,
  initiator_offered_resources    JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipient_offered_resources    JSONB NOT NULL DEFAULT '[]'::jsonb,
  initiator_offered_pets         JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipient_offered_pets         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at                     TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_trades_initiator ON trades(initiator_id);
CREATE INDEX IF NOT EXISTS idx_trades_recipient ON trades(recipient_id);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_pending ON trades(initiator_id, recipient_id) WHERE status = 'pending';

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trades_select_own" ON trades
  FOR SELECT USING (
    initiator_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
    OR recipient_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

CREATE POLICY "trades_insert_own" ON trades
  FOR INSERT WITH CHECK (
    initiator_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

CREATE POLICY "trades_update_own" ON trades
  FOR UPDATE USING (
    initiator_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
    OR recipient_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Player Cosmetics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_cosmetics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cosmetic_id  TEXT NOT NULL,
  cosmetic_type TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'achievement',
  unlocked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(player_id, cosmetic_id)
);

CREATE INDEX IF NOT EXISTS idx_player_cosmetics_player ON player_cosmetics(player_id);
CREATE INDEX IF NOT EXISTS idx_player_cosmetics_type ON player_cosmetics(cosmetic_type);

ALTER TABLE player_cosmetics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_cosmetics_select_own" ON player_cosmetics
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

CREATE POLICY "player_cosmetics_insert_own" ON player_cosmetics
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

CREATE POLICY "player_cosmetics_delete_own" ON player_cosmetics
  FOR DELETE USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Battle Pass Seasons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS battle_pass_seasons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_number INT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  start_date    TIMESTAMPTZ NOT NULL,
  end_date      TIMESTAMPTZ NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_bp_seasons_active ON battle_pass_seasons(is_active) WHERE is_active = true;

ALTER TABLE battle_pass_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bp_seasons_select_all" ON battle_pass_seasons
  FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- Battle Pass Progress
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS battle_pass_progress (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id   UUID NOT NULL REFERENCES battle_pass_seasons(id) ON DELETE CASCADE,
  tier        INT NOT NULL DEFAULT 0,
  xp          INT NOT NULL DEFAULT 0,
  has_premium BOOLEAN NOT NULL DEFAULT false,
  claimed_free_tiers    JSONB NOT NULL DEFAULT '[]'::jsonb,
  claimed_premium_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,

  UNIQUE(player_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_bp_progress_player ON battle_pass_progress(player_id);
CREATE INDEX IF NOT EXISTS idx_bp_progress_season ON battle_pass_progress(season_id);

ALTER TABLE battle_pass_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bp_progress_select_own" ON battle_pass_progress
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

CREATE POLICY "bp_progress_insert_own" ON battle_pass_progress
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

CREATE POLICY "bp_progress_update_own" ON battle_pass_progress
  FOR UPDATE USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Leaderboards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leaderboards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  score       BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(player_id, category)
);

CREATE INDEX IF NOT EXISTS idx_leaderboards_category_score ON leaderboards(category, score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboards_player ON leaderboards(player_id);

ALTER TABLE leaderboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leaderboards_select_all" ON leaderboards
  FOR SELECT USING (true);

CREATE POLICY "leaderboards_insert_own" ON leaderboards
  FOR INSERT WITH CHECK (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

CREATE POLICY "leaderboards_update_own" ON leaderboards
  FOR UPDATE USING (
    player_id IN (SELECT id FROM players WHERE auth_id = auth.uid())
  );

-- =============================================================================
-- 3. SEED DATA
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3a. Achievements (~30 across 4 categories)
-- ---------------------------------------------------------------------------
INSERT INTO achievements (code, name, description, category, target_value, reward_dust, reward_title, reward_cosmetic, icon) VALUES
-- Exploration (8)
('explore_first_chunk', 'First Steps', 'Unlock your first expansion chunk', 'exploration', 1, 50, NULL, NULL, 'map'),
('explore_5_chunks', 'Explorer', 'Unlock 5 expansion chunks', 'exploration', 5, 200, 'Explorer', NULL, 'compass'),
('explore_15_chunks', 'Cartographer', 'Unlock 15 expansion chunks', 'exploration', 15, 500, 'Cartographer', 'avatar_golden_map', 'globe'),
('explore_30_chunks', 'World Walker', 'Unlock 30 expansion chunks', 'exploration', 30, 1000, 'World Walker', NULL, 'globe'),
('reach_depth_10', 'Deep Diver', 'Reach depth 10 in a raid', 'exploration', 10, 150, NULL, NULL, 'arrow_down'),
('reach_depth_25', 'Abyss Gazer', 'Reach depth 25 in a raid', 'exploration', 25, 400, 'Abyss Gazer', NULL, 'arrow_down_circle'),
('reach_depth_50', 'Void Walker', 'Reach depth 50 in a raid', 'exploration', 50, 1000, 'Void Walker', 'avatar_void', 'zap'),
('discover_all_resources', 'Resource Hunter', 'Discover all 5 resource types', 'exploration', 5, 300, NULL, NULL, 'gem'),

-- Collection (8)
('collect_first_pet', 'Pet Keeper', 'Hatch your first pet', 'collection', 1, 100, NULL, NULL, 'heart'),
('collect_5_pets', 'Menagerie', 'Have 5 pets alive simultaneously', 'collection', 5, 300, NULL, NULL, 'users'),
('collect_15_pets', 'Beast Master', 'Have 15 pets alive simultaneously', 'collection', 15, 800, 'Beast Master', 'avatar_beast_crown', 'crown'),
('collect_30_pets', 'Army of One', 'Have 30 pets alive simultaneously', 'collection', 30, 2000, 'Legionnaire', NULL, 'shield'),
('evolve_first_pet', 'Evolution', 'Evolve a pet to stage 2', 'collection', 1, 200, NULL, NULL, 'trending_up'),
('evolve_5_pets', 'Darwin Award', 'Evolve 5 pets to stage 2+', 'collection', 5, 600, 'Evolutionist', NULL, 'trending_up'),
('max_bond_pet', 'Best Friends', 'Reach max bond level with a pet', 'collection', 10, 500, 'Friend', 'avatar_heart', 'heart'),
('collect_all_elements', 'Elementalist', 'Own pets of all 5 elements', 'collection', 5, 1000, 'Elementalist', 'avatar_elemental', 'zap'),

-- Combat (8)
('win_first_raid', 'First Blood', 'Win your first raid', 'combat', 1, 150, NULL, NULL, 'sword'),
('win_10_raids', 'Raid Veteran', 'Win 10 raids', 'combat', 10, 500, 'Raider', NULL, 'sword'),
('win_50_raids', 'Warlord', 'Win 50 raids', 'combat', 50, 1500, 'Warlord', 'avatar_war_helm', 'shield'),
('win_100_raids', 'Conqueror', 'Win 100 raids', 'combat', 100, 3000, 'Conqueror', 'avatar_conqueror', 'crown'),
('defend_success', 'Fortress', 'Successfully defend your dungeon 10 times', 'combat', 10, 400, 'Guardian', NULL, 'shield'),
('defend_50', 'Impenetrable', 'Successfully defend your dungeon 50 times', 'combat', 50, 1200, 'Impenetrable', 'avatar_fortress', 'lock'),
('capture_pet', 'Poacher', 'Capture a pet during a raid', 'combat', 1, 300, NULL, NULL, 'target'),
('capture_10_pets', 'Pet Snatcher', 'Capture 10 pets during raids', 'combat', 10, 800, 'Snatcher', NULL, 'target'),

-- Social (6)
('first_trade', 'Deal Maker', 'Complete your first trade', 'social', 1, 100, NULL, NULL, 'repeat'),
('trade_10', 'Merchant', 'Complete 10 trades', 'social', 10, 400, 'Merchant', NULL, 'repeat'),
('trade_50', 'Tycoon', 'Complete 50 trades', 'social', 50, 1200, 'Tycoon', 'avatar_gold_crown', 'dollar_sign'),
('gift_dust', 'Generous Soul', 'Give dust in a trade', 'social', 1, 50, NULL, NULL, 'gift'),
('receive_first_quest', 'Quest Starter', 'Complete your first daily quest', 'social', 1, 100, NULL, NULL, 'check_square'),
('complete_weekly', 'Week Warrior', 'Complete a weekly quest', 'social', 1, 300, NULL, NULL, 'calendar');

-- ---------------------------------------------------------------------------
-- 3b. Quests (6 daily + 6 weekly)
-- ---------------------------------------------------------------------------
INSERT INTO quests (type, code, name, description, target_value, reward_dust, reward_xp, reward_cosmetic) VALUES
-- Daily quests
('daily', 'daily_feed_pets', 'Well Fed', 'Feed your pets 10 times', 10, 30, 50, NULL),
('daily', 'daily_win_raid', 'Raid Day', 'Win 1 raid', 1, 50, 100, NULL),
('daily', 'daily_walk_tiles', 'On The Move', 'Have pets walk 200 tiles', 200, 25, 40, NULL),
('daily', 'daily_collect_resources', 'Gatherer', 'Collect 15 resources', 15, 40, 60, NULL),
('daily', 'daily_place_traps', 'Trap Master', 'Place 5 traps in your dungeon', 5, 35, 50, NULL),
('daily', 'daily_hatch_egg', 'New Life', 'Hatch 1 egg', 1, 60, 80, NULL),

-- Weekly quests
('weekly', 'weekly_win_5_raids', 'Raid Week', 'Win 5 raids this week', 5, 200, 300, NULL),
('weekly', 'weekly_evolve_pet', 'Evolution Week', 'Evolve 1 pet this week', 1, 150, 200, 'skin_evolution_glow'),
('weekly', 'weekly_trade_3', 'Market Week', 'Complete 3 trades this week', 3, 100, 150, NULL),
('weekly', 'weekly_unlock_chunk', 'Expansion Week', 'Unlock 3 new chunks this week', 3, 120, 180, NULL),
('weekly', 'weekly_bond_increase', 'Bonding Week', 'Increase bond level 5 times', 5, 80, 120, NULL),
('weekly', 'weekly_achieve_2', 'Achievement Week', 'Complete 2 achievements this week', 2, 150, 250, 'skin_achievement_gold');

-- ---------------------------------------------------------------------------
-- 3c. Skills (~50 across 12 monster families)
-- ---------------------------------------------------------------------------
-- Family 1: shroom_slime (4 skills)
INSERT INTO skills (monster_family_id, name, description, type, mp_cost, cooldown, power, unlock_stage, element) VALUES
('shroom_slime', 'Spore Burst', 'Release a cloud of toxic spores', 'attack', 5, 2, 25, 1, 'nature'),
('shroom_slime', 'Fungal Shield', 'Coat body in hardened fungus', 'buff', 8, 4, 0, 2, 'nature'),
('shroom_slime', 'Mend Spores', 'Healing spores restore HP', 'heal', 10, 3, 30, 2, 'nature'),
('shroom_slime', 'Toxic Cloud', 'AoE poison damage over time', 'aoe', 15, 5, 40, 3, 'nature');

-- Family 2: crystal_sprite (4 skills)
INSERT INTO skills (monster_family_id, name, description, type, mp_cost, cooldown, power, unlock_stage, element) VALUES
('crystal_sprite', 'Crystal Shard', 'Fire a sharp crystal projectile', 'attack', 5, 2, 30, 1, 'crystal'),
('crystal_sprite', 'Prismatic Barrier', 'Refract incoming damage', 'buff', 10, 4, 0, 2, 'crystal'),
('crystal_sprite', 'Shatter Burst', 'Explode nearby crystals', 'aoe', 15, 5, 45, 2, 'crystal'),
('crystal_sprite', 'Crystal Regen', 'Crystals slowly restore HP', 'heal', 12, 4, 35, 3, 'crystal');

-- Family 3: glob_slime (4 skills)
INSERT INTO skills (monster_family_id, name, description, type, mp_cost, cooldown, power, unlock_stage, element) VALUES
('glob_slime', 'Acid Splash', 'Corrosive glob attack', 'attack', 5, 2, 22, 1, 'nature'),
('glob_slime', 'Absorb', 'Drain enemy HP', 'attack', 10, 3, 20, 2, 'nature'),
('glob_slime', 'Elastic Body', 'Reduce all damage taken', 'buff', 8, 4, 0, 2, 'nature'),
('glob_slime', 'Engulf', 'Trap enemy in slime body', 'debuff', 12, 5, 15, 3, 'nature');

-- Family 4: dust_mite (4 skills)
INSERT INTO skills (monster_family_id, name, description, type, mp_cost, cooldown, power, unlock_stage, element) VALUES
('dust_mite', 'Dust Cloud', 'Blinding dust reduces accuracy', 'debuff', 6, 3, 10, 1, 'neutral'),
('dust_mite', 'Quick Bite', 'Fast but weak attack', 'attack', 3, 1, 18, 1, 'neutral'),
('dust_mite', 'Scurry', 'Increase speed dramatically', 'buff', 8, 4, 0, 2, 'neutral'),
('dust_mite', 'Dust Storm', 'AoE blinding storm', 'aoe', 14, 5, 30, 3, 'neutral');

-- Family 5: cave_beetle (4 skills)
INSERT INTO skills (monster_family_id, name, description, type, mp_cost, cooldown, power, unlock_stage, element) VALUES
('cave_beetle', 'Mandible Crush', 'Powerful bite attack', 'attack', 6, 2, 35, 1, 'neutral'),
('cave_beetle', 'Hardened Shell', 'Massive defense boost', 'buff', 10, 5, 0, 2, 'neutral'),
('cave_beetle', 'Burrow', 'Disappear underground briefly', 'stealth', 12, 4, 0, 2, 'neutral'),
('cave_beetle', 'Shell Shock', 'Stun enemy with shell slam', 'attack', 15, 5, 40, 3, 'neutral');

-- Family 6: mycelid (4 skills)
INSERT INTO skills (monster_family_id, name, description, type, mp_cost, cooldown, power, unlock_stage, element) VALUES
('mycelid', 'Root Strike', 'Underground root attack', 'attack', 5, 2, 28, 1, 'nature'),
('mycelid', 'Mycelium Network', 'Share HP with nearby allies', 'heal', 12, 4, 25, 2, 'nature'),
('mycelid', 'Entangle', 'Root enemy in place', 'debuff', 10, 3, 15, 2, 'nature'),
('mycelid', 'Spore Explosion', 'Detonate spores for massive damage', 'aoe', 18, 6, 55, 3, 'nature');

-- Family 7: wisp (4 skills)
INSERT INTO skills (monster_family_id, name, description, type, mp_cost, cooldown, power, unlock_stage, element) VALUES
('wisp', 'Spectral Bolt', 'Ghostly energy projectile', 'attack', 5, 2, 26, 1, 'shadow'),
('wisp', 'Phase Shift', 'Become intangible briefly', 'stealth', 10, 4, 0, 2, 'shadow'),
('wisp', 'Drain Life', 'Siphon enemy vitality', 'attack', 12, 3, 30, 2, 'shadow'),
('wisp', 'Haunting Wail', 'AoE fear debuff', 'aoe', 15, 5, 20, 3, 'shadow');

-- Family 8: cave_serpent (4 skills)
INSERT INTO skills (monster_family_id, name, description, type, mp_cost, cooldown, power, unlock_stage, element) VALUES
('cave_serpent', 'Venom Fang', 'Poisonous bite', 'attack', 6, 2, 32, 1, 'nature'),
('cave_serpent', 'Constrict', 'Squeeze enemy, reducing their ATK', 'debuff', 10, 3, 20, 2, 'nature'),
('cave_serpent', 'Slither', 'Dodge next incoming attack', 'buff', 8, 4, 0, 2, 'nature'),
('cave_serpent', 'Venom Spray', 'AoE poison cloud', 'aoe', 14, 5, 35, 3, 'nature');

-- Family 9: stone_golem (4 skills)
INSERT INTO skills (monster_family_id, name, description, type, mp_cost, cooldown, power, unlock_stage, element) VALUES
('stone_golem', 'Rock Throw', 'Hurl a boulder', 'attack', 6, 2, 38, 1, 'crystal'),
('stone_golem', 'Stone Wall', 'Create a defensive barrier', 'buff', 12, 5, 0, 2, 'crystal'),
('stone_golem', 'Earthquake', 'AoE ground slam', 'aoe', 18, 6, 50, 3, 'crystal'),
('stone_golem', 'Petrify', 'Turn enemy to stone briefly', 'debuff', 15, 5, 25, 3, 'crystal');

-- Family 10: shade_wraith (4 skills)
INSERT INTO skills (monster_family_id, name, description, type, mp_cost, cooldown, power, unlock_stage, element) VALUES
('shade_wraith', 'Shadow Claw', 'Dark energy slash', 'attack', 5, 2, 30, 1, 'shadow'),
('shade_wraith', 'Nightmare', 'Inflict fear, reducing SPD', 'debuff', 10, 3, 15, 2, 'shadow'),
('shade_wraith', 'Shadow Step', 'Teleport behind enemy', 'stealth', 8, 3, 0, 2, 'shadow'),
('shade_wraith', 'Soul Harvest', 'AoE life drain', 'aoe', 20, 6, 45, 3, 'shadow');

-- Family 11: moss_crawler (4 skills)
INSERT INTO skills (monster_family_id, name, description, type, mp_cost, cooldown, power, unlock_stage, element) VALUES
('moss_crawler', 'Vine Whip', 'Lash with thorny vines', 'attack', 5, 2, 24, 1, 'nature'),
('moss_crawler', 'Photosynthesis', 'Regenerate HP in sunlight', 'heal', 8, 3, 20, 2, 'nature'),
('moss_crawler', 'Camouflage', 'Blend into surroundings', 'stealth', 10, 4, 0, 2, 'nature'),
('moss_crawler', 'Thorn Barrage', 'AoE thorn shower', 'aoe', 14, 5, 35, 3, 'nature');

-- Family 12: ember_salamander (4 skills)
INSERT INTO skills (monster_family_id, name, description, type, mp_cost, cooldown, power, unlock_stage, element) VALUES
('ember_salamander', 'Flame Spit', 'Shoot a fireball', 'attack', 6, 2, 34, 1, 'fire'),
('ember_salamander', 'Heat Wave', 'Raise temperature, buff ATK', 'buff', 10, 4, 0, 2, 'fire'),
('ember_salamander', 'Molten Skin', 'Burn attackers on contact', 'buff', 12, 5, 20, 2, 'fire'),
('ember_salamander', 'Inferno', 'Massive AoE fire damage', 'aoe', 20, 6, 60, 3, 'fire');

-- Family 13: fang_beetle (4 skills)
INSERT INTO skills (monster_family_id, name, description, type, mp_cost, cooldown, power, unlock_stage, element) VALUES
('fang_beetle', 'Pierce', 'Armor-piercing bite', 'attack', 6, 2, 36, 1, 'neutral'),
('fang_beetle', 'Bloodlust', 'Increase ATK at cost of DEF', 'buff', 8, 4, 0, 2, 'neutral'),
('fang_beetle', 'Burrow Ambush', 'Attack from underground', 'stealth', 12, 4, 40, 2, 'neutral'),
('fang_beetle', 'Frenzy', 'AoE rapid strikes', 'aoe', 16, 5, 45, 3, 'neutral');

-- ---------------------------------------------------------------------------
-- 3d. Battle Pass Season 1
-- ---------------------------------------------------------------------------
INSERT INTO battle_pass_seasons (season_number, name, start_date, end_date, is_active) VALUES
(1, 'Season of Awakening', '2026-01-01 00:00:00+00', '2026-04-01 00:00:00+00', true);
