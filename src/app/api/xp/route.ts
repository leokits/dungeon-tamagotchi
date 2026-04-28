import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calcLevel, calcXpProgress, getLevelUnlocks } from "@/game/xp-system";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: player } = await supabase
    .from("players")
    .select("id, xp, level")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const progress = calcXpProgress(player.xp);
  const level = calcLevel(player.xp);

  return NextResponse.json({
    level,
    xp: player.xp,
    progress: {
      current: progress.current,
      needed: progress.needed,
      percent: Math.round((progress.current / progress.needed) * 100),
    },
    unlocks: getLevelUnlocks(level),
  });
}
