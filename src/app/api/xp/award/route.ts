import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  calcLevel,
  calcXpReward,
  getLevelUnlocks,
  XP_SOURCES,
} from "@/game/xp-system";

const VALID_SOURCES = Object.keys(XP_SOURCES) as Array<keyof typeof XP_SOURCES>;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { source, count } = body as { source?: string; count?: number };

  if (
    !source ||
    !VALID_SOURCES.includes(source as keyof typeof XP_SOURCES) ||
    !count ||
    typeof count !== "number" ||
    count < 1
  ) {
    return NextResponse.json(
      {
        error: "Invalid body. Required: { source: string, count: number }",
        valid_sources: VALID_SOURCES,
      },
      { status: 400 }
    );
  }

  const { data: player } = await supabase
    .from("players")
    .select("id, xp, level")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const xpGain = calcXpReward([{ source: source as keyof typeof XP_SOURCES, count }]);
  const newXp = player.xp + xpGain;
  const oldLevel = calcLevel(player.xp);
  const newLevel = calcLevel(newXp);
  const leveledUp = newLevel > oldLevel;

  const serviceSupabase = createServiceClient();

  const { error } = await serviceSupabase
    .from("players")
    .update({ xp: newXp, level: newLevel })
    .eq("id", player.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    new_xp: newXp,
    new_level: newLevel,
    leveled_up: leveledUp,
    xp_gained: xpGain,
    unlocks: leveledUp ? getLevelUnlocks(newLevel) : [],
  });
}
