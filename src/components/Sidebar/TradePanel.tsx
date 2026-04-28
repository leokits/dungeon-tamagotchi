"use client";

import { useState, useEffect, useCallback } from "react";
import type { Trade, TradeStatus, Pet, ResourceType } from "@/types/database";

const RESOURCES: { type: ResourceType; emoji: string; label: string }[] = [
  { type: "mushroom", emoji: "🍄", label: "Mushroom" },
  { type: "crystal_shard", emoji: "💎", label: "Crystal Shard" },
  { type: "bone", emoji: "🦴", label: "Bone" },
  { type: "mana_orb", emoji: "🔮", label: "Mana Orb" },
  { type: "moss", emoji: "🌿", label: "Moss" },
];

const STATUS_COLORS: Record<TradeStatus, string> = {
  pending: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  accepted: "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
  rejected: "text-red-400 bg-red-400/10 border-red-400/30",
  completed: "text-green-400 bg-green-400/10 border-green-400/30",
  cancelled: "text-gray-400 bg-gray-400/10 border-gray-400/30",
};

interface EnrichedTrade extends Trade {
  partner_username: string;
  partner_id: string;
  is_initiator: boolean;
}

interface PlayerPet {
  id: string;
  name: string | null;
  base_type: string;
  level: number;
  status: string;
}

