import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    .select("id, chrono_dust, title")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { id: playerAchievementId } = await params;

  const { data: playerAchievement, error: paError } = await supabase
    .from("player_achievements")
    .select("*, achievements!inner(reward_dust, reward_title, reward_cosmetic)")
    .eq("id", playerAchievementId)
    .eq("player_id", player.id)
    .single();

  if (paError || !playerAchievement) {
    return NextResponse.json({ error: "Achievement progress not found" }, { status: 404 });
  }

  if (!playerAchievement.completed_at) {
    return NextResponse.json({ error: "Achievement not yet completed" }, { status: 400 });
  }

  if ((playerAchievement as Record<string, unknown>).claimed_at) {
    return NextResponse.json({ error: "Reward already claimed" }, { status: 400 });
  }

  const achievement = playerAchievement.achievements as {
    reward_dust: number;
    reward_title: string | null;
    reward_cosmetic: string | null;
  };

  const updates: Record<string, unknown> = {};

  if (achievement.reward_dust > 0) {
    (updates as Record<string, number>).chrono_dust = player.chrono_dust + achievement.reward_dust;
  }

  if (achievement.reward_title && !player.title) {
    (updates as Record<string, string>).title = achievement.reward_title;
  }

  const { error: claimError } = await serviceSupabase
    .from("player_achievements")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", playerAchievementId);

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  if (Object.keys(updates).length > 0) {
    const { error: playerError } = await serviceSupabase
      .from("players")
      .update(updates)
      .eq("id", player.id);

    if (playerError) {
      return NextResponse.json({ error: playerError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    reward: {
      dust: achievement.reward_dust,
      title: achievement.reward_title,
      cosmetic: achievement.reward_cosmetic,
    },
  });
}
