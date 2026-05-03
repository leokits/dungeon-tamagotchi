"use client";

import type { Player } from "@/types/database";

interface InventoryPanelProps {
  player: Player | null;
  resourceCounts: Record<string, number>;
}

const RESOURCES = [
  { type: "mushroom", emoji: "🍄", label: "Mushroom" },
  { type: "crystal_shard", emoji: "💎", label: "Crystal Shard" },
  { type: "bone", emoji: "🦴", label: "Bone" },
  { type: "mana_orb", emoji: "🔮", label: "Mana Orb" },
  { type: "moss", emoji: "🌿", label: "Moss" },
];

export default function InventoryPanel({ player, resourceCounts = {} }: InventoryPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-amber-400">✦</span>
          <span className="text-sm font-medium text-zinc-200">Chrono Dust</span>
        </div>
        <div className="text-2xl font-mono font-bold text-amber-400">
          {player?.chrono_dust ?? 0}
        </div>
      </div>

      <div className="p-3">
        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Resources</div>
        <div className="grid grid-cols-2 gap-2">
          {RESOURCES.map((r) => (
            <div key={r.type} className="rounded-lg bg-zinc-800 p-2.5">
              <div className="text-lg mb-1">{r.emoji}</div>
              <div className="text-[10px] text-zinc-500 capitalize">{r.label}</div>
              <div className="text-sm font-mono font-bold text-zinc-200">{resourceCounts[r.type] ?? 0}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-zinc-800 p-3">
        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Items</div>
        <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-4 text-center">
          <div className="text-2xl mb-1">🎒</div>
          <p className="text-xs text-zinc-500">Coming Soon</p>
          <p className="mt-0.5 text-[10px] text-zinc-600">Equipment, consumables, and more</p>
        </div>
      </div>
    </div>
  );
}
