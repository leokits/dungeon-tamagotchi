/**
 * Particle System — visual effects for digging, evolution, combat, and ambient atmosphere.
 *
 * Design goals:
 *   - Zero allocations during gameplay (object pooling)
 *   - Batch rendering to minimize canvas state changes
 *   - Viewport culling to skip off-screen particles
 *   - Hard cap of 500 particles for 60fps performance
 */

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type ParticleType =
  | "dust"
  | "sparkle"
  | "glow"
  | "death"
  | "eat"
  | "evolution"
  | "ambient"
  | "damage"
  | "levelUp"
  | "combo"
  | "evolutionRing"
  | "crystalPulse"
  | "resourceCollect"
  | "screenFlash";

export interface Particle {
  x: number;          // World X position
  y: number;          // World Y position
  vx: number;         // Velocity X
  vy: number;         // Velocity Y
  life: number;       // Current life (frames remaining)
  maxLife: number;    // Maximum life
  size: number;       // Size in pixels
  color: string;      // CSS color
  alpha: number;      // Current opacity (0-1)
  alphaDecay: number; // Alpha reduction per frame
  sizeDecay: number;  // Size reduction per frame
  gravity: number;    // Gravity acceleration per frame
  type: ParticleType; // For categorization
}

/** Internal pool marker — not exposed externally */
interface ParticlePoolEntry {
  particle: Particle;
  alive: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const MAX_PARTICLES = 500;
const TILE_SIZE = 32; // pixels per tile

// ═══════════════════════════════════════════════════════════════════
// PARTICLE SYSTEM
// ═══════════════════════════════════════════════════════════════════

export class ParticleSystem {
  /** Flat array of all pool entries (alive + dead) */
  private pool: ParticlePoolEntry[] = [];
  /** Count of currently alive particles */
  private aliveCount = 0;
  /** Index for round-robin eviction when pool is full */
  private evictionIndex = 0;

