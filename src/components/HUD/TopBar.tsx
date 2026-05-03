"use client";

import { calcLevel, calcXpProgress, XP_TABLE } from "@/game/xp-system";
import type { Player, Dungeon, Pet } from "@/types/database";

interface TopBarProps {
  player: Player | null;
  dungeon: Dungeon | null;
  unreadCount: number;
  resourceCounts: Record<string, number>;
  alivePetCount: number;
  maxPetSlots: number;
  onToggleNotifications: () => void;
  onToggleAdmin: () => void;
  onLogout: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

const RESOURCE_EMOJIS: Record<string, string> = {
  mushroom: "🍄",
  crystal_shard: "💎",
  bone: "🦴",
  mana_orb: "🔮",
  moss: "🌿",
};

export default function TopBar({
  player, dungeon, unreadCount, resourceCounts, alivePetCount, maxPetSlots,
  onToggleNotifications, onToggleAdmin, onLogout, onToggleSidebar, sidebarOpen,
}: TopBarProps) {
  const crystalEnergy = dungeon?.crystal_energy ?? 0;
  const crystalPct = Math.min(100, crystalEnergy);

  const playerLevel = player?.level ? calcLevel(player.level) : 1;
  const totalXp = player?.level ? XP_TABLE[player.level] ?? 0 : 0;
  const xpProg = calcXpProgress(totalXp);

  const slotPct = maxPetSlots > 0 ? (alivePetCount / maxPetSlots) * 100 : 0;
  const slotColor = slotPct >= 90 ? "bg-red-500" : slotPct >= 70 ? "bg-amber-500" : "bg-zinc-600";

  return (
    <div className="absolute left-0 right-0 top-0 z-40 flex h-12 items-center justify-between border-b border-zinc-800 bg-zinc-900/95 px-3 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
        <button
          onClick={onToggleSidebar}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-zinc-400 transition-all duration-200 hover:bg-zinc-700 hover:text-zinc-200"
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 3L6 8l5 5" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 3l5 5-5 5" />
            </svg>
          )}
        </button>

        <div className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-semibold leading-none text-zinc-100">
            {player?.username || "Unknown"}
          </span>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-md bg-zinc-800/80 px-1.5 py-px border border-amber-900/30">
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600">Lv</span>
              <span className="text-xs font-mono font-bold leading-none text-amber-400">{playerLevel}</span>
            </div>
            {xpProg.needed > 0 && (
              <div className="flex w-12 items-center gap-0.5">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-700"
                    style={{
                      width: `${Math.min(100, (xpProg.current / xpProg.needed) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1 rounded-lg bg-zinc-800/60 border border-zinc-700/50 pl-1.5 pr-1 py-0.5">
          <span className="text-[10px] font-bold text-amber-500">✦</span>
          <span className="text-xs font-mono font-medium text-amber-300 tabular-nums">
            {player?.chrono_dust?.toLocaleString() ?? 0}
          </span>
        </div>

        <div className="hidden items-center gap-1.5 sm:flex">
          {Object.entries(RESOURCE_EMOJIS).map(([type, emoji]) => (
            <span key={type} className="flex items-center gap-0.5 rounded bg-zinc-800/50 px-1.5 py-0.5">
              <span className="text-[10px]">{emoji}</span>
              <span className="text-[10px] font-mono font-medium leading-none text-zinc-300 tabular-nums min-w-[12px] text-right">
                {resourceCounts[type] ?? 0}
              </span>
            </span>
          ))}
        </div>

        <div className="hidden items-center gap-1.5 rounded-lg border border-zinc-700/50 bg-zinc-800/60 px-1.5 py-0.5 md:flex">
          <span className="text-[10px] text-zinc-500">🐾</span>
          <span className="text-xs font-mono font-medium text-zinc-300">{alivePetCount}/{maxPetSlots}</span>
          <div className="h-1.5 w-6 overflow-hidden rounded-full bg-zinc-700">
            <div className={`h-full rounded-full ${slotColor} transition-all duration-500`} style={{ width: `${slotPct}%` }} />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="hidden text-[9px] font-bold tracking-wider text-cyan-600 md:inline">CE</span>
          <div className="h-2 w-16 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-zinc-700/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-700 via-cyan-500 to-cyan-400 transition-all duration-700"
              style={{ width: crystalPct + "%" }}
            />
          </div>
          <span className="text-[9px] font-mono font-medium text-cyan-400 tabular-nums">
            {crystalEnergy.toFixed(1)}
          </span>
        </div>

        <button
          onClick={onToggleNotifications}
          className="relative flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-all duration-200 hover:bg-zinc-700 hover:text-zinc-200 active:scale-95"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 6a4 4 0 0 0-8 0c0 4-2 5-2 5h12s-2-1-2-5" />
            <path d="M6.5 13a1.5 1.5 0 0 0 3 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-[14px] items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-red-600 px-1 text-[8px] font-bold text-white shadow-lg shadow-red-500/30">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {process.env.NODE_ENV === 'development' && (
          <button
            onClick={onToggleAdmin}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-zinc-700 hover:text-red-400"
            title="Admin"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="2" />
              <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
            </svg>
          </button>
        )}

        <div className="flex items-center gap-1 rounded-lg border border-zinc-700/50 bg-zinc-800/60">
          <a href="/codex" className="flex h-7 items-center gap-0.5 px-2 text-[10px] font-medium text-zinc-400 transition-colors hover:text-zinc-200" title="Monster Codex">
            <span className="text-xs">📖</span>
          </a>
          <a href="/leaderboard" className="flex h-7 items-center gap-0.5 px-2 text-[10px] font-medium text-zinc-400 transition-colors hover:text-zinc-200" title="Leaderboard">
            <span className="text-xs">🏅</span>
          </a>
        </div>

        <button
          onClick={onLogout}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-all duration-200 hover:bg-red-900/40 hover:text-red-400 active:scale-95"
          title="Logout"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 12H3V4h3M10 8h5M13 5l3 3-3 3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
