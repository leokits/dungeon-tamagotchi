// Database types matching the Supabase schema

export type TileType =
  | "solid"
  | "corridor"
  | "packed"
  | "solid_regrowing"
  | "resource"
  | "hatchery"
  | "crystal"
  | "ground";

export type ResourceType =
  | "mushroom"
  | "crystal_shard"
  | "bone"
  | "mana_orb"
  | "moss";

export type PetStatus = "alive" | "raiding" | "dead" | "captured";

export type PetBaseType =
  | "shroom_slime"
  | "crystal_sprite"
  | "stone_crawler"
  | "glob_slime"
  | "dust_mite"
  | "cave_beetle"
  | "mycelid"
  | "wisp"
  | "cave_serpent"
  | "stone_golem"
  | "shade_wraith"
  | "fang_beetle"
  | "moss_crawler"
  | "ember_salamander";

export type RaidResult = "attacker_win" | "defender_win" | "draw" | "timeout";

export type ElementType = "fire" | "nature" | "crystal" | "shadow" | "neutral";

export type TrapType = "spike_floor" | "poison_gas" | "decoy_crystal" | "wall_mimic" | "mana_drain";

export type SkillType = "attack" | "heal" | "buff" | "debuff" | "aoe" | "stealth";

export type CosmeticType = "pet_skin" | "dungeon_theme" | "crystal_effect" | "name_color" | "emote" | "title";

export type QuestType = "daily" | "weekly";

export type AchievementCategory = "exploration" | "collection" | "combat" | "social";

export type TradeStatus = "pending" | "accepted" | "rejected" | "cancelled" | "completed";

// ---- Row types ----

export interface Player {
  id: string;
  auth_id: string;
  username: string;
  chrono_dust: number;
  level: number;
  xp: number;
  title: string | null;
  avatar_cosmetic: string | null;
  last_tick_at: string;
  created_at: string;
  updated_at: string;
}

export interface Dungeon {
  id: string;
  player_id: string;
  crystal_energy: number;
  crystal_tile_x: number;
  crystal_tile_y: number;
  crystal_chunk_x: number;
  crystal_chunk_y: number;
  theme: string;
  crystal_effect: string;
  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: string;
  dungeon_id: string;
  chunk_x: number;
  chunk_y: number;
  width: number;
  height: number;
  locked: boolean;
  created_at: string;
}

export interface Tile {
  id: string;
  chunk_id: string;
  dungeon_id: string;
  local_x: number;
  local_y: number;
  chunk_x: number;
  chunk_y: number;
  type: TileType;
  nutrient: number;
  mana: number;
  regrow_at: string | null;
  traffic_count: number;
  traffic_reset: string;
  created_at: string;
}

export interface Resource {
  id: string;
  tile_id: string;
  dungeon_id: string;
  type: ResourceType;
  quantity: number;
  created_at: string;
}

export interface Pet {
  id: string;
  player_id: string;
  dungeon_id: string;
  name: string | null;
  base_type: PetBaseType;
  species: string;
  element: ElementType | null;
  evolution_stage: number;
  evolved_form: string | null;
  status: PetStatus;
  hp: number;
  max_hp: number;
  mp: number;
  max_mp: number;
  atk: number;
  def: number;
  spd: number;
  hunger: number;
  tile_x: number | null;
  tile_y: number | null;
  chunk_x: number;
  chunk_y: number;
  food_log: string[];
  skills: string[];
  level: number;
  total_exp: number;
  behavior_stats: PetBehaviorStats;
  bond_level: number;
  skin_cosmetic: string | null;
  died_at: string | null;
  death_location_x: number | null;
  death_location_y: number | null;
  created_at: string;
  updated_at: string;
}

export interface PetBehaviorStats {
  tilesWalked: number;
  fightsWon: number;
  fightsLost: number;
  totalExp: number;
  foodEaten: Record<string, number>;
  preysHunted: Record<string, number>;
  specialFlags: string[];
}

export interface Egg {
  id: string;
  player_id: string;
  dungeon_id: string;
  base_type: PetBaseType;
  hatchery_tile_id: string;
  incubation_start: string;
  hatches_at: string;
  hatched: boolean;
  created_at: string;
}

