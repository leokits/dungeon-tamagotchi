import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getShopItemById } from "@/lib/shop/catalog";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: player } = await supabase
    .from("players")
    .select("id, chrono_dust")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  let body: { item_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { item_id } = body;
  if (!item_id) {
    return NextResponse.json({ error: "item_id is required" }, { status: 400 });
  }

  const shopItem = getShopItemById(item_id);
  if (!shopItem) {
    return NextResponse.json({ error: "Invalid item" }, { status: 400 });
  }

  if (player.chrono_dust < shopItem.price_dust) {
    return NextResponse.json(
      { error: "Insufficient chrono dust", current: player.chrono_dust, required: shopItem.price_dust },
      { status: 400 }
    );
  }

  const serviceSupabase = createServiceClient();

  const { data: existing } = await serviceSupabase
    .from("player_cosmetics")
    .select("id")
    .eq("player_id", player.id)
    .eq("cosmetic_id", item_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Already owned" }, { status: 409 });
  }

  const { data: cosmetic, error: insertError } = await serviceSupabase
    .from("player_cosmetics")
    .insert({
      player_id: player.id,
      cosmetic_id: item_id,
      cosmetic_type: shopItem.cosmetic_type,
      source: "shop",
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: updatedPlayer, error: updateError } = await serviceSupabase
    .from("players")
    .update({
      chrono_dust: "chrono_dust" - shopItem.price_dust,
    })
    .eq("id", player.id)
    .gte("chrono_dust", shopItem.price_dust)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!updatedPlayer) {
    return NextResponse.json({ error: "Insufficient chrono dust" }, { status: 400 });
  }

  const newDustBalance = updatedPlayer.chrono_dust;

  return NextResponse.json({
    cosmetic,
    new_dust_balance: newDustBalance,
  });
}
