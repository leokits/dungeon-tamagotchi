import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
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

  // Get raid (must be attacker or defender)
  const { data: raid } = await supabase
    .from("raids")
    .select("*")
    .eq("id", id)
    .single();

  if (!raid) {
    return NextResponse.json({ error: "Raid not found" }, { status: 404 });
  }

  if (raid.attacker_id !== me.id && raid.defender_id !== me.id) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Get attacker username
  const { data: attacker } = await supabase
    .from("players")
    .select("username")
    .eq("id", raid.attacker_id)
    .single();

  const { data: defender } = await supabase
    .from("players")
    .select("username")
    .eq("id", raid.defender_id)
    .single();

  return NextResponse.json({
    ...raid,
    attacker_username: attacker?.username,
    defender_username: defender?.username,
  });
}
