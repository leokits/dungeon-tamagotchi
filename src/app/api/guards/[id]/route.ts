import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { GuardAssignment } from "@/types/database";

/**
 * DELETE /api/guards/[id] — Remove a guard assignment.
 * Verifies the guard belongs to the player's dungeon before deleting.
 */
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

  const { id } = await params;

  // Get player
  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // Get player's dungeon
  const { data: dungeon } = await supabase
    .from("dungeons")
    .select("id")
    .eq("player_id", player.id)
    .single();

  if (!dungeon) {
    return NextResponse.json({ error: "Dungeon not found" }, { status: 404 });
  }

  // Verify guard assignment belongs to player's dungeon
  const { data: guard } = await serviceSupabase
    .from("guard_assignments")
    .select("id, dungeon_id")
    .eq("id", id)
    .single();

  if (!guard) {
    return NextResponse.json({ error: "Guard assignment not found" }, { status: 404 });
  }

  if (guard.dungeon_id !== dungeon.id) {
    return NextResponse.json(
      { error: "Guard assignment does not belong to your dungeon" },
      { status: 403 }
    );
  }

  // Delete guard assignment
  const { error } = await serviceSupabase
    .from("guard_assignments")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * PUT /api/guards/[id] — Update a guard assignment (change patrol zone).
 * Verifies guard ownership and validates new chunk is within unlocked area.
 */
export async function PUT(
  request: NextRequest,
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

  const { id } = await params;

  const body = await request.json();
  const { chunk_x, chunk_y, patrol_radius } = body as {
    chunk_x: number;
    chunk_y: number;
    patrol_radius: number;
  };

  // Validate required fields
  if (chunk_x === undefined || chunk_y === undefined || patrol_radius === undefined) {
    return NextResponse.json(
      { error: "chunk_x, chunk_y, and patrol_radius are required" },
      { status: 400 }
    );
  }

  // Validate patrol_radius range
  if (typeof patrol_radius !== "number" || patrol_radius < 1 || patrol_radius > 5) {
    return NextResponse.json(
      { error: "patrol_radius must be a number between 1 and 5" },
      { status: 400 }
    );
  }

  // Validate chunk coordinates are integers
  if (!Number.isInteger(chunk_x) || !Number.isInteger(chunk_y)) {
    return NextResponse.json(
      { error: "chunk_x and chunk_y must be integers" },
      { status: 400 }
    );
  }

  // Get player
  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // Get player's dungeon
  const { data: dungeon } = await supabase
    .from("dungeons")
    .select("id")
    .eq("player_id", player.id)
    .single();

  if (!dungeon) {
    return NextResponse.json({ error: "Dungeon not found" }, { status: 404 });
  }

  // Verify guard assignment belongs to player's dungeon
  const { data: guard } = await serviceSupabase
    .from("guard_assignments")
    .select("id, dungeon_id, pet_id")
    .eq("id", id)
    .single();

  if (!guard) {
    return NextResponse.json({ error: "Guard assignment not found" }, { status: 404 });
  }

  if (guard.dungeon_id !== dungeon.id) {
    return NextResponse.json(
      { error: "Guard assignment does not belong to your dungeon" },
      { status: 403 }
    );
  }

  // Verify new chunk is within player's unlocked dungeon area
  const { data: chunk } = await serviceSupabase
    .from("chunks")
    .select("id, locked")
    .eq("dungeon_id", dungeon.id)
    .eq("chunk_x", chunk_x)
    .eq("chunk_y", chunk_y)
    .single();

  if (!chunk) {
    return NextResponse.json(
      { error: "Chunk is not part of your dungeon" },
      { status: 400 }
    );
  }

  if (chunk.locked) {
    return NextResponse.json(
      { error: "Chunk is not unlocked" },
      { status: 400 }
    );
  }

  // Update guard assignment
  const { data: updatedGuard, error } = await serviceSupabase
    .from("guard_assignments")
    .update({ chunk_x, chunk_y, patrol_radius })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const guardAssignment: GuardAssignment = {
    id: updatedGuard.id,
    dungeon_id: updatedGuard.dungeon_id,
    pet_id: updatedGuard.pet_id,
    chunk_x: updatedGuard.chunk_x,
    chunk_y: updatedGuard.chunk_y,
    patrol_radius: updatedGuard.patrol_radius,
    created_at: updatedGuard.created_at,
  };

  return NextResponse.json({ guard: guardAssignment });
}
