import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function getAuthenticatedPlayer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: player } = await supabase
    .from("players")
    .select("id, username, chrono_dust")
    .eq("auth_id", user.id)
    .single();

  if (!player) return { error: NextResponse.json({ error: "Player not found" }, { status: 404 }) };
  return { player };
}

async function getPlayerDungeonId(playerId: string) {
  const serviceSupabase = createServiceClient();
  const { data: dungeon } = await serviceSupabase
    .from("dungeons")
    .select("id")
    .eq("player_id", playerId)
    .single();
  return dungeon?.id ?? null;
}

async function sumDungeonResources(dungeonId: string): Promise<Record<string, number>> {
  const serviceSupabase = createServiceClient();
  const { data: resources } = await serviceSupabase
    .from("resources")
    .select("type, quantity")
    .eq("dungeon_id", dungeonId);

  const totals: Record<string, number> = {};
  for (const r of resources || []) {
    totals[r.type] = (totals[r.type] || 0) + r.quantity;
  }
  return totals;
}

async function deductResources(dungeonId: string, resources: Record<string, number>) {
  const serviceSupabase = createServiceClient();

  for (const [type, qty] of Object.entries(resources)) {
    const { data: rows } = await serviceSupabase
      .from("resources")
      .select("id, quantity")
      .eq("dungeon_id", dungeonId)
      .eq("type", type)
      .gt("quantity", 0)
      .order("quantity", { ascending: true });

    let remaining = qty as number;
    for (const row of rows || []) {
      if (remaining <= 0) break;
      const deduct = Math.min(row.quantity, remaining);
      const newQty = row.quantity - deduct;

      if (newQty <= 0) {
        await serviceSupabase.from("resources").delete().eq("id", row.id);
      } else {
        await serviceSupabase.from("resources").update({ quantity: newQty }).eq("id", row.id);
      }
      remaining -= deduct;
    }
  }
}

async function addResources(dungeonId: string, resources: Record<string, number>) {
  const serviceSupabase = createServiceClient();

  for (const [type, qty] of Object.entries(resources)) {
    const quantity = qty as number;
    if (quantity <= 0) continue;

    const { data: existing } = await serviceSupabase
      .from("resources")
      .select("id, quantity")
      .eq("dungeon_id", dungeonId)
      .eq("type", type)
      .limit(1)
      .single();

    if (existing) {
      await serviceSupabase
        .from("resources")
        .update({ quantity: existing.quantity + quantity })
        .eq("id", existing.id);
    } else {
      const { data: tile } = await serviceSupabase
        .from("tiles")
        .select("id")
        .eq("dungeon_id", dungeonId)
        .limit(1)
        .single();

      if (tile) {
        await serviceSupabase
          .from("resources")
          .insert({ tile_id: tile.id, dungeon_id: dungeonId, type, quantity });
      }
    }
  }
}

