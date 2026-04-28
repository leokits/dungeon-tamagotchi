export type ResourceType = "mushroom" | "crystal_shard" | "bone" | "mana_orb" | "moss";

/** A resource's two animation frames as a tuple [frame0, frame1] */
export type ResourceFrame = [HTMLCanvasElement, HTMLCanvasElement];

const TILE_SIZE = 32;

function drawMushroomFrame(ctx: CanvasRenderingContext2D, frame: number) {
  const cx = TILE_SIZE / 2;
  const cy = TILE_SIZE / 2;
  const bob = frame === 0 ? 0 : -2;
  const capR = frame === 0 ? 7 : 8;

  // Stem
  ctx.fillStyle = "#e8d5b7";
  ctx.fillRect(cx - 2, cy - 2 + bob, 4, 8 + frame);

  // Cap
  ctx.fillStyle = frame === 0 ? "#7cb342" : "#8bc34a";
  ctx.beginPath();
  ctx.arc(cx, cy - 3 + bob, capR, Math.PI, 0);
  ctx.fill();

  // White spots on cap
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.arc(cx - 3, cy - 5 + bob, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 3, cy - 4 + bob, 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrystalShardFrame(ctx: CanvasRenderingContext2D, frame: number) {
  const cx = TILE_SIZE / 2;
  const cy = TILE_SIZE / 2;
  const bob = frame === 0 ? 0 : -1;
  const glow = frame === 0 ? 4 : 8;

  ctx.shadowColor = "#29b6f6";
  ctx.shadowBlur = glow;

  // Diamond shape
  ctx.fillStyle = frame === 0 ? "#29b6f6" : "#4fc3f7";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8 + bob);
  ctx.lineTo(cx + 5 + frame, cy + bob);
  ctx.lineTo(cx, cy + 7 + bob);
  ctx.lineTo(cx - 5 - frame, cy + bob);
  ctx.closePath();
  ctx.fill();

  // White highlight
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(cx - 1, cy - 3 + bob, 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
}

function drawBoneFrame(ctx: CanvasRenderingContext2D, frame: number) {
  const cx = TILE_SIZE / 2;
  const cy = TILE_SIZE / 2;
  const bob = frame === 0 ? 0 : -1;
  const angle = frame === 0 ? 0 : 0.15;

  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.rotate(angle);

  ctx.fillStyle = frame === 0 ? "#e0e0e0" : "#d0d0d0";

  // Two knobs
  ctx.beginPath();
  ctx.arc(-6, -4, 3.5 + frame * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(6, 4, 3.5 + frame * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Connecting bar
  ctx.fillRect(-5, -2, 10, 4);

  // Outline
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(-6, -4, 3.5 + frame * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(6, 4, 3.5 + frame * 0.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawManaOrbFrame(ctx: CanvasRenderingContext2D, frame: number) {
  const cx = TILE_SIZE / 2;
  const cy = TILE_SIZE / 2;
  const bob = frame === 0 ? 0 : -2;
  const radius = frame === 0 ? 6 : 8;

  ctx.shadowColor = "#ab47bc";
  ctx.shadowBlur = frame === 0 ? 6 : 12;

  // Purple glowing orb
  ctx.fillStyle = frame === 0 ? "rgba(171,71,188,0.7)" : "rgba(186,104,200,0.8)";
  ctx.beginPath();
  ctx.arc(cx, cy + bob, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;

  // Inner highlight
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.arc(cx - 2, cy - 2 + bob, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.arc(cx + 2, cy + 2 + bob, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawMossFrame(ctx: CanvasRenderingContext2D, frame: number) {
  const cx = TILE_SIZE / 2;
  const cy = TILE_SIZE / 2;
  const bob = frame === 0 ? 0 : -1;
  const spread = frame === 0 ? 0 : 0.5;

  ctx.fillStyle = frame === 0 ? "#558b2f" : "#4e7c28";

  const spots: [number, number][] = [
    [-5, -4], [0, -6], [5, -3], [-4, 2], [3, 4], [6, 0],
    [-2, 0], [2, -2], [-6, 1], [4, -5],
  ];

  for (const [ox, oy] of spots) {
    ctx.beginPath();
    ctx.arc(cx + ox, cy + oy + bob, 2.5 + spread, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lighter highlights
  ctx.fillStyle = "rgba(100,160,50,0.4)";
  for (const [ox, oy] of spots.slice(0, 4)) {
    ctx.beginPath();
    ctx.arc(cx + ox + 1, cy + oy + bob - 1, 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

const RESOURCE_DRAWERS: Record<ResourceType, (ctx: CanvasRenderingContext2D, frame: number) => void> = {
  mushroom: drawMushroomFrame,
  crystal_shard: drawCrystalShardFrame,
  bone: drawBoneFrame,
  mana_orb: drawManaOrbFrame,
  moss: drawMossFrame,
};

export class ResourceSpriteGenerator {
  generate(type: ResourceType): ResourceFrame {
    const frames: ResourceFrame = [
      document.createElement("canvas"),
      document.createElement("canvas"),
    ];

    for (let i = 0; i < 2; i++) {
      const canvas = frames[i];
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext("2d")!;

      RESOURCE_DRAWERS[type](ctx, i);
    }

    return frames;
  }

  generateAll(): Map<ResourceType, ResourceFrame> {
    const result = new Map<ResourceType, ResourceFrame>();
    const resourceTypes: ResourceType[] = ["mushroom", "crystal_shard", "bone", "mana_orb", "moss"];

    for (const type of resourceTypes) {
      result.set(type, this.generate(type));
    }

    return result;
  }
}

export const resourceSpriteGenerator = new ResourceSpriteGenerator();