import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const trimmedName = name.trim().slice(0, 24);

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: pet, error } = await supabase
    .from("pets")
    .update({ name: trimmedName })
    .eq("id", id)
    .eq("player_id", player.id)
    .select()
    .single();

  if (error || !pet) {
    return NextResponse.json(
      { error: error?.message || "Pet not found or not owned by player" },
      { status: 404 }
    );
  }

  return NextResponse.json({ pet });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { resource_type } = await request.json();

  if (!resource_type || typeof resource_type !== "string") {
    return NextResponse.json({ error: "Resource type required" }, { status: 400 });
  }

  const hungerValues: Record<string, number> = {
    mushroom: 0.15,
    crystal_shard: 0.1,
    bone: 0.12,
    mana_orb: 0.08,
    moss: 0.2,
  };

  const hungerGain = hungerValues[resource_type];
  if (hungerGain === undefined) {
    return NextResponse.json({ error: "Invalid resource type" }, { status: 400 });
  }

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("*")
    .eq("id", id)
    .eq("player_id", player.id)
    .single();

  if (petError || !pet || pet.status !== "alive") {
    return NextResponse.json(
      { error: "Pet not found, not owned, or not alive" },
      { status: 404 }
    );
  }

  const { data: dungeon } = await supabase
    .from("dungeons")
    .select("id")
    .eq("player_id", player.id)
    .single();

  if (!dungeon) {
    return NextResponse.json({ error: "Dungeon not found" }, { status: 404 });
  }

  const { data: availableResources } = await supabase
    .from("resources")
    .select("id, type, quantity")
    .eq("dungeon_id", dungeon.id)
    .eq("type", resource_type);

  if (!availableResources || availableResources.length === 0) {
    return NextResponse.json(
      { error: "No resources available to feed" },
      { status: 400 }
    );
  }

  const totalAvailable = availableResources.reduce((sum, r) => sum + r.quantity, 0);
  const feedAmount = Math.min(totalAvailable, 1);
  let remaining = feedAmount;
  const removedResourceIds: string[] = [];

  for (const r of availableResources) {
    if (remaining <= 0) break;
    const take = Math.min(r.quantity, remaining);
    const updatedQuantity = r.quantity - take;
    removedResourceIds.push(r.id);
    remaining -= take;

    await supabase
      .from("resources")
      .update({ quantity: Math.max(0, updatedQuantity) })
      .eq("id", r.id);
  }

  if (removedResourceIds.length === 0) {
    return NextResponse.json({ error: "No resources consumed" }, { status: 400 });
  }

  const currentHunger = pet.hunger;
  const newHunger = Math.min(1.0, currentHunger + hungerGain);
  const currentFoodLog = pet.food_log || [];
  const updatedFoodLog = [...currentFoodLog, resource_type].slice(-10);

  const { data: updatedPet, error: updateError } = await supabase
    .from("pets")
    .update({ hunger: newHunger, food_log: updatedFoodLog })
    .eq("id", pet.id)
    .select()
    .single();

  if (updateError || !updatedPet) {
    return NextResponse.json(
      { error: "Failed to feed pet" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    pet: updatedPet,
    hungerGained: hungerGain,
    resourcesConsumed: feedAmount,
  });
}
