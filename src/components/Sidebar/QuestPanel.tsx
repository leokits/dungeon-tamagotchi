"use client";

import { useState, useEffect, useCallback } from "react";
import type { Quest } from "@/types/database";

interface QuestWithProgress {
  quest: Quest | null;
  id: string;
  player_id: string;
  quest_id: string;
  progress: number;
  completed_at: string | null;
  claimed_at: string | null;
  refreshed_at: string;
}

interface QuestPanelData {
  quests: QuestWithProgress[];
  next_daily_refresh: number | null;
  next_weekly_refresh: number | null;
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "Refreshing...";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function getQuestStatus(pq: QuestWithProgress): "locked" | "in-progress" | "completed" | "claimed" {
  if (pq.claimed_at) return "claimed";
  if (pq.completed_at) return "completed";
  if (pq.progress >= (pq.quest?.target_value ?? 0)) return "completed";
  if (pq.progress === 0) return "locked";
  return "in-progress";
}

export default function QuestPanel() {
  const [data, setData] = useState<QuestPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/player-quests");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to load quests");
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Failed to load quests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClaim = async (playerQuestId: string) => {
    setClaimingId(playerQuestId);
    setClaimSuccess(null);
    try {
      const res = await fetch(`/api/player-quests/${playerQuestId}`, {
        method: "POST",
      });
      const body = await res.json();
      if (res.ok) {
        setClaimSuccess(`+${body.reward.dust} dust, +${body.reward.xp} XP`);
        await loadData();
        setTimeout(() => setClaimSuccess(null), 3000);
      } else {
        setError(body.error || "Failed to claim reward");
      }
    } catch {
      setError("Failed to claim reward");
    } finally {
      setClaimingId(null);
    }
  };

  const dailyQuests = data?.quests.filter((q) => q.quest?.type === "daily") ?? [];
  const weeklyQuests = data?.quests.filter((q) => q.quest?.type === "weekly") ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-2">
        <span className="py-2 text-xs font-medium text-zinc-200">Quests</span>
        <button onClick={loadData} className="px-2 text-zinc-500 hover:text-white" title="Refresh">
          &#x21bb;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-zinc-500">Loading quests...</p>
          </div>
        )}

        {error && (
          <div className="mb-2 rounded-lg bg-red-900/30 border border-red-800/50 p-2 text-xs text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">&times;</button>
          </div>
        )}

        {claimSuccess && (
          <div className="mb-2 rounded-lg bg-green-900/30 border border-green-800/50 p-2 text-xs text-green-400">
            Reward claimed: {claimSuccess}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="mb-4">
              <div className="text-sm font-semibold text-zinc-200 flex items-center justify-between mb-2">
                <span>Daily Quests</span>
                {data?.next_daily_refresh != null && (
                  <span className="text-xs text-zinc-500">
                    Refreshes in {formatTimeRemaining(data.next_daily_refresh)}
                  </span>
                )}
              </div>

              {dailyQuests.length === 0 ? (
                <div className="rounded-lg bg-zinc-800/50 p-4 text-center">
                  <div className="text-2xl mb-1">&#x1F4DC;</div>
                  <p className="text-xs text-zinc-400">No daily quests available</p>
                  <p className="text-xs text-zinc-600 mt-0.5">Check back after refresh</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {dailyQuests.map((pq) => (
                    <QuestItem
                      key={pq.id}
                      pq={pq}
                      onClaim={handleClaim}
                      isClaiming={claimingId === pq.id}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-sm font-semibold text-zinc-200 flex items-center justify-between mb-2">
                <span>Weekly Quests</span>
                {data?.next_weekly_refresh != null && (
                  <span className="text-xs text-zinc-500">
                    Refreshes in {formatTimeRemaining(data.next_weekly_refresh)}
                  </span>
                )}
              </div>

              {weeklyQuests.length === 0 ? (
                <div className="rounded-lg bg-zinc-800/50 p-4 text-center">
                  <div className="text-2xl mb-1">&#x1F4DC;</div>
                  <p className="text-xs text-zinc-400">No weekly quests available</p>
                  <p className="text-xs text-zinc-600 mt-0.5">Check back after refresh</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {weeklyQuests.map((pq) => (
                    <QuestItem
                      key={pq.id}
                      pq={pq}
                      onClaim={handleClaim}
                      isClaiming={claimingId === pq.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface QuestItemProps {
  pq: QuestWithProgress;
  onClaim: (id: string) => void;
  isClaiming: boolean;
}

function QuestItem({ pq, onClaim, isClaiming }: QuestItemProps) {
  const quest = pq.quest;
  if (!quest) return null;

  const status = getQuestStatus(pq);
  const progressPercent = Math.min(100, Math.round((pq.progress / quest.target_value) * 100));

  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-lg bg-zinc-800/30 ${status === "claimed" ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-medium text-zinc-200 truncate">{quest.name}</span>
          <span className={`text-[10px] font-medium ml-2 flex-shrink-0 ${
            status === "completed" ? "text-green-400" :
            status === "claimed" ? "text-zinc-500" :
            status === "in-progress" ? "text-cyan-400" :
            "text-zinc-500"
          }`}>
            {status === "completed" ? "Complete" :
             status === "claimed" ? "Claimed" :
             status === "in-progress" ? "In Progress" :
             "Locked"}
          </span>
        </div>

        <p className="text-[10px] text-zinc-500 truncate mb-1.5">{quest.description}</p>

        <div className="flex items-center gap-2 mb-1.5">
          <div className="h-2 rounded-full bg-zinc-700 overflow-hidden flex-1">
            <div
              className="h-full rounded-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-zinc-400 flex-shrink-0">
            {pq.progress}/{quest.target_value}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[10px] text-amber-400">
            {quest.reward_dust} dust
          </span>
          <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[10px] text-purple-400">
            {quest.reward_xp} XP
          </span>
          {quest.reward_cosmetic && (
            <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[10px] text-pink-400">
              Cosmetic
            </span>
          )}
        </div>
      </div>

      {status === "completed" && (
        <button
          onClick={() => onClaim(pq.id)}
          disabled={isClaiming}
          className="rounded bg-cyan-600 px-3 py-1 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 transition-colors"
        >
          {isClaiming ? "Claiming..." : "Claim"}
        </button>
      )}
    </div>
  );
}
