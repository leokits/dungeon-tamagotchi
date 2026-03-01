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

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: pets } = await supabase
    .from("pets")
    .select("*")
    .eq("player_id", player.id);

  const { data: eggs } = await supabase
    .from("eggs")
    .select("*")
    .eq("player_id", player.id)
    .eq("hatched", false);

  return NextResponse.json({
    pets: pets || [],
    eggs: eggs || [],
  });
}
