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
    <div className="absolute bottom-0 left-0 right-0 z-40 flex h-14 items-center justify-center gap-2 border-t border-zinc-800 bg-zinc-900/95 px-4 backdrop-blur-sm">
      {TOOLS.map((t) => {
        const isActive = activeTool === t.id;
        const isSpecial = t.id === "hatchery" || t.id === "crystal_move" || t.id === "raid";
        return (
          <button
            key={t.id}
            onClick={() => onToolChange(t.id)}
            data-tutorial={t.id === "dig" ? "dig-tool" : t.id === "hatchery" ? "hatchery-tool" : t.id === "raid" ? "raid-tool" : undefined}
            data-tooltip={t.tooltip}
            className={`dt-tooltip relative flex flex-col items-center gap-0.5 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
              isActive
                ? t.id === "raid"
                  ? "bg-red-700 text-white ring-2 ring-red-500"
                  : "bg-amber-600 text-white ring-2 ring-amber-400"
                : isSpecial
                ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
          >
            <span className="text-base">{t.icon}</span>
            <span className="text-[10px]">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
