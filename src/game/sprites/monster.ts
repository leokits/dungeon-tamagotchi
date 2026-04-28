/**
 * MonsterSpriteGenerator — Procedural pixel art sprites for 120+ monster forms.
 *
 * Generates unique, recognizable 32x32 (S1), 48x48 (S2), or 64x64 (S3) sprites
 * based on monster family archetype, evolution stage, and evolution path keywords.
 *
 * No external assets — pure Canvas 2D procedural generation.
 */

import type { MonsterDef, MonsterFamily } from "@/game/monsters";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type MonsterFamilyType =
  | "Slime"
  | "Mite"
  | "Beetle"
  | "Fungus"
  | "Wisp"
  | "Serpent"
  | "Golem"
  | "Shade"
  | "Fang"
  | "Sprite"
  | "Crawler"
  | "Salamander";

export type FeatureType =
  | "horn"
  | "flame"
  | "frost"
  | "storm"
  | "toxic"
  | "metallic"
  | "leaf"
  | "shadow"
  | "prismatic";

interface RGB {
  r: number;
  g: number;
  b: number;
}

// ═══════════════════════════════════════════════════════════════════
// COLOR UTILITIES
// ═══════════════════════════════════════════════════════════════════

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

// ═══════════════════════════════════════════════════════════════════
// SEEDED RANDOM (deterministic per monster id)
// ═══════════════════════════════════════════════════════════════════

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

function createSeededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ═══════════════════════════════════════════════════════════════════
// FEATURE DETECTION
// ═══════════════════════════════════════════════════════════════════

const FEATURE_KEYWORDS: Record<string, FeatureType> = {
  horn: "horn",
  titan: "horn",
  beetle: "horn",
  flame: "flame",
  inferno: "flame",
  fire: "flame",
  frost: "frost",
  glacial: "frost",
  ice: "frost",
  storm: "storm",
  spark: "storm",
  lightning: "storm",
  toxic: "toxic",
  plague: "toxic",
  acid: "toxic",
  iron: "metallic",
  adamant: "metallic",
  stone: "metallic",
  moss: "leaf",
  garden: "leaf",
  elder: "leaf",
  shadow: "shadow",
  shade: "shadow",
  void: "shadow",
  prismatic: "prismatic",
  jewel: "prismatic",
  crystal: "prismatic",
};

function detectFeatures(def: MonsterDef): FeatureType[] {
  const features = new Set<FeatureType>();

  // Check monster name
  const nameLower = def.name.toLowerCase();
  for (const [keyword, feature] of Object.entries(FEATURE_KEYWORDS)) {
    if (nameLower.includes(keyword)) {
      features.add(feature);
    }
  }

  // Check evolution path names (from this form's evolutions)
  for (const evo of def.evolutions) {
    const evoLower = evo.to.toLowerCase();
    for (const [keyword, feature] of Object.entries(FEATURE_KEYWORDS)) {
      if (evoLower.includes(keyword)) {
        features.add(feature);
      }
    }
  }

  // Also check the id for features (useful for evolved forms)
  const idLower = def.id.toLowerCase();
  for (const [keyword, feature] of Object.entries(FEATURE_KEYWORDS)) {
    if (idLower.includes(keyword)) {
      features.add(feature);
    }
  }

  return Array.from(features);
}

// ═══════════════════════════════════════════════════════════════════
// SPRITE SIZE
// ═══════════════════════════════════════════════════════════════════

function getSpriteSize(stage: number): number {
  if (stage <= 1) return 32;
  if (stage === 2) return 48;
  return 64;
}

// ═══════════════════════════════════════════════════════════════════
// BODY SHAPE GENERATORS
// Each returns a boolean[][] mask of which pixels are "body"
// ═══════════════════════════════════════════════════════════════════

function generateSlimeBody(size: number, rng: () => number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const cx = size / 2;
  const cy = size / 2 + size * 0.05;
  const baseRadius = size * 0.35;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / baseRadius;
      const dy = (y - cy) / (baseRadius * 0.85);
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Wobble using sine for organic feel
      const angle = Math.atan2(dy, dx);
      const wobble = Math.sin(angle * 3 + rng() * 2) * 0.08 + Math.sin(angle * 5) * 0.04;
      if (dist < 1 + wobble) {
        mask[y][x] = true;
      }
    }
  }
  return mask;
}

