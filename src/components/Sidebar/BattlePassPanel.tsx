"use client";

import { useState, useEffect, useCallback } from "react";

const TOTAL_TIERS = 50;
const TOTAL_XP = 5000;
const PREMIUM_COST = 500;

interface SeasonInfo {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  days_remaining: number;
  total_tiers: number;
}

interface PlayerProgress {
  current_tier: number;
  xp: number;
  xp_for_next_tier: number;
  is_premium: boolean;
  claimed_free_tiers: number[];
  claimed_premium_tiers: number[];
}

interface BattlePassData {
  season: SeasonInfo;
  player: PlayerProgress;
}

interface TierReward {
  icon: string;
  name: string;
  type: string;
}

function getTierReward(tier: number, isPremium: boolean): TierReward {
  const freeRewards: TierReward[] = [
    { icon: "💎", name: "50 Chrono Dust", type: "chrono_dust" },
    { icon: "⚡", name: "XP Boost (1h)", type: "xp_boost" },
    { icon: "🎨", name: "Common Frame", type: "cosmetic" },
    { icon: "💎", name: "75 Chrono Dust", type: "chrono_dust" },
    { icon: "🍄", name: "Mushroom Emote", type: "emote" },
    { icon: "💎", name: "100 Chrono Dust", type: "chrono_dust" },
    { icon: "⚡", name: "XP Boost (2h)", type: "xp_boost" },
    { icon: "🎨", name: "Common Banner", type: "cosmetic" },
    { icon: "💎", name: "125 Chrono Dust", type: "chrono_dust" },
    { icon: "🔥", name: "Fire Title", type: "title" },
  ];

  const premiumRewards: TierReward[] = [
    { icon: "✨", name: "Exclusive Skin Shard", type: "cosmetic" },
    { icon: "👑", name: "Royal Title", type: "title" },
    { icon: "💫", name: "Sparkle Emote", type: "emote" },
    { icon: "🌟", name: "Rare Frame", type: "cosmetic" },
    { icon: "🎭", name: "Shadow Emote", type: "emote" },
    { icon: "💎", name: "200 Chrono Dust", type: "chrono_dust" },
    { icon: "🏆", name: "Champion Title", type: "title" },
    { icon: "🌈", name: "Rainbow Effect", type: "cosmetic" },
    { icon: "⚔️", name: "Legendary Emote", type: "emote" },
    { icon: "🐉", name: "Dragon Skin", type: "cosmetic" },
  ];

  const idx = (tier - 1) % 10;
  const rewards = isPremium ? premiumRewards : freeRewards;
  const reward = { ...rewards[idx] };

  if (reward.type === "chrono_dust") {
    const dustMultiplier = Math.floor((tier - 1) / 10) + 1;
    const base = isPremium ? 200 : 50;
    reward.name = `${base * dustMultiplier} Chrono Dust`;
  }

  return reward;
}

