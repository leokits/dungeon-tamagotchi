-- Migration: Monster System Overhaul
-- Adds 12 base monster types, behavior stats tracking, level/exp system

-- =============================================================================
-- 1. Extend pet_base_type enum with all 12 base monster families
-- =============================================================================
-- NOTE: We add all base AND evolved form names so evolved_form can reference them too.
-- Supabase/Postgres doesn't support dropping enum values easily,
-- so we keep the old ones and add new ones.

ALTER TYPE pet_base_type ADD VALUE IF NOT EXISTS 'glob_slime';
ALTER TYPE pet_base_type ADD VALUE IF NOT EXISTS 'dust_mite';
ALTER TYPE pet_base_type ADD VALUE IF NOT EXISTS 'cave_beetle';
ALTER TYPE pet_base_type ADD VALUE IF NOT EXISTS 'mycelid';
ALTER TYPE pet_base_type ADD VALUE IF NOT EXISTS 'wisp';
ALTER TYPE pet_base_type ADD VALUE IF NOT EXISTS 'cave_serpent';
ALTER TYPE pet_base_type ADD VALUE IF NOT EXISTS 'stone_golem';
ALTER TYPE pet_base_type ADD VALUE IF NOT EXISTS 'shade_wraith';
ALTER TYPE pet_base_type ADD VALUE IF NOT EXISTS 'fang_beetle';
-- crystal_sprite already exists
-- stone_crawler already exists (keeping for backward compat)
ALTER TYPE pet_base_type ADD VALUE IF NOT EXISTS 'moss_crawler';
ALTER TYPE pet_base_type ADD VALUE IF NOT EXISTS 'ember_salamander';

-- =============================================================================
-- 2. Add new columns to pets table for behavior tracking & combat
-- =============================================================================

-- Level & experience
ALTER TABLE pets ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS total_exp INT NOT NULL DEFAULT 0;

-- Behavior statistics (JSONB for flexibility)
-- Stores: tilesWalked, fightsWon, fightsLost, totalExp, foodEaten, preysHunted, specialFlags
ALTER TABLE pets ADD COLUMN IF NOT EXISTS behavior_stats JSONB NOT NULL DEFAULT '{
  "tilesWalked": 0,
  "fightsWon": 0,
  "fightsLost": 0,
  "totalExp": 0,
  "foodEaten": {},
  "preysHunted": {},
  "specialFlags": []
}'::jsonb;

-- Monster species id (more flexible than base_type enum for evolved forms)
-- This is the actual monster form id from the bestiary (e.g. "moss_slime", "basilisk")
ALTER TABLE pets ADD COLUMN IF NOT EXISTS species TEXT NOT NULL DEFAULT '';

-- =============================================================================
-- 3. Add combat log table for fight history
-- =============================================================================
CREATE TABLE IF NOT EXISTS combat_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dungeon_id  UUID NOT NULL REFERENCES dungeons(id) ON DELETE CASCADE,
  attacker_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  defender_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  winner_id   UUID REFERENCES pets(id) ON DELETE SET NULL,
  attacker_damage INT NOT NULL DEFAULT 0,
  defender_damage INT NOT NULL DEFAULT 0,
  exp_gained  INT NOT NULL DEFAULT 0,
  rounds      INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_combat_logs_dungeon ON combat_logs(dungeon_id);
CREATE INDEX IF NOT EXISTS idx_combat_logs_attacker ON combat_logs(attacker_id);
CREATE INDEX IF NOT EXISTS idx_combat_logs_defender ON combat_logs(defender_id);

-- RLS for combat_logs
ALTER TABLE combat_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combat_logs_select_all" ON combat_logs
  FOR SELECT USING (true);

CREATE POLICY "combat_logs_insert_own" ON combat_logs
  FOR INSERT WITH CHECK (
    dungeon_id IN (
      SELECT d.id FROM dungeons d
      JOIN players p ON d.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );

-- =============================================================================
-- 4. Update evolution_stage constraint to allow up to stage 3
-- =============================================================================
-- The existing check is (1-3) so this is already fine.

-- =============================================================================
-- 5. Backfill species for any existing pets
-- =============================================================================
UPDATE pets SET species = base_type::text WHERE species = '';