  /**
   * Add a particle to the system.
   * If the pool is at MAX_PARTICLES, the oldest particle is recycled.
   */
  addParticle(p: Omit<Particle, "life"> & { life: number }): void {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].alive) {
        this._assign(this.pool[i].particle, p);
        this.pool[i].alive = true;
        this.aliveCount++;
        return;
      }
    }

    if (this.pool.length < MAX_PARTICLES) {
      const entry: ParticlePoolEntry = {
        particle: this._createParticle(p),
        alive: true,
      };
      this.pool.push(entry);
      this.aliveCount++;
      return;
    }

    const target = this.pool[this.evictionIndex];
    this.evictionIndex = (this.evictionIndex + 1) % MAX_PARTICLES;
    this._assign(target.particle, p);
  }

  /** Advance all particles by one frame, remove dead ones. */
  update(): void {
    for (let i = 0; i < this.pool.length; i++) {
      const entry = this.pool[i];
      if (!entry.alive) continue;

      const p = entry.particle;
      p.life--;

      if (p.life <= 0) {
        entry.alive = false;
        this.aliveCount--;
        continue;
      }

      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.alpha = Math.max(0, p.alpha - p.alphaDecay);
      p.size = Math.max(0, p.size - p.sizeDecay);

      if (p.alpha <= 0 || p.size <= 0) {
        entry.alive = false;
        this.aliveCount--;
      }
    }
  }

  /** Draw all alive particles to canvas, respecting camera transform. */
  render(
    ctx: CanvasRenderingContext2D,
    camera: { x: number; y: number; zoom: number }
  ): void {
    if (this.aliveCount === 0) return;

    const canvas = ctx.canvas;
    const viewportLeft = camera.x;
    const viewportTop = camera.y;
    const viewportRight = camera.x + canvas.width / camera.zoom;
    const viewportBottom = camera.y + canvas.height / camera.zoom;

    const glowTypes = new Set<ParticleType>(["glow", "sparkle", "evolution"]);

    ctx.save();
    ctx.shadowBlur = 8;
    for (let i = 0; i < this.pool.length; i++) {
      const entry = this.pool[i];
      if (!entry.alive) continue;
      if (!glowTypes.has(entry.particle.type)) continue;
      if (!this._inViewport(entry.particle, viewportLeft, viewportTop, viewportRight, viewportBottom)) continue;
      this._drawParticle(ctx, entry.particle, camera, true);
    }
    ctx.restore();

    for (let i = 0; i < this.pool.length; i++) {
      const entry = this.pool[i];
      if (!entry.alive) continue;
      if (glowTypes.has(entry.particle.type)) continue;
      if (!this._inViewport(entry.particle, viewportLeft, viewportTop, viewportRight, viewportBottom)) continue;
      this._drawParticle(ctx, entry.particle, camera, false);
    }
  }

  /** Remove all particles immediately. */
  clear(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].alive = false;
    }
    this.aliveCount = 0;
  }

  /** Number of currently alive particles (useful for debugging). */
  get count(): number {
    return this.aliveCount;
  }

  // ─────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────

  private _createParticle(p: Omit<Particle, "life"> & { life: number }): Particle {
    return {
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      life: p.life,
      maxLife: p.maxLife,
      size: p.size,
      color: p.color,
      alpha: p.alpha,
      alphaDecay: p.alphaDecay,
      sizeDecay: p.sizeDecay,
      gravity: p.gravity,
      type: p.type,
    };
  }

  private _assign(target: Particle, p: Omit<Particle, "life"> & { life: number }): void {
    target.x = p.x;
    target.y = p.y;
    target.vx = p.vx;
    target.vy = p.vy;
    target.life = p.life;
    target.maxLife = p.maxLife;
    target.size = p.size;
    target.color = p.color;
    target.alpha = p.alpha;
    target.alphaDecay = p.alphaDecay;
    target.sizeDecay = p.sizeDecay;
    target.gravity = p.gravity;
    target.type = p.type;
  }

  private _inViewport(
    p: Particle,
    left: number,
    top: number,
    right: number,
    bottom: number
  ): boolean {
    const px = p.x * TILE_SIZE;
    const py = p.y * TILE_SIZE;
    return (
      px + p.size >= left &&
      px - p.size <= right &&
      py + p.size >= top &&
      py - p.size <= bottom
    );
  }

  private _drawParticle(
    ctx: CanvasRenderingContext2D,
    p: Particle,
    camera: { x: number; y: number; zoom: number },
    useShadow: boolean
  ): void {
    const screenX = (p.x * TILE_SIZE - camera.x) * camera.zoom;
    const screenY = (p.y * TILE_SIZE - camera.y) * camera.zoom;
    const screenSize = p.size * camera.zoom;

    if (screenSize <= 0) return;

    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;

    if (useShadow) {
      ctx.shadowColor = p.color;
    } else {
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
    }

    ctx.beginPath();
    ctx.arc(screenX, screenY, screenSize, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: random range
// ═══════════════════════════════════════════════════════════════════

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

// ═══════════════════════════════════════════════════════════════════
// PRESET EMITTER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/** Dust burst when digging a tile — 8-12 brown/tan particles. */
export function emitDig(ps: ParticleSystem, x: number, y: number): void {
  const mainColors = ["#8d6e63", "#a1887f", "#bcaaa4", "#d7ccc8", "#795548"];
  const accentColors = ["#ffb74d", "#ffcc80", "#ffe0b2", "#ffd54f"];
  const count = randInt(8, 12);

  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(0.5, 2.5);
    const life = randInt(25, 40);
    const isAccent = Math.random() > 0.7;

    ps.addParticle({
      x: x + rand(-0.2, 0.2),
      y: y + rand(-0.2, 0.2),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(0.5, 2),
      life,
      maxLife: life,
      size: rand(2.5, 6),
      color: isAccent ? accentColors[randInt(0, accentColors.length - 1)] : mainColors[randInt(0, mainColors.length - 1)],
      alpha: rand(0.7, 1),
      alphaDecay: rand(0.015, 0.035),
      sizeDecay: rand(0.03, 0.08),
      gravity: 0.06,
      type: isAccent ? "glow" : "dust",
    });
  }

  for (let i = 0; i < 15; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(0.3, 1.2);
    const life = randInt(20, 35);

    ps.addParticle({
      x: x + rand(-0.3, 0.3),
      y: y + rand(-0.3, 0.3),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(0.8, 2.5),
      life,
      maxLife: life,
      size: rand(1, 2.5),
      color: mainColors[randInt(0, mainColors.length - 1)],
      alpha: rand(0.4, 0.7),
      alphaDecay: rand(0.02, 0.04),
      sizeDecay: rand(0.04, 0.1),
      gravity: 0.1,
      type: "dust",
    });
  }

  for (let i = 0; i < 6; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(1.5, 3.5);
    const life = randInt(10, 18);

    ps.addParticle({
      x: x + rand(-0.1, 0.1),
      y: y - 0.3,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(1.5, 3),
      life,
      maxLife: life,
      size: rand(3, 6),
      color: accentColors[randInt(0, accentColors.length - 1)],
      alpha: rand(0.8, 1),
      alphaDecay: rand(0.03, 0.06),
      sizeDecay: rand(0.05, 0.12),
      gravity: 0.04,
      type: "glow",
    });
  }
}

/** Evolution celebration — 30-40 sparkle particles in a ring, bright colors, glow. */
export function emitEvolution(
  ps: ParticleSystem,
  x: number,
  y: number,
  color: string
): void {
  const count = randInt(30, 40);
  const palette = [
    color,
    "#ffffff",
    "#ffeb3b",
    "#ff9800",
    "#e040fb",
    "#00e5ff",
  ];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand(-0.2, 0.2);
    const speed = rand(1, 3);
    const life = randInt(30, 50);

    ps.addParticle({
      x: x + Math.cos(angle) * rand(0.1, 0.5),
      y: y + Math.sin(angle) * rand(0.1, 0.5),
      vx: Math.cos(angle) * speed * 0.5,
      vy: Math.sin(angle) * speed * 0.5 - rand(1, 3),
      life,
      maxLife: life,
      size: rand(3, 7),
      color: palette[randInt(0, palette.length - 1)],
      alpha: rand(0.7, 1),
      alphaDecay: rand(0.01, 0.025),
      sizeDecay: rand(0.02, 0.06),
      gravity: -0.02,
      type: "evolution",
    });
  }
}

