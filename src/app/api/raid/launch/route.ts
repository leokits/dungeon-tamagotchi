import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { simulateRaid, type RaidTile } from "@/lib/raid-simulation";
import {
  simulateEnhancedRaid,
  type RaidPet,
  type RaidTrap,
  type RaidGuard,
  type EnhancedRaidResult,
} from "@/game/enhanced-raid-simulation";

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

  // Load defender's traps (join with tiles to get global coordinates)
  const { data: defenderTraps } = await serviceSupabase
    .from("traps")
    .select(`
      id,
      type,
      damage,
      tiles (local_x, local_y, chunk_x, chunk_y)
    `)
    .eq("dungeon_id", defenderDungeon.id)
    .eq("triggered", false);

  // Load defender's guard assignments (join with pets for stats)
  const { data: defenderGuards } = await serviceSupabase
    .from("guard_assignments")
    .select(`
      id,
      chunk_x,
      chunk_y,
      patrol_radius,
      pets (
        id,
        name,
        hp,
        max_hp,
        atk,
        def,
        spd,
        hunger,
        element,
        base_type
      )
    `)
    .eq("dungeon_id", defenderDungeon.id);

  // Load attacker pet skills
  const { data: attackerPetSkills } = await serviceSupabase
    .from("player_skills")
    .select(`
      pet_id,
      skills (
        id,
        name,
        type,
        mp_cost,
        cooldown,
        power,
        element
      )
    `)
    .in("pet_id", pet_ids);

  // Mark pets as raiding
  await serviceSupabase
    .from("pets")
    .update({ status: "raiding" })
    .in("id", pet_ids);

  // Generate random seed
  const seed = Math.floor(Math.random() * 2147483647);

  // Build enhanced raid pets with skills
  const skillsByPetId = new Map<string, typeof attackerPetSkills>();
  if (attackerPetSkills) {
    for (const ps of attackerPetSkills) {
      if (!skillsByPetId.has(ps.pet_id)) {
        skillsByPetId.set(ps.pet_id, []);
      }
      skillsByPetId.get(ps.pet_id)!.push(ps);
    }
  }

  const raidPets: RaidPet[] = attackPets.map((p) => ({
    id: p.id,
    name: p.name,
    hp: p.hp,
    max_hp: p.max_hp,
    mp: p.mp ?? p.max_hp,
    max_mp: p.max_mp ?? p.max_hp,
    atk: p.atk,
    def: p.def,
    spd: p.spd,
    hunger: p.hunger,
    element: p.element ?? "neutral",
    skills: (skillsByPetId.get(p.id) ?? []).map((ps: any) => ({
      id: ps.skills.id,
      name: ps.skills.name,
      type: ps.skills.type,
      mp_cost: ps.skills.mp_cost,
      power: ps.skills.power,
      element: ps.skills.element,
      cooldown: ps.skills.cooldown,
    })),
  }));

  // Build trap data with global coordinates
  const traps: RaidTrap[] = (defenderTraps ?? [])
    .filter((t: any) => t.tiles)
    .map((t: any) => ({
      id: t.id,
      tile_x: t.tiles.chunk_x * 20 + t.tiles.local_x,
      tile_y: t.tiles.chunk_y * 15 + t.tiles.local_y,
      type: t.type,
      damage: t.damage,
    }));

  // Build guard data
  const guards: RaidGuard[] = (defenderGuards ?? [])
    .filter((g: any) => g.pets)
    .map((g: any) => ({
      pet: {
        id: g.pets.id,
        name: g.pets.name,
        hp: g.pets.hp,
        max_hp: g.pets.max_hp,
        mp: g.pets.mp ?? g.pets.max_hp,
        max_mp: g.pets.max_mp ?? g.pets.max_hp,
        atk: g.pets.atk,
        def: g.pets.def,
        spd: g.pets.spd,
        hunger: g.pets.hunger,
        element: g.pets.element ?? "neutral",
        skills: [],
      },
      chunk_x: g.chunk_x,
      chunk_y: g.chunk_y,
      patrol_radius: g.patrol_radius,
    }));

  // Find entrance and crystal positions for enhanced simulation
  const entranceTile = defenderTiles.find((t) => t.type === "entrance");
  const crystalTile = defenderTiles.find((t) => t.type === "crystal");
  const entrancePos = entranceTile
    ? { x: entranceTile.chunk_x * 20 + entranceTile.local_x, y: entranceTile.chunk_y * 15 + entranceTile.local_y }
    : null;
  const crystalPos = crystalTile
    ? { x: crystalTile.chunk_x * 20 + crystalTile.local_x, y: crystalTile.chunk_y * 15 + crystalTile.local_y }
    : null;

  // Run enhanced simulation with fallback to simple simulation
  let simResult: EnhancedRaidResult | ReturnType<typeof simulateRaid> | undefined;

  try {
    if (traps.length > 0 || guards.length > 0) {
      simResult = simulateEnhancedRaid(
        defenderTiles as RaidTile[],
        raidPets,
        traps,
        guards,
        seed,
        crystalPos ?? { x: 0, y: 0 },
        entrancePos ?? { x: 0, y: 0 },
      );
    }
  } catch (e) {
    // Enhanced simulation failed — fall back to simple
  }

  if (!simResult) {
    simResult = simulateRaid(defenderTiles as RaidTile[], raidPets, seed);
  }

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
  if (attackerDungeon && Object.values(simResult.loot.resources).some((v: number) => v > 0)) {
    const { data: corridorTiles } = await serviceSupabase
      .from("tiles")
      .select("id")
      .eq("dungeon_id", attackerDungeon.id)
      .in("type", ["corridor", "packed"])
      .limit(20);

    if (corridorTiles && corridorTiles.length > 0) {
      const resourceInserts = [];
      for (const [type, qty] of Object.entries(simResult.loot.resources) as [string, number][]) {
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
    traps_triggered: "traps_triggered" in simResult ? simResult.traps_triggered : 0,
    guards_defeated: "guards_defeated" in simResult ? simResult.guards_defeated : 0,
    guards_won: "guards_won" in simResult ? simResult.guards_won : 0,
  });
}
