import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Quest, PlayerQuest } from "@/types/database";

const REFRESH_PERIODS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

async function refreshPlayerQuestsIfNeeded(
  serviceSupabase: ReturnType<typeof createServiceClient>,
  playerId: string
): Promise<PlayerQuest[]> {
  const { data: playerQuests, error: pqError } = await serviceSupabase
    .from("player_quests")
    .select("*, quests(*)")
    .eq("player_id", playerId);

  if (pqError || !playerQuests || playerQuests.length === 0) {
    return createFreshPlayerQuests(serviceSupabase, playerId);
  }

  const now = Date.now();
  let needsRefresh = false;

  for (const pq of playerQuests) {
    const quest = pq.quests as Quest | null;
    if (!quest) continue;

    const refreshPeriod = REFRESH_PERIODS[quest.type as "daily" | "weekly"] || REFRESH_PERIODS.daily;
    const refreshedAt = new Date(pq.refreshed_at).getTime();

    if (now - refreshedAt >= refreshPeriod) {
      needsRefresh = true;
      break;
    }
  }

  if (needsRefresh) {
    await serviceSupabase.from("player_quests").delete().eq("player_id", playerId);
    return await createFreshPlayerQuests(serviceSupabase, playerId);
  }

  const { data: cleanPlayerQuests } = await serviceSupabase
    .from("player_quests")
    .select("*")
    .eq("player_id", playerId);

  return (cleanPlayerQuests || []) as PlayerQuest[];
}

async function createFreshPlayerQuests(
  serviceSupabase: ReturnType<typeof createServiceClient>,
  playerId: string
): Promise<PlayerQuest[]> {
  const { data: activeQuests } = await serviceSupabase
    .from("quests")
    .select("*")
    .eq("is_active", true);

  if (!activeQuests || activeQuests.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const playerQuestRows = activeQuests.map((q: Quest) => ({
    player_id: playerId,
    quest_id: q.id,
    progress: 0,
    completed_at: null,
    claimed_at: null,
    refreshed_at: now,
  }));

  const { data: inserted, error } = await serviceSupabase
    .from("player_quests")
    .insert(playerQuestRows)
    .select();

  if (error) {
    console.error("Failed to create fresh player quests:", error);
    return [];
  }

  return (inserted || []) as PlayerQuest[];
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

  const playerQuests = await refreshPlayerQuestsIfNeeded(serviceSupabase, player.id);

  const questIds = playerQuests.map((pq) => pq.quest_id);
  const { data: quests } = await serviceSupabase
    .from("quests")
    .select("*")
    .in("id", questIds);

  const questMap = new Map<string, Quest>();
  for (const q of quests || []) {
    questMap.set(q.id, q as Quest);
  }

  const combined = playerQuests.map((pq) => ({
    ...pq,
    quest: questMap.get(pq.quest_id) || null,
  }));

  const now = Date.now();
  let nextDailyRefresh = Infinity;
  let nextWeeklyRefresh = Infinity;

  for (const pq of playerQuests) {
    const quest = questMap.get(pq.quest_id);
    if (!quest) continue;

    const refreshPeriod = REFRESH_PERIODS[quest.type as "daily" | "weekly"] || REFRESH_PERIODS.daily;
    const refreshedAt = new Date(pq.refreshed_at).getTime();
    const expiresAt = refreshedAt + refreshPeriod;
    const timeLeft = expiresAt - now;

    if (quest.type === "daily" && timeLeft < nextDailyRefresh) {
      nextDailyRefresh = timeLeft;
    }
    if (quest.type === "weekly" && timeLeft < nextWeeklyRefresh) {
      nextWeeklyRefresh = timeLeft;
    }
  }

  return NextResponse.json({
    quests: combined,
    next_daily_refresh: nextDailyRefresh === Infinity ? null : nextDailyRefresh,
    next_weekly_refresh: nextWeeklyRefresh === Infinity ? null : nextWeeklyRefresh,
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
  const { quest_id, progress } = body as { quest_id: string; progress: number };

  if (!quest_id || progress === undefined) {
    return NextResponse.json(
      { error: "quest_id and progress are required" },
      { status: 400 }
    );
  }

  const { data: updated, error } = await serviceSupabase
    .from("player_quests")
    .update({ progress })
    .eq("player_id", player.id)
    .eq("quest_id", quest_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ player_quest: updated }, { status: 200 });
}
