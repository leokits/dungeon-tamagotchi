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

function FloatingEmoji({ delay, emoji, x, speed }: { delay: number; emoji: string; x: number; speed: number }) {
  return (
    <div
      className="absolute pointer-events-none select-none"
      style={{
        left: `${x}%`,
        bottom: "0%",
        fontSize: "24px",
        opacity: 0.15,
        animation: `floatUp ${6 / speed}s ${delay}s ease-in infinite`,
      }}
    >
      {emoji}
    </div>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 50;
  const outerRadius = 60;
  const strokeWidth = 4;
  const innerStrokeWidth = 2.5;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const outerNormalizedRadius = outerRadius - innerStrokeWidth / 2;

  return (
    <div className="relative" style={{ width: outerRadius * 2, height: outerRadius * 2 }}>
      <svg height={outerRadius * 2} width={outerRadius * 2} className="absolute inset-0" style={{ animation: "ringPulse 3s ease-in-out infinite", transformOrigin: "center" }}>
        <circle
          stroke="rgba(245, 158, 11, 0.2)"
          fill="transparent"
          strokeWidth={innerStrokeWidth}
          r={outerNormalizedRadius}
          cx={outerRadius}
          cy={outerRadius}
        />
      </svg>

      <svg height={radius * 2.4} width={radius * 2.4} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ filter: "blur(6px)", opacity: 0.35 }}>
        <circle
          stroke="url(#loadingGradient)"
          fill="transparent"
          strokeWidth={strokeWidth + 4}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>

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
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function SparkleParticles() {
  const [particles] = useState(() => {
    const intHash = (seed: number) => {
      let h = seed | 0;
      h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
      h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      cx: 18 + intHash(i * 7 + 3) * 84,
      cy: 18 + intHash(i * 11 + 7) * 84,
      delay: intHash(i * 13 + 5) * 3,
      duration: 1.5 + intHash(i * 17 + 11) * 2,
      size: 2 + intHash(i * 19 + 13) * 3,
    }));
  });

  return (
    <svg height={120} width={120} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 blur-[0.5px]">
      {particles.map((p) => (
        <circle
          key={p.id}
          cx={p.cx}
          cy={p.cy}
          r={p.size}
          fill="#fbbf24"
          style={{
            animation: `starTwinkle ${p.duration}s ${p.delay}s ease-in-out infinite`,
          }}
        />
      ))}
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
      const s = seed.current;

      const cellW = 28;
      const cellH = 14;
      const offsetX = 10;
      const offsetY = 10;
      const cols = 8;
      const rows = 6;

      ctx.lineWidth = 0.5;
      for (let i = 0; i <= cols; i++) {
        const shimmer = 0.08 + Math.sin(t * 0.03 + i * 0.8) * 0.12;
        const grad = ctx.createLinearGradient(
          offsetX + i * cellW,
          offsetY,
          offsetX + i * cellW,
          offsetY + rows * cellH * 2
        );
        const alpha = Math.floor(shimmer * 255);
        grad.addColorStop(0, `rgba(100, 90, 80, ${alpha / 255})`);
        grad.addColorStop(0.5, `rgba(245, 158, 11, ${(alpha * 1.5) / 255})`);
        grad.addColorStop(1, `rgba(100, 90, 80, ${alpha / 255})`);
        ctx.strokeStyle = grad;

        ctx.beginPath();
        ctx.moveTo(offsetX + i * cellW, offsetY);
        for (let j = 0; j < rows; j++) {
          const x = offsetX + i * cellW + j * cellW * 0.5;
          const y = offsetY + j * cellH;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      for (let j = 0; j <= rows; j++) {
        const shimmer = 0.08 + Math.sin(t * 0.025 + j * 0.6) * 0.12;
        ctx.strokeStyle = `rgba(100, 90, 80, ${shimmer})`;

        ctx.beginPath();
        ctx.moveTo(offsetX, offsetY + j * cellH);
        for (let i = 0; i <= cols; i++) {
          const x = offsetX + i * cellW - j * cellW * 0.5;
          const y = offsetY + j * cellH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      for (let j = rows - 1; j >= 0; j--) {
        for (let i = 0; i < cols; i++) {
          const px = offsetX + (i - j) * cellW * 0.5;
          const py = offsetY + (i + j) * cellH * 0.5;

          const noise = Math.sin((i + Math.sin(t * 0.02) * 3) * 0.5) *
                        Math.cos((j + Math.cos(t * 0.015) * 2) * 0.5) *
                        Math.cos((i + j) * 0.3 + s);

          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + cellW * 0.5, py + cellH * 0.5);
          ctx.lineTo(px, py + cellH);
          ctx.lineTo(px - cellW * 0.5, py + cellH * 0.5);
          ctx.closePath();

          let tileBrightness: number;
          let tileColor: string;
          let sideColor: string;

          if (noise > 0.3) {
            tileBrightness = 120 + Math.sin(t * 0.04 + i + j) * 10;
            tileColor = `rgb(${tileBrightness * 0.5}, ${tileBrightness * 0.35}, ${tileBrightness * 0.25})`;
            sideColor = `rgb(${Math.floor(tileBrightness * 0.3)}, ${Math.floor(tileBrightness * 0.2)}, ${Math.floor(tileBrightness * 0.15)})`;
          } else if (noise > -0.1) {
            tileBrightness = 45 + noise * 5;
            tileColor = `rgb(${Math.floor(tileBrightness * 0.5)}, ${Math.floor(tileBrightness * 0.45)}, ${Math.floor(tileBrightness * 0.4)})`;
            sideColor = `rgb(${Math.floor(tileBrightness * 0.3)}, ${Math.floor(tileBrightness * 0.28)}, ${Math.floor(tileBrightness * 0.25)})`;
          } else {
            tileBrightness = 20;
            tileColor = `rgb(${Math.floor(tileBrightness * 0.55)}, ${Math.floor(tileBrightness * 0.5)}, ${Math.floor(tileBrightness * 0.45)})`;
            sideColor = `rgb(${Math.floor(tileBrightness * 0.35)}, ${Math.floor(tileBrightness * 0.3)}, ${Math.floor(tileBrightness * 0.25)})`;
          }

          ctx.fillStyle = tileColor;
          ctx.fill();
          ctx.strokeStyle = `rgba(60, 55, 50, 0.4)`;
          ctx.lineWidth = 0.5;
          ctx.stroke();

          if (noise > -0.1) {
            ctx.beginPath();
            ctx.moveTo(px - cellW * 0.5, py + cellH * 0.5);
            ctx.lineTo(px, py + cellH);
            ctx.lineTo(px, py + cellH + 5);
            ctx.lineTo(px - cellW * 0.5, py + cellH * 0.5 + 5);
            ctx.closePath();
            ctx.fillStyle = sideColor;
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(px + cellW * 0.5, py + cellH * 0.5);
            ctx.lineTo(px, py + cellH);
            ctx.lineTo(px, py + cellH + 5);
            ctx.lineTo(px + cellW * 0.5, py + cellH * 0.5 + 5);
            ctx.closePath();
            ctx.fillStyle = sideColor;
            ctx.globalAlpha = 0.7;
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
      }

      const resourceCount = 6;
      const resourceTypes = [
        { color: "245, 158, 11", radius: 4, glowAlpha: 0.6 },
        { color: "34, 211, 238", radius: 3, glowAlpha: 0.5 },
        { color: "168, 85, 247", radius: 3, glowAlpha: 0.5 },
        { color: "74, 222, 128", radius: 3, glowAlpha: 0.4 },
        { color: "251, 146, 60", radius: 4, glowAlpha: 0.5 },
        { color: "239, 68, 68", radius: 3, glowAlpha: 0.4 },
      ];

      for (let i = 0; i < resourceCount; i++) {
        const rx = Math.floor(((s * (i + 1) * 7 + i * 13) % 1000) / 1000 * cols);
        const ry = Math.floor(((s * (i + 1) * 11 + i * 17) % 1000) / 1000 * rows);
        const flicker = Math.sin(t * 0.06 + i * 1.5) * 0.5 + 0.5;
        const type = resourceTypes[i % resourceTypes.length];

        const px = offsetX + (rx - ry) * cellW * 0.5;
        const py = offsetY + (rx + ry) * cellH * 0.5;

        ctx.beginPath();
        ctx.arc(px, py + cellH * 0.3, type.radius * 2.5 * (0.8 + flicker * 0.2), 0, Math.PI * 2);
        const glowGrad = ctx.createRadialGradient(px, py + cellH * 0.3, 0, px, py + cellH * 0.3, type.radius * 2.5);
        glowGrad.addColorStop(0, `rgba(${type.color}, ${type.glowAlpha * flicker})`);
        glowGrad.addColorStop(1, `rgba(${type.color}, 0)`);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py + cellH * 0.3, type.radius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${type.color}, ${0.4 * flicker + 0.1})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py + cellH * 0.3, type.radius * (0.6 + flicker * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${type.color}, ${0.7 + flicker * 0.3})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py + cellH * 0.3, type.radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + flicker * 0.3})`;
        ctx.fill();
      }

      const structures = [
        { col: 0, row: 0, height: 18, color: "80, 75, 70" },
        { col: cols - 1, row: 0, height: 14, color: "75, 70, 65" },
        { col: 0, row: rows - 1, height: 16, color: "70, 65, 60" },
        { col: cols - 1, row: rows - 1, height: 12, color: "85, 80, 75" },
      ];

      for (const struct of structures) {
        const px = offsetX + (struct.col - struct.row) * cellW * 0.5;
        const py = offsetY + (struct.col + struct.row) * cellH * 0.5;
        const height = struct.height + Math.sin(t * 0.02 + struct.col + struct.row) * 2;

        ctx.beginPath();
        ctx.moveTo(px - cellW * 0.5, py + cellH * 0.5);
        ctx.lineTo(px, py + cellH);
        ctx.lineTo(px, py + cellH - height);
        ctx.lineTo(px - cellW * 0.5, py + cellH * 0.5 - height);
        ctx.closePath();
        ctx.fillStyle = `rgba(${struct.color}, 0.8)`;
        ctx.fill();
        ctx.strokeStyle = `rgba(120, 110, 100, 0.3)`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(px + cellW * 0.5, py + cellH * 0.5);
        ctx.lineTo(px, py + cellH);
        ctx.lineTo(px, py + cellH - height);
        ctx.lineTo(px + cellW * 0.5, py + cellH * 0.5 - height);
        ctx.closePath();
        ctx.fillStyle = `rgba(${struct.color}, 0.6)`;
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(px, py + cellH * 0.5 - height);
        ctx.lineTo(px + cellW * 0.5, py + cellH);
        ctx.lineTo(px + cellW * 0.5, py + cellH * 0.5);
        ctx.lineTo(px, py);
        ctx.closePath();
        const lightColor = struct.color.split(",").map(c => parseInt(c.trim()));
        ctx.fillStyle = `rgba(${lightColor[0] + 20 | 0}, ${lightColor[1] + 15 | 0}, ${lightColor[2] + 10 | 0}, 0.7)`;
        ctx.fill();
        ctx.strokeStyle = `rgba(120, 110, 100, 0.2)`;
        ctx.stroke();

        if (Math.sin(t * 0.04 + struct.col * 3 + struct.row * 5) > 0.2) {
          const windowGlow = 0.3 + Math.sin(t * 0.04 + struct.col + struct.row) * 0.2;
          ctx.beginPath();
          ctx.arc(px, py + cellH * 0.5 - height * 0.6, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(245, 158, 11, ${windowGlow})`;
          ctx.fill();
        }
      }

      for (let i = 0; i < 8; i++) {
        const particleX = offsetX + 10 + Math.sin(t * 0.015 + i * 1.8) * 60 + i * 12;
        const particleY = offsetY + 10 + Math.cos(t * 0.02 + i * 2.1) * 20 + i * 8;
        const particleAlpha = 0.15 + Math.sin(t * 0.05 + i * 3) * 0.1;

        ctx.beginPath();
        ctx.arc(particleX, particleY, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245, 158, 11, ${particleAlpha})`;
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
      width={240}
      height={140}
      className="rounded-lg border border-zinc-700/50"
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

  const emojis = useRef(EMOJIS.map((emoji, i) => ({
    emoji,
    x: 5 + (i * 95 / EMOJIS.length),
    delay: (i * 0.8) % 6,
    speed: 0.6 + (i % 3) * 0.4,
  })));

  const titleColors = ["#fbbf24", "#f59e0b", "#d97706", "#92400e", "#f59e0b", "#fbbf24"];

  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-zinc-950">
      {emojis.current.map((e, i) => (
        <FloatingEmoji key={i} delay={e.delay} emoji={e.emoji} x={e.x} speed={e.speed} />
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

      <div className="relative z-10 flex flex-col items-center gap-8 px-4" style={{ animation: "loadingCardGlow 4s ease-in-out infinite" }}>
        <div className="flex flex-col items-center gap-2">
          <h1
            className="text-4xl font-bold tracking-tight"
            style={{
              backgroundImage: `linear-gradient(90deg, ${titleColors.join(", ")})`,
              backgroundSize: "200% 100%",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              animation: "dt-toast-in 0.5s ease-out forwards, gradientShift 4s ease-in-out infinite",
            }}
          >
            DOJOGEN
          </h1>
          <p className="text-sm text-zinc-500">Build dungeons. Raise pets. Raid friends.</p>
        </div>

        <div className="relative flex items-center gap-8">
          <div className="relative">
            <ProgressRing progress={progress} />
            <SparkleParticles />
            <div
              className="absolute left-1/2 top-1/2 block text-center -translate-x-1/2 -translate-y-1/2 font-mono text-lg font-bold text-amber-400"
              style={{ textShadow: "0 0 8px rgba(245, 158, 11, 0.5)" }}
            >
              {Math.round(progress)}%
            </div>
          </div>

          <div className="hidden sm:block">
            <DungeonPreview />
          </div>
        </div>

        <div className="w-72 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900/50">
          <div
            className="h-1.5 origin-left rounded-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400"
            style={{
              width: `${progress}%`,
              transition: "width 0.3s ease-out",
              boxShadow: "0 0 8px rgba(245, 158, 11, 0.3)",
            }}
          />
        </div>

        <p className="font-mono text-xs tracking-widest text-zinc-600">
          {LOADING_STAGES[currentStage]?.text || "Ready!"}
        </p>

        <p className="animate-pulse text-xs text-zinc-600">
          Your dungeon awaits...
        </p>
      </div>
    </div>
  );
}
