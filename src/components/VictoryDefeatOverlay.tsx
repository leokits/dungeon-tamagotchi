"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface VictoryDefeatOverlayProps {
  result: {
    result: string;
    depth_reached: number;
    loot: { resources: Record<string, number> };
    dead_pets: string[];
    surviving_pets: string[];
    energy_drained: number;
  };
  onClose: () => void;
}

// ── Particle Burst System ────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface SparkleParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  twinkle: number;
}

function createParticles(
  count: number,
  cx: number,
  cy: number,
  colors: string[],
): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 2 + Math.random() * 4;
    const maxLife = 60 + Math.random() * 40;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: maxLife,
      maxLife,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 2 + Math.random() * 3,
    });
  }
  return particles;
}

function createCornerBurstParticles(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  colors: string[],
): Particle[] {
  const particles: Particle[] = [];
  const count = 30;
  for (let i = 0; i < count; i++) {
    const t = Math.random();
    const progress = t * 0.8;
    const cx = (startX + (targetX - startX) * progress) + (Math.random() - 0.5) * 40;
    const cy = (startY + (targetY - startY) * progress) + (Math.random() - 0.5) * 40;
    const angle = Math.atan2(targetY - startY, targetX - startX) + (Math.random() - 0.5) * 1.2;
    const speed = 1 + Math.random() * 3;
    const maxLife = 40 + Math.random() * 30;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: maxLife,
      maxLife,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 2 + Math.random() * 2.5,
    });
  }
  return particles;
}

function createSparkleParticles(count: number, cx: number, cy: number): SparkleParticle[] {
  const particles: SparkleParticle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 2;
    const maxLife = 40 + Math.random() * 30;
    particles.push({
      x: cx + (Math.random() - 0.5) * 60,
      y: cy + (Math.random() - 0.5) * 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: maxLife,
      maxLife,
      size: 1.5 + Math.random() * 2.5,
      twinkle: Math.random() * Math.PI * 2,
    });
  }
  return particles;
}

function ParticleBurstCanvas({ colors, resultType }: { colors: string[]; resultType: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const triggeredRef = useRef(false);
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const isAttack = resultType === "attacker_win" || resultType === "defender_win";
    const isDefeat = resultType !== "attacker_win" && resultType !== "defender_win" && resultType !== "draw";
    const W = canvas.width;
    const H = canvas.height;

    function fireBursts() {
      if (isAttack) {
        const burstPositions = [
          { x: W * 0.3, y: H * 0.3 },
          { x: W * 0.7, y: H * 0.4 },
          { x: W * 0.5, y: H * 0.6 },
        ];
        burstPositions.forEach((pos, i) => {
          const t = setTimeout(() => {
            particlesRef.current.push(
              ...createParticles(40, pos.x, pos.y, colors)
            );
          }, i * 200);
          timeoutRefs.current.push(t);
        });
      } else if (isDefeat) {
        const corners = [
          { x: 0, y: 0 },
          { x: W, y: 0 },
          { x: 0, y: H },
          { x: W, y: H },
        ];
        corners.forEach((corner, i) => {
          const t = setTimeout(() => {
            particlesRef.current.push(
              ...createCornerBurstParticles(
                corner.x,
                corner.y,
                W / 2,
                H / 2,
                colors
              )
            );
          }, i * 150);
          timeoutRefs.current.push(t);
        });
      } else {
        particlesRef.current = createParticles(60, W / 2, H / 2, colors);
      }
    }

    if (!triggeredRef.current) {
      triggeredRef.current = true;
      fireBursts();
    }

    function animate() {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.vx *= 0.99;
        p.life--;

        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();

        if (p.life <= 0) {
          particles.splice(i, 1);
        }
      }

      ctx.globalAlpha = 1;

      if (particles.length > 0) {
        animRef.current = requestAnimationFrame(animate);
      }
    }

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", handleResize);
      timeoutRefs.current.forEach(clearTimeout);
    };
  }, [colors, resultType]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 1 }}
    />
  );
}

// ── Sparkle Canvas for Loot ──────────────────────────────────────────────────

interface SparkleCanvasProps {
  active: boolean;
  color?: string;
}

