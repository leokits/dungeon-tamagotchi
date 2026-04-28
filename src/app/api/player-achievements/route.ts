import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: playerAchievements, error } = await supabase
    .from("player_achievements")
    .select("*")
    .eq("player_id", player.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ player_achievements: playerAchievements || [] });
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
  const { achievement_id, progress } = body as { achievement_id: string; progress: number };

  if (!achievement_id || progress === undefined) {
    return NextResponse.json(
      { error: "achievement_id and progress are required" },
      { status: 400 }
    );
  }

  // Check if achievement exists and get target
  const { data: achievement } = await supabase
    .from("achievements")
    .select("target_value")
    .eq("id", achievement_id)
    .single();

  if (!achievement) {
    return NextResponse.json({ error: "Achievement not found" }, { status: 404 });
  }

  const cappedProgress = Math.min(progress, achievement.target_value);
  const completedAt = cappedProgress >= achievement.target_value ? new Date().toISOString() : null;

  // Upsert player achievement
  const { data: existing } = await supabase
    .from("player_achievements")
    .select("id, progress")
    .eq("player_id", player.id)
    .eq("achievement_id", achievement_id)
    .single();

  let result;
  if (existing) {
    // Only update if new progress is higher
    if (progress > existing.progress) {
      const { data, error } = await serviceSupabase
        .from("player_achievements")
        .update({ progress: cappedProgress, completed_at: completedAt })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      result = data;
    } else {
      result = existing;
    }
  } else {
    const { data, error } = await serviceSupabase
      .from("player_achievements")
      .insert({
        player_id: player.id,
        achievement_id,
        progress: cappedProgress,
        completed_at: completedAt,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    result = data;
  }

  return NextResponse.json({ player_achievement: result }, { status: 200 });
}
