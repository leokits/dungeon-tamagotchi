import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Trade } from "@/types/database";

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

async function getTrade(tradeId: string) {
  const serviceSupabase = createServiceClient();
  const { data: trade } = await serviceSupabase
    .from("trades")
    .select("*")
    .eq("id", tradeId)
    .single();
  return trade;
}

/**
 * GET /api/trades/[id] — Get full trade details.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedPlayer();
  if (auth.error) return auth.error;
  const { player } = auth;

  const { id } = await params;
  const trade = await getTrade(id);

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  if (trade.initiator_id !== player.id && trade.recipient_id !== player.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceSupabase = createServiceClient();
  const partnerId = trade.initiator_id === player.id ? trade.recipient_id : trade.initiator_id;
  const { data: partner } = await serviceSupabase
    .from("players")
    .select("id, username")
    .eq("id", partnerId)
    .single();

  return NextResponse.json({
    trade: {
      ...trade,
      partner_username: partner?.username ?? "Unknown",
      partner_id: partnerId,
      is_initiator: trade.initiator_id === player.id,
    },
  });
}

/**
 * POST /api/trades/[id] — Accept or reject a trade (recipient only).
 * Body: { action: "accept" | "reject" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedPlayer();
  if (auth.error) return auth.error;
  const { player } = auth;

  const { id } = await params;
  const trade = await getTrade(id);

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  if (trade.recipient_id !== player.id) {
    return NextResponse.json({ error: "Only the recipient can accept or reject a trade" }, { status: 403 });
  }

  if (trade.status !== "pending") {
    return NextResponse.json({ error: `Trade is already ${trade.status}` }, { status: 400 });
  }

  const body = await request.json();
  const { action } = body as { action?: string };

  if (action !== "accept" && action !== "reject") {
    return NextResponse.json({ error: 'Action must be "accept" or "reject"' }, { status: 400 });
  }

  const newStatus = action === "accept" ? "accepted" : "rejected";
  const serviceSupabase = createServiceClient();

  const { data: updatedTrade, error } = await serviceSupabase
    .from("trades")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: partner } = await serviceSupabase
    .from("players")
    .select("id, username")
    .eq("id", trade.initiator_id)
    .single();

  return NextResponse.json({
    trade: {
      ...updatedTrade,
      partner_username: partner?.username ?? "Unknown",
      partner_id: trade.initiator_id,
      is_initiator: false,
    },
  });
}

/**
 * DELETE /api/trades/[id] — Cancel a pending trade (initiator only).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedPlayer();
  if (auth.error) return auth.error;
  const { player } = auth;

  const { id } = await params;
  const trade = await getTrade(id);

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  if (trade.initiator_id !== player.id) {
    return NextResponse.json({ error: "Only the initiator can cancel a trade" }, { status: 403 });
  }

  if (trade.status !== "pending") {
    return NextResponse.json({ error: `Cannot cancel a trade that is ${trade.status}` }, { status: 400 });
  }

  const serviceSupabase = createServiceClient();

  const { error } = await serviceSupabase
    .from("trades")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
