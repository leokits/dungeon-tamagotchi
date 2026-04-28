"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface RaidReplayProps {
  replayData: {
    frames: Array<{
      tick: number;
      pets: Array<{ id: string; x: number; y: number; hp: number; action: string }>;
    }>;
    events: Array<{
      tick: number;
      type: string;
      pet_id?: string;
      cause?: string;
      combat_result?: { winner: string; loser: string; turns: number };
    }>;
  };
  dungeonSnapshot?: {
    tiles: Array<{ x: number; y: number; type: string }>;
    crystal: { x: number; y: number };
  };
  attackerPets?: Array<{ id: string; name: string; color: string }>;
  defenderPets?: Array<{ id: string; name: string; color: string }>;
  result?: string;
  onClose: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TILE_SIZE = 32;
const BASE_FRAME_INTERVAL = 500; // ms per frame at 1x speed

const TILE_COLORS: Record<string, string> = {
  solid: "#4a3728",
  corridor: "#8b7355",
  packed: "#a0926b",
  solid_regrowing: "#5a4738",
  resource: "#8b7355",
  hatchery: "#6b5b95",
  crystal: "#00c8ff",
  ground: "#4a7a3b",
};

const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPetName(id: string, attackerPets: NonNullable<RaidReplayProps["attackerPets"]>, defenderPets: NonNullable<RaidReplayProps["defenderPets"]>): string {
  const attacker = attackerPets.find((p) => p.id === id);
  if (attacker) return attacker.name || attacker.id.slice(0, 8);
  const defender = defenderPets.find((p) => p.id === id);
  if (defender) return defender.name || defender.id.slice(0, 8);
  return id.slice(0, 8);
}

function getPetColorById(
  id: string,
  attackerPets: NonNullable<RaidReplayProps["attackerPets"]>,
  defenderPets: NonNullable<RaidReplayProps["defenderPets"]>,
): string {
  const attacker = attackerPets.find((p) => p.id === id);
  if (attacker) return attacker.color;
  const defender = defenderPets.find((p) => p.id === id);
  if (defender) return defender.color;
  return "#888";
}

function isAttackerPet(
  id: string,
  attackerPets: NonNullable<RaidReplayProps["attackerPets"]>,
): boolean {
  return attackerPets.some((p) => p.id === id);
}

function formatResult(result: string): string {
  switch (result) {
    case "attacker_win":
      return "Victory";
    case "defender_win":
      return "Defeat";
    case "draw":
      return "Draw";
    case "timeout":
      return "Timeout";
    default:
      return result;
  }
}

function resultColor(result: string): string {
  switch (result) {
    case "attacker_win":
      return "text-green-400";
    case "defender_win":
      return "text-red-400";
    case "draw":
      return "text-yellow-400";
    default:
      return "text-zinc-400";
  }
}

function resultBg(result: string): string {
  switch (result) {
    case "attacker_win":
      return "from-green-900/40 to-zinc-900/40";
    case "defender_win":
      return "from-red-900/40 to-zinc-900/40";
    case "draw":
      return "from-yellow-900/40 to-zinc-900/40";
    default:
      return "from-zinc-800/40 to-zinc-900/40";
  }
}

function eventIcon(type: string): string {
  switch (type) {
    case "raid_start":
      return "⚔️";
    case "raid_end":
      return "🏁";
    case "pet_death":
      return "💀";
    case "crystal_reached":
      return "💎";
    case "trap_trigger":
      return "⚠️";
    case "combat_encounter":
      return "🗡️";
    default:
      return "📌";
  }
}