function SparkleCanvas({ active, color = "#fbbf24" }: SparkleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<SparkleParticle[]>([]);
  const animRef = useRef<number>(0);
  const frameCountRef = useRef(0);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width || 100;
    canvas.height = rect.height || 20;
    const w = canvas.width;
    const h = canvas.height;

    particlesRef.current = createSparkleParticles(30, w / 2, h / 2);

    function animate() {
      ctx.clearRect(0, 0, w, h);

      frameCountRef.current++;
      if (frameCountRef.current % 8 === 0 && particlesRef.current.length < 50) {
        particlesRef.current.push(
          ...createSparkleParticles(3, w * (0.3 + Math.random() * 0.4), h / 2)
        );
      }

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy -= 0.02;
        p.life--;
        p.twinkle += 0.3;

        const alpha = Math.max(0, p.life / p.maxLife);
        const twinkleAlpha = alpha * (0.5 + 0.5 * Math.sin(p.twinkle));

        ctx.globalAlpha = twinkleAlpha;
        ctx.fillStyle = color;

        const s = p.size * alpha;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s * 2);
        ctx.lineTo(p.x + s * 0.5, p.y - s * 0.5);
        ctx.lineTo(p.x + s * 2, p.y);
        ctx.lineTo(p.x + s * 0.5, p.y + s * 0.5);
        ctx.lineTo(p.x, p.y + s * 2);
        ctx.lineTo(p.x - s * 0.5, p.y + s * 0.5);
        ctx.lineTo(p.x - s * 2, p.y);
        ctx.lineTo(p.x - s * 0.5, p.y - s * 0.5);
        ctx.closePath();
        ctx.fill();

        if (p.life <= 0) {
          particles.splice(i, 1);
        }
      }

      ctx.globalAlpha = 1;

      if (particles.length > 0) {
        animRef.current = requestAnimationFrame(animate);
      }
    }

    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [active, color]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 2 }}
    />
  );
}

// ── Overlay Component ────────────────────────────────────────────────────────

function formatResult(result: string): {
  title: string;
  emoji: string;
  subtitle: string;
} {
  switch (result) {
    case "attacker_win":
      return { title: "Victory!", emoji: "\uD83C\uDFC6", subtitle: "Your raid was successful!" };
    case "defender_win":
      return { title: "Defense Successful!", emoji: "\uD83C\uDFC6", subtitle: "You repelled the invaders!" };
    case "draw":
      return { title: "Draw", emoji: "\uD83C\uDFE5", subtitle: "Neither side prevailed." };
    default:
      return { title: "Defeat!", emoji: "\uD83D\uDC80", subtitle: "Your raid failed." };
  }
}

function resultTheme(result: string): {
  gradient: string;
  bgGradient: string;
  borderColor: string;
  particleColors: string[];
} {
  if (result === "attacker_win" || result === "defender_win") {
    return {
      gradient: "from-amber-400 via-green-400 to-amber-400",
      bgGradient: "from-green-900/30 via-zinc-950 to-amber-900/20",
      borderColor: "border-green-700/50",
      particleColors: ["#fbbf24", "#22c55e", "#f59e0b", "#4ade80", "#fcd34d"],
    };
  }
  if (result === "draw") {
    return {
      gradient: "from-yellow-400 to-amber-400",
      bgGradient: "from-yellow-900/20 via-zinc-950 to-amber-900/20",
      borderColor: "border-yellow-700/50",
      particleColors: ["#fbbf24", "#f59e0b", "#fcd34d", "#eab308"],
    };
  }
  return {
    gradient: "from-red-500 via-orange-400 to-red-500",
    bgGradient: "from-red-900/30 via-zinc-950 to-orange-900/20",
    borderColor: "border-red-700/50",
    particleColors: ["#ef4444", "#f97316", "#dc2626", "#fb923c", "#fbbf24"],
  };
}

