"use client";

import { useState, useEffect, useCallback } from "react";

type Category = "strongest_pet" | "most_raids_won" | "richest" | "most_evolved" | "highest_level";
type Timeframe = "weekly" | "monthly" | "all";

interface LeaderboardEntry {
  rank: number;
  player_name: string;
  value: number;
  avatar_cosmetic: string | null;
}

interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  category: string;
  timeframe: string;
  last_updated: string;
  current_player_id: string | null;
}

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: "strongest_pet", label: "Strongest Pet", icon: "🐾" },
  { key: "most_raids_won", label: "Raids Won", icon: "⚔️" },
  { key: "richest", label: "Richest", icon: "✦" },
  { key: "most_evolved", label: "Most Evolved", icon: "🧬" },
  { key: "highest_level", label: "Highest Level", icon: "⭐" },
];

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "all", label: "All Time" },
];

const RANK_ICONS = ["🥇", "🥈", "🥉"];

function formatValue(category: Category, value: number): string {
  switch (category) {
    case "strongest_pet":
      return `Lv ${value}`;
    case "most_raids_won":
      return `${value} wins`;
    case "richest":
      return `${value.toLocaleString()} dust`;
    case "most_evolved":
      return `${value} pets`;
    case "highest_level":
      return `Lv ${value}`;
  }
}

export default function Leaderboard() {
  const [category, setCategory] = useState<Category>("strongest_pet");
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?category=${category}&timeframe=${timeframe}`);
      if (res.ok) {
        const data: LeaderboardResponse = await res.json();
        setEntries(data.entries);
        setCurrentPlayerId(data.current_player_id);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [category, timeframe]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  useEffect(() => {
    const interval = setInterval(fetchLeaderboard, 60_000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  useEffect(() => {
    const handleClick = () => setShowTimeDropdown(false);
    if (showTimeDropdown) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [showTimeDropdown]);

  const currentTimeLabel = TIMEFRAMES.find((t) => t.key === timeframe)?.label ?? "All Time";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-bold text-amber-400">Leaderboard</h1>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                category === cat.key
                  ? "bg-amber-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
            >
              <span className="mr-1">{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowTimeDropdown((v) => !v);
            }}
            className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
          >
            {currentTimeLabel}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M2 4l3 3 3-3" />
            </svg>
          </button>
          {showTimeDropdown && (
            <div className="absolute right-0 top-full z-10 mt-1 w-32 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTimeframe(tf.key);
                    setShowTimeDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                    timeframe === tf.key
                      ? "bg-amber-600 text-white"
                      : "text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <span className="text-2xl">🏆</span>
            <p className="text-sm text-zinc-500">No entries yet for this category</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="w-12 px-3 py-2 text-center">#</th>
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const rankIcon = entry.rank <= 3 ? RANK_ICONS[entry.rank - 1] : entry.rank;
                const rankBg =
                  entry.rank === 1
                    ? "bg-amber-500/10"
                    : entry.rank === 2
                      ? "bg-zinc-400/10"
                      : entry.rank === 3
                        ? "bg-orange-700/10"
                        : "";

                return (
                  <tr
                    key={entry.rank}
                    className={`border-b border-zinc-800/50 transition-colors ${rankBg}`}
                  >
                    <td className="w-12 px-3 py-2.5 text-center font-mono text-zinc-400">
                      {rankIcon}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-zinc-200">{entry.player_name}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-zinc-300">
                      {formatValue(category, entry.value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {entries.length > 0 && (
        <p className="mt-2 text-right text-[10px] text-zinc-600">
          Updated {new Date().toLocaleTimeString()} · Auto-refreshes every 60s
        </p>
      )}
    </div>
  );
}
