import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { GuardAssignment, Pet } from "@/types/database";

/**
 * GET /api/guards — List all guard assignments for current player's dungeon.
 * Returns guards with their associated pet details.
 */
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

  const { data: guards, error } = await supabase
    .from("guard_assignments")
    .select("*, pets(*)")
    .eq("dungeon_id", dungeon.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const guardsWithPets = (guards || []).map((g) => ({
    assignment: {
      id: g.id,
      dungeon_id: g.dungeon_id,
      pet_id: g.pet_id,
      chunk_x: g.chunk_x,
      chunk_y: g.chunk_y,
      patrol_radius: g.patrol_radius,
      created_at: g.created_at,
    } satisfies GuardAssignment,
    pet: g.pets as Pet,
  }));

  return NextResponse.json({ guards: guardsWithPets });
}

/**
 * POST /api/guards — Assign a pet to guard a zone.
 * Validates pet availability, chunk ownership, and no duplicate assignments.
 */
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
  const { pet_id, chunk_x, chunk_y, patrol_radius } = body as {
    pet_id: string;
    chunk_x: number;
    chunk_y: number;
    patrol_radius: number;
  };

  // Validate required fields
  if (!pet_id || chunk_x === undefined || chunk_y === undefined || patrol_radius === undefined) {
    return NextResponse.json(
      { error: "pet_id, chunk_x, chunk_y, and patrol_radius are required" },
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

  // Verify pet belongs to player
  const { data: pet } = await supabase
    .from("pets")
    .select("id, status")
    .eq("id", pet_id)
    .eq("player_id", player.id)
    .single();

  if (!pet) {
    return NextResponse.json(
      { error: "Pet not found or does not belong to you" },
      { status: 400 }
    );
  }

  // Verify pet is alive (not raiding, dead, or captured)
  if (pet.status !== "alive") {
    return NextResponse.json(
      { error: `Pet is not available for guard duty (status: ${pet.status})` },
      { status: 400 }
    );
  }

  // Verify pet is not already assigned as a guard
  const { data: existingGuard } = await supabase
    .from("guard_assignments")
    .select("id")
    .eq("pet_id", pet_id)
    .single();

  if (existingGuard) {
    return NextResponse.json(
      { error: "Pet is already assigned as a guard" },
      { status: 409 }
    );
  }

  // Verify chunk is within player's unlocked dungeon area
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

  // Insert guard assignment
  const { data: guard, error } = await serviceSupabase
    .from("guard_assignments")
    .insert({
      dungeon_id: dungeon.id,
      pet_id,
      chunk_x,
      chunk_y,
      patrol_radius,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ guard }, { status: 201 });
}
