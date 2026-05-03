"use client";

import { useState, useEffect } from "react";
import type { Pet, TrapType } from "@/types/database";
import { MONSTER_DEF_BY_ID } from "@/game/monsters";
import { resolveSpecies } from "@/game/species-utils";
import RaidReplay from "@/components/RaidReplay";

function getPetColor(pet: Pet): string {
  const species = resolveSpecies(pet);
  const def = MONSTER_DEF_BY_ID[species];
  return def?.color || "#ff6600";
}

function getPetDisplayName(pet: Pet): string {
  const species = resolveSpecies(pet);
  const def = MONSTER_DEF_BY_ID[species];
  return pet.name || def?.name || pet.base_type.replace(/_/g, " ");
}

// Trap configuration
const TRAP_CONFIG: Record<TrapType, { cost: number; damage: number; icon: string; label: string }> = {
  spike_floor: { cost: 10, damage: 15, icon: "\u26A1", label: "Spike Floor" },
  poison_gas: { cost: 15, damage: 8, icon: "\u2620\uFE0F", label: "Poison Gas" },
  decoy_crystal: { cost: 20, damage: 0, icon: "\uD83D\uDC8E", label: "Decoy Crystal" },
  wall_mimic: { cost: 25, damage: 0, icon: "\uD83E\uDDF1", label: "Wall Mimic" },
  mana_drain: { cost: 12, damage: 0, icon: "\uD83C\uDF00", label: "Mana Drain" },
};

const MAX_TRAPS = 20;
const MAX_GUARDS = 5;

interface BrowseDungeon {
  player_id: string;
  username: string;
  dungeon_id: string;
  crystal_energy: number;
  pet_count: number;
  last_active: string;
}

interface RaidHistoryEntry {
  id: string;
  role: "attacker" | "defender";
  opponent_username: string;
  result: string | null;
  depth_reached: number | null;
  loot?: { resources: Record<string, number> } | null;
  energy_drained: number | null;
  created_at: string;
}

interface LastRaidResult {
  result: string;
  depth_reached: number;
  loot: { resources: Record<string, number> };
  dead_pets: string[];
  surviving_pets: string[];
  energy_drained: number;
}

interface Trap {
  id: string;
  dungeon_id: string;
  tile_id: string;
  type: TrapType;
  damage: number;
  triggered: boolean;
  created_at: string;
}

interface GuardAssignment {
  id: string;
  dungeon_id: string;
  pet_id: string;
  chunk_x: number;
  chunk_y: number;
  patrol_radius: number;
  created_at: string;
}

interface UnlockedChunk {
  chunk_x: number;
  chunk_y: number;
}

interface RaidPanelProps {
  raidTab: "browse" | "defense" | "history";
  onTabChange: (tab: "browse" | "defense" | "history") => void;
  browseDungeons: BrowseDungeon[];
  browseLoading: boolean;
  raidHistory: RaidHistoryEntry[];
  raidHistoryLoading: boolean;
  selectedTarget: BrowseDungeon | null;
  onTargetSelect: (target: BrowseDungeon | null) => void;
  selectedRaidPets: string[];
  onRaidPetToggle: (petId: string) => void;
  raidLaunching: boolean;
  onLaunchRaid: () => void;
  lastRaidResult: LastRaidResult | null;
  onRaidResultDismiss: () => void;
  onClose: () => void;
  alivePets: Pet[];
  unlockedChunks?: UnlockedChunk[];
}

