import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Quest } from "@/types/database";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch active daily quests
  const { data: daily, error: dailyError } = await supabase
    .from("quests")
    .select("*")
    .eq("type", "daily")
    .eq("is_active", true)
    .order("id");

  if (dailyError) {
    return NextResponse.json({ error: dailyError.message }, { status: 500 });
  }

  // Fetch active weekly quests
  const { data: weekly, error: weeklyError } = await supabase
    .from("quests")
    .select("*")
    .eq("type", "weekly")
    .eq("is_active", true)
    .order("id");

  if (weeklyError) {
    return NextResponse.json({ error: weeklyError.message }, { status: 500 });
  }

  return NextResponse.json({
    daily: (daily || []) as Quest[],
    weekly: (weekly || []) as Quest[],
  });
}