function generateBeetleBody(size: number, rng: () => number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const cx = size / 2 + (rng() - 0.5) * 2;
  const cy = size / 2;
  const hw = size * 0.32; // half-width
  const hh = size * 0.38; // half-height

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / hw;
      const dy = (y - cy) / hh;
      // Hexagonal-ish shape
      const hexDist = Math.max(Math.abs(dx) * 0.85, Math.abs(dy)) + Math.abs(dx) * 0.15;
      if (hexDist < 1) {
        mask[y][x] = true;
      }
    }
  }

  // Horn protrusion at top
  const hornWidth = Math.max(2, Math.floor(size * 0.06));
  const hornHeight = Math.floor(size * 0.15);
  for (let y = Math.max(0, Math.floor(cy - hh - hornHeight)); y < Math.floor(cy - hh); y++) {
    for (let x = Math.floor(cx - hornWidth); x <= Math.ceil(cx + hornWidth); x++) {
      if (x >= 0 && x < size && y >= 0) {
        mask[y][x] = true;
      }
    }
  }

  return mask;
}

function generateSerpentBody(size: number, rng: () => number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const cx = size / 2 + (rng() - 0.5) * 2;
  const bodyWidth = Math.max(4, Math.floor(size * 0.2));

  // S-curve body
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const offsetX = Math.sin(t * Math.PI * 2.5) * size * 0.2;
    const centerX = cx + offsetX;

    for (let dx = -bodyWidth; dx <= bodyWidth; dx++) {
      const x = Math.floor(centerX + dx);
      if (x >= 0 && x < size) {
        // Taper at head and tail
        const taper = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1;
        if (Math.abs(dx) <= bodyWidth * taper) {
          mask[y][x] = true;
        }
      }
    }
  }

  // Head (wider at top)
  const headY = Math.floor(size * 0.08);
  const headW = Math.floor(size * 0.22);
  for (let dy = -2; dy <= 3; dy++) {
    for (let dx = -headW; dx <= headW; dx++) {
      const y = headY + dy;
      const x = Math.floor(cx + dx);
      if (y >= 0 && y < size && x >= 0 && x < size) {
        mask[y][x] = true;
      }
    }
  }

  return mask;
}

function generateGolemBody(size: number, rng: () => number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const cx = size / 2 + (rng() - 0.5) * 2;
  const cy = size / 2;

  // Blocky rectangular body
  const bw = Math.floor(size * 0.35);
  const bh = Math.floor(size * 0.4);

  for (let y = Math.floor(cy - bh); y <= Math.ceil(cy + bh); y++) {
    for (let x = Math.floor(cx - bw); x <= Math.ceil(cx + bw); x++) {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        // Slight rounding at corners
        const dx = Math.abs(x - cx) - bw + 2;
        const dy = Math.abs(y - cy) - bh + 2;
        if (dx < 0 || dy < 0 || Math.sqrt(dx * dx + dy * dy) < 3) {
          mask[y][x] = true;
        }
      }
    }
  }

  // Head block on top
  const headW = Math.floor(size * 0.25);
  const headH = Math.floor(size * 0.18);
  const headTop = Math.floor(cy - bh - headH);
  for (let y = headTop; y < Math.floor(cy - bh); y++) {
    for (let x = Math.floor(cx - headW); x <= Math.ceil(cx + headW); x++) {
      if (x >= 0 && x < size && y >= 0) {
        mask[y][x] = true;
      }
    }
  }

  // Arms (side blocks)
  const armW = Math.floor(size * 0.1);
  const armH = Math.floor(size * 0.25);
  for (let side = -1; side <= 1; side += 2) {
    const armX = Math.floor(cx + side * (bw + armW * 0.5));
    for (let y = Math.floor(cy - armH * 0.5); y <= Math.ceil(cy + armH * 0.5); y++) {
      for (let dx = 0; dx < armW; dx++) {
        const x = armX + (side === -1 ? dx : -dx);
        if (x >= 0 && x < size && y >= 0 && y < size) {
          mask[y][x] = true;
        }
      }
    }
  }

  return mask;
}

