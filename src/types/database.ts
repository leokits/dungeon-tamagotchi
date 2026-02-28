// Database types matching the Supabase schema

export type TileType =
  | "solid"
  | "corridor"
  | "packed"
  | "solid_regrowing"
  | "resource"
  | "hatchery"
  | "crystal";

export type ResourceType =
  | "mushroom"
  | "crystal_shard"
  | "bone"
  | "mana_orb"
  | "moss";

export type PetStatus = "alive" | "raiding" | "dead" | "captured";

export type PetBaseType = "shroom_slime" | "crystal_sprite" | "stone_crawler";

export type RaidResult = "attacker_win" | "defender_win" | "draw" | "timeout";

// ---- Row types ----

export interface Player {
  id: string;
  auth_id: string;
  username: string;
  chrono_dust: number;
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
  died_at: string | null;
  death_location_x: number | null;
  death_location_y: number | null;
  created_at: string;
  updated_at: string;
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
