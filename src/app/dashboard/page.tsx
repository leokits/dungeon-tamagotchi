import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GameView from "@/components/GameView";

// Force dynamic rendering — env vars not available at build time
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Check if player record exists, create if not
  let { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    // First login — create player + dungeon
    const username =
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      `player_${Date.now()}`;

    const { data: newPlayer, error: playerError } = await supabase
      .from("players")
      .insert({ auth_id: user.id, username })
      .select()
      .single();

    if (playerError) {
      // Username conflict — append random suffix
      const { data: retryPlayer } = await supabase
        .from("players")
        .insert({
          auth_id: user.id,
          username: `${username}_${Math.floor(Math.random() * 9999)}`,
        })
        .select()
        .single();
      player = retryPlayer;
    } else {
      player = newPlayer;
    }

    if (player) {
      // Create dungeon
      const { data: dungeon } = await supabase
        .from("dungeons")
        .insert({ player_id: player.id })
        .select()
        .single();

      if (dungeon) {
        // Create starting chunk (0,0) — 20x15
        const { data: chunk } = await supabase
          .from("chunks")
          .insert({
            dungeon_id: dungeon.id,
            chunk_x: 0,
            chunk_y: 0,
            width: 20,
            height: 15,
          })
          .select()
          .single();

        if (chunk) {
          // Generate 20x15 = 300 tiles
          const tiles = [];
          for (let y = 0; y < 15; y++) {
            for (let x = 0; x < 20; x++) {
              const isCrystal =
                x === dungeon.crystal_tile_x && y === dungeon.crystal_tile_y;
              // Create a small starting corridor around center
              const isStartCorridor =
                Math.abs(x - 10) + Math.abs(y - 7) <= 2;

              tiles.push({
                chunk_id: chunk.id,
                dungeon_id: dungeon.id,
                local_x: x,
                local_y: y,
                chunk_x: 0,
                chunk_y: 0,
                type: isCrystal
                  ? "crystal"
                  : isStartCorridor
                    ? "corridor"
                    : "solid",
                nutrient: isCrystal ? 0 : 1.0,
                mana: isCrystal ? 5.0 : Math.random() * 0.3,
              });
            }
          }

          await supabase.from("tiles").insert(tiles);
        }
      }
    }
  }

  return <GameView playerId={player?.id || ""} />;
}
