import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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

  // Fetch notifications for current player
  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("player_id", me.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const unreadCount = (notifications || []).filter((n) => !n.seen).length;

  return NextResponse.json({
    notifications: notifications || [],
    unread_count: unreadCount,
  });
}