export default function VictoryDefeatOverlay({
  result,
  onClose,
}: VictoryDefeatOverlayProps) {
  const [visible, setVisible] = useState(false);
  const info = formatResult(result.result);
  const theme = resultTheme(result.result);
  const hasLoot = Object.values(result.loot.resources).some((v) => v > 0);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center transition-all duration-500 ${
        visible ? "bg-black/70 backdrop-blur-sm" : "bg-black/0"
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ zIndex: 70 }}
    >
      <ParticleBurstCanvas colors={theme.particleColors} resultType={result.result} />

      <div
        className={`relative z-10 w-full max-w-md overflow-hidden rounded-2xl border ${theme.borderColor} bg-gradient-to-b ${theme.bgGradient} shadow-2xl transition-all duration-500 ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="relative overflow-hidden bg-gradient-to-b from-black/40 to-transparent px-6 pt-6 pb-2">
          <div
            className={`absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r ${theme.gradient} transition-all duration-1000 ${visible ? "scale-x-100" : "scale-x-0"}`}
            style={{
              transformOrigin: "left",
              animation: `dt-shimmer-line 2s ease-in-out ${visible ? '0.4s' : '0s'} infinite`,
            }}
          />

          <div className="flex items-center justify-center gap-3 pt-2">
            <div
              className={`text-5xl ${visible ? "animate-bounce" : ""}`}
              style={{
                animationDelay: visible ? "0.3s" : "0s",
                animationDuration: "1s",
                animationIterationCount: "3",
              }}
            >
              {info.emoji}
            </div>
            <div className="text-left">
              <h2
                className={`bg-gradient-to-r ${theme.gradient} bg-clip-text text-4xl font-black uppercase tracking-widest text-transparent transition-all duration-700 ${visible ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"}`}
              >
                {info.title}
              </h2>
              <p
                className={`mt-0.5 text-sm text-zinc-400 transition-all duration-700 delay-200 ${visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
              >
                {info.subtitle}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700/50 bg-zinc-900/80 text-zinc-400 transition-all duration-200 hover:scale-110 hover:border-zinc-500/70 hover:bg-zinc-800/90 hover:text-zinc-200 hover:shadow-lg hover:shadow-zinc-500/20 active:scale-100"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Stats */}
        <div className="mx-6 mb-4 mt-3 rounded-xl bg-zinc-900/60 p-4">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="text-xs text-zinc-500">Depth Reached</div>
              <div className="text-lg font-bold text-zinc-200">
                {result.depth_reached}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Energy Drained</div>
              <div className="text-lg font-bold text-zinc-200">
                {result.energy_drained} CE
              </div>
            </div>
          </div>

          {/* Loot */}
          {hasLoot && (
            <div className="mt-3 border-t border-zinc-800 pt-3">
              <div className="relative mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Loot Collected
                <SparkleCanvas active={visible} color={theme.particleColors[0]} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(result.loot.resources).map(([type, qty]) =>
                  (qty as number) > 0 ? (
                    <span
                      key={type}
                      className="relative rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 capitalize"
                      style={{
                        animation: visible ? "dt-loot-shimmer 2s ease-in-out infinite" : "none",
                        animationDelay: `${Math.random() * 1.5}s`,
                        boxShadow: `0 0 8px ${theme.particleColors[0]}40`,
                      }}
                    >
                      <span
                        className="pointer-events-none absolute inset-0 rounded"
                        style={{
                          border: "1.5px solid transparent",
                          WebkitMask: "linear-gradient(white, white) padding-box, linear-gradient(white, white)",
                          WebkitMaskComposite: "xor",
                          maskComposite: "exclude",
                          background: `linear-gradient(${theme.gradient}) padding-box, linear-gradient(${theme.gradient}) border-box`,
                          animation: `dt-border-shimmer 2s linear infinite`,
                          animationDelay: `${Math.random() * 2}s`,
                        }}
                      />
                      {type.replace(/_/g, " ")} ×{qty}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          )}

          {/* Pet Status */}
          <div className="mt-3 border-t border-zinc-800 pt-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Pet Status
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              {result.surviving_pets.length > 0 && (
                <div className="flex items-center gap-1.5 text-green-400">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-400/20 ring-1 ring-green-400/40">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <circle cx="5" cy="3.5" r="2" fill="#4ade80" />
                      <path d="M2 8c0-1.7 1.3-3 3-3s3 1.3 3 3" stroke="#4ade80" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                    </svg>
                  </div>
                  <span>{result.surviving_pets.length} survived</span>
                </div>
              )}
              {result.dead_pets.length > 0 && (
                <div className="flex items-center gap-1.5 text-red-400">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-400/20 ring-1 ring-red-400/40">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <line x1="2" y1="2" x2="8" y2="8" stroke="#f87171" strokeWidth="1.3" strokeLinecap="round" />
                      <line x1="8" y1="2" x2="2" y2="8" stroke="#f87171" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  </div>
                  <span>{result.dead_pets.length} lost</span>
                </div>
              )}
              {result.surviving_pets.length === 0 &&
                result.dead_pets.length === 0 && (
                  <span className="text-zinc-500">No pets involved</span>
                )}
            </div>
          </div>
        </div>

        {/* Continue button */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className={`group relative w-full overflow-hidden rounded-xl bg-gradient-to-r ${theme.gradient} px-4 py-3 text-sm font-bold text-zinc-950 transition-all hover:shadow-lg hover:shadow-zinc-500/30 active:scale-[0.98]`}
            style={{
              animation: visible ? "dt-btn-glow 2s ease-in-out infinite" : "none",
            }}
          >
            <span className="relative z-10">Continue</span>
            <div
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
