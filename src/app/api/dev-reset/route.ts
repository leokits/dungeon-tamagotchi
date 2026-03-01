import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateDungeon } from "@/lib/dungeon-generator";

// Dev-only: delete + recreate dungeon with new 10x10 grid layout
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: player } = await service
    .from("players")
    .select("*")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: dungeon } = await service
    .from("dungeons")
    .select("*")
    .eq("player_id", player.id)
    .single();

  if (dungeon) {
    await service.from("eggs").delete().eq("dungeon_id", dungeon.id);
    await service.from("pets").delete().eq("dungeon_id", dungeon.id);
    await service.from("resources").delete().eq("dungeon_id", dungeon.id);
    await service.from("tiles").delete().eq("dungeon_id", dungeon.id);
    await service.from("chunks").delete().eq("dungeon_id", dungeon.id);
    await service.from("dungeons").delete().eq("id", dungeon.id);
  }

  const result = await generateDungeon(service, player.id);

  await service
    .from("players")
    .update({ chrono_dust: 0, last_tick_at: new Date().toISOString() })
    .eq("id", player.id);

  return NextResponse.json({
    message: "Dungeon reset! Refresh the page.",
    ...result,
  });
}
