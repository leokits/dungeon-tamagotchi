import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get current player
  const { data: me } = await supabase
    .from("players")
    .select("id")
    .eq("auth_id", user.id)
    .single();

  if (!me) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // Get raids where player is attacker or defender
  const { data: attackerRaids } = await supabase
    .from("raids")
    .select("id, defender_id, result, depth_reached, loot, energy_drained, created_at, completed_at, pets_sent")
    .eq("attacker_id", me.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: defenderRaids } = await supabase
    .from("raids")
    .select("id, attacker_id, result, depth_reached, energy_drained, created_at, completed_at")
    .eq("defender_id", me.id)
    .order("created_at", { ascending: false })
    .limit(30);

  // Get player usernames for display
  const allPlayerIds = new Set<string>();
  for (const r of attackerRaids || []) allPlayerIds.add(r.defender_id);
  for (const r of defenderRaids || []) allPlayerIds.add(r.attacker_id);

  const playerIdList = [...allPlayerIds];
  let usernameMap: Record<string, string> = {};

  if (playerIdList.length > 0) {
    const { data: playerNames } = await supabase
      .from("players")
      .select("id, username")
      .in("id", playerIdList);
    usernameMap = Object.fromEntries((playerNames || []).map((p) => [p.id, p.username]));
  }

  const attackerHistory = (attackerRaids || []).map((r) => ({
    ...r,
    role: "attacker" as const,
    opponent_username: usernameMap[r.defender_id] || "Unknown",
  }));

  const defenderHistory = (defenderRaids || []).map((r) => ({
    ...r,
    role: "defender" as const,
    opponent_username: usernameMap[r.attacker_id] || "Unknown",
  }));

  // Merge and sort by date
  const allRaids = [...attackerHistory, ...defenderHistory].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 50);

  return NextResponse.json({ raids: allRaids });
}
