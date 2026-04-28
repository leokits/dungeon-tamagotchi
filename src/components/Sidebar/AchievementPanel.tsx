"use client";

import { useState, useEffect, useMemo } from "react";
import type { Achievement, PlayerAchievement, AchievementCategory } from "@/types/database";

type AchievementStatus = "locked" | "in-progress" | "completed";

interface EnrichedAchievement extends Achievement {
  playerProgress: PlayerAchievement | null;
  status: AchievementStatus;
  percentage: number;
  isClaimed: boolean;
}

const CATEGORIES: { key: AchievementCategory | "all"; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "\uD83C\uDFC6" },
  { key: "exploration", label: "Exploration", icon: "\uD83D\uDDFA\uFE0F" },
  { key: "collection", label: "Collection", icon: "\uD83D\uDC8E" },
  { key: "combat", label: "Combat", icon: "\u2694\uFE0F" },
  { key: "social", label: "Social", icon: "\uD83E\uDD1D" },
];

function getStatusIcon(status: AchievementStatus, isClaimed: boolean): React.ReactNode {
  if (isClaimed) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-400">
        \u2714
      </span>
    );
  }
  switch (status) {
    case "completed":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-400">
          \u2714
        </span>
      );
    case "in-progress":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[10px] text-amber-400">
          \u25CF
        </span>
      );
    case "locked":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-[10px] text-zinc-500">
          \uD83D\uDD12
        </span>
      );
  }
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-amber-500" />
    </div>
  );
}

export default function AchievementPanel() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [playerAchievements, setPlayerAchievements] = useState<PlayerAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<AchievementCategory | "all">("all");
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [achievementsRes, playerRes] = await Promise.all([
        fetch("/api/achievements"),
        fetch("/api/player-achievements"),
      ]);

      if (!achievementsRes.ok) {
        throw new Error("Failed to load achievements");
      }

      const achievementsData = await achievementsRes.json();
      setAchievements(achievementsData.achievements || []);

      if (playerRes.ok) {
        const playerData = await playerRes.json();
        setPlayerAchievements(playerData.player_achievements || []);
      } else {
        setPlayerAchievements([]);
      }
    } catch {
      setError("Failed to load achievements. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleClaim = async (playerAchievementId: string) => {
    setClaimingId(playerAchievementId);
    setClaimError(null);
    try {
      const res = await fetch(`/api/player-achievements/${playerAchievementId}/claim`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        const playerRes = await fetch("/api/player-achievements");
        if (playerRes.ok) {
          const playerData = await playerRes.json();
          setPlayerAchievements(playerData.player_achievements || []);
        }
      } else {
        setClaimError(data.error || "Failed to claim reward");
      }
    } catch {
      setClaimError("Error claiming reward");
    } finally {
      setClaimingId(null);
    }
  };

  const enrichedAchievements: EnrichedAchievement[] = useMemo(() => {
    const progressMap = new Map<string, PlayerAchievement>();
    for (const pa of playerAchievements) {
      progressMap.set(pa.achievement_id, pa);
    }

    return achievements.map((achievement) => {
      const playerProgress = progressMap.get(achievement.id) || null;
      const progress = playerProgress?.progress ?? 0;
      const isCompleted = !!playerProgress?.completed_at;
      const isClaimed = !!playerProgress?.claimed_at;
      const percentage = Math.min(100, Math.round((progress / achievement.target_value) * 100));

      let status: AchievementStatus = "locked";
      if (isCompleted) {
        status = "completed";
      } else if (progress > 0) {
        status = "in-progress";
      }

      return {
        ...achievement,
        playerProgress,
        status,
        percentage,
        isClaimed,
      };
    });
  }, [achievements, playerAchievements]);

  const filteredAchievements = useMemo(
    () =>
      activeCategory === "all"
        ? enrichedAchievements
        : enrichedAchievements.filter((a) => a.category === activeCategory),
    [enrichedAchievements, activeCategory]
  );

  const stats = useMemo(() => {
    const completed = enrichedAchievements.filter((a) => a.status === "completed").length;
    const inProgress = enrichedAchievements.filter((a) => a.status === "in-progress").length;
    return { total: enrichedAchievements.length, completed, inProgress };
  }, [enrichedAchievements]);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-zinc-800 px-3 py-2.5">
          <h2 className="text-sm font-semibold text-zinc-200">Achievements</h2>
        </div>
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-zinc-800 px-3 py-2.5">
          <h2 className="text-sm font-semibold text-zinc-200">Achievements</h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="w-full text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
              <span className="text-lg">\u26A0\uFE0F</span>
            </div>
            <p className="text-xs text-red-400 mb-3">{error}</p>
            <button
              onClick={loadData}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Achievements</h2>
          <div className="flex gap-2 text-[10px] text-zinc-500">
            <span className="text-emerald-400">{stats.completed} done</span>
            <span className="text-amber-400">{stats.inProgress} active</span>
          </div>
        </div>
      </div>

      <div className="flex border-b border-zinc-800 px-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
              activeCategory === cat.key
                ? "border-b-2 border-amber-400 text-amber-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className="mr-0.5">{cat.icon}</span>
            <span className="hidden sm:inline">{cat.label}</span>
          </button>
        ))}
      </div>

      {claimError && (
        <div className="mx-2 mt-2 rounded-lg bg-red-900/30 border border-red-800/50 px-2.5 py-1.5 text-[11px] text-red-400 flex items-center justify-between">
          <span>{claimError}</span>
          <button onClick={() => setClaimError(null)} className="text-red-300 hover:text-white ml-2">
            &times;
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {filteredAchievements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 text-2xl">\uD83C\uDFC6</div>
            <p className="text-xs text-zinc-400">No achievements found</p>
            <p className="mt-0.5 text-[11px] text-zinc-600">
              {activeCategory !== "all" ? "Try a different category" : "Achievements will appear here"}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredAchievements.map((achievement) => (
              <div
                key={achievement.id}
                className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-zinc-800/50"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-lg">
                  {achievement.icon}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-zinc-200">
                      {achievement.name}
                    </span>
                    {getStatusIcon(achievement.status, achievement.isClaimed)}
                  </div>
                  <p className="truncate text-[11px] text-zinc-400 mt-0.5">
                    {achievement.description}
                  </p>

                  <div className="mt-1.5">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                      <span>
                        {achievement.playerProgress?.progress ?? 0} / {achievement.target_value}
                      </span>
                      <span>{achievement.percentage}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          achievement.status === "completed"
                            ? "bg-emerald-500"
                            : achievement.status === "in-progress"
                              ? "bg-amber-500"
                              : "bg-zinc-600"
                        }`}
                        style={{ width: `${achievement.percentage}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {achievement.reward_dust > 0 && (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-amber-400">
                          \uD83D\uDC8E {achievement.reward_dust} dust
                        </span>
                      )}
                      {achievement.reward_title && (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-cyan-400">
                          \uD83C\uDFC5 {achievement.reward_title}
                        </span>
                      )}
                    </div>

                    {achievement.status === "completed" && !achievement.isClaimed && (
                      <button
                        onClick={() =>
                          achievement.playerProgress &&
                          handleClaim(achievement.playerProgress.id)
                        }
                        disabled={claimingId === achievement.playerProgress?.id}
                        className="rounded bg-amber-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {claimingId === achievement.playerProgress?.id
                          ? "Claiming..."
                          : "Claim Reward"}
                      </button>
                    )}

                    {achievement.isClaimed && (
                      <span className="text-[10px] text-emerald-400 font-medium">
                        Claimed \u2714
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