function generateWispBody(size: number, rng: () => number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.3;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Soft circular with glow falloff
      if (dist < radius * 1.5) {
        const intensity = 1 - dist / (radius * 1.5);
        if (intensity > 0.3 || rng() < intensity * 0.5) {
          mask[y][x] = true;
        }
      }
    }
  }

  return mask;
}

function generateFungusBody(size: number, rng: () => number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const cx = size / 2 + (rng() - 0.5) * 2;

  // Mushroom cap (top half)
  const capY = Math.floor(size * 0.35);
  const capRadiusX = size * 0.38;
  const capRadiusY = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / capRadiusX;
      const dy = (y - capY) / capRadiusY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1 && dy < 0.3) {
        mask[y][x] = true;
      }
    }
  }

  // Stem
  const stemW = Math.max(3, Math.floor(size * 0.12));
  const stemTop = Math.floor(size * 0.35);
  const stemBottom = Math.floor(size * 0.85);
  for (let y = stemTop; y < stemBottom; y++) {
    for (let dx = -stemW; dx <= stemW; dx++) {
      const x = Math.floor(cx + dx);
      if (x >= 0 && x < size) {
        mask[y][x] = true;
      }
    }
  }

  return mask;
}

function generateMiteBody(size: number, rng: () => number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const cx = size / 2;
  const cy = size / 2;

  // Small oval body
  const rx = size * 0.28;
  const ry = size * 0.2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy < 1) {
        mask[y][x] = true;
      }
    }
  }

  // Tiny legs (dots on sides)
  const legCount = 4;
  for (let i = 0; i < legCount; i++) {
    const ly = Math.floor(cy - ry * 0.5 + (i / (legCount - 1)) * ry * 1.2);
    for (let side = -1; side <= 1; side += 2) {
      const lx = Math.floor(cx + side * (rx + 1 + rng() * 2));
      if (lx >= 0 && lx < size && ly >= 0 && ly < size) {
        mask[ly][lx] = true;
        if (ly + 1 < size) mask[ly + 1][lx] = true;
      }
    }
  }

  return mask;
}

function generateWraithBody(size: number, rng: () => number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const cx = size / 2;

  // Ethereal flowing shape — wider at top, tapering with wispy bottom
  for (let y = 0; y < size; y++) {
    const t = y / size;
    // Width: wide at top, narrowing, then wispy at bottom
    let width: number;
    if (t < 0.3) {
      width = size * (0.2 + t * 0.3);
    } else if (t < 0.7) {
      width = size * (0.35 - (t - 0.3) * 0.15);
    } else {
      // Wispy trailing bottom
      width = size * (0.25 - (t - 0.7) * 0.4) + Math.sin(t * 20 + rng() * 10) * size * 0.05;
    }
    width = Math.max(1, width);

    const centerX = cx + Math.sin(t * Math.PI * 3) * size * 0.05;
    for (let dx = -Math.floor(width); dx <= Math.floor(width); dx++) {
      const x = Math.floor(centerX + dx);
      if (x >= 0 && x < size) {
        // Wispy edges
        const edgeDist = Math.abs(dx) / width;
        if (edgeDist < 0.7 || rng() < (1 - edgeDist) * 0.5) {
          mask[y][x] = true;
        }
      }
    }
  }

  return mask;
}

function generateSalamanderBody(size: number, rng: () => number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const cx = size / 2 + (rng() - 0.5) * 2;

  // Lizard-like body with tail
  for (let y = 0; y < size; y++) {
    const t = y / size;
    let width: number;
    let offsetX = 0;

    if (t < 0.15) {
      // Head
      width = size * (0.15 + t * 0.5);
    } else if (t < 0.5) {
      // Body (widest)
      width = size * 0.22;
      offsetX = Math.sin(t * Math.PI) * size * 0.03;
    } else if (t < 0.75) {
      // Tapering to tail
      width = size * (0.22 - (t - 0.5) * 0.5);
      offsetX = Math.sin(t * Math.PI * 1.5) * size * 0.06;
    } else {
      // Tail (thin, curving)
      width = size * (0.08 - (t - 0.75) * 0.2);
      offsetX = Math.sin(t * Math.PI * 2) * size * 0.1;
    }

    width = Math.max(1, width);
    const centerX = cx + offsetX;

    for (let dx = -Math.floor(width); dx <= Math.floor(width); dx++) {
      const x = Math.floor(centerX + dx);
      if (x >= 0 && x < size) {
        mask[y][x] = true;
      }
    }
  }

  // Small legs
  const legPositions = [0.35, 0.55];
  for (const legT of legPositions) {
    const ly = Math.floor(legT * size);
    for (let side = -1; side <= 1; side += 2) {
      const lx = Math.floor(cx + side * size * 0.22);
      for (let dy = 0; dy < 3; dy++) {
        if (ly + dy < size && lx >= 0 && lx < size) {
          mask[ly + dy][lx] = true;
        }
      }
    }
  }

  return mask;
}

