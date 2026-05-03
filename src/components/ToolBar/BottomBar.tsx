"use client";

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

export default function BottomBar({ activeTool, onToolChange }: BottomBarProps) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 flex h-14 items-center justify-center gap-2 border-t border-zinc-800/80 bg-zinc-900/95 px-4 backdrop-blur-md">
      {TOOLS.map((t) => {
        const isActive = activeTool === t.id;
        const isSpecial = t.id === "hatchery" || t.id === "crystal_move" || t.id === "raid";
        return (
          <button
            key={t.id}
            onClick={() => onToolChange(t.id)}
            data-tutorial={t.id === "dig" ? "dig-tool" : t.id === "hatchery" ? "hatchery-tool" : t.id === "raid" ? "raid-tool" : undefined}
            data-tooltip={t.tooltip}
            className={`dt-tooltip relative flex flex-col items-center gap-0.5 rounded-xl px-4 py-2 text-xs font-medium transition-all duration-200 ${
              isActive
                ? t.id === "raid"
                  ? "bg-gradient-to-t from-red-700 to-red-600 text-white shadow-lg shadow-red-900/40 ring-2 ring-red-500/60"
                  : "bg-gradient-to-t from-amber-600 to-amber-500 text-white shadow-lg shadow-amber-900/40 ring-2 ring-amber-400/60"
                : isSpecial
                ? "bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-200 hover:ring-1 hover:ring-zinc-600"
                : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-200 hover:ring-1 hover:ring-zinc-600"
            }`}
          >
            <span className={`text-base transition-transform duration-200 ${isActive ? "scale-110" : ""}`}>{t.icon}</span>
            <span className="text-[10px]">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
