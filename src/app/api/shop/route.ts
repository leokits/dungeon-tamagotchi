import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getShopItemsByCategory } from "@/lib/shop/catalog";

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

  const { data: owned } = await supabase
    .from("player_cosmetics")
    .select("cosmetic_id")
    .eq("player_id", player.id);

  const ownedIds = new Set((owned || []).map((c) => c.cosmetic_id));

  return NextResponse.json({
    categories: getShopItemsByCategory(),
    owned_cosmetics: Array.from(ownedIds),
  });
}
