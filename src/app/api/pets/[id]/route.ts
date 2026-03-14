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
