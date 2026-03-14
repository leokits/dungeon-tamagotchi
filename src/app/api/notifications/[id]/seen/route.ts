import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get current player
  const { data: me } = await supabase
    .from("players")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!me) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // Mark notification as seen (only if it belongs to this player)
  const { data: notification, error } = await supabase
    .from("notifications")
    .update({ seen: true })
    .eq("id", id)
    .eq("player_id", me.id)
    .select()
    .single();

  if (error || !notification) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  return NextResponse.json({ notification });
}
