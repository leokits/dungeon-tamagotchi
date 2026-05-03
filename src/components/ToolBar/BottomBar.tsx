"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface BottomBarProps {
  activeTool: string;
  onToolChange: (tool: string) => void;
}

const TOOLS = [
  { id: "dig", icon: "⛏️", label: "Dig", tooltip: "Dig into tiles to find resources and pets" },
  { id: "view", icon: "👁️", label: "View", tooltip: "Inspect tiles and resources" },
  { id: "hatchery", icon: "🥚", label: "Hatchery", tooltip: "Place hatcheries and incubate eggs" },
  { id: "crystal_move", icon: "💎", label: "Crystal", tooltip: "Move crystal (costs 25 dust)" },
  { id: "raid", icon: "⚔️", label: "Raid", tooltip: "Browse and launch raids" },
];

const ACTIVE_BUTTON: Record<string, { active: string; hover: string; ring: string; shadow: string }> = {
  raid: {
    active: "bg-gradient-to-t from-red-600 via-red-500 to-orange-500",
    hover: "bg-gradient-to-t from-red-900 to-red-800",
    ring: "ring-red-400/70",
    shadow: "shadow-orange-500/50",
  },
  dig: {
    active: "bg-gradient-to-t from-amber-500 via-yellow-400 to-amber-300",
    hover: "bg-gradient-to-t from-amber-700 to-amber-600",
    ring: "ring-amber-300/70",
    shadow: "shadow-amber-400/50",
  },
  view: {
    active: "bg-gradient-to-t from-emerald-500 via-teal-400 to-cyan-300",
    hover: "bg-gradient-to-t from-emerald-700 to-teal-600",
    ring: "ring-emerald-300/70",
    shadow: "shadow-emerald-400/50",
  },
  hatchery: {
    active: "bg-gradient-to-t from-fuchsia-600 via-pink-500 to-rose-400",
    hover: "bg-gradient-to-t from-fuchsia-800 to-pink-700",
    ring: "ring-fuchsia-400/70",
    shadow: "shadow-fuchsia-400/50",
  },
  crystal_move: {
    active: "bg-gradient-to-t from-cyan-500 via-blue-400 to-violet-400",
    hover: "bg-gradient-to-t from-cyan-700 to-blue-600",
    ring: "ring-cyan-300/70",
    shadow: "shadow-cyan-400/50",
  },
};

export default function BottomBar({ activeTool, onToolChange }: BottomBarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [barVisible, setBarVisible] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setBarVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handlePress = useCallback(
    (toolId: string) => {
      setPressedId(toolId);
      setTimeout(() => setPressedId(null), 250);
      onToolChange(toolId);
    },
    [onToolChange],
  );

  return (
    <div
      ref={barRef}
      className="fixed bottom-0 left-0 right-0 z-40 flex justify-center px-2 pb-safe pt-1"
      style={{
        transform: barVisible ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#16162a]/92 px-2.5 py-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
        {TOOLS.map((t) => {
          const isActive = activeTool === t.id;
          const isHovered = hoveredId === t.id;
          const isPressed = pressedId === t.id;
          const colors = ACTIVE_BUTTON[t.id] || ACTIVE_BUTTON.dig;

          return (
            <div key={t.id} className="relative flex flex-col items-center">
              {/* Ambient glow behind active button */}
              {isActive && (
                <div
                  className="absolute inset-0 -m-2 rounded-2xl"
                  style={{
                    background: `radial-gradient(ellipse at center, ${
                      t.id === "raid"
                        ? "rgba(244,63,94,0.35)"
                        : t.id === "hatchery"
                          ? "rgba(192,38,211,0.3)"
                          : t.id === "crystal_move"
                            ? "rgba(34,211,238,0.25)"
                            : "rgba(251,191,36,0.3)"
                    }, transparent 70%)`,
                    filter: "blur(12px)",
                    animation: "ambientPulse 2.5s ease-in-out infinite",
                    pointerEvents: "none",
                  }}
                />
              )}

              {/* Pressed button bounce */}
              <button
                onClick={() => handlePress(t.id)}
                onMouseEnter={() => setHoveredId(t.id)}
                onMouseLeave={() => setHoveredId(null)}
                data-tutorial={
                  t.id === "dig"
                    ? "dig-tool"
                    : t.id === "hatchery"
                      ? "hatchery-tool"
                      : t.id === "raid"
                        ? "raid-tool"
                        : undefined
                }
                style={{
                  transform: isPressed
                    ? "scale(0.88)"
                    : isActive || isHovered
                      ? "scale(1.06)"
                      : "scale(1)",
                  transition:
                    "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
                className={`relative flex flex-col items-center justify-center rounded-xl px-4 py-2 text-[10px] font-semibold tracking-wide transition-colors duration-300 ${
                  isActive
                    ? `text-white shadow-lg ${colors.shadow} ring-2 ${colors.ring}`
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                }`}
              >
                <span
                  className={`mb-0.5 text-lg leading-none transition-transform duration-200 ${
                    isActive ? "scale-110" : ""
                  }`}
                >
                  {t.icon}
                </span>
                <span className="text-[9px] uppercase tracking-widest">
                  {t.label}
                </span>

                {/* Hover / active highlight overlay */}
                {isHovered && !isActive && (
                  <div className="absolute inset-0 -m-px rounded-xl bg-white/[0.04]" />
                )}
              </button>

              {/* Tooltip */}
              {isHovered && (
                <div
                  className="absolute -top-1 left-1/2 z-50 w-max max-w-[200px] -translate-x-1/2 translate-y-full pt-2"
                  style={{
                    animation:
                      "tooltipFadeIn 0.2s ease-out forwards",
                  }}
                >
                  <div
                    className="relative rounded-lg border border-white/10 px-3 py-1.5 text-center text-[11px] font-medium leading-snug text-zinc-100 shadow-xl"
                    style={{
                      background: "linear-gradient(135deg, #1e1e3a 0%, #151528 100%)",
                    }}
                  >
                    {t.tooltip}
                    {/* Arrow */}
                    <div
                      className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45"
                      style={{
                        background: "linear-gradient(135deg, #1e1e3a 0%, #151528 100%)",
                        border: "none",
                        borderRight: "1px solid rgba(255,255,255,0.1)",
                        borderTop: "1px solid rgba(255,255,255,0.1)",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
