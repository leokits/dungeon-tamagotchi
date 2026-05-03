"use client";

import { useEffect, useState, useRef } from "react";

const LOADING_STAGES = [
  { min: 0, max: 20, text: "Summoning dungeon..." },
  { min: 20, max: 40, text: "Generating tiles..." },
  { min: 40, max: 60, text: "Growing resources..." },
  { min: 60, max: 80, text: "Awakening creatures..." },
  { min: 80, max: 100, text: "Preparing dungeon..." },
];

const EMOJIS = ["🏰", "⛏️", "🍄", "💎", "🦴", "🔮", "🌿", "👁️", "🐾", "💀"];

function FloatingEmoji({ delay, emoji, x }: { delay: number; emoji: string; x: number }) {
  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: `${x}%`,
        bottom: "0%",
        fontSize: "24px",
        opacity: 0.15,
        animation: `floatUp 6s ${delay}s ease-in infinite`,
      }}
    >
      {emoji}
    </div>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 50;
  const strokeWidth = 4;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
      <circle
        stroke="rgba(245, 158, 11, 0.1)"
        fill="transparent"
        strokeWidth={strokeWidth}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      <circle
        stroke="url(#loadingGradient)"
        fill="transparent"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
        style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
      />
      <defs>
        <linearGradient id="loadingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function DungeonPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seed = useRef(Math.random() * 10000);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const tileSize = 16;
      const cols = Math.ceil(canvas.width / tileSize);
      const rows = Math.ceil(canvas.height / tileSize);
      const s = seed.current;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const noise = Math.sin((x + Math.sin(t * 0.02) * 3) * 0.5) *
                        Math.cos((y + Math.cos(t * 0.015) * 2) * 0.5) *
                        Math.cos((x + y) * 0.3 + s);
          const brightness = Math.floor(20 + noise * 15 + t * 0.05);
          const clamped = Math.min(60, Math.max(10, brightness));

          if (noise > 0.3) {
            ctx.fillStyle = `rgba(120, 90, 70, 0.4)`;
            ctx.fillRect(x * tileSize, y * tileSize, tileSize - 1, tileSize - 1);
          } else if (noise > -0.1) {
            ctx.fillStyle = `rgba(40, 35, 30, 0.6)`;
            ctx.fillRect(x * tileSize, y * tileSize, tileSize - 1, tileSize - 1);
          }
        }
      }

      const resourceCount = 5;
      for (let i = 0; i < resourceCount; i++) {
        const rx = Math.floor(((s * (i + 1) * 7 + i * 13) % 1000) / 1000 * cols);
        const ry = Math.floor(((s * (i + 1) * 11 + i * 17) % 1000) / 1000 * rows);
        const flicker = Math.sin(t * 0.05 + i * 2) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(245, 158, 11, ${0.2 * flicker})`;
        ctx.beginPath();
        ctx.arc(rx * tileSize + tileSize / 2, ry * tileSize + tileSize / 2, 3 * flicker, 0, Math.PI * 2);
        ctx.fill();
      }

      t++;
      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={120}
      className="rounded-lg border border-zinc-700/50"
      style={{ filter: "brightness(1.5)" }}
    />
  );
}

export default function LoadingScreen() {
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 1 + Math.random() * 2;
        if (next >= 100) return 100;
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const stage = LOADING_STAGES.findIndex((s) => progress < s.max);
    setCurrentStage(stage === -1 ? LOADING_STAGES.length - 1 : stage);
  }, [progress]);

  const emojis = useRef(EMOJIS.map((emoji, i) => ({ emoji, x: 5 + (i * 95 / EMOJIS.length), delay: (i * 0.8) % 6 })));

  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-zinc-950">
      {emojis.current.map((e, i) => (
        <FloatingEmoji key={i} delay={e.delay} emoji={e.emoji} x={e.x} />
      ))}

      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)",
            animation: "dt-bar-pulse 3s ease-in-out infinite",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 px-4">
        <div className="flex flex-col items-center gap-2">
          <h1
            className="text-4xl font-bold tracking-tight"
            style={{
              backgroundImage: "linear-gradient(to right, #fbbf24, #f59e0b)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              animation: "dt-toast-in 0.5s ease-out forwards",
            }}
          >
            DOJOGEN
          </h1>
          <p className="text-sm text-zinc-500">Build dungeons. Raise pets. Raid friends.</p>
        </div>

        {/* Progress ring + tile preview */}
        <div className="relative flex items-center gap-8">
          <div className="relative">
            <ProgressRing progress={progress} />
            <div
              className="absolute left-1/2 top-1/2 block text-center -translate-x-1/2 -translate-y-1/2 font-mono text-lg font-bold text-amber-400"
            >
              {Math.round(progress)}%
            </div>
          </div>

          <div className="hidden sm:block">
            <DungeonPreview />
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-72 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900/50">
          <div
            className="h-1.5 origin-left rounded-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400"
            style={{
              width: `${progress}%`,
              transition: "width 0.3s ease-out",
            }}
          />
        </div>

        {/* Stage text */}
        <p className="font-mono text-xs tracking-widest text-zinc-600">
          {LOADING_STAGES[currentStage]?.text || "Ready!"}
        </p>

        {/* Subtitle */}
        <p className="animate-pulse text-xs text-zinc-600">
          Your dungeon awaits...
        </p>
      </div>
    </div>
  );
}
