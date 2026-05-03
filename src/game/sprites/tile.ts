/**
 * TileSpriteGenerator — Procedural pixel art tile sprites.
 *
 * Generates 32×32 pixel textures for each dungeon tile type,
 * with 2 animation frames per tile. Supports soil-type color
 * variations (green, crystal, brown).
 *
 * No external assets — pure Canvas 2D procedural generation.
 */

import type { SoilType } from "@/game/monsters";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type TileType =
  | "solid"
  | "corridor"
  | "packed"
  | "solid_regrowing"
  | "hatchery"
  | "crystal"
  | "ground";

/** A tile's two animation frames as a tuple [frame0, frame1] */
export type TileFrame = [HTMLCanvasElement, HTMLCanvasElement];

// ═══════════════════════════════════════════════════════════════════
// SEEDED RANDOM
// ═══════════════════════════════════════════════════════════════════

function hashCoords(x: number, y: number): number {
  return ((x * 73856093) ^ (y * 19349663)) & 0xffff;
}

function createSeededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ═══════════════════════════════════════════════════════════════════
// TILE RENDERERS
// ═══════════════════════════════════════════════════════════════════

const TILE_SIZE = 32;

function drawSolidTile(
  ctx: CanvasRenderingContext2D,
  frame: number,
  soil: SoilType,
  rng: () => number
): void {
  const palettes: Record<SoilType, [string, string]> = {
    brown: ["#4a3728", "#4e3b2c"],
    green: ["#3a4a28", "#3e4e2c"],
    crystal: ["#28384a", "#2c3c4e"],
  };
  const speckle: Record<SoilType, [string, string]> = {
    brown: ["rgba(0,0,0,0.12)", "rgba(0,0,0,0.08)"],
    green: ["rgba(20,40,0,0.15)", "rgba(20,40,0,0.10)"],
    crystal: ["rgba(0,20,40,0.15)", "rgba(0,20,40,0.10)"],
  };

  ctx.fillStyle = palettes[soil][frame];
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  const hlGrad = ctx.createLinearGradient(0, 0, TILE_SIZE * 0.5, TILE_SIZE * 0.5);
  hlGrad.addColorStop(0, "rgba(255,255,255,0.10)");
  hlGrad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hlGrad;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  for (let gy = 0; gy < TILE_SIZE; gy += 2) {
    for (let gx = 0; gx < TILE_SIZE; gx += 2) {
      const nv = hashCoords(gx, gy) % 100;
      if (nv < 25) {
        ctx.fillStyle = `rgba(0,0,0,${(nv / 25) * 0.08})`;
        ctx.fillRect(gx, gy, 1, 1);
      } else if (nv > 80) {
        ctx.fillStyle = `rgba(255,255,255,${((nv - 80) / 20) * 0.06})`;
        ctx.fillRect(gx, gy, 1, 1);
      }
    }
  }

  // Speckle noise
  ctx.fillStyle = speckle[soil][frame];
  const sx = (hashCoords(Math.floor(rng() * 100), 0) % 7) * 4 + 2;
  const sy = (hashCoords(0, Math.floor(rng() * 100)) % 6) * 4 + 3;
  ctx.fillRect(sx, sy, 3 + frame, 2 + frame);
  const sx2 = (hashCoords(Math.floor(rng() * 200), 0) % 6) * 4 + 5;
  const sy2 = (hashCoords(0, Math.floor(rng() * 200)) % 5) * 5 + 2;
  ctx.fillRect(sx2, sy2, 2 + (1 - frame), 3);

  // Rock cracks
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(5 + frame, 8);
  ctx.lineTo(14, 18 - frame);
  ctx.lineTo(22, 12);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(18, 22);
  ctx.lineTo(26, 26 + frame);
  ctx.stroke();

  // Soil accent overlay
  if (soil === "green") {
    ctx.fillStyle = frame === 0 ? "rgba(80,140,50,0.12)" : "rgba(90,150,60,0.15)";
    ctx.fillRect(4, TILE_SIZE - 4, 8, 3);
    ctx.fillRect(20, TILE_SIZE - 3, 6, 2);
  } else if (soil === "crystal") {
    ctx.fillStyle = frame === 0 ? "rgba(60,140,200,0.10)" : "rgba(70,150,220,0.14)";
    ctx.beginPath();
    ctx.arc(12, 14, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(24, 20, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCorridorTile(
  ctx: CanvasRenderingContext2D,
  frame: number,
  soil: SoilType,
  rng: () => number
): void {
  const palettes: Record<SoilType, [string, string]> = {
    brown: ["#8b7355", "#877050"],
    green: ["#5a8b45", "#568740"],
    crystal: ["#556b8b", "#516787"],
  };

  ctx.fillStyle = palettes[soil][frame];
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Dirt/detail specs
  const detailColor: Record<SoilType, string> = {
    brown: "rgba(60,40,20,0.2)",
    green: "rgba(30,60,10,0.2)",
    crystal: "rgba(10,30,60,0.2)",
  };
  ctx.fillStyle = detailColor[soil];
  const dx1 = Math.floor(rng() * 6) + 3;
  const dy1 = Math.floor(rng() * 4) + 4;
  ctx.fillRect(dx1 + frame * 2, dy1, 2, 2);
  ctx.fillRect(14 + frame * 2, 10, 3, 2);

  // Footprints
  ctx.fillStyle = frame === 0 ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.13)";
  ctx.fillRect(8 + frame * 2, 12, 4, 6);
  ctx.fillRect(18 - frame * 2, 6, 4, 6);

  // Moss/crystal accents on corridor edges
  if (soil === "green") {
    ctx.fillStyle = frame === 0 ? "rgba(90,170,50,0.18)" : "rgba(100,180,60,0.22)";
    ctx.fillRect(0, TILE_SIZE - 3, TILE_SIZE, 3);
    ctx.fillRect(0, 0, TILE_SIZE, 2);
  } else if (soil === "crystal") {
    ctx.fillStyle = frame === 0 ? "rgba(60,160,230,0.12)" : "rgba(70,170,240,0.16)";
    ctx.fillRect(0, TILE_SIZE - 2, TILE_SIZE, 2);
  }
}

function drawPackedTile(
  ctx: CanvasRenderingContext2D,
  frame: number,
  soil: SoilType,
  rng: () => number
): void {
  const palettes: Record<SoilType, [string, string]> = {
    brown: ["#a0926b", "#9c8e67"],
    green: ["#7aa066", "#769c62"],
    crystal: ["#6b82a0", "#677e9c"],
  };

  ctx.fillStyle = palettes[soil][frame];
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Footprint marks — more than corridor
  ctx.fillStyle = frame === 0 ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.13)";
  const fx1 = Math.floor(rng() * 4) + 6;
  ctx.fillRect(fx1 + frame * 2, 10, 5, 7);
  ctx.fillRect(20 - frame * 2, 14, 5, 7);
  ctx.fillRect(12, 22 + frame, 4, 5);

  // Smoother surface — fewer specs
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  ctx.fillRect(8, 4, 3, 2);
  ctx.fillRect(22, 18, 2, 2);
}

function drawSolidRegrowingTile(
  ctx: CanvasRenderingContext2D,
  frame: number,
  soil: SoilType,
  rng: () => number
): void {
  const palettes: Record<SoilType, [string, string]> = {
    brown: ["#5a4738", "#5e4b3c"],
    green: ["#4a5a38", "#4e5e3c"],
    crystal: ["#384a5a", "#3c4e5e"],
  };

  ctx.fillStyle = palettes[soil][frame];
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Healing crack lines
  const crackAlpha = frame === 0 ? 0.4 : 0.6;
  const crackColor: Record<SoilType, string> = {
    green: `rgba(100,160,70,${crackAlpha})`,
    crystal: `rgba(80,140,180,${crackAlpha})`,
    brown: `rgba(139,115,85,${crackAlpha})`,
  };
  ctx.strokeStyle = crackColor[soil];
  ctx.lineWidth = 1;
  const crackOffset = Math.floor(rng() * 3);
  ctx.beginPath();
  ctx.moveTo(8 + crackOffset, 4 + frame * 2);
  ctx.lineTo(16, 16 - frame * 2);
  ctx.lineTo(24, 28);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(4, 20 - frame);
  ctx.lineTo(14, 14 + frame);
  ctx.lineTo(22, 24);
  ctx.stroke();

  // Small regrowth dots for green soil
  if (soil === "green") {
    ctx.fillStyle = frame === 0 ? "rgba(80,160,50,0.2)" : "rgba(100,180,60,0.3)";
    ctx.beginPath();
    ctx.arc(8, 10, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(20, 8, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(14, 22, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHatcheryTile(
  ctx: CanvasRenderingContext2D,
  frame: number,
  _soil: SoilType,
  rng: () => number
): void {
  ctx.fillStyle = frame === 0 ? "#6b5b95" : "#7363a0";
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  ctx.strokeStyle = frame === 0 ? "#d4a6ff" : "#c89aee";
  ctx.lineWidth = frame === 0 ? 2 : 2.5;
  ctx.strokeRect(3, 3, TILE_SIZE - 6, TILE_SIZE - 6);

  ctx.fillStyle = frame === 0 ? "rgba(212,166,255,0.3)" : "rgba(200,154,238,0.4)";
  const runeOffset = Math.floor(rng() * 3);
  ctx.fillRect(12 + runeOffset, 12 - frame, 8, 8 + frame * 2);

  // Rune cross
  ctx.strokeStyle = frame === 0 ? "rgba(212,166,255,0.5)" : "rgba(200,154,238,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, 10);
  ctx.lineTo(16, 22);
  ctx.moveTo(10, 16);
  ctx.lineTo(22, 16);
  ctx.stroke();

  // Corner dots
  const dotR = 1.5 + frame * 0.3;
  ctx.fillStyle = frame === 0 ? "#d4a6ff" : "#e0b0ff";
  for (const [dx, dy] of [[5, 5], [27, 5], [5, 27], [27, 27]]) {
    ctx.beginPath();
    ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCrystalTile(
  ctx: CanvasRenderingContext2D,
  frame: number,
  _soil: SoilType,
  rng: () => number
): void {
  ctx.fillStyle = frame === 0 ? "#1a3a4a" : "#1e3e4e";
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);


  const glowGrad = ctx.createRadialGradient(
    TILE_SIZE / 2, TILE_SIZE / 2, 0,
    TILE_SIZE / 2, TILE_SIZE / 2, TILE_SIZE * 0.5
  );
  glowGrad.addColorStop(0, frame === 0 ? "rgba(0,240,255,0.5)" : "rgba(0,255,255,0.7)");
  glowGrad.addColorStop(0.3, frame === 0 ? "rgba(0,200,255,0.25)" : "rgba(0,220,255,0.35)");
  glowGrad.addColorStop(0.7, frame === 0 ? "rgba(0,150,255,0.08)" : "rgba(0,180,255,0.12)");
  glowGrad.addColorStop(1, "rgba(0,100,200,0)");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  ctx.save();
  ctx.shadowColor = frame === 0 ? "#00c8ff" : "#00e0ff";
  ctx.shadowBlur = frame === 0 ? 10 : 16;
  ctx.fillStyle = frame === 0 ? "rgba(180,240,255,0.6)" : "rgba(200,250,255,0.8)";
  const cRadius = frame === 0 ? TILE_SIZE / 4 : TILE_SIZE / 3 + 1.5;
  ctx.beginPath();
  ctx.arc(TILE_SIZE / 2, TILE_SIZE / 2, cRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const sparkleOffset = Math.floor(rng() * 4);

  // Light rays
  ctx.strokeStyle = frame === 0 ? "rgba(0,200,255,0.15)" : "rgba(0,220,255,0.25)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + frame * 0.3;
    ctx.beginPath();
    ctx.moveTo(TILE_SIZE / 2, TILE_SIZE / 2);
    ctx.lineTo(
      TILE_SIZE / 2 + Math.cos(angle) * TILE_SIZE * 0.45,
      TILE_SIZE / 2 + Math.sin(angle) * TILE_SIZE * 0.45
    );
    ctx.stroke();
  }

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(10 + frame * 4 + sparkleOffset, 8, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(22 - frame * 3, 22, 1, 0, Math.PI * 2);
  ctx.fill();

  const orbitCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < orbitCount; i++) {
    const a = (i / orbitCount) * Math.PI * 2 + frame * 0.5 + sparkleOffset * 0.1;
    const r = TILE_SIZE * (0.25 + i * 0.06);
    const ox = TILE_SIZE / 2 + Math.cos(a) * r;
    const oy = TILE_SIZE / 2 + Math.sin(a) * r;
    const oSize = 0.8 + rng() * 0.8;
    ctx.fillStyle = frame === 0 ? "rgba(100,220,255,0.7)" : "rgba(150,240,255,0.9)";
    ctx.globalAlpha = 0.5 + rng() * 0.5;
    ctx.beginPath();
    ctx.arc(ox, oy, oSize, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGroundTile(
  ctx: CanvasRenderingContext2D,
  frame: number,
  soil: SoilType,
  rng: () => number
): void {
  const grassPalettes: Record<SoilType, [string, string]> = {
    brown: ["#4a7a3b", "#528442"],
    green: ["#5a8a4b", "#629452"],
    crystal: ["#4a7a5b", "#528462"],
  };
  ctx.fillStyle = grassPalettes[soil][frame];
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Grass blades
  ctx.fillStyle = frame === 0 ? "#5c9a4a" : "#68a554";
  const gx = Math.floor(rng() * 6) * 5 + 2;
  ctx.fillRect(gx, TILE_SIZE - 6 - frame, 2, 5 + frame);
  ctx.fillRect(gx + 8, TILE_SIZE - 5, 2, 4);
  ctx.fillRect(gx + 16, TILE_SIZE - 7 + frame, 2, 6 - frame);

  // More grass blades
  ctx.fillStyle = frame === 0 ? "#4e8a3e" : "#5a9648";
  ctx.fillRect(gx + 3, TILE_SIZE - 4, 1, 3);
  ctx.fillRect(gx + 12, TILE_SIZE - 5 - frame, 1, 4 + frame);

  // Sky hint at top
  ctx.fillStyle = frame === 0 ? "rgba(135,206,235,0.25)" : "rgba(135,206,235,0.35)";
  ctx.fillRect(0, 0, TILE_SIZE, 4);

  // Dirt layer at bottom
  ctx.fillStyle = "rgba(90,60,30,0.3)";
  ctx.fillRect(0, TILE_SIZE - 3, TILE_SIZE, 3);
}

// ═══════════════════════════════════════════════════════════════════
// DRAWER DISPATCH
// ═══════════════════════════════════════════════════════════════════

type TileDrawer = (ctx: CanvasRenderingContext2D, frame: number, soil: SoilType, rng: () => number) => void;

const TILE_DRAWERS: Record<TileType, TileDrawer> = {
  solid: drawSolidTile,
  corridor: drawCorridorTile,
  packed: drawPackedTile,
  solid_regrowing: drawSolidRegrowingTile,
  hatchery: drawHatcheryTile,
  crystal: drawCrystalTile,
  ground: drawGroundTile,
};

// ═══════════════════════════════════════════════════════════════════
// MAIN GENERATOR CLASS
// ═══════════════════════════════════════════════════════════════════

export class TileSpriteGenerator {
  /**
   * Generate both animation frames for a tile type + soil combination.
   * Returns a tuple [frame0, frame1].
   */
  generate(type: TileType, soil: SoilType = "brown", seed: number = 0): TileFrame {
    const frames: TileFrame = [
      document.createElement("canvas"),
      document.createElement("canvas"),
    ];

    for (let i = 0; i < 2; i++) {
      const canvas = frames[i];
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext("2d")!;
      const rng = createSeededRandom(seed + i);

      TILE_DRAWERS[type](ctx, i, soil, rng);

      // Grid line overlay
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);

      const depthGrad = ctx.createLinearGradient(0, 0, TILE_SIZE, TILE_SIZE);
      depthGrad.addColorStop(0, "rgba(0,0,0,0)");
      depthGrad.addColorStop(0.4, "rgba(0,0,0,0.03)");
      depthGrad.addColorStop(1, "rgba(0,0,0,0.20)");
      ctx.fillStyle = depthGrad;
      ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

      ctx.fillStyle = i === 0 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.08)";
      ctx.fillRect(0, 0, TILE_SIZE, 1);
      ctx.fillRect(0, 0, 1, TILE_SIZE);
    }

    return frames;
  }

  /**
   * Generate all tile sprites for all types and soil variations.
   * Returns a nested map: type → soil → [frame0, frame1]
   */
  generateAll(): Map<TileType, Map<SoilType, TileFrame>> {
    const result = new Map<TileType, Map<SoilType, TileFrame>>();
    const types: TileType[] = [
      "solid",
      "corridor",
      "packed",
      "solid_regrowing",
      "hatchery",
      "crystal",
      "ground",
    ];
    const soils: SoilType[] = ["brown", "green", "crystal"];

    for (const type of types) {
      const soilMap = new Map<SoilType, TileFrame>();
      for (const soil of soils) {
        const seed = hashCoords(
          type.length * 17 + soil.length * 31,
          type.charCodeAt(0) + soil.charCodeAt(0)
        );
        soilMap.set(soil, this.generate(type, soil, seed));
      }
      result.set(type, soilMap);
    }

    return result;
  }
}

// Singleton instance
export const tileSpriteGenerator = new TileSpriteGenerator();