function generateCrawlerBody(size: number, rng: () => number): boolean[][] {
  const mask: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const cx = size / 2 + (rng() - 0.5) * 2;

  // Low/wide segmented body
  const segments = 5;
  const segHeight = Math.floor(size * 0.14);
  const startY = Math.floor(size * 0.2);

  for (let s = 0; s < segments; s++) {
    const segY = startY + s * segHeight;
    const segWidth = size * (0.3 - Math.abs(s - 2) * 0.04);

    for (let dy = 0; dy < segHeight; dy++) {
      for (let dx = -Math.floor(segWidth); dx <= Math.floor(segWidth); dx++) {
        const x = Math.floor(cx + dx);
        const y = segY + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) {
          mask[y][x] = true;
        }
      }
    }

    // Multiple legs per segment
    if (s < segments - 1) {
      const legY = segY + Math.floor(segHeight * 0.5);
      for (let side = -1; side <= 1; side += 2) {
        const legX = Math.floor(cx + side * (segWidth + 2));
        for (let ld = 0; ld < 3; ld++) {
          if (legY + ld < size && legX >= 0 && legX < size) {
            mask[legY + ld][legX] = true;
          }
        }
      }
    }
  }

  return mask;
}

// ═══════════════════════════════════════════════════════════════════
// BODY SHAPE DISPATCH
// ═══════════════════════════════════════════════════════════════════

function generateBodyMask(family: MonsterFamilyType, size: number, rng: () => number): boolean[][] {
  switch (family) {
    case "Slime":
      return generateSlimeBody(size, rng);
    case "Mite":
      return generateMiteBody(size, rng);
    case "Beetle":
    case "Fang":
      return generateBeetleBody(size, rng);
    case "Fungus":
      return generateFungusBody(size, rng);
    case "Wisp":
    case "Sprite":
      return generateWispBody(size, rng);
    case "Serpent":
      return generateSerpentBody(size, rng);
    case "Golem":
      return generateGolemBody(size, rng);
    case "Shade":
      return generateWraithBody(size, rng);
    case "Crawler":
      return generateCrawlerBody(size, rng);
    case "Salamander":
      return generateSalamanderBody(size, rng);
    default:
      return generateSlimeBody(size, rng);
  }
}

// ═══════════════════════════════════════════════════════════════════
// FEATURE RENDERERS
// ═══════════════════════════════════════════════════════════════════

