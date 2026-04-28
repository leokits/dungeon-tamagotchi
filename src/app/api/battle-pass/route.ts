import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { BattlePassSeason, BattlePassProgress } from "@/types/database";

const XP_PER_TIER = 100;
const TOTAL_TIERS = 50;
const TOTAL_XP = XP_PER_TIER * TOTAL_TIERS;
const PREMIUM_COST = 500;

interface TierReward {
  tier: number;
  free: { icon: string; name: string; type: string };
  premium: { icon: string; name: string; type: string };
}

function getTierReward(tier: number): TierReward {
  const freeRewards: TierReward["free"][] = [
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

  const premiumRewards: TierReward["premium"][] = [
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
  const dustMultiplier = Math.floor((tier - 1) / 10) + 1;

  const free = { ...freeRewards[idx] };
  const premium = { ...premiumRewards[idx] };

  if (free.type === "chrono_dust") {
    free.name = `${50 * dustMultiplier} Chrono Dust`;
  }
  if (premium.type === "chrono_dust") {
    premium.name = `${200 * dustMultiplier} Chrono Dust`;
  }

  return { tier, free, premium };
}

function getDaysRemaining(endDate: string): number {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  const diff = end - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

async function getOrCreateProgress(
  serviceSupabase: ReturnType<typeof createServiceClient>,
  playerId: string,
  seasonId: string
): Promise<BattlePassProgress> {
  const { data: existing } = await serviceSupabase
    .from("battle_pass_progress")
    .select("*")
    .eq("player_id", playerId)
    .eq("season_id", seasonId)
    .single();

  if (existing) {
    return existing as BattlePassProgress;
  }

  const { data: inserted, error } = await serviceSupabase
    .from("battle_pass_progress")
    .insert({
      player_id: playerId,
      season_id: seasonId,
      tier: 0,
      xp: 0,
      has_premium: false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create battle pass progress: ${error.message}`);
  }

  return inserted as BattlePassProgress;
}

export async function GET() {
  const supabase = await createClient();
  const serviceSupabase = createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: season } = await serviceSupabase
    .from("battle_pass_seasons")
    .select("*")
    .eq("is_active", true)
    .single();

  if (!season) {
    return NextResponse.json({ error: "No active season" }, { status: 404 });
  }

  const progress = await getOrCreateProgress(serviceSupabase, player.id, season.id);

  const currentTier = Math.min(
    TOTAL_TIERS,
    Math.floor(progress.xp / XP_PER_TIER)
  );
  const xpForNextTier = Math.min(
    XP_PER_TIER,
    progress.xp - currentTier * XP_PER_TIER
  );

  const claimedFreeTiers = progress.claimed_free_tiers || [];
  const claimedPremiumTiers = progress.claimed_premium_tiers || [];

  return NextResponse.json({
    season: {
      id: season.id,
      name: season.name,
      start_date: season.start_date,
      end_date: season.end_date,
      days_remaining: getDaysRemaining(season.end_date),
      total_tiers: TOTAL_TIERS,
    },
    player: {
      current_tier: currentTier,
      xp: progress.xp,
      xp_for_next_tier: xpForNextTier,
      is_premium: progress.has_premium,
      claimed_free_tiers: claimedFreeTiers,
      claimed_premium_tiers: claimedPremiumTiers,
    },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const serviceSupabase = createServiceClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const body = await request.json();
  const { action, tier, is_premium } = body as {
    action?: string;
    tier?: number;
    is_premium?: boolean;
  };

  if (action === "activate-premium") {
    return handleActivatePremium(serviceSupabase, player.id);
  }

  if (action === "claim") {
    if (!tier || is_premium === undefined) {
      return NextResponse.json(
        { error: "tier and is_premium are required" },
        { status: 400 }
      );
    }
    return handleClaimTier(serviceSupabase, player.id, tier, is_premium);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

async function handleActivatePremium(
  serviceSupabase: ReturnType<typeof createServiceClient>,
  playerId: string
) {
  const { data: player, error: playerError } = await serviceSupabase
    .from("players")
    .select("chrono_dust")
    .eq("id", playerId)
    .single();

  if (playerError || !player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  if (player.chrono_dust < PREMIUM_COST) {
    return NextResponse.json(
      { error: `Not enough chrono dust. Need ${PREMIUM_COST}, have ${player.chrono_dust}` },
      { status: 400 }
    );
  }

  const { data: season } = await serviceSupabase
    .from("battle_pass_seasons")
    .select("id")
    .eq("is_active", true)
    .single();

  if (!season) {
    return NextResponse.json({ error: "No active season" }, { status: 404 });
  }

  const progress = await getOrCreateProgress(serviceSupabase, playerId, season.id);

  if (progress.has_premium) {
    return NextResponse.json({ error: "Premium already activated" }, { status: 400 });
  }

  const { error: dustError } = await serviceSupabase
    .from("players")
    .update({ chrono_dust: player.chrono_dust - PREMIUM_COST })
    .eq("id", playerId);

  if (dustError) {
    return NextResponse.json({ error: dustError.message }, { status: 500 });
  }

  const { error: progressError } = await serviceSupabase
    .from("battle_pass_progress")
    .update({ has_premium: true })
    .eq("player_id", playerId)
    .eq("season_id", season.id);

  if (progressError) {
    await serviceSupabase
      .from("players")
      .update({ chrono_dust: player.chrono_dust })
      .eq("id", playerId);

    return NextResponse.json({ error: progressError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

async function handleClaimTier(
  serviceSupabase: ReturnType<typeof createServiceClient>,
  playerId: string,
  tier: number,
  isPremium: boolean
) {
  if (tier < 1 || tier > TOTAL_TIERS) {
    return NextResponse.json(
      { error: `Tier must be between 1 and ${TOTAL_TIERS}` },
      { status: 400 }
    );
  }

  const { data: season } = await serviceSupabase
    .from("battle_pass_seasons")
    .select("id")
    .eq("is_active", true)
    .single();

  if (!season) {
    return NextResponse.json({ error: "No active season" }, { status: 404 });
  }

  const progress = await getOrCreateProgress(serviceSupabase, playerId, season.id);

  const playerTier = Math.floor(progress.xp / XP_PER_TIER);
  if (playerTier < tier) {
    return NextResponse.json(
      { error: `Tier ${tier} not completed. Current tier: ${playerTier}` },
      { status: 400 }
    );
  }

  const claimedFreeTiers = progress.claimed_free_tiers || [];
  const claimedPremiumTiers = progress.claimed_premium_tiers || [];

  if (isPremium) {
    if (!progress.has_premium) {
      return NextResponse.json(
        { error: "Premium pass not activated" },
        { status: 400 }
      );
    }
    if (claimedPremiumTiers.includes(tier)) {
      return NextResponse.json(
        { error: "Premium reward already claimed" },
        { status: 400 }
      );
    }
  } else {
    if (claimedFreeTiers.includes(tier)) {
      return NextResponse.json(
        { error: "Free reward already claimed" },
        { status: 400 }
      );
    }
  }

  const reward = getTierReward(tier);
  const rewardData = isPremium ? reward.premium : reward.free;

  const newClaimedTiers = isPremium
    ? [...claimedPremiumTiers, tier]
    : [...claimedFreeTiers, tier];

  const columnName = isPremium ? "claimed_premium_tiers" : "claimed_free_tiers";

  const { error: updateError } = await serviceSupabase
    .from("battle_pass_progress")
    .update({ [columnName]: newClaimedTiers })
    .eq("player_id", playerId)
    .eq("season_id", season.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (rewardData.type === "chrono_dust") {
    const dustAmount = parseInt(rewardData.name.split(" ")[0], 10);
    if (!isNaN(dustAmount)) {
      const { data: playerData } = await serviceSupabase
        .from("players")
        .select("chrono_dust")
        .eq("id", playerId)
        .single();

      if (playerData) {
        await serviceSupabase
          .from("players")
          .update({ chrono_dust: playerData.chrono_dust + dustAmount })
          .eq("id", playerId);
      }
    }
  }

  return NextResponse.json({
    success: true,
    reward: rewardData,
  });
}