export default function BattlePassPanel() {
  const [data, setData] = useState<BattlePassData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/battle-pass");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to load battle pass");
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Failed to load battle pass");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClaim = async (tier: number, isPremium: boolean) => {
    const key = `${isPremium ? "p" : "f"}-${tier}`;
    setClaiming(key);
    setSuccess(null);
    try {
      const res = await fetch("/api/battle-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim", tier, is_premium: isPremium }),
      });
      const body = await res.json();
      if (res.ok) {
        setSuccess(`Claimed: ${body.reward.icon} ${body.reward.name}`);
        await loadData();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(body.error || "Failed to claim reward");
      }
    } catch {
      setError("Failed to claim reward");
    } finally {
      setClaiming(null);
    }
  };

  const handleActivatePremium = async () => {
    setActivating(true);
    setSuccess(null);
    try {
      const res = await fetch("/api/battle-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate-premium" }),
      });
      const body = await res.json();
      if (res.ok) {
        setSuccess("Premium activated!");
        await loadData();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(body.error || "Failed to activate premium");
      }
    } catch {
      setError("Failed to activate premium");
    } finally {
      setActivating(false);
    }
  };

  const xpPercent = data ? Math.min(100, (data.player.xp / TOTAL_XP) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-2">
        <span className="py-2 text-xs font-medium text-zinc-200">Battle Pass</span>
        <button onClick={loadData} className="px-2 text-zinc-500 hover:text-white" title="Refresh">
          &#x21bb;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-zinc-500">Loading battle pass...</p>
          </div>
        )}

        {error && (
          <div className="mb-2 rounded-lg bg-red-900/30 border border-red-800/50 p-2 text-xs text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">&times;</button>
          </div>
        )}

        {success && (
          <div className="mb-2 rounded-lg bg-green-900/30 border border-green-800/50 p-2 text-xs text-green-400">
            {success}
          </div>
        )}

        {!loading && data && (
          <>
            <div className="rounded-lg bg-gradient-to-r from-amber-900/50 to-purple-900/50 border border-amber-700/50 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-amber-300">{data.season.name}</h3>
                <span className="text-xs text-zinc-400">{data.season.days_remaining} days left</span>
              </div>

              <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-400">
                <span>Tier {data.player.current_tier} / {TOTAL_TIERS}</span>
                <span>{data.player.xp} / {TOTAL_XP} XP</span>
              </div>
              <div className="h-3 rounded-full bg-zinc-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${xpPercent}%` }}
                />
              </div>

              {!data.player.is_premium && (
                <button
                  onClick={handleActivatePremium}
                  disabled={activating}
                  className="mt-3 w-full rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {activating ? "Activating..." : `Activate Premium — ${PREMIUM_COST} Dust`}
                </button>
              )}

              {data.player.is_premium && (
                <div className="mt-2 text-center text-[10px] text-amber-400 font-medium">
                  ✨ Premium Active
                </div>
              )}
            </div>

            <div className="mb-3">
              <div className="text-xs text-zinc-500 mb-1">Free Rewards</div>
              <TierTrack
                tiers={TOTAL_TIERS}
                currentTier={data.player.current_tier}
                claimedTiers={data.player.claimed_free_tiers}
                isPremium={false}
                playerHasPremium={data.player.is_premium}
                claiming={claiming}
                onClaim={handleClaim}
              />
            </div>

            <div>
              <div className="text-xs text-amber-500 mb-1">Premium Rewards</div>
              <TierTrack
                tiers={TOTAL_TIERS}
                currentTier={data.player.current_tier}
                claimedTiers={data.player.claimed_premium_tiers}
                isPremium={true}
                playerHasPremium={data.player.is_premium}
                claiming={claiming}
                onClaim={handleClaim}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface TierTrackProps {
  tiers: number;
  currentTier: number;
  claimedTiers: number[];
  isPremium: boolean;
  playerHasPremium: boolean;
  claiming: string | null;
  onClaim: (tier: number, isPremium: boolean) => void;
}

function TierTrack({ tiers, currentTier, claimedTiers, isPremium, playerHasPremium, claiming, onClaim }: TierTrackProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
      {Array.from({ length: tiers }, (_, i) => i + 1).map((tier) => {
        const reward = getTierReward(tier, isPremium);
        const isClaimed = claimedTiers.includes(tier);
        const isClaimable = currentTier >= tier && !isClaimed;
        const isLocked = currentTier < tier;

        const cardKey = `${isPremium ? "p" : "f"}-${tier}`;
        const isClaiming = claiming === cardKey;

        const borderClass = isClaimed
          ? "border-green-600 bg-green-900/20"
          : isClaimable
            ? "border-amber-600 bg-amber-900/20 animate-pulse"
            : "border-zinc-700 bg-zinc-800/30";

        return (
          <div
            key={tier}
            className={`relative min-w-[80px] rounded-lg p-2 text-center snap-center border ${borderClass}`}
          >
            <div className="text-[10px] text-zinc-500 mb-1">#{tier}</div>
            <div className="text-lg mb-0.5">{reward.icon}</div>
            <div className="text-[9px] text-zinc-400 truncate">{reward.name}</div>

            {isClaimed && (
              <div className="absolute top-1 right-1 text-green-400 text-xs">✓</div>
            )}

            {isClaimable && (
              <button
                onClick={() => onClaim(tier, isPremium)}
                disabled={isClaiming}
                className="mt-1 w-full rounded bg-amber-600 px-1 py-0.5 text-[9px] font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isClaiming ? "..." : "Claim"}
              </button>
            )}

            {isLocked && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                <span className="text-zinc-500 text-sm">🔒</span>
              </div>
            )}

            {isPremium && !playerHasPremium && !isClaimed && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                <span className="text-amber-500 text-[9px] font-medium">Premium</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
