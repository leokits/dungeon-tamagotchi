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

const WALKABLE_TILE_TYPES = ["corridor", "packed"];

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

  const { data: dungeon } = await supabase
    .from("dungeons")
    .select("id")
    .eq("player_id", player.id)
    .single();

  if (!dungeon) {
    return NextResponse.json({ error: "Dungeon not found" }, { status: 404 });
  }

  const { data: traps, error } = await supabase
    .from("traps")
    .select("*")
    .eq("dungeon_id", dungeon.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ traps: traps || [] });
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
  const { tile_id, type } = body as { tile_id: string; type: string };

  if (!tile_id || !type) {
    return NextResponse.json(
      { error: "tile_id and type are required" },
      { status: 400 }
    );
  }

  if (!Object.keys(TRAP_CONFIG).includes(type)) {
    return NextResponse.json(
      {
        error: `Invalid trap type. Must be one of: ${Object.keys(TRAP_CONFIG).join(", ")}`,
      },
      { status: 400 }
    );
  }

  const trapType = type as TrapType;
  const trapConfig = TRAP_CONFIG[trapType];

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

  const { data: tile } = await supabase
    .from("tiles")
    .select("id, type, dungeon_id")
    .eq("id", tile_id)
    .single();

  if (!tile) {
    return NextResponse.json({ error: "Tile not found" }, { status: 404 });
  }

  if (tile.dungeon_id !== dungeon.id) {
    return NextResponse.json(
      { error: "Tile does not belong to your dungeon" },
      { status: 403 }
    );
  }

  if (!WALKABLE_TILE_TYPES.includes(tile.type)) {
    return NextResponse.json(
      {
        error: `Can only place traps on walkable tiles (corridor or packed). This tile is: ${tile.type}`,
      },
      { status: 400 }
    );
  }

  const { data: existingTrap } = await supabase
    .from("traps")
    .select("id")
    .eq("tile_id", tile_id)
    .eq("triggered", false)
    .single();

  if (existingTrap) {
    return NextResponse.json(
      { error: "A trap already exists on this tile" },
      { status: 400 }
    );
  }

  if (player.chrono_dust < trapConfig.cost) {
    return NextResponse.json(
      {
        error: `Not enough chrono dust. Need ${trapConfig.cost}, have ${player.chrono_dust}`,
      },
      { status: 400 }
    );
  }

  const { data: newTrap, error: trapError } = await serviceSupabase
    .from("traps")
    .insert({
      dungeon_id: dungeon.id,
      tile_id: tile_id,
      type: trapType,
      damage: trapConfig.damage,
      triggered: false,
    })
    .select()
    .single();

  if (trapError || !newTrap) {
    return NextResponse.json(
      { error: trapError?.message || "Failed to create trap" },
      { status: 500 }
    );
  }

  const { error: dustError } = await serviceSupabase
    .from("players")
    .update({
      chrono_dust: player.chrono_dust - trapConfig.cost,
      updated_at: new Date().toISOString(),
    })
    .eq("id", player.id);

  if (dustError) {
    await serviceSupabase.from("traps").delete().eq("id", newTrap.id);
    return NextResponse.json(
      { error: dustError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ trap: newTrap }, { status: 201 });
}
