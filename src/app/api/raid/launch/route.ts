import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { simulateRaid, type RaidPet, type RaidTile } from "@/lib/raid-simulation";

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
  const { defender_player_id, pet_ids } = body as {
    defender_player_id: string;
    pet_ids: string[];
  };

  if (!defender_player_id || !pet_ids || pet_ids.length === 0) {
    return NextResponse.json({ error: "defender_player_id and pet_ids required" }, { status: 400 });
  }

  if (pet_ids.length > 3) {
    return NextResponse.json({ error: "Max 3 pets per raid" }, { status: 400 });
  }

  // Get attacker
  const { data: attacker } = await supabase
    .from("players")
    .select("id, chrono_dust")
    .eq("auth_id", user.id)
    .single();

  if (!attacker) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  if (attacker.id === defender_player_id) {
    return NextResponse.json({ error: "Cannot raid your own dungeon" }, { status: 400 });
  }

  // Get attacker's pets
  const { data: attackPets } = await supabase
    .from("pets")
    .select("*")
    .in("id", pet_ids)
    .eq("player_id", attacker.id)
    .eq("status", "alive");

  if (!attackPets || attackPets.length !== pet_ids.length) {
    return NextResponse.json({ error: "Some pets not found or not alive" }, { status: 400 });
  }

  // Check hunger
  const hungryPets = attackPets.filter((p) => p.hunger < 0.2);
  if (hungryPets.length > 0) {
    return NextResponse.json({
      error: `Pets are too hungry to raid: ${hungryPets.map((p) => p.name || p.base_type).join(", ")}`,
    }, { status: 400 });
  }

  // Get defender's dungeon
  const { data: defenderDungeon } = await serviceSupabase
    .from("dungeons")
    .select("id, crystal_energy")
    .eq("player_id", defender_player_id)
    .single();

  if (!defenderDungeon) {
    return NextResponse.json({ error: "Defender dungeon not found" }, { status: 404 });
  }

  // Snapshot defender's tiles
  const { data: defenderTiles } = await serviceSupabase
    .from("tiles")
    .select("local_x, local_y, chunk_x, chunk_y, type")
    .eq("dungeon_id", defenderDungeon.id);

  if (!defenderTiles || defenderTiles.length === 0) {
    return NextResponse.json({ error: "Defender dungeon has no tiles" }, { status: 400 });
  }

  // Mark pets as raiding
  await serviceSupabase
    .from("pets")
    .update({ status: "raiding" })
    .in("id", pet_ids);

  // Generate random seed
  const seed = Math.floor(Math.random() * 2147483647);

  // Run simulation
  const raidPets: RaidPet[] = attackPets.map((p) => ({
    id: p.id,
    name: p.name,
    hp: p.hp,
    max_hp: p.max_hp,
    atk: p.atk,
    def: p.def,
    spd: p.spd,
    hunger: p.hunger,
  }));

  const simResult = simulateRaid(defenderTiles as RaidTile[], raidPets, seed);

  // Handle dead pets — mark them dead
  for (const petId of simResult.dead_pet_ids) {
    const deadPet = attackPets.find((p) => p.id === petId);
    if (deadPet) {
      await serviceSupabase
        .from("pets")
        .update({
          status: "dead",
          died_at: new Date().toISOString(),
        })
        .eq("id", petId);
    }
  }

  // Handle surviving pets — return them to alive
  for (const petId of simResult.surviving_pet_ids) {
    await serviceSupabase
      .from("pets")
      .update({ status: "alive" })
      .eq("id", petId);
  }

  // Drain crystal energy from defender
  if (simResult.energy_drained > 0) {
    const newEnergy = Math.max(0, defenderDungeon.crystal_energy - simResult.energy_drained);
    await serviceSupabase
      .from("dungeons")
      .update({ crystal_energy: newEnergy })
      .eq("id", defenderDungeon.id);
  }

  // Store raid record
  const dungeonSnapshot = { tiles: defenderTiles };
  const { data: raid } = await serviceSupabase
    .from("raids")
    .insert({
      attacker_id: attacker.id,
      defender_id: defender_player_id,
      pets_sent: pet_ids,
      dungeon_snapshot: dungeonSnapshot,
      random_seed: seed,
      result: simResult.result,
      depth_reached: simResult.depth_reached,
      loot: simResult.loot,
      energy_drained: simResult.energy_drained,
      replay_data: simResult.replay_data,
      completed_at: new Date().toISOString(),
    })
    .select()
    .single();

  // Get attacker's dungeon for loot storage
  const { data: attackerDungeon } = await serviceSupabase
    .from("dungeons")
    .select("id")
    .eq("player_id", attacker.id)
    .single();

  // Add loot resources to attacker's dungeon (find a random corridor tile)
  if (attackerDungeon && Object.values(simResult.loot.resources).some((v) => v > 0)) {
    const { data: corridorTiles } = await serviceSupabase
      .from("tiles")
      .select("id")
      .eq("dungeon_id", attackerDungeon.id)
      .in("type", ["corridor", "packed"])
      .limit(20);

    if (corridorTiles && corridorTiles.length > 0) {
      const resourceInserts = [];
      for (const [type, qty] of Object.entries(simResult.loot.resources)) {
        if (qty <= 0) continue;
        // Distribute across random tiles
        for (let i = 0; i < qty; i++) {
          const randomTile = corridorTiles[Math.floor(Math.random() * corridorTiles.length)];
          // Check if tile already has a resource
          const { data: existingRes } = await serviceSupabase
            .from("resources")
            .select("id")
            .eq("tile_id", randomTile.id)
            .single();

          if (!existingRes) {
            resourceInserts.push({
              tile_id: randomTile.id,
              dungeon_id: attackerDungeon.id,
              type,
              quantity: 1,
            });
          }
        }
      }
      if (resourceInserts.length > 0) {
        await serviceSupabase.from("resources").insert(resourceInserts);
      }
    }
  }

  // Create notifications for both players
  const attackerResultMsg =
    simResult.result === "attacker_win"
      ? "Victory! Your raid succeeded!"
      : simResult.result === "draw"
      ? "Partial success — your pets retreated with some loot."
      : "Defeat — your raid failed. Pets that survived have returned.";

  await serviceSupabase.from("notifications").insert([
    {
      player_id: attacker.id,
      type: "raid_result",
      data: {
        raid_id: raid?.id,
        result: simResult.result,
        message: attackerResultMsg,
        depth_reached: simResult.depth_reached,
        loot: simResult.loot,
        dead_pets: simResult.dead_pet_ids.length,
      },
    },
    {
      player_id: defender_player_id,
      type: "raid_incoming",
      data: {
        raid_id: raid?.id,
        result: simResult.result,
        attacker_id: attacker.id,
        message:
          simResult.result === "attacker_win"
            ? "Your dungeon was raided and the crystal was reached!"
            : simResult.result === "draw"
            ? "Your dungeon was raided — the attackers reached deep but were repelled."
            : "Raiders attacked your dungeon but were defeated!",
        energy_drained: simResult.energy_drained,
      },
    },
  ]);

  return NextResponse.json({
    raid,
    result: simResult.result,
    depth_reached: simResult.depth_reached,
    loot: simResult.loot,
    energy_drained: simResult.energy_drained,
    surviving_pets: simResult.surviving_pet_ids,
    dead_pets: simResult.dead_pet_ids,
  });
}