function drawHornFeature(
  ctx: CanvasRenderingContext2D,
  size: number,
  accentColor: string,
  rng: () => number
) {
  const cx = size / 2 + (rng() - 0.5) * size * 0.04;
  const hornH = Math.floor(size * 0.12);
  const hornW = Math.max(2, Math.floor(size * 0.04));

  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(cx, size * 0.05);
  ctx.lineTo(cx - hornW, size * 0.05 + hornH);
  ctx.lineTo(cx + hornW, size * 0.05 + hornH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = lighten(accentColor, 0.3);
  ctx.fillRect(cx - 1, size * 0.08, 2, hornH * 0.5);
}

function drawFlameFeature(
  ctx: CanvasRenderingContext2D,
  size: number,
  accentColor: string,
  rng: () => number
) {
  const flameColors = [accentColor, "#ff9800", "#ffeb3b", "#ff5722"];
  const flameCount = 3 + Math.floor(rng() * 3);

  for (let i = 0; i < flameCount; i++) {
    const fx = size * 0.2 + rng() * size * 0.6;
    const fy = size * 0.1 + rng() * size * 0.3;
    const fh = 3 + rng() * 6;
    const fw = 2 + rng() * 3;

    ctx.fillStyle = flameColors[Math.floor(rng() * flameColors.length)];
    ctx.globalAlpha = 0.6 + rng() * 0.4;

    // Flame shape
    ctx.beginPath();
    ctx.moveTo(fx, fy + fh);
    ctx.quadraticCurveTo(fx - fw, fy + fh * 0.5, fx, fy);
    ctx.quadraticCurveTo(fx + fw, fy + fh * 0.5, fx, fy + fh);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFrostFeature(
  ctx: CanvasRenderingContext2D,
  size: number,
  accentColor: string,
  rng: () => number
) {
  const crystalCount = 3 + Math.floor(rng() * 3);

  for (let i = 0; i < crystalCount; i++) {
    const cx = size * 0.15 + rng() * size * 0.7;
    const cy = size * 0.15 + rng() * size * 0.7;
    const ch = 4 + rng() * 6;
    const cw = 1.5 + rng() * 2;

    ctx.fillStyle = i % 2 === 0 ? "#b3e5fc" : accentColor;
    ctx.globalAlpha = 0.5 + rng() * 0.5;

    // Diamond crystal
    ctx.beginPath();
    ctx.moveTo(cx, cy - ch);
    ctx.lineTo(cx + cw, cy);
    ctx.lineTo(cx, cy + ch * 0.5);
    ctx.lineTo(cx - cw, cy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawStormFeature(
  ctx: CanvasRenderingContext2D,
  size: number,
  accentColor: string,
  rng: () => number
) {
  const boltCount = 2 + Math.floor(rng() * 2);

  for (let i = 0; i < boltCount; i++) {
    let bx = size * 0.2 + rng() * size * 0.6;
    let by = size * 0.1;

    ctx.strokeStyle = "#ffeb3b";
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7 + rng() * 0.3;
    ctx.beginPath();
    ctx.moveTo(bx, by);

    const segments = 3 + Math.floor(rng() * 3);
    for (let s = 0; s < segments; s++) {
      bx += (rng() - 0.5) * 8;
      by += 3 + rng() * 5;
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawToxicFeature(
  ctx: CanvasRenderingContext2D,
  size: number,
  accentColor: string,
  rng: () => number
) {
  const dripCount = 3 + Math.floor(rng() * 4);
  const dripColor = rng() > 0.5 ? "#76ff03" : "#e040fb";

  for (let i = 0; i < dripCount; i++) {
    const dx = size * 0.2 + rng() * size * 0.6;
    const dy = size * 0.5 + rng() * size * 0.4;
    const dr = 1.5 + rng() * 2.5;

    ctx.fillStyle = dripColor;
    ctx.globalAlpha = 0.5 + rng() * 0.5;

    // Drip shape
    ctx.beginPath();
    ctx.arc(dx, dy, dr, 0, Math.PI * 2);
    ctx.fill();

    // Trail
    ctx.fillRect(dx - 0.5, dy - dr - 2, 1, 3 + rng() * 4);
  }
  ctx.globalAlpha = 1;
}

function drawMetallicFeature(
  ctx: CanvasRenderingContext2D,
  size: number,
  _accentColor: string,
  rng: () => number
) {
  const highlightCount = 4 + Math.floor(rng() * 4);

  for (let i = 0; i < highlightCount; i++) {
    const hx = size * 0.15 + rng() * size * 0.7;
    const hy = size * 0.15 + rng() * size * 0.7;
    const hw = 2 + rng() * 4;
    const hh = 1 + rng() * 2;

    ctx.fillStyle = `rgba(200, 210, 220, ${0.3 + rng() * 0.4})`;
    ctx.fillRect(hx, hy, hw, hh);
  }
}

function drawLeafFeature(
  ctx: CanvasRenderingContext2D,
  size: number,
  accentColor: string,
  rng: () => number
) {
  const leafCount = 3 + Math.floor(rng() * 4);

  for (let i = 0; i < leafCount; i++) {
    const lx = size * 0.1 + rng() * size * 0.8;
    const ly = size * 0.1 + rng() * size * 0.5;
    const lw = 3 + rng() * 4;
    const lh = 2 + rng() * 3;
    const angle = rng() * Math.PI;

    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(angle);
    ctx.fillStyle = i % 2 === 0 ? "#4caf50" : accentColor;
    ctx.globalAlpha = 0.6 + rng() * 0.4;

    // Leaf shape
    ctx.beginPath();
    ctx.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2);
    ctx.fill();

    // Leaf vein
    ctx.strokeStyle = darken("#4caf50", 0.3);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-lw, 0);
    ctx.lineTo(lw, 0);
    ctx.stroke();

    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawShadowFeature(
  ctx: CanvasRenderingContext2D,
  size: number,
  accentColor: string,
  rng: () => number
) {
  // Dark aura with purple edges
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.5);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.6, "rgba(0, 0, 0, 0.3)");
  gradient.addColorStop(1, accentColor + "60");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Purple edge wisps
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + rng() * 0.5;
    const dist = size * 0.35 + rng() * size * 0.1;
    const wx = size / 2 + Math.cos(angle) * dist;
    const wy = size / 2 + Math.sin(angle) * dist;

    ctx.fillStyle = "#9c27b0";
    ctx.globalAlpha = 0.3 + rng() * 0.3;
    ctx.beginPath();
    ctx.arc(wx, wy, 2 + rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPrismaticFeature(
  ctx: CanvasRenderingContext2D,
  size: number,
  _accentColor: string,
  rng: () => number
) {
  const sparkleCount = 5 + Math.floor(rng() * 5);
  const rainbowColors = ["#ff0000", "#ff8800", "#ffff00", "#00ff00", "#0088ff", "#8800ff", "#ff00ff"];

  for (let i = 0; i < sparkleCount; i++) {
    const sx = size * 0.1 + rng() * size * 0.8;
    const sy = size * 0.1 + rng() * size * 0.8;
    const sr = 1 + rng() * 2;

    ctx.fillStyle = rainbowColors[Math.floor(rng() * rainbowColors.length)];
    ctx.globalAlpha = 0.4 + rng() * 0.6;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const FEATURE_DRAWERS: Record<FeatureType, (ctx: CanvasRenderingContext2D, size: number, accentColor: string, rng: () => number) => void> = {
  horn: drawHornFeature,
  flame: drawFlameFeature,
  frost: drawFrostFeature,
  storm: drawStormFeature,
  toxic: drawToxicFeature,
  metallic: drawMetallicFeature,
  leaf: drawLeafFeature,
  shadow: drawShadowFeature,
  prismatic: drawPrismaticFeature,
};

// ═══════════════════════════════════════════════════════════════════
// EYE RENDERER
// ═══════════════════════════════════════════════════════════════════

function drawEyes(
  ctx: CanvasRenderingContext2D,
  size: number,
  family: MonsterFamilyType,
  rng: () => number
) {
  const eyeSize = Math.max(1.5, size * 0.06);
  const pupilSize = eyeSize * 0.55;
  const eyeOffsetY = (rng() - 0.5) * size * 0.02;

  // Eye positions vary slightly by family
  let eyeY: number;
  let eyeSpacing: number;

  switch (family) {
    case "Slime":
      eyeY = size * 0.4;
      eyeSpacing = size * 0.12;
      break;
    case "Beetle":
    case "Fang":
      eyeY = size * 0.35;
      eyeSpacing = size * 0.14;
      break;
    case "Serpent":
      eyeY = size * 0.12;
      eyeSpacing = size * 0.1;
      break;
    case "Golem":
      eyeY = size * 0.3;
      eyeSpacing = size * 0.16;
      break;
    case "Wisp":
    case "Sprite":
      eyeY = size * 0.45;
      eyeSpacing = size * 0.1;
      break;
    case "Fungus":
      eyeY = size * 0.3;
      eyeSpacing = size * 0.12;
      break;
    case "Mite":
      eyeY = size * 0.42;
      eyeSpacing = size * 0.08;
      break;
    case "Shade":
      eyeY = size * 0.25;
      eyeSpacing = size * 0.12;
      break;
    case "Salamander":
      eyeY = size * 0.12;
      eyeSpacing = size * 0.08;
      break;
    case "Crawler":
      eyeY = size * 0.28;
      eyeSpacing = size * 0.1;
      break;
    default:
      eyeY = size * 0.4;
      eyeSpacing = size * 0.12;
  }

  const cx = size / 2;

  for (let side = -1; side <= 1; side += 2) {
    const ex = cx + side * eyeSpacing;
    const ey = eyeY + eyeOffsetY;

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ex, ey, eyeSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.arc(ex, ey, pupilSize, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.arc(ex - pupilSize * 0.3, ey - pupilSize * 0.3, pupilSize * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════════
// AURA / GLOW (S3 only)
// ═══════════════════════════════════════════════════════════════════

function drawAura(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
  accentColor: string,
  rng: () => number
) {
  // Outer glow
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.25,
    size / 2,
    size / 2,
    size * 0.55
  );
  gradient.addColorStop(0, color + "00");
  gradient.addColorStop(0.5, color + "20");
  gradient.addColorStop(1, accentColor + "10");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Floating particles
  const particleCount = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < particleCount; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = size * 0.3 + rng() * size * 0.15;
    const px = size / 2 + Math.cos(angle) * dist;
    const py = size / 2 + Math.sin(angle) * dist;
    const pr = 1 + rng() * 2;

    ctx.fillStyle = rng() > 0.5 ? lighten(color, 0.4) : lighten(accentColor, 0.3);
    ctx.globalAlpha = 0.3 + rng() * 0.4;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN SPRITE GENERATOR
// ═══════════════════════════════════════════════════════════════════

export class MonsterSpriteGenerator {
  /**
   * Generate a sprite for a monster definition.
   * @param def Monster definition from bestiary
   * @param family Monster family (for body shape selection)
   * @returns Offscreen HTMLCanvasElement with the rendered sprite
   */
  generate(def: MonsterDef, family: MonsterFamilyType): HTMLCanvasElement {
    const size = getSpriteSize(def.stage);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const seed = hashString(def.id);
    const rng = createSeededRandom(seed);

    // 1. Generate body mask
    const mask = generateBodyMask(family, size, rng);

    // 2. Fill body with color + noise texture
    const primaryRgb = hexToRgb(def.color);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!mask[y][x]) continue;

        // Base color with subtle noise
        const noise = (rng() - 0.5) * 20;
        const distFromCenter =
          Math.sqrt(
            Math.pow((x - size / 2) / (size / 2), 2) +
              Math.pow((y - size / 2) / (size / 2), 2)
          );

        // Slight shading: darker at edges
        const shade = 1 - distFromCenter * 0.15;

        const r = (primaryRgb.r + noise) * shade;
        const g = (primaryRgb.g + noise) * shade;
        const b = (primaryRgb.b + noise) * shade;

        ctx.fillStyle = rgbToHex(r, g, b);
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // 3. Body outline
    ctx.strokeStyle = darken(def.color, 0.3);
    ctx.lineWidth = 1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!mask[y][x]) continue;
        // Check if any neighbor is not body
        const isEdge =
          (y === 0 || !mask[y - 1]?.[x]) ||
          (y === size - 1 || !mask[y + 1]?.[x]) ||
          (x === 0 || !mask[y][x - 1]) ||
          (x === size - 1 || !mask[y][x + 1]);
        if (isEdge) {
          ctx.fillStyle = darken(def.color, 0.25);
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }

    // 4. Draw features based on stage
    const features = detectFeatures(def);

    if (def.stage >= 2) {
      // S2: body + eyes + 1 feature
      // Draw the first detected feature
      if (features.length > 0) {
        const feature = features[0];
        FEATURE_DRAWERS[feature]?.(ctx, size, def.accentColor, rng);
      }
    }

    if (def.stage >= 3) {
      // S3: body + eyes + 2-3 features + aura
      // Draw up to 3 features
      const featureCount = Math.min(features.length, 3);
      for (let i = 0; i < featureCount; i++) {
        const feature = features[i];
        FEATURE_DRAWERS[feature]?.(ctx, size, def.accentColor, rng);
      }

      // Aura/glow effect
      drawAura(ctx, size, def.color, def.accentColor, rng);
    }

    // 5. Eyes (always drawn on top)
    drawEyes(ctx, size, family, rng);

    return canvas;
  }

  /**
   * Generate sprite from MonsterDef and MonsterFamily.
   */
  generateFromFamily(def: MonsterDef, family: MonsterFamily): HTMLCanvasElement {
    return this.generate(def, family.familyName as MonsterFamilyType);
  }
}

// Singleton instance
export const monsterSpriteGenerator = new MonsterSpriteGenerator();