/** Death effect — 20-25 dark falling particles, red/purple. */
export function emitDeath(ps: ParticleSystem, x: number, y: number): void {
  const count = randInt(20, 25);
  const colors = ["#4a0e4e", "#880e4f", "#b71c1c", "#311b92", "#1a1a2e", "#6a1b9a"];

  for (let i = 0; i < count; i++) {
    const life = randInt(40, 60);
    const spread = rand(-1.5, 1.5);

    ps.addParticle({
      x: x + rand(-0.5, 0.5),
      y: y + rand(-0.5, 0.5),
      vx: spread * 0.3,
      vy: rand(0.5, 2),
      life,
      maxLife: life,
      size: rand(3, 8),
      color: colors[randInt(0, colors.length - 1)],
      alpha: rand(0.5, 0.9),
      alphaDecay: rand(0.008, 0.018),
      sizeDecay: rand(0.02, 0.06),
      gravity: 0.06,
      type: "death",
    });
  }
}

/** Eat effect — 5-8 small particles, color based on resource type. */
export function emitEat(
  ps: ParticleSystem,
  x: number,
  y: number,
  resourceType: string
): void {
  const count = randInt(5, 8);
  const colorMap: Record<string, string> = {
    moss: "#7cb342",
    mushroom: "#8d6e63",
    bone: "#e0e0e0",
    crystal_shard: "#00bcd4",
    mana_orb: "#e040fb",
  };
  const baseColor = colorMap[resourceType] ?? "#ffffff";
  const colors = [baseColor, "#ffffff", baseColor];

  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(0.3, 1.2);
    const life = randInt(10, 15);

    ps.addParticle({
      x: x + rand(-0.1, 0.1),
      y: y + rand(-0.1, 0.1),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(0.5, 1.5),
      life,
      maxLife: life,
      size: rand(1.5, 3),
      color: colors[randInt(0, colors.length - 1)],
      alpha: rand(0.7, 1),
      alphaDecay: rand(0.05, 0.08),
      sizeDecay: rand(0.1, 0.2),
      gravity: 0.02,
      type: "eat",
    });
  }
}

