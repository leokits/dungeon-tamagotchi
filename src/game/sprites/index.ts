export { MonsterSpriteGenerator, monsterSpriteGenerator } from "./monster";
export type { MonsterFamilyType, FeatureType } from "./monster";

export { TileSpriteGenerator, tileSpriteGenerator } from "./tile";
export type { TileType, TileFrame } from "./tile";

export { ResourceSpriteGenerator, resourceSpriteGenerator } from "./resource";
export type { ResourceType, ResourceFrame } from "./resource";

export { SpriteCache, spriteCache } from "./cache";

import { spriteCache } from "./cache";
import type { SoilType } from "@/game/monsters";

export interface InitOptions {
  pregenerateMonsters?: boolean;
  pregenerateTiles?: boolean;
  pregenerateResources?: boolean;
  soilTypes?: SoilType[];
}

export function init(options: InitOptions = {}): {
  monsters: number;
  tiles: number;
  resources: number;
} {
  const {
    pregenerateMonsters = true,
    pregenerateTiles = true,
    pregenerateResources = true,
    soilTypes = ["brown", "green", "crystal"],
  } = options;

  let monsters = 0;
  let tiles = 0;
  let resources = 0;

  if (pregenerateMonsters) {
    monsters = spriteCache.pregenerateMonsters();
  }

  if (pregenerateTiles) {
    tiles = spriteCache.pregenerateTiles(soilTypes);
  }

  if (pregenerateResources) {
    resources = spriteCache.pregenerateResources();
  }

  return { monsters, tiles, resources };
}