function eventDescription(
  evt: { tick: number; type: string; pet_id?: string; cause?: string; combat_result?: { winner: string; loser: string; turns: number } },
  attackerPets: NonNullable<RaidReplayProps["attackerPets"]>,
  defenderPets: NonNullable<RaidReplayProps["defenderPets"]>,
): string {
  switch (evt.type) {
    case "raid_start":
      return "Raid began";
    case "raid_end":
      return "Raid ended";
    case "pet_death": {
      const name = evt.pet_id ? getPetName(evt.pet_id, attackerPets, defenderPets) : "Unknown";
      const cause = evt.cause ? ` (${evt.cause})` : "";
      return `${name} fell${cause}`;
    }
    case "crystal_reached": {
      const name = evt.pet_id ? getPetName(evt.pet_id, attackerPets, defenderPets) : "Unknown";
      return `${name} reached the crystal`;
    }
    case "trap_trigger": {
      const name = evt.pet_id ? getPetName(evt.pet_id, attackerPets, defenderPets) : "Unknown";
      return `${name} triggered a trap`;
    }
    case "combat_encounter": {
      if (evt.combat_result) {
        const winner = getPetName(evt.combat_result.winner, attackerPets, defenderPets);
        const loser = getPetName(evt.combat_result.loser, attackerPets, defenderPets);
        return `${winner} defeated ${loser} in ${evt.combat_result.turns} turns`;
      }
      return "Combat encounter";
    }
    default:
      return evt.type.replace(/_/g, " ");
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RaidReplay({
  replayData,
  dungeonSnapshot = { tiles: [], crystal: { x: 0, y: 0 } },
  attackerPets = [],
  defenderPets = [],
  result = "unknown",
  onClose,
}: RaidReplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const eventLogRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);

  const totalFrames = replayData.frames.length;
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);

  // Compute summary stats
  const stats = useMemo(() => {
    const trapsTriggered = replayData.events.filter((e) => e.type === "trap_trigger").length;
    const petsLost = replayData.events.filter((e) => e.type === "pet_death").length;
    const crystalReached = replayData.events.some((e) => e.type === "crystal_reached");

    // Calculate depth reached from the last frame
    let maxDepth = 0;
    if (replayData.frames.length > 0) {
      const lastFrame = replayData.frames[replayData.frames.length - 1];
      for (const pet of lastFrame.pets) {
        const depth = Math.abs(pet.x - dungeonSnapshot.crystal.x) + Math.abs(pet.y - dungeonSnapshot.crystal.y);
        if (depth > maxDepth) maxDepth = depth;
      }
    }

    return { trapsTriggered, petsLost, crystalReached, maxDepth };
  }, [replayData, dungeonSnapshot.crystal]);

  // Get current frame data
  const frameData = replayData.frames[currentFrame] ?? replayData.frames[0];

  // Get events up to current frame
  const eventsUpToCurrent = useMemo(
    () => replayData.events.filter((e) => e.tick <= (frameData?.tick ?? 0)),
    [replayData.events, frameData?.tick],
  );

  // Auto-scroll event log to latest event during playback
  useEffect(() => {
    if (eventLogRef.current && isPlaying) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [eventsUpToCurrent.length, isPlaying]);

  // Jump to frame helper
  const jumpToFrame = useCallback(
    (frameIndex: number) => {
      const clamped = Math.max(0, Math.min(frameIndex, totalFrames - 1));
      setCurrentFrame(clamped);
    },
    [totalFrames],
  );

  // Jump to event
  const jumpToEvent = useCallback(
    (eventIndex: number) => {
      const evt = replayData.events[eventIndex];
      if (!evt) return;
      // Find the frame closest to this event's tick
      const frameIdx = replayData.frames.findIndex((f) => f.tick >= evt.tick);
      jumpToFrame(frameIdx >= 0 ? frameIdx : replayData.frames.length - 1);
      setSelectedEvent(eventIndex);
    },
    [replayData.events, replayData.frames, jumpToFrame],
  );

  // Playback loop
  useEffect(() => {
    if (!isPlaying) return;

    const interval = BASE_FRAME_INTERVAL / playbackSpeed;

    function tick() {
      const now = Date.now();
      if (now - lastTickRef.current >= interval) {
        setCurrentFrame((prev) => {
          if (prev >= totalFrames - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
        lastTickRef.current = now;
      }
      animFrameRef.current = requestAnimationFrame(tick);
    }

    lastTickRef.current = Date.now();
    animFrameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, playbackSpeed, totalFrames]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frameData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to container
    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate camera to fit the dungeon
    const tiles = dungeonSnapshot.tiles;
    if (tiles.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tiles) {
      if (t.x < minX) minX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.x > maxX) maxX = t.x;
      if (t.y > maxY) maxY = t.y;
    }

    const dungeonW = (maxX - minX + 1) * TILE_SIZE;
    const dungeonH = (maxY - minY + 1) * TILE_SIZE;
    const padding = 64;
    const scaleX = (canvas.width - padding * 2) / dungeonW;
    const scaleY = (canvas.height - padding * 2) / dungeonH;
    const scale = Math.min(scaleX, scaleY, 2); // cap at 2x

    const offsetX = (canvas.width - dungeonW * scale) / 2 - minX * TILE_SIZE * scale;
    const offsetY = (canvas.height - dungeonH * scale) / 2 - minY * TILE_SIZE * scale;

    function tx(x: number) {
      return x * TILE_SIZE * scale + offsetX;
    }
    function ty(y: number) {
      return y * TILE_SIZE * scale + offsetY;
    }
    function ts(size: number) {
      return size * scale;
    }

    // Draw tiles
    for (const tile of tiles) {
      const px = tx(tile.x);
      const py = ty(tile.y);
      const s = ts(TILE_SIZE);

      ctx.fillStyle = TILE_COLORS[tile.type] || "#333";
      ctx.fillRect(px, py, s, s);

      // Subtle grid
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px, py, s, s);
    }

    // Draw crystal with glow
    const crystal = dungeonSnapshot.crystal;
    const ccx = tx(crystal.x) + ts(TILE_SIZE) / 2;
    const ccy = ty(crystal.y) + ts(TILE_SIZE) / 2;
    const cRadius = ts(TILE_SIZE) / 3;

    // Crystal glow
    const glowGrad = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, cRadius * 3);
    glowGrad.addColorStop(0, "rgba(0, 200, 255, 0.3)");
    glowGrad.addColorStop(1, "rgba(0, 200, 255, 0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(ccx, ccy, cRadius * 3, 0, Math.PI * 2);
    ctx.fill();

    // Crystal body
    ctx.shadowColor = "#00c8ff";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#00c8ff";
    ctx.beginPath();
    ctx.arc(ccx, ccy, cRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Crystal sparkle
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(ccx - ts(3), ccy - ts(3), ts(1.5), 0, Math.PI * 2);
    ctx.fill();

    // Draw event highlights on the current frame
    const currentTick = frameData.tick;
    const currentEvents = replayData.events.filter((e) => e.tick === currentTick);

    for (const evt of currentEvents) {
      if (evt.type === "trap_trigger" && evt.pet_id) {
        const pet = frameData.pets.find((p) => p.id === evt.pet_id);
        if (pet) {
          // Red flash around pet
          const px = tx(pet.x) + ts(TILE_SIZE) / 2;
          const py = ty(pet.y) + ts(TILE_SIZE) / 2;
          ctx.strokeStyle = "rgba(239, 68, 68, 0.8)";
          ctx.lineWidth = ts(3);
          ctx.beginPath();
          ctx.arc(px, py, ts(TILE_SIZE) / 2 + ts(4), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (evt.type === "combat_encounter" && evt.pet_id) {
        const pet = frameData.pets.find((p) => p.id === evt.pet_id);
        if (pet) {
          // Yellow border around pet
          const px = tx(pet.x) + ts(TILE_SIZE) / 2;
          const py = ty(pet.y) + ts(TILE_SIZE) / 2;
          ctx.strokeStyle = "rgba(234, 179, 8, 0.9)";
          ctx.lineWidth = ts(2.5);
          ctx.setLineDash([ts(3), ts(2)]);
          ctx.beginPath();
          ctx.arc(px, py, ts(TILE_SIZE) / 2 + ts(3), 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // Draw pets
    for (const pet of frameData.pets) {
      const px = tx(pet.x) + ts(TILE_SIZE) / 2;
      const py = ty(pet.y) + ts(TILE_SIZE) / 2;
      const bodyR = ts(TILE_SIZE) / 3;
      const color = getPetColorById(pet.id, attackerPets, defenderPets);
      const isAttacker = isAttackerPet(pet.id, attackerPets);

      if (pet.action === "dead") {
        // X mark for dead pets
        const xSize = ts(6);
        ctx.strokeStyle = "rgba(239, 68, 68, 0.7)";
        ctx.lineWidth = ts(2);
        ctx.beginPath();
        ctx.moveTo(px - xSize, py - xSize);
        ctx.lineTo(px + xSize, py + xSize);
        ctx.moveTo(px + xSize, py - xSize);
        ctx.lineTo(px - xSize, py + xSize);
        ctx.stroke();

        // Dimmed body
        ctx.fillStyle = "rgba(100, 100, 100, 0.3)";
        ctx.beginPath();
        ctx.arc(px, py, bodyR, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // Pet body
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, bodyR, 0, Math.PI * 2);
      ctx.fill();

      // Outline
      ctx.strokeStyle = isAttacker ? "rgba(251, 191, 36, 0.6)" : "rgba(34, 211, 238, 0.6)";
      ctx.lineWidth = ts(1.5);
      ctx.stroke();

      // Eyes
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(px - ts(3), py - ts(2), ts(1.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + ts(3), py - ts(2), ts(1.5), 0, Math.PI * 2);
      ctx.fill();

      // HP bar
      const hpBarWidth = ts(TILE_SIZE);
      const hpBarHeight = ts(3);
      const hpBarY = py - bodyR - ts(6);
      const hpPercent = Math.max(0, pet.hp / 100);

      // HP bar background
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(px - hpBarWidth / 2, hpBarY, hpBarWidth, hpBarHeight);

      // HP bar fill
      const hpColor = hpPercent > 0.6 ? "#22c55e" : hpPercent > 0.3 ? "#eab308" : "#ef4444";
      ctx.fillStyle = hpColor;
      ctx.fillRect(px - hpBarWidth / 2, hpBarY, hpBarWidth * hpPercent, hpBarHeight);

      // HP bar border
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px - hpBarWidth / 2, hpBarY, hpBarWidth, hpBarHeight);
    }
  }, [frameData, dungeonSnapshot, attackerPets, defenderPets, replayData.events]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((v) => !v);
      }
      if (e.key === "ArrowLeft") jumpToFrame(currentFrame - 10);
      if (e.key === "ArrowRight") jumpToFrame(currentFrame + 10);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentFrame, jumpToFrame, onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[90vh] w-[95vw] max-w-7xl flex-col overflow-hidden rounded-2xl border border-zinc-700/50 bg-zinc-950 shadow-2xl">
        {/* Result Banner */}
        <div className={`relative flex items-center justify-between border-b border-zinc-700/50 bg-gradient-to-r ${resultBg(result)} px-6 py-3`}>
          <div className="flex items-center gap-4">
            <span className={`text-2xl font-black uppercase tracking-widest ${resultColor(result)}`}>
              {formatResult(result)}
            </span>
            <div className="flex gap-4 text-xs text-zinc-400">
              <span>Depth: <span className="text-zinc-200">{stats.maxDepth}</span></span>
              <span>Traps: <span className="text-red-400">{stats.trapsTriggered}</span></span>
              <span>Pets Lost: <span className="text-red-400">{stats.petsLost}</span></span>
              {stats.crystalReached && (
                <span className="text-cyan-400">Crystal Reached!</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
          >
            Close
          </button>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Canvas + Controls */}
          <div className="flex flex-1 flex-col">
            {/* Canvas */}
            <div ref={containerRef} className="relative flex-1 overflow-hidden bg-zinc-950">
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

              {/* Frame counter overlay */}
              <div className="absolute right-3 top-3 rounded-md bg-zinc-900/80 px-2.5 py-1 text-xs font-mono text-zinc-400 backdrop-blur-sm">
                Frame {currentFrame + 1} / {totalFrames}
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-3 border-t border-zinc-700/50 bg-zinc-900/50 px-4 py-3">
              {/* Play/Pause */}
              <button
                onClick={() => setIsPlaying((v) => !v)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                  isPlaying
                    ? "bg-amber-600 text-white hover:bg-amber-500"
                    : "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
                }`}
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>

              {/* Skip back */}
              <button
                onClick={() => jumpToFrame(currentFrame - 10)}
                disabled={currentFrame === 0}
                className="rounded-lg bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-30"
                title="Skip back 10 frames"
              >
                ⏪
              </button>

              {/* Skip forward */}
              <button
                onClick={() => jumpToFrame(currentFrame + 10)}
                disabled={currentFrame >= totalFrames - 1}
                className="rounded-lg bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-30"
                title="Skip forward 10 frames"
              >
                ⏩
              </button>

              {/* Timeline slider */}
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={totalFrames - 1}
                  value={currentFrame}
                  onChange={(e) => jumpToFrame(Number(e.target.value))}
                  className="flex-1 accent-amber-500"
                />
              </div>

              {/* Speed selector */}
              <div className="flex items-center gap-1">
                {SPEED_OPTIONS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      playbackSpeed === speed
                        ? "bg-amber-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Event Log Panel */}
          <div className="flex w-72 flex-col border-l border-zinc-700/50 bg-zinc-900/30">
            <div className="border-b border-zinc-700/50 px-4 py-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Event Log
              </h3>
              <p className="text-[10px] text-zinc-500">
                {replayData.events.length} events
              </p>
            </div>

            <div ref={eventLogRef} className="flex-1 overflow-y-auto">
              {replayData.events.length === 0 ? (
                <p className="p-4 text-xs text-zinc-500">No events recorded.</p>
              ) : (
                <div className="divide-y divide-zinc-800/50">
                  {replayData.events.map((evt, idx) => {
                    const isActive = selectedEvent === idx;
                    const hasOccurred = evt.tick <= (frameData?.tick ?? 0);

                    return (
                      <button
                        key={idx}
                        onClick={() => jumpToEvent(idx)}
                        className={`w-full px-4 py-2.5 text-left transition-colors ${
                          isActive
                            ? "bg-amber-900/20"
                            : hasOccurred
                              ? "hover:bg-zinc-800/50"
                              : "opacity-40"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 text-sm">{eventIcon(evt.type)}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] text-zinc-500">
                                T{evt.tick}
                              </span>
                              <span className="truncate text-xs text-zinc-300">
                                {eventDescription(evt, attackerPets, defenderPets)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="border-t border-zinc-700/50 px-4 py-3">
              <div className="space-y-1.5 text-[10px] text-zinc-500">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
                  Attacker pets
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400" />
                  Defender pets
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                  Trap trigger
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500" />
                  Combat
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