export default function RaidPanel({
  raidTab, onTabChange,
  browseDungeons, browseLoading, raidHistory, raidHistoryLoading,
  selectedTarget, onTargetSelect, selectedRaidPets, onRaidPetToggle,
  raidLaunching, onLaunchRaid, lastRaidResult, onRaidResultDismiss, onClose,
  alivePets, unlockedChunks = [],
}: RaidPanelProps) {
  // Defense tab state
  const [traps, setTraps] = useState<Trap[]>([]);
  const [guards, setGuards] = useState<GuardAssignment[]>([]);
  const [trapsLoading, setTrapsLoading] = useState(false);
  const [guardsLoading, setGuardsLoading] = useState(false);
  const [showTrapModal, setShowTrapModal] = useState(false);
  const [showGuardModal, setShowGuardModal] = useState(false);
  const [placingTrap, setPlacingTrap] = useState(false);
  const [assigningGuard, setAssigningGuard] = useState(false);
  const [trapForm, setTrapForm] = useState<{ type: TrapType; tile_id: string }>({ type: "spike_floor", tile_id: "" });
  const [guardForm, setGuardForm] = useState<{ pet_id: string; chunk_x: number; chunk_y: number; patrol_radius: number }>({ pet_id: "", chunk_x: 0, chunk_y: 0, patrol_radius: 3 });
  const [availablePets, setAvailablePets] = useState<Pet[]>([]);
  const [availablePetsLoading, setAvailablePetsLoading] = useState(false);
  const [defenseError, setDefenseError] = useState<string | null>(null);
  const [replayData, setReplayData] = useState<{ frames: Array<{ tick: number; pets: Array<{ id: string; x: number; y: number; hp: number; action: string }> }>; events: Array<{ tick: number; type: string; pet_id?: string; cause?: string; combat_result?: { winner: string; loser: string; turns: number } }> } | null>(null);

  // Load defense data when tab becomes active
  useEffect(() => {
    if (raidTab === "defense") {
      loadTraps();
      loadGuards();
      loadAvailablePets();
    }
  }, [raidTab]);

  const loadTraps = async () => {
    setTrapsLoading(true);
    setDefenseError(null);
    try {
      const res = await fetch("/api/traps");
      if (res.ok) {
        const data = await res.json();
        setTraps(data.traps || []);
      }
    } catch {
      setDefenseError("Failed to load traps");
    }
    setTrapsLoading(false);
  };

  const loadGuards = async () => {
    setGuardsLoading(true);
    setDefenseError(null);
    try {
      const res = await fetch("/api/guards");
      if (res.ok) {
        const data = await res.json();
        setGuards(data.guards || []);
      }
    } catch {
      setDefenseError("Failed to load guards");
    }
    setGuardsLoading(false);
  };

  const loadAvailablePets = async () => {
    setAvailablePetsLoading(true);
    try {
      const res = await fetch("/api/pets");
      if (res.ok) {
        const data = await res.json();
        setAvailablePets((data.pets || []).filter((p: Pet) => p.status === "alive"));
      }
    } catch {
      setAvailablePets(alivePets);
    }
    setAvailablePetsLoading(false);
  };

  const handlePlaceTrap = async () => {
    if (!trapForm.tile_id.trim()) return;
    setPlacingTrap(true);
    setDefenseError(null);
    try {
      const res = await fetch("/api/traps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tile_id: trapForm.tile_id, type: trapForm.type }),
      });
      const data = await res.json();
      if (res.ok) {
        setTrapForm({ type: "spike_floor", tile_id: "" });
        setShowTrapModal(false);
        await loadTraps();
      } else {
        setDefenseError(data.error || "Failed to place trap");
      }
    } catch {
      setDefenseError("Error placing trap");
    }
    setPlacingTrap(false);
  };

  const handleRemoveTrap = async (trapId: string) => {
    setDefenseError(null);
    try {
      const res = await fetch(`/api/traps/${trapId}`, { method: "DELETE" });
      if (res.ok) {
        await loadTraps();
      } else {
        const data = await res.json();
        setDefenseError(data.error || "Failed to remove trap");
      }
    } catch {
      setDefenseError("Error removing trap");
    }
  };

  const handleAssignGuard = async () => {
    if (!guardForm.pet_id) return;
    setAssigningGuard(true);
    setDefenseError(null);
    try {
      const res = await fetch("/api/guards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pet_id: guardForm.pet_id,
          chunk_x: guardForm.chunk_x,
          chunk_y: guardForm.chunk_y,
          patrol_radius: guardForm.patrol_radius,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setGuardForm({ pet_id: "", chunk_x: 0, chunk_y: 0, patrol_radius: 3 });
        setShowGuardModal(false);
        await loadGuards();
      } else {
        setDefenseError(data.error || "Failed to assign guard");
      }
    } catch {
      setDefenseError("Error assigning guard");
    }
    setAssigningGuard(false);
  };

  const handleRemoveGuard = async (guardId: string) => {
    setDefenseError(null);
    try {
      const res = await fetch(`/api/guards/${guardId}`, { method: "DELETE" });
      if (res.ok) {
        await loadGuards();
      } else {
        const data = await res.json();
        setDefenseError(data.error || "Failed to remove guard");
      }
    } catch {
      setDefenseError("Error removing guard");
    }
  };

  const getGuardPet = (petId: string): Pet | undefined => {
    return availablePets.find((p) => p.id === petId) || alivePets.find((p) => p.id === petId);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-2">
        <div className="flex flex-1">
          <button
            onClick={() => onTabChange("browse")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              raidTab === "browse"
                ? "border-b-2 border-amber-400 text-amber-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Browse
          </button>
          <button
            onClick={() => onTabChange("defense")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              raidTab === "defense"
                ? "border-b-2 border-amber-400 text-amber-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            My Defense
          </button>
          <button
            onClick={() => onTabChange("history")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              raidTab === "history"
                ? "border-b-2 border-amber-400 text-amber-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            History
          </button>
        </div>
        <button onClick={onClose} className="px-2 text-zinc-500 hover:text-white">&times;</button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {raidTab === "browse" && (
          !selectedTarget ? (
            <div>
              <p className="text-xs text-zinc-400 mb-2">Select a dungeon to raid:</p>
              {browseLoading ? (
                <p className="text-xs text-zinc-500">Loading dungeons...</p>
              ) : browseDungeons.length === 0 ? (
                <p className="text-xs text-zinc-500">No other players found yet.</p>
              ) : (
                <div className="space-y-2">
                  {browseDungeons.map((d) => (
                    <button
                      key={d.dungeon_id}
                      onClick={() => onTargetSelect(d)}
                      className="w-full rounded-lg bg-zinc-800 p-3 text-left transition-colors hover:bg-zinc-700"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-zinc-200">{d.username}</span>
                        <span className="text-xs text-zinc-500">{new Date(d.last_active).toLocaleDateString()}</span>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs">
                        <span className="text-cyan-400">CE: {d.crystal_energy.toFixed(0)}%</span>
                        <span className="text-green-400">Pets: {d.pet_count}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <button onClick={() => onTargetSelect(null)} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white mb-2 transition-colors">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M10 3L5 8l5 5" />
                </svg>
                Back
              </button>
              <span className="text-sm font-medium text-zinc-200">Raid {selectedTarget.username}</span>
              <p className="text-xs text-zinc-400 mt-1 mb-2">Select up to 3 pets (hunger &ge; 20%):</p>
              <div className="space-y-1.5 mb-3">
                {alivePets.length === 0 ? (
                  <p className="text-xs text-zinc-500">No alive pets.</p>
                ) : (
                  alivePets.map((pet) => {
                    const isSelected = selectedRaidPets.includes(pet.id);
                    const tooHungry = pet.hunger < 0.2;
                    return (
                      <button
                        key={pet.id}
                        onClick={() => {
                          if (tooHungry) return;
                          onRaidPetToggle(pet.id);
                        }}
                        className={`w-full rounded p-2 text-xs flex items-center justify-between transition-colors ${
                          isSelected
                            ? "bg-amber-900/40 border border-amber-500"
                            : tooHungry
                            ? "bg-zinc-800 opacity-50 cursor-not-allowed"
                            : "bg-zinc-800 hover:bg-zinc-700"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getPetColor(pet) }} />
                          <span className="text-zinc-200">{getPetDisplayName(pet)} Lv{pet.level ?? 1}</span>
                        </div>
                        <div className="flex gap-2 text-zinc-400">
                          <span>HP {pet.hp}</span>
                          <span className={pet.hunger < 0.2 ? "text-red-400" : "text-zinc-400"}>
                            H {(pet.hunger * 100).toFixed(0)}%
                          </span>
                          {isSelected && <span className="text-amber-400">&check;</span>}
                          {tooHungry && <span className="text-red-400">Hungry</span>}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <button
                disabled={selectedRaidPets.length === 0 || raidLaunching}
                onClick={onLaunchRaid}
                className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {raidLaunching ? "Simulating..." : `\u2694\uFE0F Launch Raid (${selectedRaidPets.length})`}
              </button>
            </div>
          )
        )}

        {raidTab === "defense" && (
          <div>
            {defenseError && (
              <div className="mb-2 rounded-lg bg-red-900/30 border border-red-800/50 p-2 text-xs text-red-400">
                {defenseError}
                <button onClick={() => setDefenseError(null)} className="ml-2 text-red-300 hover:text-white">&times;</button>
              </div>
            )}

            {/* Traps Section */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-zinc-200">Traps</h3>
                <button
                  onClick={() => setShowTrapModal(true)}
                  disabled={traps.length >= MAX_TRAPS}
                  className="rounded bg-amber-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Place Trap
                </button>
              </div>
              <p className="text-xs text-zinc-500 mb-2">{traps.length}/{MAX_TRAPS} traps placed</p>
              {trapsLoading ? (
                <p className="text-xs text-zinc-500">Loading traps...</p>
              ) : traps.length === 0 ? (
                <div className="rounded-lg bg-zinc-800/50 p-4 text-center">
                  <div className="text-2xl mb-1">\uD83D\uDEE1\uFE0F</div>
                  <p className="text-xs text-zinc-400">No traps placed yet</p>
                  <p className="text-xs text-zinc-600 mt-0.5">Place traps to defend your dungeon</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {traps.map((trap) => {
                    const config = TRAP_CONFIG[trap.type];
                    return (
                      <div key={trap.id} className="rounded-lg bg-zinc-800 p-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{config.icon}</span>
                            <div>
                              <span className="font-medium text-zinc-200">{config.label}</span>
                              <div className="text-zinc-500 text-[10px]">Tile: {trap.tile_id.slice(0, 8)}...</div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveTrap(trap.id)}
                            className="rounded px-1.5 py-0.5 text-zinc-500 hover:text-red-400 hover:bg-red-900/30 transition-colors"
                            title="Remove trap (50% refund)"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="flex gap-3 mt-1.5 text-zinc-400">
                          {config.damage > 0 && <span>DMG: {config.damage}</span>}
                          <span className={trap.triggered ? "text-red-400" : "text-green-400"}>
                            {trap.triggered ? "Triggered" : "Active"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Guards Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-zinc-200">Guards</h3>
                <button
                  onClick={() => setShowGuardModal(true)}
                  disabled={guards.length >= MAX_GUARDS}
                  className="rounded bg-amber-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Assign Guard
                </button>
              </div>
              <p className="text-xs text-zinc-500 mb-2">{guards.length}/{MAX_GUARDS} guards assigned</p>
              {guardsLoading ? (
                <p className="text-xs text-zinc-500">Loading guards...</p>
              ) : guards.length === 0 ? (
                <div className="rounded-lg bg-zinc-800/50 p-4 text-center">
                  <div className="text-2xl mb-1">\uD83D\uDC15</div>
                  <p className="text-xs text-zinc-400">No guards assigned yet</p>
                  <p className="text-xs text-zinc-600 mt-0.5">Assign pets to patrol your chunks</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {guards.map((guard) => {
                    const pet = getGuardPet(guard.pet_id);
                    return (
                      <div key={guard.id} className="rounded-lg bg-zinc-800 p-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {pet ? (
                              <>
                                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: getPetColor(pet) }} />
                                <div>
                                  <span className="font-medium text-zinc-200">{getPetDisplayName(pet)}</span>
                                  <span className="text-zinc-500 ml-1">Lv{pet.level ?? 1}</span>
                                </div>
                              </>
                            ) : (
                              <div className="w-4 h-4 rounded-full bg-zinc-600 flex-shrink-0" />
                            )}
                          </div>
                          <button
                            onClick={() => handleRemoveGuard(guard.id)}
                            className="rounded px-1.5 py-0.5 text-zinc-500 hover:text-red-400 hover:bg-red-900/30 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="flex gap-3 mt-1.5 text-zinc-400">
                          <span>Chunk ({guard.chunk_x}, {guard.chunk_y})</span>
                          <span>Radius: {guard.patrol_radius}</span>
                          {pet && <span className="text-green-400">HP {pet.hp}/{pet.max_hp}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {raidTab === "history" && (
          raidHistoryLoading ? (
            <p className="text-xs text-zinc-500">Loading history...</p>
          ) : raidHistory.length === 0 ? (
            <p className="text-xs text-zinc-500">No raid history yet.</p>
          ) : (
            <div className="space-y-2">
              {raidHistory.map((r) => {
                const isAttacker = r.role === "attacker";
                const won = (isAttacker && r.result === "attacker_win") || (!isAttacker && r.result === "defender_win");
                const drew = r.result === "draw";
                return (
                  <div key={r.id} className="rounded-lg bg-zinc-800 p-3 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={won ? "text-green-400" : drew ? "text-yellow-400" : "text-red-400"}>
                          {won ? "\uD83C\uDFC6 Win" : drew ? "\u2696\uFE0F Draw" : "\uD83D\uDC80 Loss"}
                        </span>
                        <span className="text-zinc-400">
                          {isAttacker ? "\u2192" : "\u2190"} {r.opponent_username}
                        </span>
                      </div>
                      <span className="text-zinc-500">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex gap-3 text-zinc-500">
                      <span>Depth: {r.depth_reached ?? 0}</span>
                      {isAttacker && r.loot && (
                        <span className="text-green-400">
                          Loot: {Object.entries(r.loot.resources || {}).filter(([, v]) => (v as number) > 0).map(([k, v]) => `${k.replace(/_/g, " ")} \u00D7${v}`).join(", ") || "none"}
                        </span>
                      )}
                      {!isAttacker && r.energy_drained !== null && (
                        <span className="text-red-400">Drained: {r.energy_drained}</span>
                      )}
                      <button
                        onClick={() => fetch(`/api/raid/${r.id}`).then(res => res.json()).then(data => {
                          if (data.raid?.replay_data) setReplayData(data.raid.replay_data);
                        })}
                        className="text-cyan-400 hover:text-cyan-300 ml-auto"
                      >
                        ▶ Replay
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Trap Placement Modal */}
      {showTrapModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-xl bg-zinc-900 border border-zinc-700 p-5 shadow-2xl">
            <h2 className="text-sm font-bold text-zinc-200 mb-3">Place Trap</h2>

            <label className="block mb-3">
              <span className="text-xs text-zinc-400 mb-1 block">Trap Type</span>
              <select
                value={trapForm.type}
                onChange={(e) => setTrapForm((prev) => ({ ...prev, type: e.target.value as TrapType }))}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
              >
                {(Object.keys(TRAP_CONFIG) as TrapType[]).map((type) => (
                  <option key={type} value={type}>
                    {TRAP_CONFIG[type].icon} {TRAP_CONFIG[type].label} — {TRAP_CONFIG[type].cost} dust
                  </option>
                ))}
              </select>
            </label>

            <label className="block mb-3">
              <span className="text-xs text-zinc-400 mb-1 block">Tile ID</span>
              <input
                type="text"
                value={trapForm.tile_id}
                onChange={(e) => setTrapForm((prev) => ({ ...prev, tile_id: e.target.value }))}
                placeholder="Enter tile UUID..."
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              />
            </label>

            <div className="rounded-lg bg-zinc-800 p-2 mb-4 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Cost:</span>
                <span className="text-amber-400 font-medium">{TRAP_CONFIG[trapForm.type].cost} chrono dust</span>
              </div>
              {TRAP_CONFIG[trapForm.type].damage > 0 && (
                <div className="flex justify-between text-zinc-400 mt-0.5">
                  <span>Damage:</span>
                  <span className="text-red-400">{TRAP_CONFIG[trapForm.type].damage}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setShowTrapModal(false); setDefenseError(null); }}
                className="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePlaceTrap}
                disabled={placingTrap || !trapForm.tile_id.trim()}
                className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {placingTrap ? "Placing..." : "Place Trap"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guard Assignment Modal */}
      {showGuardModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-xl bg-zinc-900 border border-zinc-700 p-5 shadow-2xl">
            <h2 className="text-sm font-bold text-zinc-200 mb-3">Assign Guard</h2>

            <label className="block mb-3">
              <span className="text-xs text-zinc-400 mb-1 block">Pet</span>
              {availablePetsLoading ? (
                <p className="text-xs text-zinc-500">Loading pets...</p>
              ) : availablePets.length === 0 ? (
                <p className="text-xs text-zinc-500">No available pets</p>
              ) : (
                <select
                  value={guardForm.pet_id}
                  onChange={(e) => setGuardForm((prev) => ({ ...prev, pet_id: e.target.value }))}
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select a pet...</option>
                  {availablePets.map((pet) => (
                    <option key={pet.id} value={pet.id}>
                      {getPetDisplayName(pet)} Lv{pet.level ?? 1} (HP {pet.hp}/{pet.max_hp})
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="block mb-3">
              <span className="text-xs text-zinc-400 mb-1 block">Chunk</span>
              {unlockedChunks.length === 0 ? (
                <p className="text-xs text-zinc-500">No unlocked chunks</p>
              ) : (
                <select
                  value={`${guardForm.chunk_x},${guardForm.chunk_y}`}
                  onChange={(e) => {
                    const [x, y] = e.target.value.split(",").map(Number);
                    setGuardForm((prev) => ({ ...prev, chunk_x: x, chunk_y: y }));
                  }}
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select a chunk...</option>
                  {unlockedChunks.map((chunk) => (
                    <option key={`${chunk.chunk_x},${chunk.chunk_y}`} value={`${chunk.chunk_x},${chunk.chunk_y}`}>
                      Chunk ({chunk.chunk_x}, {chunk.chunk_y})
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="block mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-zinc-400">Patrol Radius</span>
                <span className="text-xs text-amber-400 font-medium">{guardForm.patrol_radius} tiles</span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={guardForm.patrol_radius}
                onChange={(e) => setGuardForm((prev) => ({ ...prev, patrol_radius: parseInt(e.target.value) }))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-[10px] text-zinc-600 mt-0.5">
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
              </div>
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => { setShowGuardModal(false); setDefenseError(null); }}
                className="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignGuard}
                disabled={assigningGuard || !guardForm.pet_id || unlockedChunks.length === 0}
                className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {assigningGuard ? "Assigning..." : "Assign Guard"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raid Replay Modal */}
      {replayData && (
        <RaidReplay
          replayData={replayData}
          onClose={() => setReplayData(null)}
        />
      )}
    </div>
  );
}
