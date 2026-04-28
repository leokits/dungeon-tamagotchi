import { MONSTER_DEF_BY_ID, MONSTER_FAMILY_BY_ID, type SoilType } from "@/game/monsters";
import { monsterSpriteGenerator, type MonsterFamilyType } from "./monster";
import { tileSpriteGenerator, type TileType, type TileFrame } from "./tile";
import { resourceSpriteGenerator, type ResourceType, type ResourceFrame } from "./resource";

export class SpriteCache {
  private static instance: SpriteCache;

  private monsterCache = new Map<string, HTMLCanvasElement>();
  private tileCache = new Map<string, TileFrame>();
  private resourceCache = new Map<string, ResourceFrame>();

  private constructor() {}

  static getInstance(): SpriteCache {
    if (!SpriteCache.instance) {
      SpriteCache.instance = new SpriteCache();
    }
    return SpriteCache.instance;
  }

  getMonster(id: string): HTMLCanvasElement | null {
    if (this.monsterCache.has(id)) {
      return this.monsterCache.get(id)!;
    }

    const def = MONSTER_DEF_BY_ID[id];
    const family = MONSTER_FAMILY_BY_ID[id];
    if (!def || !family) return null;

    const canvas = monsterSpriteGenerator.generate(def, family.familyName as MonsterFamilyType);
    this.monsterCache.set(id, canvas);
    return canvas;
  }

  getTile(type: TileType, frame: number, soil: SoilType = "brown"): HTMLCanvasElement | null {
    const cacheKey = `${type}_${soil}`;
    if (!this.tileCache.has(cacheKey)) {
      const frames = tileSpriteGenerator.generate(type, soil);
      this.tileCache.set(cacheKey, frames);
    }

    const frames = this.tileCache.get(cacheKey)!;
    return frames[frame % 2];
  }

  getResource(type: ResourceType, frame: number): HTMLCanvasElement | null {
    if (!this.resourceCache.has(type)) {
      const frames = resourceSpriteGenerator.generate(type);
      this.resourceCache.set(type, frames);
    }

    const frames = this.resourceCache.get(type)!;
    return frames[frame % 2];
  }

  pregenerateMonsters(): number {
    let count = 0;
    for (const id of Object.keys(MONSTER_DEF_BY_ID)) {
      this.getMonster(id);
      count++;
    }
    return count;
  }

  pregenerateTiles(soilTypes: SoilType[] = ["brown", "green", "crystal"]): number {
    let count = 0;
    const tileTypes: TileType[] = ["solid", "corridor", "packed", "solid_regrowing", "hatchery", "crystal", "ground"];
    for (const soil of soilTypes) {
      for (const type of tileTypes) {
        this.getTile(type, 0, soil);
        count++;
      }
    }
    return count;
  }

  pregenerateResources(): number {
    let count = 0;
    const resourceTypes: ResourceType[] = ["mushroom", "crystal_shard", "bone", "mana_orb", "moss"];
    for (const type of resourceTypes) {
      this.getResource(type, 0);
      count++;
    }
    return count;
  }

  clear(): void {
    this.monsterCache.clear();
    this.tileCache.clear();
    this.resourceCache.clear();
  }

  getStats(): { monsters: number; tiles: number; resources: number } {
    return {
      monsters: this.monsterCache.size,
      tiles: this.tileCache.size,
      resources: this.resourceCache.size,
    };
  }
}

export const spriteCache = SpriteCache.getInstance();