export interface Raid {
  id: string;
  attacker_id: string;
  defender_id: string;
  pets_sent: string[];
  dungeon_snapshot: Record<string, unknown>;
  random_seed: number;
  result: RaidResult | null;
  depth_reached: number | null;
  loot: Record<string, unknown> | null;
  captured_pet_id: string | null;
  energy_drained: number | null;
  replay_data: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface CombatLog {
  id: string;
  dungeon_id: string;
  attacker_id: string;
  defender_id: string;
  winner_id: string | null;
  attacker_damage: number;
  defender_damage: number;
  exp_gained: number;
  rounds: number;
  created_at: string;
}

export interface Notification {
  id: string;
  player_id: string;
  type: string;
  data: Record<string, unknown>;
  seen: boolean;
  created_at: string;
}

// ---- Composite types for API responses ----

export interface DungeonWithDetails extends Dungeon {
  chunks: ChunkWithTiles[];
  resources: Resource[];
}

export interface ChunkWithTiles extends Chunk {
  tiles: Tile[];
}

// ---- Helper: global tile coordinates ----

export function toGlobalCoords(
  chunkX: number,
  chunkY: number,
  localX: number,
  localY: number,
  chunkWidth: number = 10,
  chunkHeight: number = 10
): { x: number; y: number } {
  // The starting chunk (0,0) is 20x15, expansion chunks are 10x10
  // For simplicity we use chunk offset * standard size + local
  return {
    x: chunkX * chunkWidth + localX,
    y: chunkY * chunkHeight + localY,
  };
}

// ---- New Deepborn types ----

export interface Trap {
  id: string;
  dungeon_id: string;
  tile_id: string;
  type: TrapType;
  damage: number;
  triggered: boolean;
  created_at: string;
}

export interface GuardAssignment {
  id: string;
  dungeon_id: string;
  pet_id: string;
  chunk_x: number;
  chunk_y: number;
  patrol_radius: number;
  created_at: string;
}

export interface Skill {
  id: string;
  monster_family_id: string;
  name: string;
  description: string;
  type: SkillType;
  mp_cost: number;
  cooldown: number;
  power: number;
  unlock_stage: number;
  element: ElementType | null;
}

export interface PlayerSkill {
  id: string;
  pet_id: string;
  skill_id: string;
  unlocked_at: string;
}

export interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  category: AchievementCategory;
  target_value: number;
  reward_dust: number;
  reward_title: string | null;
  reward_cosmetic: string | null;
  icon: string;
}

export interface PlayerAchievement {
  id: string;
  player_id: string;
  achievement_id: string;
  progress: number;
  completed_at: string | null;
  claimed_at: string | null;
}

export interface Quest {
  id: string;
  type: QuestType;
  code: string;
  name: string;
  description: string;
  target_value: number;
  reward_dust: number;
  reward_xp: number;
  reward_cosmetic: string | null;
  is_active: boolean;
}

export interface PlayerQuest {
  id: string;
  player_id: string;
  quest_id: string;
  progress: number;
  completed_at: string | null;
  claimed_at: string | null;
  refreshed_at: string;
}

export interface Trade {
  id: string;
  initiator_id: string;
  recipient_id: string;
  status: TradeStatus;
  initiator_offered_dust: number;
  recipient_offered_dust: number;
  initiator_offered_resources: Record<string, number>;
  recipient_offered_resources: Record<string, number>;
  initiator_offered_pets: string[];
  recipient_offered_pets: string[];
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface PlayerCosmetic {
  id: string;
  player_id: string;
  cosmetic_id: string;
  cosmetic_type: CosmeticType;
  source: string;
  unlocked_at: string;
}

export interface BattlePassSeason {
  id: string;
  season_number: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export interface BattlePassProgress {
  id: string;
  player_id: string;
  season_id: string;
  tier: number;
  xp: number;
  has_premium: boolean;
  claimed_free_tiers: number[];
  claimed_premium_tiers: number[];
}

export interface LeaderboardEntry {
  id: string;
  player_id: string;
  category: string;
  score: number;
  updated_at: string;
}
