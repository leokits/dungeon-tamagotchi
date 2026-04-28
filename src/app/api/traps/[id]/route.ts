import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { TrapType } from "@/types/database";

const TRAP_CONFIG: Record<TrapType, { cost: number; damage: number }> = {
  spike_floor: { cost: 10, damage: 15 },
  poison_gas: { cost: 15, damage: 8 },
  decoy_crystal: { cost: 20, damage: 0 },
  wall_mimic: { cost: 25, damage: 0 },
  mana_drain: { cost: 12, damage: 0 },
};

export async function DELETE(
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

  const { id: trapId } = await params;

  const { data: player } = await supabase
    .from("players")
    .select("id, chrono_dust")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: dungeon } = await supabase
    .from("dungeons")
    .select("id")
    .eq("player_id", player.id)
    .single();

  if (!dungeon) {
    return NextResponse.json({ error: "Dungeon not found" }, { status: 404 });
  }

  const { data: trap, error: fetchError } = await supabase
    .from("traps")
    .select("*")
    .eq("id", trapId)
    .single();

  if (fetchError || !trap) {
    return NextResponse.json({ error: "Trap not found" }, { status: 404 });
  }

  if (trap.dungeon_id !== dungeon.id) {
    return NextResponse.json(
      { error: "Trap does not belong to your dungeon" },
      { status: 403 }
    );
  }

  const trapType = trap.type as TrapType;
  const trapConfig = TRAP_CONFIG[trapType];
  const refundAmount = Math.floor(trapConfig.cost * 0.5);

  const { error: deleteError } = await serviceSupabase
    .from("traps")
    .delete()
    .eq("id", trapId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await serviceSupabase
    .from("players")
    .update({
      chrono_dust: player.chrono_dust + refundAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", player.id);

  return NextResponse.json({ success: true });
}
