import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const VALID_CATEGORIES = [
  "strongest_pet",
  "most_raids_won",
  "richest",
  "most_evolved",
  "highest_level",
] as const;

const VALID_TIMEFRAMES = ["weekly", "monthly", "all"] as const;

type Category = (typeof VALID_CATEGORIES)[number];
type Timeframe = (typeof VALID_TIMEFRAMES)[number];

function getDateFilter(timeframe: Timeframe): string | null {
  if (timeframe === "all") return null;
  const now = new Date();
  const days = timeframe === "weekly" ? 7 : 30;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

async function getStrongestPet(since: string | null) {
  const supabase = createServiceClient();
  let query = supabase
    .from("pets")
    .select("player_id, level")
    .eq("status", "alive")
    .order("level", { ascending: false })
    .limit(100);

  if (since) {
    query = query.gte("updated_at", since);
  }

  const { data } = await query;
  if (!data || data.length === 0) return [];

  const playerMax = new Map<string, number>();
  for (const pet of data) {
    const current = playerMax.get(pet.player_id) ?? 0;
    if (pet.level > current) playerMax.set(pet.player_id, pet.level);
  }

  return Array.from(playerMax.entries())
    .map(([player_id, score]) => ({ player_id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);
}

async function getMostRaidsWon(since: string | null) {
  const supabase = createServiceClient();
  let query = supabase
    .from("raids")
    .select("attacker_id, result")
    .eq("result", "attacker_win");

  if (since) {
    query = query.gte("created_at", since);
  }

  const { data } = await query;
  if (!data || data.length === 0) return [];

  const playerWins = new Map<string, number>();
  for (const raid of data) {
    playerWins.set(raid.attacker_id, (playerWins.get(raid.attacker_id) ?? 0) + 1);
  }

  return Array.from(playerWins.entries())
    .map(([player_id, score]) => ({ player_id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);
}

async function getRichest(since: string | null) {
  const supabase = createServiceClient();
  let query = supabase
    .from("players")
    .select("id, chrono_dust")
    .order("chrono_dust", { ascending: false })
    .limit(100);

  if (since) {
    query = query.gte("updated_at", since);
  }

  const { data } = await query;
  if (!data || data.length === 0) return [];

  return data.map((p) => ({ player_id: p.id, score: p.chrono_dust }));
}

async function getMostEvolved(since: string | null) {
  const supabase = createServiceClient();
  let query = supabase
    .from("pets")
    .select("player_id, evolution_stage")
    .eq("status", "alive")
    .gte("evolution_stage", 3);

  if (since) {
    query = query.gte("updated_at", since);
  }

  const { data } = await query;
  if (!data || data.length === 0) return [];

  const playerCount = new Map<string, number>();
  for (const pet of data) {
    playerCount.set(pet.player_id, (playerCount.get(pet.player_id) ?? 0) + 1);
  }

  return Array.from(playerCount.entries())
    .map(([player_id, score]) => ({ player_id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);
}

async function getHighestLevel(since: string | null) {
  const supabase = createServiceClient();
  let query = supabase
    .from("players")
    .select("id, level")
    .order("level", { ascending: false })
    .limit(100);

  if (since) {
    query = query.gte("updated_at", since);
  }

  const { data } = await query;
  if (!data || data.length === 0) return [];

  return data.map((p) => ({ player_id: p.id, score: p.level }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const timeframe = searchParams.get("timeframe") ?? "all";

  if (!category || !VALID_CATEGORIES.includes(category as Category)) {
    return NextResponse.json(
      { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!VALID_TIMEFRAMES.includes(timeframe as Timeframe)) {
    return NextResponse.json(
      { error: `Invalid timeframe. Must be one of: ${VALID_TIMEFRAMES.join(", ")}` },
      { status: 400 }
    );
  }

  const since = getDateFilter(timeframe as Timeframe);

  let scores: { player_id: string; score: number }[] = [];

  switch (category as Category) {
    case "strongest_pet":
      scores = await getStrongestPet(since);
      break;
    case "most_raids_won":
      scores = await getMostRaidsWon(since);
      break;
    case "richest":
      scores = await getRichest(since);
      break;
    case "most_evolved":
      scores = await getMostEvolved(since);
      break;
    case "highest_level":
      scores = await getHighestLevel(since);
      break;
  }

  if (scores.length === 0) {
    return NextResponse.json({
      entries: [],
      category,
      timeframe,
      last_updated: new Date().toISOString(),
    });
  }

  const playerIds = scores.map((s) => s.player_id);
  const supabase = createServiceClient();
  const { data: players } = await supabase
    .from("players")
    .select("id, username, avatar_cosmetic")
    .in("id", playerIds);

  const playerMap = new Map(
    (players ?? []).map((p) => [p.id, { username: p.username, avatar_cosmetic: p.avatar_cosmetic }])
  );

  const entries = scores.map((s, index) => ({
    rank: index + 1,
    player_name: playerMap.get(s.player_id)?.username ?? "Unknown",
    value: s.score,
    avatar_cosmetic: playerMap.get(s.player_id)?.avatar_cosmetic ?? null,
  }));

  const serverClient = await createClient();
  const {
    data: { user },
  } = await serverClient.auth.getUser();

  let currentPlayerId: string | null = null;
  if (user) {
    const { data: me } = await serverClient
      .from("players")
      .select("id")
      .eq("auth_id", user.id)
      .single();
    currentPlayerId = me?.id ?? null;
  }

  return NextResponse.json({
    entries,
    category,
    timeframe,
    last_updated: new Date().toISOString(),
    current_player_id: currentPlayerId,
  });
}