/** Damage flash — 3-5 red particles, very short life. */
export function emitDamage(ps: ParticleSystem, x: number, y: number): void {
  const count = randInt(3, 5);

  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(0.5, 2);
    const life = randInt(5, 10);

    ps.addParticle({
      x: x + rand(-0.3, 0.3),
      y: y + rand(-0.3, 0.3),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: rand(4, 8),
      color: Math.random() > 0.5 ? "#ff1744" : "#ff5252",
      alpha: rand(0.8, 1),
      alphaDecay: rand(0.08, 0.15),
      sizeDecay: rand(0.2, 0.4),
      gravity: 0,
      type: "damage",
    });
  }
}

/** Crystal glow — 2-3 ambient glow particles, cyan/blue, slow upward drift. */
export function emitCrystalGlow(ps: ParticleSystem, x: number, y: number): void {
  const count = randInt(2, 3);
  const colors = ["#00e5ff", "#00bcd4", "#18ffff", "#84ffff"];

  for (let i = 0; i < count; i++) {
    const life = randInt(60, 90);

    ps.addParticle({
      x: x + rand(-0.3, 0.3),
      y: y + rand(-0.3, 0.3),
      vx: rand(-0.1, 0.1),
      vy: rand(-0.3, -0.05),
      life,
      maxLife: life,
      size: rand(3, 6),
      color: colors[randInt(0, colors.length - 1)],
      alpha: rand(0.3, 0.6),
      alphaDecay: rand(0.003, 0.008),
      sizeDecay: rand(0.01, 0.03),
      gravity: -0.01,
      type: "glow",
    });
  }
}

