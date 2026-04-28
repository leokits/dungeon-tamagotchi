import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(
  _request: Request,
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
    .select("id, chrono_dust, xp")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { id: playerQuestId } = await params;

  const { data: playerQuest, error: fetchError } = await serviceSupabase
    .from("player_quests")
    .select("*, quests(*)")
    .eq("id", playerQuestId)
    .eq("player_id", player.id)
    .single();

  if (fetchError || !playerQuest) {
    return NextResponse.json({ error: "Quest progress not found" }, { status: 404 });
  }

  if (playerQuest.claimed_at) {
    return NextResponse.json({ error: "Reward already claimed" }, { status: 400 });
  }

  const quest = playerQuest.quests;
  if (!quest) {
    return NextResponse.json({ error: "Quest definition not found" }, { status: 404 });
  }

  if (playerQuest.progress < quest.target_value) {
    return NextResponse.json(
      { error: `Quest not completed. Progress: ${playerQuest.progress}/${quest.target_value}` },
      { status: 400 }
    );
  }

  const { error: updateError } = await serviceSupabase
    .from("player_quests")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", playerQuestId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: rewardError } = await serviceSupabase
    .from("players")
    .update({
      chrono_dust: player.chrono_dust + quest.reward_dust,
      xp: player.xp + quest.reward_xp,
      updated_at: new Date().toISOString(),
    })
    .eq("id", player.id);

  if (rewardError) {
    await serviceSupabase
      .from("player_quests")
      .update({ claimed_at: null })
      .eq("id", playerQuestId);

    return NextResponse.json({ error: rewardError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    reward: {
      dust: quest.reward_dust,
      xp: quest.reward_xp,
    },
  });
}
