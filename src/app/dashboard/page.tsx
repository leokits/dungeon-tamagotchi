import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GameShell from "@/components/GameShell";
import { generateDungeon } from "@/lib/dungeon-generator";

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
      // Create full 10x10 dungeon grid with shared generator
      await generateDungeon(supabase, player.id);
    }
  }

  return <GameShell playerId={player?.id || ""} />;
}
