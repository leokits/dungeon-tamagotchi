import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const TOTAL_STEPS = 7;
const REWARD_DUST = 50;

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
    .select("id, tutorial_progress")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const progress = (player as Record<string, unknown>).tutorial_progress as Record<string, unknown> | null;

  return NextResponse.json({
    current_step: progress?.current_step ?? 0,
    completed_steps: (progress?.completed_steps as number[]) ?? [],
    started_at: (progress?.started_at as string) ?? null,
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

  const body = await request.json();
  const { step_number } = body;

  if (typeof step_number !== "number" || step_number < 1 || step_number > TOTAL_STEPS) {
    return NextResponse.json({ error: "Invalid step number" }, { status: 400 });
  }

  const { data: player } = await supabase
    .from("players")
    .select("id, tutorial_progress")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const existing = (player as Record<string, unknown>).tutorial_progress as Record<string, unknown> | null;
  const completedSteps: number[] = (existing?.completed_steps as number[]) ?? [];
  const startedAt = (existing?.started_at as string) ?? new Date().toISOString();

  if (!completedSteps.includes(step_number)) {
    completedSteps.push(step_number);
  }

  const allComplete = completedSteps.length >= TOTAL_STEPS;
  let rewardClaimed = false;

  if (allComplete && !existing?.reward_claimed) {
    const { error: updateError } = await serviceSupabase
      .from("players")
      .update({
        chrono_dust: ((player as Record<string, unknown>).chrono_dust as number) + REWARD_DUST,
        tutorial_progress: {
          current_step: TOTAL_STEPS,
          completed_steps: completedSteps,
          started_at: startedAt,
          reward_claimed: true,
        },
      })
      .eq("id", player.id);

    if (!updateError) {
      rewardClaimed = true;
    }
  } else {
    await serviceSupabase
      .from("players")
      .update({
        tutorial_progress: {
          current_step: Math.max(step_number, (existing?.current_step as number) ?? 0),
          completed_steps: completedSteps,
          started_at: startedAt,
          reward_claimed: (existing?.reward_claimed as boolean) ?? false,
        },
      })
      .eq("id", player.id);
  }

  return NextResponse.json({
    current_step: allComplete ? TOTAL_STEPS : step_number,
    completed: allComplete,
    reward_claimed: rewardClaimed,
  });
}
