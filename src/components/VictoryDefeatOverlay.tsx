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

function ParticleBurstCanvas({ colors }: { colors: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const triggeredRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Trigger burst once
    if (!triggeredRef.current) {
      triggeredRef.current = true;
      particlesRef.current = createParticles(
        80,
        canvas.width / 2,
        canvas.height / 2,
        colors,
      );
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
    };
  }, [colors]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 1 }}
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

  useEffect(() => {
    // Trigger fade-in
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

  const hasLoot = Object.values(result.loot.resources).some((v) => v > 0);

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
      <ParticleBurstCanvas colors={theme.particleColors} />

      <div
        className={`relative z-10 w-full max-w-md overflow-hidden rounded-2xl border ${theme.borderColor} bg-gradient-to-b ${theme.bgGradient} shadow-2xl transition-all duration-500 ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        {/* Header */}
        <div className="px-6 pt-8 pb-4 text-center">
          <div
            className="mb-3 text-6xl"
            style={{ animation: "dt-bar-pulse 2s ease-in-out infinite" }}
          >
            {info.emoji}
          </div>
          <h2
            className={`bg-gradient-to-r ${theme.gradient} bg-clip-text text-3xl font-black uppercase tracking-widest text-transparent`}
            style={{ animation: "dt-toast-in 0.6s ease-out forwards" }}
          >
            {info.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">{info.subtitle}</p>
        </div>

        {/* Stats */}
        <div className="mx-6 mb-4 rounded-xl bg-zinc-900/60 p-4">
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
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Loot Collected
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(result.loot.resources).map(([type, qty]) =>
                  (qty as number) > 0 ? (
                    <span
                      key={type}
                      className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 capitalize"
                    >
                      {type.replace(/_/g, " ")} &times;{qty}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          )}

          {/* Pets status */}
          <div className="mt-3 border-t border-zinc-800 pt-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Pet Status
            </div>
            <div className="flex items-center gap-4 text-xs">
              {result.surviving_pets.length > 0 && (
                <span className="text-green-400">
                  \u2728 {result.surviving_pets.length} survived
                </span>
              )}
              {result.dead_pets.length > 0 && (
                <span className="text-red-400">
                  \uD83D\uDC80 {result.dead_pets.length} lost
                </span>
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
            className={`w-full rounded-xl bg-gradient-to-r ${theme.gradient} px-4 py-3 text-sm font-bold text-zinc-950 transition-all hover:opacity-90 active:scale-[0.98]`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
