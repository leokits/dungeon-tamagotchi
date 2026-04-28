"use client";

import type { Player, Dungeon } from "@/types/database";

interface TopBarProps {
  player: Player | null;
  dungeon: Dungeon | null;
  unreadCount: number;
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
  player, dungeon, unreadCount,
  onToggleNotifications, onToggleAdmin, onLogout, onToggleSidebar, sidebarOpen,
}: TopBarProps) {
  const crystalEnergy = dungeon?.crystal_energy ?? 0;
  const crystalPct = Math.min(100, crystalEnergy);

  return (
    <div className="absolute left-0 right-0 top-0 z-40 flex h-12 items-center justify-between border-b border-zinc-800 bg-zinc-900/95 px-3 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11 3L6 8l5 5" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 3l5 5-5 5" />
            </svg>
          )}
        </button>

        <span className="text-sm font-medium text-amber-400">{player?.username || "Unknown"}</span>

        <div className="flex items-center gap-1.5 rounded bg-zinc-800 px-2 py-0.5">
          <span className="text-[10px] font-semibold text-zinc-500">Lv</span>
          <span className="text-xs font-mono text-zinc-200">1</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-amber-400">✦</span>
          <span className="text-xs font-mono text-zinc-300">{player?.chrono_dust ?? 0}</span>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          {Object.entries(RESOURCE_EMOJIS).map(([type, emoji]) => (
            <span key={type} className="flex items-center gap-0.5 text-xs" title={type}>
              <span>{emoji}</span>
              <span className="font-mono text-zinc-500">0</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-cyan-400">CE</span>
          <div className="h-2 w-20 overflow-hidden rounded-full bg-zinc-700">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-500"
              style={{ width: crystalPct + "%" }}
            />
          </div>
          <span className="text-[10px] font-mono text-zinc-400">{crystalEnergy.toFixed(1)}</span>
        </div>

        <button
          onClick={onToggleNotifications}
          className="relative flex h-7 w-7 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 6a4 4 0 0 0-8 0c0 4-2 5-2 5h12s-2-1-2-5" />
            <path d="M6.5 13a1.5 1.5 0 0 0 3 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-[14px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white dt-badge-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        <button
          onClick={onToggleAdmin}
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          title="Admin"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="2" />
            <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
          </svg>
        </button>

        <a href="/codex" className="flex h-7 items-center gap-1 rounded px-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200" title="Monster Codex">
          <span>📖</span>
          <span className="hidden sm:inline">Codex</span>
        </a>

        <a href="/leaderboard" className="flex h-7 items-center gap-1 rounded px-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200" title="Leaderboard">
          <span>🏅</span>
          <span className="hidden sm:inline">Ranks</span>
        </a>

        <button
          onClick={onLogout}
          className="flex h-7 items-center gap-1 rounded px-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M6 12H3V4h3M10 8h5M13 5l3 3-3 3" />
          </svg>
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </div>
  );
}