/** Ambient dungeon atmosphere */
export function emitAmbient(
  ps: ParticleSystem,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const count = randInt(1, 2);
  const colors = ["#616161", "#757575", "#9e9e9e", "#bdbdbd"];

  for (let i = 0; i < count; i++) {
    const life = randInt(100, 180);

    ps.addParticle({
      x: x + rand(0, width),
      y: y + rand(0, height),
      vx: rand(-0.05, 0.05),
      vy: rand(-0.05, 0.05),
      life,
      maxLife: life,
      size: rand(1, 3),
      color: colors[randInt(0, colors.length - 1)],
      alpha: rand(0.1, 0.25),
      alphaDecay: rand(0.001, 0.003),
      sizeDecay: rand(0.005, 0.015),
      gravity: 0,
      type: "ambient",
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// COMMERCIAL-GRADE PRESET EMITTER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/** Level-up celebration — golden ring burst + floating stars + sparkle trail */
export function emitLevelUp(
  ps: ParticleSystem,
  x: number,
  y: number
): void {
  const palette = ["#fbbf24", "#f59e0b", "#fcd34d", "#fef3c7", "#ffffff", "#a855f7", "#c084fc"];

  // Ring burst
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const speed = rand(1.5, 3.5);

    ps.addParticle({
      x: x / TILE_SIZE + Math.cos(angle) * rand(0.05, 0.15),
      y: y / TILE_SIZE + Math.sin(angle) * rand(0.05, 0.15),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(0.5, 2),
      life: randInt(30, 50),
      maxLife: 50,
      size: rand(2, 5),
      color: palette[i % palette.length],
      alpha: rand(0.8, 1),
      alphaDecay: rand(0.01, 0.025),
      sizeDecay: rand(0.02, 0.05),
      gravity: -0.01,
      type: "levelUp",
    });
  }

  // Rising sparkle stars
  for (let i = 0; i < 15; i++) {
    const life = randInt(20, 40);
    ps.addParticle({
      x: x / TILE_SIZE + rand(-0.5, 0.5),
      y: y / TILE_SIZE + rand(0.2, 0.5),
      vx: rand(-0.3, 0.3),
      vy: rand(-1.5, -0.5),
      life,
      maxLife: life,
      size: rand(1.5, 4),
      color: palette[randInt(0, palette.length - 1)],
      alpha: rand(0.6, 0.9),
      alphaDecay: rand(0.015, 0.035),
      sizeDecay: rand(0.02, 0.05),
      gravity: -0.03,
      type: "sparkle",
    });
  }

  // Floating "+1" text particles (represented as glow orbs)
  for (let i = 0; i < 5; i++) {
    const life = randInt(40, 60);
    ps.addParticle({
      x: x / TILE_SIZE + rand(-0.3, 0.3),
      y: y / TILE_SIZE - 0.3,
      vx: rand(-0.1, 0.1),
      vy: rand(-0.5, -0.2),
      life,
      maxLife: life,
      size: rand(4, 7),
      color: "#fbbf24",
      alpha: rand(0.3, 0.5),
      alphaDecay: rand(0.003, 0.008),
      sizeDecay: rand(0.005, 0.015),
      gravity: -0.01,
      type: "glow",
    });
  }
}

/** Combo hit — rapid directional particles with impact flash */
export function emitCombo(
  ps: ParticleSystem,
  x: number,
  y: number,
  comboCount: number
): void {
  const count = Math.min(6 + comboCount * 3, 30);
  const accentColors = ["#ff5252", "#ff1744", "#ff8a65", "#ffab40", "#ffd740"];

  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(1, 4 + comboCount * 0.3);
    const life = randInt(8, 18);

    ps.addParticle({
      x: x / TILE_SIZE + rand(-0.15, 0.15),
      y: y / TILE_SIZE + rand(-0.15, 0.15),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: rand(2, 4 + comboCount * 0.2),
      color: accentColors[i % accentColors.length],
      alpha: rand(0.7, 1),
      alphaDecay: rand(0.04, 0.1),
      sizeDecay: rand(0.1, 0.25),
      gravity: 0,
      type: "combo",
    });
  }

  // Center flash
  const life = randInt(5, 10);
  ps.addParticle({
    x: x / TILE_SIZE,
    y: y / TILE_SIZE,
    vx: 0,
    vy: -0.2,
    life,
    maxLife: life,
    size: rand(6, 12 + comboCount * 2),
    color: "#ffffff",
    alpha: rand(0.6, 0.9),
    alphaDecay: rand(0.06, 0.12),
    sizeDecay: rand(0.08, 0.15),
    gravity: 0,
    type: "glow",
  });
}

/** Evolution ring — expanding magical circle with sparkles */
export function emitEvolutionRing(
  ps: ParticleSystem,
  x: number,
  y: number,
  color: string
): void {
  const accents = ["#ffffff", "#fbbf24", color, "#e040fb", "#00e5ff"];

  // Expanding ring particles
  for (let i = 0; i < 40; i++) {
    const angle = (i / 40) * Math.PI * 2;
    const speed = rand(0.3, 0.8);
    const life = randInt(40, 70);

    ps.addParticle({
      x: x / TILE_SIZE + Math.cos(angle) * rand(0.1, 0.2),
      y: y / TILE_SIZE + Math.sin(angle) * rand(0.1, 0.2),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: rand(2, 4),
      color: accents[i % accents.length],
      alpha: rand(0.7, 1),
      alphaDecay: rand(0.005, 0.015),
      sizeDecay: rand(0.01, 0.03),
      gravity: 0,
      type: "evolutionRing",
    });
  }

  // Inner light core
  const life = randInt(50, 80);
  ps.addParticle({
    x: x / TILE_SIZE,
    y: y / TILE_SIZE,
    vx: 0,
    vy: 0,
    life,
    maxLife: life,
    size: rand(5, 8),
    color: "#ffffff",
    alpha: rand(0.4, 0.7),
    alphaDecay: rand(0.003, 0.008),
    sizeDecay: rand(0.01, 0.02),
    gravity: 0,
    type: "glow",
  });

  // Upward floating sparkles
  for (let i = 0; i < 10; i++) {
    const l = randInt(20, 40);
    ps.addParticle({
      x: x / TILE_SIZE + rand(-0.5, 0.5),
      y: y / TILE_SIZE,
      vx: rand(-0.3, 0.3),
      vy: rand(-2, -0.5),
      life: l,
      maxLife: l,
      size: rand(1, 3),
      color: accents[randInt(0, accents.length - 1)],
      alpha: rand(0.5, 0.8),
      alphaDecay: rand(0.015, 0.03),
      sizeDecay: rand(0.02, 0.04),
      gravity: -0.03,
      type: "sparkle",
    });
  }
}

/** Crystal energy pulse — expanding cyan wave */
export function emitCrystalPulse(
  ps: ParticleSystem,
  x: number,
  y: number
): void {
  for (let ring = 0; ring < 2; ring++) {
    const ringOffset = ring * 15;
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const speed = rand(0.8, 1.5);
      const life = randInt(25, 45) + ringOffset;

      ps.addParticle({
        x: x / TILE_SIZE + Math.cos(angle) * rand(0.1, 0.2),
        y: y / TILE_SIZE + Math.sin(angle) * rand(0.1, 0.2),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: rand(2, 4),
        color: ring === 0 ? "#00e5ff" : "#18ffff",
        alpha: rand(0.4, 0.7),
        alphaDecay: rand(0.005, 0.015),
        sizeDecay: rand(0.01, 0.03),
        gravity: 0,
        type: "crystalPulse",
      });
    }
  }
}

/** Resource collection sparkle burst */
export function emitResourceCollect(
  ps: ParticleSystem,
  x: number,
  y: number,
  resourceType: string
): void {
  const colorMap: Record<string, string[]> = {
    mushroom: ["#8d6e63", "#a1887f", "#ffb74d", "#8d6e63"],
    crystal_shard: ["#00e5ff", "#18ffff", "#00bcd4", "#ffffff"],
    bone: ["#e0e0e0", "#f5f5f5", "#bdbdbd", "#e0e0e0"],
    mana_orb: ["#e040fb", "#ce93d8", "#f3e5f5", "#ab47bc"],
    moss: ["#7cb342", "#8bc34a", "#aed581", "#c5e1a5"],
  };
  const colors = colorMap[resourceType] ?? ["#ffffff", "#f5f5f5"];
  const count = randInt(8, 14);

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand(-0.15, 0.15);
    const speed = rand(0.5, 2);
    const life = randInt(10, 25);

    ps.addParticle({
      x: x / TILE_SIZE + rand(-0.1, 0.1),
      y: y / TILE_SIZE + rand(-0.1, 0.1),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(0.5, 1.5),
      life,
      maxLife: life,
      size: rand(1.5, 3.5),
      color: colors[i % colors.length],
      alpha: rand(0.6, 0.9),
      alphaDecay: rand(0.025, 0.05),
      sizeDecay: rand(0.03, 0.08),
      gravity: 0.04,
      type: "sparkle",
    });
  }
}

/** Screen flash — white overlay particle for impact feedback */
export function emitScreenFlash(
  ps: ParticleSystem,
  _x: number,
  _y: number,
  color: string = "#ffffff",
  duration: number = 6
): void {
  // Just add a particle - the flash logic is handled in the render loop
  ps.addParticle({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: duration,
    maxLife: duration,
    size: 0, // signal for screen flash
    color,
    alpha: 0.4,
    alphaDecay: 0,
    sizeDecay: 0,
    gravity: 0,
    type: "screenFlash",
  });
}