export default function TradePanel() {
  const [activeTab, setActiveTab] = useState<"my" | "new">("my");
  const [trades, setTrades] = useState<EnrichedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [recipientId, setRecipientId] = useState("");
  const [offeredDust, setOfferedDust] = useState(0);
  const [offeredResources, setOfferedResources] = useState<Record<string, number>>({});
  const [offeredPets, setOfferedPets] = useState<string[]>([]);
  const [requestedDust, setRequestedDust] = useState(0);
  const [requestedResources, setRequestedResources] = useState<Record<string, number>>({});
  const [requestedPets, setRequestedPets] = useState<string[]>([]);
  const [myPets, setMyPets] = useState<PlayerPet[]>([]);
  const [myDust, setMyDust] = useState(0);
  const [creatingTrade, setCreatingTrade] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const loadTrades = useCallback(async () => {
    try {
      const res = await fetch("/api/trades");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to load trades");
        return;
      }
      const json = await res.json();
      setTrades(json.trades || []);
      setError(null);
    } catch {
      setError("Failed to load trades");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlayerData = useCallback(async () => {
    try {
      const res = await fetch("/api/pets");
      if (res.ok) {
        const json = await res.json();
        setMyPets((json.pets || []).filter((p: PlayerPet) => p.status === "alive"));
      }
    } catch {
      // eslint-disable-next-line no-empty
    }
  }, []);

  useEffect(() => {
    loadTrades();
    loadPlayerData();
  }, [loadTrades, loadPlayerData]);

  useEffect(() => {
    const hasPending = trades.some((t) => t.status === "pending");
    if (!hasPending) return;
    const interval = setInterval(loadTrades, 30000);
    return () => clearInterval(interval);
  }, [trades, loadTrades]);

  const handleTradeAction = async (tradeId: string, action: "accept" | "reject" | "cancel" | "complete") => {
    setActionLoading(tradeId);
    setError(null);
    try {
      let res: Response;
      if (action === "cancel") {
        res = await fetch(`/api/trades/${tradeId}`, { method: "DELETE" });
      } else if (action === "complete") {
        res = await fetch(`/api/trades/${tradeId}/complete`, { method: "POST" });
      } else {
        res = await fetch(`/api/trades/${tradeId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
      }

      const body = await res.json();
      if (res.ok) {
        await loadTrades();
      } else {
        setError(body.error || `Failed to ${action} trade`);
      }
    } catch {
      setError(`Failed to ${action} trade`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateTrade = async () => {
    setCreatingTrade(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_id: recipientId,
          offered_dust: offeredDust,
          offered_resources: offeredResources,
          offered_pets: offeredPets,
          requested_dust: requestedDust,
          requested_resources: requestedResources,
          requested_pets: requestedPets,
        }),
      });
      const body = await res.json();
      if (res.ok) {
        setCreateSuccess("Trade offer sent!");
        setRecipientId("");
        setOfferedDust(0);
        setOfferedResources({});
        setOfferedPets([]);
        setRequestedDust(0);
        setRequestedResources({});
        setRequestedPets([]);
        await loadTrades();
        setTimeout(() => setCreateSuccess(null), 3000);
      } else {
        setCreateError(body.error || "Failed to create trade");
      }
    } catch {
      setCreateError("Failed to create trade");
    } finally {
      setCreatingTrade(false);
    }
  };

  const toggleResource = (
    type: string,
    direction: "offered" | "requested",
    delta: number
  ) => {
    const setter = direction === "offered" ? setOfferedResources : setRequestedResources;
    setter((prev) => {
      const current = prev[type] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [type]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [type]: next };
    });
  };

  const togglePet = (petId: string, direction: "offered" | "requested") => {
    const setter = direction === "offered" ? setOfferedPets : setRequestedPets;
    setter((prev) =>
      prev.includes(petId) ? prev.filter((id) => id !== petId) : [...prev, petId]
    );
  };

  const pendingReceived = trades.filter((t) => t.status === "pending" && !t.is_initiator);
  const pendingSent = trades.filter((t) => t.status === "pending" && t.is_initiator);
  const otherTrades = trades.filter((t) => t.status !== "pending");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-2">
        <div className="flex flex-1">
          <button
            onClick={() => setActiveTab("my")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === "my"
                ? "border-b-2 border-amber-400 text-amber-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            My Trades
          </button>
          <button
            onClick={() => setActiveTab("new")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === "new"
                ? "border-b-2 border-amber-400 text-amber-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            New Trade
          </button>
        </div>
        <button onClick={loadTrades} className="px-2 text-zinc-500 hover:text-white" title="Refresh">
          &#x21bb;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {error && (
          <div className="mb-2 rounded-lg bg-red-900/30 border border-red-800/50 p-2 text-xs text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">&times;</button>
          </div>
        )}

        {activeTab === "my" && (
          <>
            {loading && (
              <div className="flex items-center justify-center py-8">
                <p className="text-xs text-zinc-500">Loading trades...</p>
              </div>
            )}

            {!loading && pendingReceived.length === 0 && pendingSent.length === 0 && otherTrades.length === 0 && (
              <div className="rounded-lg bg-zinc-800/50 p-4 text-center">
                <div className="text-2xl mb-1">&#x1F91D;</div>
                <p className="text-xs text-zinc-400">No trades yet</p>
                <p className="text-xs text-zinc-600 mt-0.5">Create a trade offer to get started</p>
              </div>
            )}

            {pendingReceived.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-amber-400 mb-1.5">
                  Incoming ({pendingReceived.length})
                </div>
                <div className="space-y-1.5">
                  {pendingReceived.map((trade) => (
                    <TradeItem
                      key={trade.id}
                      trade={trade}
                      actionLoading={actionLoading === trade.id}
                      onAction={handleTradeAction}
                    />
                  ))}
                </div>
              </div>
            )}

            {pendingSent.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-cyan-400 mb-1.5">
                  Sent ({pendingSent.length})
                </div>
                <div className="space-y-1.5">
                  {pendingSent.map((trade) => (
                    <TradeItem
                      key={trade.id}
                      trade={trade}
                      actionLoading={actionLoading === trade.id}
                      onAction={handleTradeAction}
                    />
                  ))}
                </div>
              </div>
            )}

            {otherTrades.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-zinc-400 mb-1.5">
                  History ({otherTrades.length})
                </div>
                <div className="space-y-1.5">
                  {otherTrades.map((trade) => (
                    <TradeItem
                      key={trade.id}
                      trade={trade}
                      actionLoading={actionLoading === trade.id}
                      onAction={handleTradeAction}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "new" && (
          <div className="space-y-3">
            {createError && (
              <div className="rounded-lg bg-red-900/30 border border-red-800/50 p-2 text-xs text-red-400">
                {createError}
                <button onClick={() => setCreateError(null)} className="ml-2 text-red-300 hover:text-white">&times;</button>
              </div>
            )}
            {createSuccess && (
              <div className="rounded-lg bg-green-900/30 border border-green-800/50 p-2 text-xs text-green-400">
                {createSuccess}
              </div>
            )}

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Recipient ID</label>
              <input
                type="text"
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                placeholder="Enter player UUID..."
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-zinc-300 mb-1.5">You Offer</div>
              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Chrono Dust</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOfferedDust(Math.max(0, offeredDust - 10))}
                      className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-600"
                    >
                      -10
                    </button>
                    <span className="text-xs font-mono text-amber-400 w-12 text-center">{offeredDust}</span>
                    <button
                      onClick={() => setOfferedDust(offeredDust + 10)}
                      className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-600"
                    >
                      +10
                    </button>
                  </div>
                </div>

                {RESOURCES.map((r) => (
                  <div key={r.type} className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">{r.emoji} {r.label}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleResource(r.type, "offered", -1)}
                        className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-600"
                      >
                        -1
                      </button>
                      <span className="text-xs font-mono text-zinc-200 w-8 text-center">
                        {offeredResources[r.type] || 0}
                      </span>
                      <button
                        onClick={() => toggleResource(r.type, "offered", 1)}
                        className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-600"
                      >
                        +1
                      </button>
                    </div>
                  </div>
                ))}

                <div>
                  <span className="text-xs text-zinc-400 block mb-1">Pets</span>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {myPets.length === 0 ? (
                      <p className="text-xs text-zinc-600">No alive pets</p>
                    ) : (
                      myPets.map((pet) => {
                        const selected = offeredPets.includes(pet.id);
                        return (
                          <button
                            key={pet.id}
                            onClick={() => togglePet(pet.id, "offered")}
                            className={`w-full rounded px-2 py-1 text-xs text-left transition-colors ${
                              selected
                                ? "bg-amber-900/40 border border-amber-500 text-amber-300"
                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            }`}
                          >
                            {pet.name || pet.base_type} Lv{pet.level}
                            {selected && " ✓"}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-zinc-300 mb-1.5">You Request</div>
              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Chrono Dust</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRequestedDust(Math.max(0, requestedDust - 10))}
                      className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-600"
                    >
                      -10
                    </button>
                    <span className="text-xs font-mono text-amber-400 w-12 text-center">{requestedDust}</span>
                    <button
                      onClick={() => setRequestedDust(requestedDust + 10)}
                      className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-600"
                    >
                      +10
                    </button>
                  </div>
                </div>

                {RESOURCES.map((r) => (
                  <div key={r.type} className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">{r.emoji} {r.label}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleResource(r.type, "requested", -1)}
                        className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-600"
                      >
                        -1
                      </button>
                      <span className="text-xs font-mono text-zinc-200 w-8 text-center">
                        {requestedResources[r.type] || 0}
                      </span>
                      <button
                        onClick={() => toggleResource(r.type, "requested", 1)}
                        className="rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-600"
                      >
                        +1
                      </button>
                    </div>
                  </div>
                ))}

                <div>
                  <span className="text-xs text-zinc-400 block mb-1">Pets (by ID)</span>
                  <div className="space-y-1">
                    {requestedPets.map((petId) => (
                      <div key={petId} className="flex items-center justify-between rounded bg-zinc-800 px-2 py-1">
                        <span className="text-xs text-zinc-300 font-mono">{petId.slice(0, 8)}...</span>
                        <button
                          onClick={() => togglePet(petId, "requested")}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const id = prompt("Enter pet UUID:");
                        if (id && id.trim()) {
                          togglePet(id.trim(), "requested");
                        }
                      }}
                      className="w-full rounded bg-zinc-800 border border-dashed border-zinc-600 px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
                    >
                      + Add Pet ID
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleCreateTrade}
              disabled={creatingTrade || !recipientId.trim()}
              className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creatingTrade ? "Creating..." : "Send Trade Offer"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface TradeItemProps {
  trade: EnrichedTrade;
  actionLoading: boolean;
  onAction: (tradeId: string, action: "accept" | "reject" | "cancel" | "complete") => void;
}

function TradeItem({ trade, actionLoading, onAction }: TradeItemProps) {
  const statusLabel = trade.status.charAt(0).toUpperCase() + trade.status.slice(1);
  const statusColor = STATUS_COLORS[trade.status];

  const offeredDust = trade.is_initiator ? trade.initiator_offered_dust : trade.recipient_offered_dust;
  const requestedDust = trade.is_initiator ? trade.recipient_offered_dust : trade.initiator_offered_dust;

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-800/50 transition-colors bg-zinc-800/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-medium text-zinc-200 truncate">
            {trade.is_initiator ? "→" : "←"} {trade.partner_username}
          </span>
          <span className={`text-[10px] font-medium ml-2 flex-shrink-0 rounded border px-1.5 py-0.5 ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          {offeredDust > 0 && (
            <span className="text-amber-400">{offeredDust} dust</span>
          )}
          {requestedDust > 0 && (
            <span className="text-zinc-400">wants {requestedDust} dust</span>
          )}
        </div>

        <div className="text-[10px] text-zinc-600 mt-0.5">
          {new Date(trade.created_at).toLocaleDateString()}
        </div>
      </div>

      <div className="flex gap-1.5 flex-shrink-0">
        {trade.status === "pending" && !trade.is_initiator && (
          <>
            <button
              onClick={() => onAction(trade.id, "accept")}
              disabled={actionLoading}
              className="rounded bg-green-700 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={() => onAction(trade.id, "reject")}
              disabled={actionLoading}
              className="rounded bg-red-700 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              Reject
            </button>
          </>
        )}

        {trade.status === "pending" && trade.is_initiator && (
          <button
            onClick={() => onAction(trade.id, "cancel")}
            disabled={actionLoading}
            className="rounded bg-gray-700 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        )}

        {trade.status === "accepted" && (
          <button
            onClick={() => onAction(trade.id, "complete")}
            disabled={actionLoading}
            className="rounded bg-cyan-700 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-cyan-600 disabled:opacity-50 transition-colors"
          >
            Complete
          </button>
        )}
      </div>
    </div>
  );
}
