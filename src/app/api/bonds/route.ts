import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { calcBondLevel, getBondBonus, BOND_XP_SOURCES } from "@/game/bond-system";
import type { BondXpSource } from "@/game/bond-system";

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
    .select("id, name, base_type, bond_level")
    .eq("player_id", player.id);

  const bonds = (pets || []).map((pet) => {
    const bondLevel = pet.bond_level ?? 0;
    const bonus = getBondBonus(bondLevel);
    return {
      pet_id: pet.id,
      pet_name: pet.name || pet.base_type,
      bond_xp: bondLevel,
      bond_level: bondLevel,
      atk_bonus: bonus.atkBonus,
      def_bonus: bonus.defBonus,
      combo_chance: bonus.comboChance,
    };
  });

  return NextResponse.json({ bonds });
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

  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const body = await request.json();
  const { pet_id, source, count } = body as {
    pet_id: string;
    source: string;
    count: number;
  };

  if (!pet_id || !source || !count) {
    return NextResponse.json(
      { error: "pet_id, source, and count are required" },
      { status: 400 }
    );
  }

  if (!(source in BOND_XP_SOURCES)) {
    return NextResponse.json(
      { error: `Invalid source. Must be one of: ${Object.keys(BOND_XP_SOURCES).join(", ")}` },
      { status: 400 }
    );
  }

  if (count < 1 || count > 100) {
    return NextResponse.json(
      { error: "count must be between 1 and 100" },
      { status: 400 }
    );
  }

  const { data: pet } = await serviceSupabase
    .from("pets")
    .select("id, bond_level")
    .eq("id", pet_id)
    .eq("player_id", player.id)
    .single();

  if (!pet) {
    return NextResponse.json(
      { error: "Pet not found or not owned by player" },
      { status: 404 }
    );
  }

  const xpPerAction = BOND_XP_SOURCES[source as BondXpSource];
  const xpGained = xpPerAction * count;
  const currentBondXp = pet.bond_level ?? 0;
  const newBondXp = currentBondXp + xpGained;

  const oldLevel = calcBondLevel(currentBondXp);
  const newLevel = calcBondLevel(newBondXp);
  const leveledUp = newLevel > oldLevel;

  await serviceSupabase
    .from("pets")
    .update({ bond_level: newBondXp })
    .eq("id", pet_id);

  return NextResponse.json({
    xp_gained: xpGained,
    new_bond_xp: newBondXp,
    new_bond_level: newLevel,
    leveled_up: leveledUp,
  });
}
