import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Trade } from "@/types/database";

/**
 * GET /api/trades — List all trades where the player is initiator or recipient.
 */
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
    .select("id, username")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const serviceSupabase = createServiceClient();

  const { data: trades } = await serviceSupabase
    .from("trades")
    .select("*")
    .or(`initiator_id.eq.${player.id},recipient_id.eq.${player.id}`)
    .order("created_at", { ascending: false });

  // Enrich trades with partner info
  const enrichedTrades = await Promise.all(
    (trades || []).map(async (trade: Trade) => {
      const partnerId = trade.initiator_id === player.id ? trade.recipient_id : trade.initiator_id;
      const { data: partner } = await serviceSupabase
        .from("players")
        .select("id, username")
        .eq("id", partnerId)
        .single();

      return {
        ...trade,
        partner_username: partner?.username ?? "Unknown",
        partner_id: partnerId,
        is_initiator: trade.initiator_id === player.id,
      };
    })
  );

  return NextResponse.json({ trades: enrichedTrades });
}

/**
 * POST /api/trades — Create a new trade offer.
 * Body: { recipient_id, offered_dust, offered_resources, offered_pets, requested_dust, requested_resources, requested_pets }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: player } = await supabase
    .from("players")
    .select("id, username, chrono_dust")
    .eq("auth_id", user.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const body = await request.json();
  const {
    recipient_id,
    offered_dust = 0,
    offered_resources = {},
    offered_pets = [],
    requested_dust = 0,
    requested_resources = {},
    requested_pets = [],
  } = body as {
    recipient_id: string;
    offered_dust?: number;
    offered_resources?: Record<string, number>;
    offered_pets?: string[];
    requested_dust?: number;
    requested_resources?: Record<string, number>;
    requested_pets?: string[];
  };

  // Validate recipient_id
  if (!recipient_id) {
    return NextResponse.json({ error: "recipient_id is required" }, { status: 400 });
  }

  // Cannot trade with self
  if (recipient_id === player.id) {
    return NextResponse.json({ error: "Cannot trade with yourself" }, { status: 400 });
  }

  const serviceSupabase = createServiceClient();

  // Validate recipient exists
  const { data: recipient } = await serviceSupabase
    .from("players")
    .select("id, username")
    .eq("id", recipient_id)
    .single();

  if (!recipient) {
    return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
  }

  // Validate offered dust is sufficient
  if (offered_dust < 0) {
    return NextResponse.json({ error: "Offered dust cannot be negative" }, { status: 400 });
  }
  if (offered_dust > player.chrono_dust) {
    return NextResponse.json({ error: "Insufficient chrono dust" }, { status: 400 });
  }

  // Validate offered resources belong to player (sum across dungeon)
  if (Object.keys(offered_resources).length > 0) {
    const { data: dungeon } = await serviceSupabase
      .from("dungeons")
      .select("id")
      .eq("player_id", player.id)
      .single();

    if (dungeon) {
      const { data: resources } = await serviceSupabase
        .from("resources")
        .select("type, quantity")
        .eq("dungeon_id", dungeon.id);

      const playerResourceTotals: Record<string, number> = {};
      for (const r of resources || []) {
        playerResourceTotals[r.type] = (playerResourceTotals[r.type] || 0) + r.quantity;
      }

      for (const [type, qty] of Object.entries(offered_resources)) {
        if ((qty as number) < 0) {
          return NextResponse.json({ error: `Resource quantity cannot be negative: ${type}` }, { status: 400 });
        }
        const available = playerResourceTotals[type] || 0;
        if ((qty as number) > available) {
          return NextResponse.json({ error: `Insufficient resources: ${type}` }, { status: 400 });
        }
      }
    }
  }

  // Validate offered pets belong to player and are alive
  if (offered_pets.length > 0) {
    const { data: pets } = await serviceSupabase
      .from("pets")
      .select("id, status")
      .eq("player_id", player.id)
      .in("id", offered_pets);

    const validPetIds = new Set((pets || []).filter((p) => p.status === "alive").map((p) => p.id));
    for (const petId of offered_pets) {
      if (!validPetIds.has(petId)) {
        return NextResponse.json({ error: `Pet ${petId} not found, not owned by you, or not alive` }, { status: 400 });
      }
    }
  }

  // Validate requested values are non-negative
  if (requested_dust < 0) {
    return NextResponse.json({ error: "Requested dust cannot be negative" }, { status: 400 });
  }
  for (const [, qty] of Object.entries(requested_resources)) {
    if ((qty as number) < 0) {
      return NextResponse.json({ error: "Requested resource quantities cannot be negative" }, { status: 400 });
    }
  }

  // Create trade record
  const { data: trade, error } = await serviceSupabase
    .from("trades")
    .insert({
      initiator_id: player.id,
      recipient_id,
      status: "pending",
      initiator_offered_dust: offered_dust,
      recipient_offered_dust: requested_dust,
      initiator_offered_resources: offered_resources,
      recipient_offered_resources: requested_resources,
      initiator_offered_pets: offered_pets,
      recipient_offered_pets: requested_pets,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      trade: {
        ...trade,
        partner_username: recipient.username,
        partner_id: recipient_id,
        is_initiator: true,
      },
    },
    { status: 201 }
  );
}