/**
 * POST /api/trades/[id]/complete — Execute an accepted trade, exchanging items between players.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedPlayer();
  if (auth.error) return auth.error;
  const { player } = auth;

  const { id } = await params;
  const serviceSupabase = createServiceClient();

  const { data: fetchedTrade } = await serviceSupabase
    .from("trades")
    .select("*")
    .eq("id", id)
    .single();

  if (!fetchedTrade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  if (fetchedTrade.initiator_id !== player.id && fetchedTrade.recipient_id !== player.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Atomic status transition to prevent TOCTOU race condition
  const { data: updatedTrade, error: transitionError } = await serviceSupabase
    .from("trades")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "accepted")
    .select()
    .single();

  if (transitionError && transitionError.code === "PGRST116") {
    return NextResponse.json({ error: "Trade is no longer accepted — may have expired or been completed by another request" }, { status: 409 });
  }

  if (transitionError) {
    return NextResponse.json({ error: transitionError.message }, { status: 500 });
  }

  if (!updatedTrade) {
    return NextResponse.json({ error: "Trade is no longer accepted — may have expired or been completed by another request" }, { status: 409 });
  }


  const initiatorId = updatedTrade.initiator_id;
  const recipientId = updatedTrade.recipient_id;

  const { data: initiator } = await serviceSupabase
    .from("players")
    .select("id, chrono_dust")
    .eq("id", initiatorId)
    .single();

  if (!initiator || initiator.chrono_dust < updatedTrade.initiator_offered_dust) {
    return NextResponse.json({ error: "Initiator no longer has sufficient dust" }, { status: 400 });
  }

  const { data: recipient } = await serviceSupabase
    .from("players")
    .select("id, chrono_dust")
    .eq("id", recipientId)
    .single();

  if (!recipient || recipient.chrono_dust < updatedTrade.recipient_offered_dust) {
    return NextResponse.json({ error: "Recipient no longer has sufficient dust" }, { status: 400 });
  }

  if (updatedTrade.initiator_offered_pets && (updatedTrade.initiator_offered_pets as string[]).length > 0) {
    const { data: pets } = await serviceSupabase
      .from("pets")
      .select("id")
      .eq("player_id", initiatorId)
      .in("id", updatedTrade.initiator_offered_pets);

    if ((pets || []).length !== (updatedTrade.initiator_offered_pets as string[]).length) {
      return NextResponse.json({ error: "Initiator no longer owns all offered pets" }, { status: 400 });
    }
  }

  if (updatedTrade.recipient_offered_pets && (updatedTrade.recipient_offered_pets as string[]).length > 0) {
    const { data: pets } = await serviceSupabase
      .from("pets")
      .select("id")
      .eq("player_id", recipientId)
      .in("id", updatedTrade.recipient_offered_pets);

    if ((pets || []).length !== (updatedTrade.recipient_offered_pets as string[]).length) {
      return NextResponse.json({ error: "Recipient no longer owns all offered pets" }, { status: 400 });
    }
  }

  const initiatorDungeonId = await getPlayerDungeonId(initiatorId);
  const recipientDungeonId = await getPlayerDungeonId(recipientId);

  if (initiatorDungeonId && updatedTrade.initiator_offered_resources && Object.keys(updatedTrade.initiator_offered_resources).length > 0) {
    const available = await sumDungeonResources(initiatorDungeonId);
    for (const [type, qty] of Object.entries(updatedTrade.initiator_offered_resources)) {
      if ((available[type] || 0) < (qty as number)) {
        return NextResponse.json({ error: `Initiator no longer has sufficient ${type}` }, { status: 400 });
      }
    }
  }

  if (recipientDungeonId && updatedTrade.recipient_offered_resources && Object.keys(updatedTrade.recipient_offered_resources).length > 0) {
    const available = await sumDungeonResources(recipientDungeonId);
    for (const [type, qty] of Object.entries(updatedTrade.recipient_offered_resources)) {
      if ((available[type] || 0) < (qty as number)) {
        return NextResponse.json({ error: `Recipient no longer has sufficient ${type}` }, { status: 400 });
      }
    }
  }

  // Execute exchange: dust, resources, pets (status already set atomically above)

  const initiatorNewDust = initiator.chrono_dust - updatedTrade.initiator_offered_dust + updatedTrade.recipient_offered_dust;
  const recipientNewDust = recipient.chrono_dust + updatedTrade.initiator_offered_dust - updatedTrade.recipient_offered_dust;

  await serviceSupabase
    .from("players")
    .update({ chrono_dust: initiatorNewDust })
    .eq("id", initiatorId);

  await serviceSupabase
    .from("players")
    .update({ chrono_dust: recipientNewDust })
    .eq("id", recipientId);

  if (initiatorDungeonId && recipientDungeonId) {
    if (updatedTrade.initiator_offered_resources && Object.keys(updatedTrade.initiator_offered_resources).length > 0) {
      await deductResources(initiatorDungeonId, updatedTrade.initiator_offered_resources);
      await addResources(recipientDungeonId, updatedTrade.initiator_offered_resources);
    }
    if (updatedTrade.recipient_offered_resources && Object.keys(updatedTrade.recipient_offered_resources).length > 0) {
      await deductResources(recipientDungeonId, updatedTrade.recipient_offered_resources);
      await addResources(initiatorDungeonId, updatedTrade.recipient_offered_resources);
    }
  }

  if (updatedTrade.initiator_offered_pets && (updatedTrade.initiator_offered_pets as string[]).length > 0) {
    await serviceSupabase
      .from("pets")
      .update({ player_id: recipientId })
      .in("id", updatedTrade.initiator_offered_pets);
  }

  if (updatedTrade.recipient_offered_pets && (updatedTrade.recipient_offered_pets as string[]).length > 0) {
    await serviceSupabase
      .from("pets")
      .update({ player_id: initiatorId })
      .in("id", updatedTrade.recipient_offered_pets);
  }


  return NextResponse.json({ success: true, trade: updatedTrade });
}
