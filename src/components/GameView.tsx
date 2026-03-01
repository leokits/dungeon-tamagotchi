"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tile, Resource, Dungeon, Player, Pet, Chunk } from "@/types/database";
import {
  MONSTER_DEF_BY_ID,
  MONSTER_FAMILY_BY_ID,
  levelToExp,
  EXP_PER_LEVEL,
  type MonsterDef,
  type MonsterFamily,
  type PetBehaviorStats as BehaviorStats,
} from "@/game/monsters";

const TILE_SIZE = 32;

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

const RESOURCE_COLORS: Record<string, string> = {
  mushroom: "#7cb342",
  crystal_shard: "#29b6f6",
  bone: "#e0e0e0",
  mana_orb: "#ab47bc",
  moss: "#558b2f",
};

const PET_COLORS: Record<string, string> = {
  shroom_slime: "#7cb342",
  crystal_sprite: "#29b6f6",
  stone_crawler: "#9e9e9e",
};

/** Map legacy pet base_types to new bestiary IDs */
const LEGACY_SPECIES_MAP: Record<string, string> = {
  shroom_slime: "glob_slime",
  stone_crawler: "cave_beetle",
  // crystal_sprite already exists in bestiary
};

/** Get pet color from bestiary, falling back to PET_COLORS legacy map */
function getPetColor(pet: Pet): string {
  const rawSpecies = (pet as unknown as { species?: string }).species || pet.base_type;
  const species = LEGACY_SPECIES_MAP[rawSpecies] || rawSpecies;
  const def = MONSTER_DEF_BY_ID[species];
  if (def) return def.color;
  return PET_COLORS[pet.base_type] || "#ff6600";
}

/** Get pet display name from bestiary */
function getPetDisplayName(pet: Pet): string {
  const rawSpecies = (pet as unknown as { species?: string }).species || pet.base_type;
  const species = LEGACY_SPECIES_MAP[rawSpecies] || rawSpecies;
  const def = MONSTER_DEF_BY_ID[species];
  return pet.name || def?.name || pet.base_type.replace(/_/g, " ");
}

/** Resolve a pet's bestiary species ID (handles legacy mapping) */
function resolveSpecies(pet: Pet): string {
  const raw = (pet as unknown as { species?: string }).species || pet.base_type;
  return LEGACY_SPECIES_MAP[raw] || raw;
}

type Tool = "dig" | "view" | "crystal_move";

interface GameViewProps {
  playerId: string;
}

export default function GameView({ playerId }: GameViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [dungeon, setDungeon] = useState<Dungeon | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [tool, setTool] = useState<Tool>("dig");
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [areaCost, setAreaCost] = useState(50);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);

  // Admin menu state
  const [showAdmin, setShowAdmin] = useState(false);
  const [tickInterval, setTickInterval] = useState(5); // seconds
  const [autoTick, setAutoTick] = useState(true);
  const [dustMultiplier, setDustMultiplier] = useState(1);
  const [crystalGrowthRate, setCrystalGrowthRate] = useState(1.7);
  const [petMoveChance, setPetMoveChance] = useState(1);
  const [regrowthSpeed, setRegrowthSpeed] = useState(1);
  const [animSpeed, setAnimSpeed] = useState(1000); // ms per frame toggle
  const [tickCount, setTickCount] = useState(0);
  const [lastTickResult, setLastTickResult] = useState<string | null>(null);

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  const supabase = createClient();

  const showStatus = useCallback((msg: string, durationMs = 3000) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), durationMs);
  }, []);

  const loadDungeon = useCallback(async () => {
    const res = await fetch("/api/dungeon/mine");
    if (!res.ok) return;
    const data = await res.json();
    setDungeon(data.dungeon);
    setTiles(data.tiles);
    setResources(data.resources);
    setPlayer(data.player);
    setChunks(data.chunks || []);
    setLoading(false);
  }, []);

  const loadPets = useCallback(async () => {
    const res = await fetch("/api/pets");
    if (!res.ok) return;
    const data = await res.json();
    setPets(data.pets ?? []);
  }, []);

  useEffect(() => {
    loadDungeon();
    loadPets();
  }, [loadDungeon, loadPets]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!dungeon) return;

    const channel = supabase
      .channel("dungeon-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tiles",
          filter: `dungeon_id=eq.${dungeon.id}`,
        },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setTiles((prev) =>
              prev.map((t) =>
                t.id === (payload.new as Tile).id ? (payload.new as Tile) : t
              )
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "resources",
          filter: `dungeon_id=eq.${dungeon.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setResources((prev) => [...prev, payload.new as Resource]);
          } else if (payload.eventType === "DELETE") {
            setResources((prev) =>
              prev.filter((r) => r.id !== (payload.old as Resource).id)
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dungeons",
          filter: `id=eq.${dungeon.id}`,
        },
        (payload) => {
          setDungeon(payload.new as Dungeon);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pets",
          filter: `dungeon_id=eq.${dungeon.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setPets((prev) => [...prev, payload.new as Pet]);
          } else if (payload.eventType === "UPDATE") {
            setPets((prev) =>
              prev.map((p) =>
                p.id === (payload.new as Pet).id ? (payload.new as Pet) : p
              )
            );
          } else if (payload.eventType === "DELETE") {
            setPets((prev) =>
              prev.filter((p) => p.id !== (payload.old as Pet).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dungeon?.id]);

  // Animation frame: alternates 0/1 at configurable speed
  const frameRef = useRef(0);
  useEffect(() => {
    const interval = setInterval(() => {
      frameRef.current = frameRef.current === 0 ? 1 : 0;
    }, animSpeed);
    return () => clearInterval(interval);
  }, [animSpeed]);

  // Auto-tick: calls /api/dev-tick every tickInterval seconds
  const fireTick = useCallback(async () => {
    try {
      const res = await fetch("/api/dev-tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dustMultiplier,
          crystalGrowthRate,
          petMoveChance,
          regrowthSpeed,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTickCount((c) => c + 1);
        setLastTickResult(
          `+${data.dustGained}d | CE ${data.crystalEnergy} | R+${data.resourcesSpawned} | P${data.petsMoved}`
        );
        // refresh dungeon state from server
        loadDungeon();
        loadPets();
      }
    } catch {
      // silent fail for dev tick
    }
  }, [dustMultiplier, crystalGrowthRate, petMoveChance, regrowthSpeed, loadDungeon, loadPets]);

  useEffect(() => {
    if (!autoTick || tickInterval <= 0) return;
    const id = setInterval(fireTick, tickInterval * 1000);
    return () => clearInterval(id);
  }, [autoTick, tickInterval, fireTick]);

  // Canvas rendering with 2-frame animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || tiles.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    // Seeded pseudo-random per tile for consistent texture variation
    function tileHash(x: number, y: number) {
      return ((x * 73856093) ^ (y * 19349663)) & 0xffff;
    }

    function render() {
      if (!ctx || !canvas) return;
      const cam = cameraRef.current;
      const frame = frameRef.current; // 0 or 1

      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      const resourceMap = new Map<string, Resource>();
      for (const r of resources) {
        resourceMap.set(r.tile_id, r);
      }

      // ---- LOCKED AREA OVERLAYS (dim rectangles for all 10x10 chunks) ----
      for (const chunk of chunks) {
        const chunkPx = chunk.chunk_x * 20 * TILE_SIZE;
        const chunkPy = chunk.chunk_y * 15 * TILE_SIZE;
        const chunkW = 20 * TILE_SIZE;
        const chunkH = 15 * TILE_SIZE;

        if (chunk.locked) {
          const isAdjacentToUnlocked = chunks.some(
            (c) =>
              !c.locked &&
              Math.abs(c.chunk_x - chunk.chunk_x) + Math.abs(c.chunk_y - chunk.chunk_y) === 1
          );

          // Dark background — buyable areas slightly brighter
          ctx.fillStyle = isAdjacentToUnlocked ? "#1e1812" : "#0e0c08";
          ctx.fillRect(chunkPx, chunkPy, chunkW, chunkH);

          if (isAdjacentToUnlocked) {
            // Bright dashed border for buyable areas
            ctx.strokeStyle = "rgba(255,200,80,0.7)";
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 4]);
            ctx.strokeRect(chunkPx + 2, chunkPy + 2, chunkW - 4, chunkH - 4);
            ctx.setLineDash([]);
            // Subtle glow fill
            ctx.fillStyle = "rgba(255,200,80,0.05)";
            ctx.fillRect(chunkPx, chunkPy, chunkW, chunkH);
            // Cost label (plain text, no emoji for canvas reliability)
            ctx.fillStyle = "rgba(255,210,100,0.85)";
            ctx.font = `bold ${Math.max(16, Math.round(18 / cam.zoom))}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
              `[ ${areaCost} dust ]`,
              chunkPx + chunkW / 2,
              chunkPy + chunkH / 2
            );
            ctx.fillStyle = "rgba(255,210,100,0.5)";
            ctx.font = `${Math.max(11, Math.round(12 / cam.zoom))}px monospace`;
            ctx.fillText(
              "click to unlock",
              chunkPx + chunkW / 2,
              chunkPy + chunkH / 2 + Math.max(20, Math.round(22 / cam.zoom))
            );
          } else {
            // Faint grid for non-adjacent locked
            ctx.strokeStyle = "rgba(60,40,20,0.1)";
            ctx.lineWidth = 0.5;
            for (let gx = 0; gx <= 20; gx++) {
              ctx.beginPath();
              ctx.moveTo(chunkPx + gx * TILE_SIZE, chunkPy);
              ctx.lineTo(chunkPx + gx * TILE_SIZE, chunkPy + chunkH);
              ctx.stroke();
            }
            for (let gy = 0; gy <= 15; gy++) {
              ctx.beginPath();
              ctx.moveTo(chunkPx, chunkPy + gy * TILE_SIZE);
              ctx.lineTo(chunkPx + chunkW, chunkPy + gy * TILE_SIZE);
              ctx.stroke();
            }
          }
        } else {
          // Unlocked chunk — subtle border
          ctx.strokeStyle = "rgba(100,80,60,0.3)";
          ctx.lineWidth = 1;
          ctx.strokeRect(chunkPx, chunkPy, chunkW, chunkH);
        }
      }

      // ---- TILES ----
      for (const tile of tiles) {
        const px = tile.local_x * TILE_SIZE + tile.chunk_x * 20 * TILE_SIZE;
        const py = tile.local_y * TILE_SIZE + tile.chunk_y * 15 * TILE_SIZE;
        const h = tileHash(tile.local_x + tile.chunk_x * 100, tile.local_y + tile.chunk_y * 100);

        // Soil type coloring based on nutrient/mana
        const soil: "green" | "crystal" | "brown" =
          tile.mana >= 2 ? "crystal" : tile.nutrient >= 0.6 ? "green" : "brown";

        // Color palettes per soil type
        const SOIL_SOLID: Record<string, [string, string]> = {
          brown:   ["#4a3728", "#4e3b2c"],
          green:   ["#3a4a28", "#3e4e2c"],
          crystal: ["#28384a", "#2c3c4e"],
        };
        const SOIL_CORRIDOR: Record<string, [string, string]> = {
          brown:   ["#8b7355", "#877050"],
          green:   ["#5a8b45", "#568740"],
          crystal: ["#556b8b", "#516787"],
        };
        const SOIL_PACKED: Record<string, [string, string]> = {
          brown:   ["#a0926b", "#9c8e67"],
          green:   ["#7aA066", "#769c62"],
          crystal: ["#6b82a0", "#677e9c"],
        };
        const SOIL_REGROWING: Record<string, [string, string]> = {
          brown:   ["#5a4738", "#5e4b3c"],
          green:   ["#4a5a38", "#4e5e3c"],
          crystal: ["#384a5a", "#3c4e5e"],
        };
        const SOIL_SPECKLE: Record<string, [string, string]> = {
          brown:   ["rgba(0,0,0,0.12)", "rgba(0,0,0,0.08)"],
          green:   ["rgba(20,40,0,0.15)", "rgba(20,40,0,0.10)"],
          crystal: ["rgba(0,20,40,0.15)", "rgba(0,20,40,0.10)"],
        };
        const SOIL_DETAIL: Record<string, string> = {
          brown:   "rgba(60,40,20,0.2)",
          green:   "rgba(30,60,10,0.2)",
          crystal: "rgba(10,30,60,0.2)",
        };

        // Frame A/B: slight color shift for living texture
        if (tile.type === "solid") {
          ctx.fillStyle = SOIL_SOLID[soil][frame];
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          // Speckle texture
          ctx.fillStyle = SOIL_SPECKLE[soil][frame];
          const sx = (h % 7) * 4 + 2;
          const sy = ((h >> 3) % 6) * 4 + 3;
          ctx.fillRect(px + sx, py + sy, 3 + (frame * 1), 2 + (frame * 1));
          const sx2 = ((h >> 5) % 6) * 4 + 5;
          const sy2 = ((h >> 7) % 5) * 5 + 2;
          ctx.fillRect(px + sx2, py + sy2, 2 + ((1 - frame) * 1), 3);
          // Soil hint overlay for green/crystal
          if (soil === "green") {
            ctx.fillStyle = frame === 0 ? "rgba(80,140,50,0.12)" : "rgba(90,150,60,0.15)";
            ctx.fillRect(px + (h % 4) * 6 + 2, py + TILE_SIZE - 5, 6 + frame, 3);
          } else if (soil === "crystal") {
            ctx.fillStyle = frame === 0 ? "rgba(60,140,200,0.10)" : "rgba(70,150,220,0.14)";
            ctx.beginPath();
            ctx.arc(px + 10 + (h % 3) * 5, py + 12 + (h % 4) * 3, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (tile.type === "corridor") {
          ctx.fillStyle = SOIL_CORRIDOR[soil][frame];
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          // Dirt/detail specs
          ctx.fillStyle = SOIL_DETAIL[soil];
          ctx.fillRect(px + (h % 5) * 5 + 3, py + ((h >> 2) % 4) * 6 + 4, 2, 2);
          ctx.fillRect(px + ((h >> 4) % 6) * 4 + 6, py + ((h >> 6) % 5) * 5 + 2, 3, 2);
          // Moss/crystal accents on corridor
          if (soil === "green") {
            ctx.fillStyle = frame === 0 ? "rgba(90,170,50,0.18)" : "rgba(100,180,60,0.22)";
            ctx.fillRect(px, py + TILE_SIZE - 3, TILE_SIZE, 3);
            ctx.fillRect(px, py, TILE_SIZE, 2);
          } else if (soil === "crystal") {
            ctx.fillStyle = frame === 0 ? "rgba(60,160,230,0.12)" : "rgba(70,170,240,0.16)";
            ctx.fillRect(px, py + TILE_SIZE - 2, TILE_SIZE, 2);
          }
        } else if (tile.type === "packed") {
          ctx.fillStyle = SOIL_PACKED[soil][frame];
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          // Footprint marks
          ctx.fillStyle = frame === 0 ? "rgba(0,0,0,0.10)" : "rgba(0,0,0,0.13)";
          ctx.fillRect(px + 8 + frame * 2, py + 12, 4, 6);
          ctx.fillRect(px + 18 - frame * 2, py + 6, 4, 6);
        } else if (tile.type === "hatchery") {
          ctx.fillStyle = frame === 0 ? "#6b5b95" : "#7363a0";
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          // Glowing border alternates intensity
          ctx.strokeStyle = frame === 0 ? "#d4a6ff" : "#c89aee";
          ctx.lineWidth = frame === 0 ? 2 : 2.5;
          ctx.strokeRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
          // Inner rune marks
          ctx.fillStyle = frame === 0 ? "rgba(212,166,255,0.3)" : "rgba(200,154,238,0.4)";
          ctx.fillRect(px + 12, py + 12 - frame, 8, 8 + frame * 2);
        } else if (tile.type === "solid_regrowing") {
          ctx.fillStyle = SOIL_REGROWING[soil][frame];
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          // Cracks healing animation — tinted by soil
          const crackAlpha = frame === 0 ? 0.4 : 0.6;
          ctx.strokeStyle = soil === "green"
            ? `rgba(100,160,70,${crackAlpha})`
            : soil === "crystal"
            ? `rgba(80,140,180,${crackAlpha})`
            : `rgba(139,115,85,${crackAlpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + 8, py + 4 + frame * 2);
          ctx.lineTo(px + 16, py + 16 - frame * 2);
          ctx.lineTo(px + 24, py + 28);
          ctx.stroke();
        } else if (tile.type === "crystal") {
          // Crystal tile background
          ctx.fillStyle = frame === 0 ? "#1a3a4a" : "#1e3e4e";
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          // Crystal glow alternates
          ctx.shadowColor = frame === 0 ? "#00c8ff" : "#00e0ff";
          ctx.shadowBlur = frame === 0 ? 10 : 16;
          ctx.fillStyle = frame === 0 ? "rgba(0, 200, 255, 0.5)" : "rgba(0, 220, 255, 0.7)";
          const cRadius = frame === 0 ? TILE_SIZE / 3 : TILE_SIZE / 3 + 1.5;
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, cRadius, 0, Math.PI * 2);
          ctx.fill();
          // Sparkle dots
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(px + 10 + frame * 4, py + 8, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(px + 22 - frame * 3, py + 22, 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (tile.type === "ground") {
          // Ground / surface layer — green grass with sky-blue top edge
          ctx.fillStyle = frame === 0 ? "#4a7a3b" : "#528442";
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          // Grass blades
          ctx.fillStyle = frame === 0 ? "#5c9a4a" : "#68a554";
          const gx = (h % 6) * 5 + 2;
          ctx.fillRect(px + gx, py + TILE_SIZE - 6 - frame, 2, 5 + frame);
          ctx.fillRect(px + gx + 8, py + TILE_SIZE - 5, 2, 4);
          ctx.fillRect(px + gx + 16, py + TILE_SIZE - 7 + frame, 2, 6 - frame);
          // Sky hint at the very top of ground tiles
          ctx.fillStyle = frame === 0 ? "rgba(135,206,235,0.25)" : "rgba(135,206,235,0.35)";
          ctx.fillRect(px, py, TILE_SIZE, 4);
          // Dirt layer at bottom
          ctx.fillStyle = "rgba(90,60,30,0.3)";
          ctx.fillRect(px, py + TILE_SIZE - 3, TILE_SIZE, 3);
        } else {
          ctx.fillStyle = TILE_COLORS[tile.type] || "#333";
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }

        // Grid lines
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);

        // ---- RESOURCES on tile ----
        const resource = resourceMap.get(tile.id);
        if (resource) {
          const rcx = px + TILE_SIZE / 2;
          const rcy = py + TILE_SIZE / 2;
          const bob = frame === 0 ? 0 : -2; // bob up on frame 1

          if (resource.type === "mushroom") {
            // Frame A: small mushroom, Frame B: slightly bigger
            const capR = frame === 0 ? 5 : 6;
            ctx.fillStyle = frame === 0 ? "#7cb342" : "#8bc34a";
            ctx.beginPath();
            ctx.arc(rcx, rcy - 2 + bob, capR, Math.PI, 0); // cap
            ctx.fill();
            ctx.fillStyle = "#e8d5b7";
            ctx.fillRect(rcx - 1.5, rcy - 2 + bob, 3, 5 + (frame === 0 ? 0 : 1)); // stem
          } else if (resource.type === "crystal_shard") {
            // Diamond shape, alternates glow
            ctx.fillStyle = frame === 0 ? "#29b6f6" : "#4fc3f7";
            ctx.beginPath();
            ctx.moveTo(rcx, rcy - 6 + bob);
            ctx.lineTo(rcx + 4 + frame, rcy + bob);
            ctx.lineTo(rcx, rcy + 5 + bob);
            ctx.lineTo(rcx - 4 - frame, rcy + bob);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 0.5;
            ctx.stroke();
          } else if (resource.type === "bone") {
            ctx.fillStyle = frame === 0 ? "#e0e0e0" : "#d0d0d0";
            // Bone shape: two knobs + bar
            ctx.beginPath();
            ctx.arc(rcx - 5, rcy - 3 + bob, 2.5 + frame * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(rcx + 5, rcy + 3 + bob, 2.5 + frame * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(rcx - 4, rcy - 1.5 + bob, 8, 3);
          } else if (resource.type === "mana_orb") {
            ctx.fillStyle = frame === 0 ? "rgba(171,71,188,0.7)" : "rgba(186,104,200,0.8)";
            ctx.shadowColor = "#ab47bc";
            ctx.shadowBlur = frame === 0 ? 4 : 8;
            ctx.beginPath();
            ctx.arc(rcx, rcy + bob, 5 + frame, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            // Inner highlight
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.beginPath();
            ctx.arc(rcx - 1.5, rcy - 1.5 + bob, 2, 0, Math.PI * 2);
            ctx.fill();
          } else if (resource.type === "moss") {
            ctx.fillStyle = frame === 0 ? "#558b2f" : "#4e7c28";
            // Clumps of moss dots
            const spots = [[-4, -3], [0, -5], [4, -2], [-3, 2], [2, 3], [5, 1]];
            for (const [ox, oy] of spots) {
              ctx.beginPath();
              ctx.arc(rcx + ox, rcy + oy + bob, 2 + (frame === 0 ? 0 : 0.5), 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            ctx.fillStyle = RESOURCE_COLORS[resource.type] || "#fff";
            ctx.beginPath();
            ctx.arc(rcx, rcy + bob, TILE_SIZE / 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }


      }

      // ---- PETS ----
      for (const pet of pets) {
        if (pet.status !== "alive" || pet.tile_x === null || pet.tile_y === null) continue;

        const px = pet.tile_x * TILE_SIZE + pet.chunk_x * 20 * TILE_SIZE;
        const py = pet.tile_y * TILE_SIZE + pet.chunk_y * 15 * TILE_SIZE;
        const pcx = px + TILE_SIZE / 2;
        const pcy = py + TILE_SIZE / 2;
        const isSelected = pet.id === selectedPetId;

        // Selected pet: pulsing highlight ring
        if (isSelected) {
          const pulseR = TILE_SIZE / 2 + 3 + (frame === 0 ? 0 : 2);
          ctx.strokeStyle = frame === 0 ? "rgba(255,200,60,0.9)" : "rgba(255,220,80,1)";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(pcx, pcy, pulseR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          // Glow under the pet
          ctx.shadowColor = "rgba(255,200,60,0.6)";
          ctx.shadowBlur = 12;
        }

        // Breathing: frame 0 slightly smaller, frame 1 slightly bigger
        const bodyR = frame === 0 ? TILE_SIZE / 3 - 0.5 : TILE_SIZE / 3 + 0.5;
        const bodyY = frame === 0 ? 0 : -1; // slight hop

        // Body
        ctx.fillStyle = getPetColor(pet);
        ctx.beginPath();
        ctx.arc(pcx, pcy + bodyY, bodyR, 0, Math.PI * 2);
        ctx.fill();

        // Outline
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Eyes — blink on frame 1 every ~4th cycle (use pet id hash)
        const petHash = pet.id.charCodeAt(0) + pet.id.charCodeAt(1);
        ctx.fillStyle = "#111";
        if (frame === 1 && petHash % 4 === 0) {
          // Blink: horizontal line instead of dots
          ctx.fillRect(pcx - 4, pcy - 2 + bodyY, 3, 1);
          ctx.fillRect(pcx + 1, pcy - 2 + bodyY, 3, 1);
        } else {
          // Open eyes
          ctx.beginPath();
          ctx.arc(pcx - 3, pcy - 2 + bodyY, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(pcx + 3, pcy - 2 + bodyY, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Mouth — frame A: neutral, frame B: little smile
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (frame === 0) {
          ctx.moveTo(pcx - 2, pcy + 3 + bodyY);
          ctx.lineTo(pcx + 2, pcy + 3 + bodyY);
        } else {
          ctx.arc(pcx, pcy + 2 + bodyY, 3, 0.1, Math.PI - 0.1);
        }
        ctx.stroke();

        // Evolution stage dots
        for (let i = 0; i < pet.evolution_stage; i++) {
          ctx.fillStyle = frame === 0 ? "#fff" : "#ffe066";
          ctx.beginPath();
          ctx.arc(pcx - 6 + i * 6, py + TILE_SIZE - 3 + bodyY, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Clear glow for selected pet
        if (isSelected) {
          ctx.shadowBlur = 0;
          // Name label above pet
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          const label = getPetDisplayName(pet) + " Lv" + (pet.level ?? 1);
          ctx.font = "bold 9px monospace";
          const tw = ctx.measureText(label).width;
          ctx.fillRect(pcx - tw / 2 - 3, py - 14, tw + 6, 12);
          ctx.fillStyle = "#ffe066";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, pcx, py - 8);
          ctx.textAlign = "start";
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [tiles, resources, pets, chunks, areaCost, selectedPetId]);

  function handleMouseDown(e: React.MouseEvent) {
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    cameraRef.current.x -= dx / cameraRef.current.zoom;
    cameraRef.current.y -= dy / cameraRef.current.zoom;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
  }

  function handleMouseUp(e: React.MouseEvent) {
    dragRef.current.dragging = false;

    const start = dragStartRef.current;
    if (!start) return;

    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    dragStartRef.current = null;

    if (dx > 5 || dy > 5) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const worldX = (screenX - canvas.clientWidth / 2) / cam.zoom + cam.x;
    const worldY = (screenY - canvas.clientHeight / 2) / cam.zoom + cam.y;

    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    const chunkX = Math.floor(tileX / 20);
    const chunkY = Math.floor(tileY / 15);
    const localX = tileX - chunkX * 20;
    const localY = tileY - chunkY * 15;

    // Check if clicking on a locked chunk → buy area
    const clickedChunk = chunks.find(
      (c) => c.chunk_x === chunkX && c.chunk_y === chunkY
    );
    if (clickedChunk && clickedChunk.locked) {
      handleBuyArea(chunkX, chunkY);
      return;
    }

    if (tool === "dig") {
      handleDig(chunkX, chunkY, localX, localY);
    } else if (tool === "crystal_move") {
      handleMoveCrystal(chunkX, chunkY, localX, localY);
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    cameraRef.current.zoom = Math.max(0.3, Math.min(3, cameraRef.current.zoom * delta));
  }

  async function handleDig(chunkX: number, chunkY: number, localX: number, localY: number) {
    const res = await fetch("/api/dungeon/dig", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chunk_x: chunkX, chunk_y: chunkY, local_x: localX, local_y: localY }),
    });

    const data = await res.json();
    if (res.ok) {
      setTiles((prev) => prev.map((t) => (t.id === data.tile.id ? data.tile : t)));
      const msgs: string[] = [];
      if (data.resource) {
        setResources((prev) => [...prev, data.resource]);
        msgs.push("Found " + data.resource.type.replace(/_/g, " ") + "!");
      }
      if (data.pet) {
        setPets((prev) => [...prev, data.pet]);
        msgs.push("A " + data.pet.base_type.replace(/_/g, " ") + " emerged from the soil!");
      }
      showStatus(msgs.length > 0 ? msgs.join(" ") : "Tile dug!");
    } else {
      showStatus(data.error || "Failed to dig");
    }
  }

  async function handleBuyArea(chunkX: number, chunkY: number) {
    // Check adjacency to unlocked chunk
    const isAdjacent = chunks.some(
      (c) =>
        !c.locked &&
        Math.abs(c.chunk_x - chunkX) + Math.abs(c.chunk_y - chunkY) === 1
    );
    if (!isAdjacent) {
      showStatus("Must buy an area adjacent to an unlocked one");
      return;
    }

    if (!confirm(`Buy area (${chunkX},${chunkY}) for ${areaCost} dust?`)) return;

    const res = await fetch("/api/dungeon/buy-area", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chunk_x: chunkX,
        chunk_y: chunkY,
        cost_override: areaCost,
      }),
    });

    let data;
    try {
      data = await res.json();
    } catch {
      showStatus("Server error — check console");
      return;
    }
    if (res.ok) {
      showStatus(data.message);
      await loadDungeon();
    } else {
      showStatus(data.error || "Failed to buy area");
    }
  }

  async function handleMoveCrystal(chunkX: number, chunkY: number, localX: number, localY: number) {
    const res = await fetch("/api/dungeon/move-crystal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chunk_x: chunkX, chunk_y: chunkY, local_x: localX, local_y: localY }),
    });

    const data = await res.json();
    if (res.ok) {
      showStatus(data.message);
      loadDungeon();
    } else {
      showStatus(data.error || "Failed to move crystal");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-zinc-400">Loading your dungeon...</p>
      </div>
    );
  }

  const alivePets = pets.filter((p) => p.status === "alive");

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950">
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />

      {statusMsg && (
        <div className="absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg bg-zinc-800/90 px-4 py-2 text-sm text-zinc-200 shadow-lg backdrop-blur-sm">
          {statusMsg}
        </div>
      )}

      <div className="absolute left-0 right-0 top-0 flex items-center justify-between bg-zinc-900/80 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-amber-400">{player?.username}</span>
          <span className="text-sm text-zinc-400">Dust: {player?.chrono_dust ?? 0}</span>
          <span className="text-sm text-zinc-400">Pets: {alivePets.length}/20</span>

        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-cyan-400">Crystal</span>
            <div className="h-3 w-24 overflow-hidden rounded-full bg-zinc-700">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all"
                style={{ width: Math.min(100, dungeon?.crystal_energy ?? 0) + "%" }}
              />
            </div>
            <span className="text-xs text-zinc-400">{(dungeon?.crystal_energy ?? 0).toFixed(1)}</span>
          </div>

          <button
            onClick={() => setShowAdmin((v) => !v)}
            className={"rounded px-2 py-1 text-xs transition-colors " + (showAdmin ? "bg-red-600 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200")}
          >
            Admin
          </button>
          <button
            onClick={handleLogout}
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Admin Panel */}
      {showAdmin && (
        <div className="absolute left-2 top-14 z-50 w-72 rounded-lg bg-zinc-900/95 p-3 backdrop-blur-sm shadow-xl border border-zinc-700">
          <h3 className="mb-2 text-xs font-bold text-red-400 uppercase tracking-wider">Admin Panel</h3>

          {/* Tick controls */}
          <div className="mb-3 rounded bg-zinc-800 p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-400">Auto Tick</span>
              <button
                onClick={() => setAutoTick((v) => !v)}
                className={"rounded px-2 py-0.5 text-xs font-medium " + (autoTick ? "bg-green-600 text-white" : "bg-zinc-700 text-zinc-400")}
              >
                {autoTick ? "ON" : "OFF"}
              </button>
            </div>
            <label className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span>Interval (sec)</span>
              <input
                type="number"
                min={1}
                max={300}
                value={tickInterval}
                onChange={(e) => setTickInterval(Math.max(1, Number(e.target.value)))}
                className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200"
              />
            </label>
            <button
              onClick={fireTick}
              className="w-full rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500"
            >
              Fire Tick Now
            </button>
            <div className="mt-1 text-xs text-zinc-500">
              Ticks: {tickCount}{lastTickResult && " | " + lastTickResult}
            </div>
          </div>

          {/* Dust & Crystal */}
          <div className="mb-3 rounded bg-zinc-800 p-2 space-y-1">
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Dust Multiplier</span>
              <input
                type="number"
                min={0.1}
                max={100}
                step={0.5}
                value={dustMultiplier}
                onChange={(e) => setDustMultiplier(Number(e.target.value))}
                className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Crystal Growth/hr</span>
              <input
                type="number"
                min={0}
                max={50}
                step={0.1}
                value={crystalGrowthRate}
                onChange={(e) => setCrystalGrowthRate(Number(e.target.value))}
                className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200"
              />
            </label>
          </div>

          {/* Pets */}
          <div className="mb-3 rounded bg-zinc-800 p-2 space-y-1">
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Pet Move Chance</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={petMoveChance}
                onChange={(e) => setPetMoveChance(Number(e.target.value))}
                className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Regrowth Speed</span>
              <input
                type="number"
                min={0.1}
                max={1000}
                step={1}
                value={regrowthSpeed}
                onChange={(e) => setRegrowthSpeed(Math.max(0.1, Number(e.target.value)))}
                className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200"
              />
            </label>
          </div>

          {/* Visual */}
          <div className="rounded bg-zinc-800 p-2 space-y-1">
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Area Cost (dust)</span>
              <input
                type="number"
                min={1}
                max={10000}
                step={5}
                value={areaCost}
                onChange={(e) => setAreaCost(Math.max(1, Number(e.target.value)))}
                className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Anim Speed (ms)</span>
              <input
                type="number"
                min={100}
                max={5000}
                step={100}
                value={animSpeed}
                onChange={(e) => setAnimSpeed(Math.max(100, Number(e.target.value)))}
                className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200"
              />
            </label>
          </div>

          {/* Danger zone */}
          <div className="mt-3 rounded bg-red-950/50 border border-red-800/50 p-2">
            <button
              onClick={async () => {
                if (!confirm("Reset dungeon? All tiles, pets will be deleted.")) return;
                const res = await fetch("/api/dev-reset", { method: "POST" });
                const data = await res.json();
                if (res.ok) {
                  showStatus(data.message);
                  window.location.reload();
                } else {
                  showStatus(data.error || "Reset failed");
                }
              }}
              className="w-full rounded bg-red-700 px-2 py-1 text-xs font-medium text-white hover:bg-red-600"
            >
              Reset Dungeon (new layout)
            </button>
          </div>
        </div>
      )}

      {alivePets.length > 0 && (
        <div className="absolute right-2 top-14 z-40 max-h-[60vh] w-48 overflow-auto rounded-lg bg-zinc-900/90 p-2 backdrop-blur-sm">
          <h3 className="mb-1 text-xs font-semibold text-zinc-400">Pets</h3>
          {alivePets.map((pet) => (
            <div
              key={pet.id}
              className={"mb-1 rounded px-2 py-1 text-xs cursor-pointer transition-colors " +
                (selectedPetId === pet.id ? "bg-zinc-700 ring-1 ring-amber-500" : "bg-zinc-800 hover:bg-zinc-750")}
              onClick={() => setSelectedPetId(selectedPetId === pet.id ? null : pet.id)}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium" style={{ color: getPetColor(pet) }}>
                  {getPetDisplayName(pet)}
                </span>
                <span className="text-zinc-500">Lv{pet.level ?? 1}</span>
              </div>
              <div className="mt-0.5 flex gap-2 text-zinc-500">
                <span>HP {pet.hp}/{pet.max_hp}</span>
                <span>H {(pet.hunger * 100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pet Detail Panel */}
      {selectedPetId && (() => {
        const pet = pets.find((p) => p.id === selectedPetId);
        if (!pet) return null;

        const species = resolveSpecies(pet);
        const monsterDef = MONSTER_DEF_BY_ID[species];
        const family = MONSTER_FAMILY_BY_ID[species];
        const behaviorStats: BehaviorStats = (pet as unknown as { behavior_stats?: BehaviorStats }).behavior_stats ?? {
          tilesWalked: 0, fightsWon: 0, fightsLost: 0, totalExp: 0,
          foodEaten: {}, preysHunted: {}, specialFlags: [],
        };
        const petLevel = pet.level ?? 1;
        const petExp = (pet as unknown as { total_exp?: number }).total_exp ?? 0;
        const nextLevelExp = levelToExp(petLevel + 1);
        const currentLevelExp = levelToExp(petLevel);
        const expProgress = petExp - currentLevelExp;
        const expNeeded = nextLevelExp - currentLevelExp;

        // Build evolution tree for this family
        const allForms = family ? family.forms : monsterDef ? [monsterDef] : [];

        // Criteria progress helper
        function criteriaProgress(c: { type: string; target: number; subtype?: string; description: string }) {
          let current = 0;
          switch (c.type) {
            case "level": current = petLevel; break;
            case "eat": current = behaviorStats.foodEaten[c.subtype!] ?? 0; break;
            case "prey": current = behaviorStats.preysHunted[c.subtype!] ?? 0; break;
            case "walk": current = behaviorStats.tilesWalked; break;
            case "combat": current = behaviorStats.fightsWon; break;
            case "special": current = (behaviorStats.specialFlags || []).includes(c.subtype!) ? 1 : 0; break;
          }
          const met = current >= c.target;
          const pct = Math.min(100, Math.round((current / c.target) * 100));
          return { current, met, pct };
        }

        return (
          <div className="absolute right-52 top-14 z-50 w-72 max-h-[80vh] overflow-auto rounded-lg bg-zinc-900/95 p-3 backdrop-blur-sm border border-zinc-700 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: getPetColor(pet) }} />
                <div>
                  <div className="font-bold text-sm" style={{ color: getPetColor(pet) }}>
                    {getPetDisplayName(pet)}
                  </div>
                  <div className="text-[10px] text-zinc-500">{monsterDef?.lore || species.replace(/_/g, " ")}</div>
                </div>
              </div>
              <button onClick={() => setSelectedPetId(null)} className="text-zinc-500 hover:text-white text-lg leading-none">&times;</button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs mb-2 bg-zinc-800 rounded p-2">
              <div className="text-zinc-400">Level</div><div className="text-white font-medium">{petLevel}</div>
              <div className="text-zinc-400">EXP</div>
              <div className="text-white">
                {petExp} <span className="text-zinc-500">/ {nextLevelExp}</span>
              </div>
              <div className="col-span-2 mt-0.5 mb-1">
                <div className="h-1.5 w-full rounded-full bg-zinc-700">
                  <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.min(100, (expProgress / expNeeded) * 100)}%` }} />
                </div>
              </div>
              <div className="text-zinc-400">HP</div><div className="text-white">{pet.hp} / {pet.max_hp}</div>
              <div className="text-zinc-400">MP</div><div className="text-white">{pet.mp} / {pet.max_mp}</div>
              <div className="text-zinc-400">ATK</div><div className="text-white">{pet.atk}</div>
              <div className="text-zinc-400">DEF</div><div className="text-white">{pet.def}</div>
              <div className="text-zinc-400">SPD</div><div className="text-white">{pet.spd}</div>
              <div className="text-zinc-400">Hunger</div><div className="text-white">{(pet.hunger * 100).toFixed(0)}%</div>
            </div>

            {/* Behavior Stats */}
            <div className="text-xs mb-2 bg-zinc-800 rounded p-2">
              <div className="font-semibold text-zinc-300 mb-1">Behavior Stats</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                <div className="text-zinc-400">Tiles Walked</div><div className="text-white">{behaviorStats.tilesWalked}</div>
                <div className="text-zinc-400">Fights Won</div><div className="text-white">{behaviorStats.fightsWon}</div>
                <div className="text-zinc-400">Fights Lost</div><div className="text-white">{behaviorStats.fightsLost}</div>
              </div>
              {Object.keys(behaviorStats.foodEaten || {}).length > 0 && (
                <div className="mt-1">
                  <div className="text-zinc-500 text-[10px]">Food Eaten:</div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {Object.entries(behaviorStats.foodEaten).map(([food, count]) => (
                      <span key={food} className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300">
                        {food.replace(/_/g, " ")} ×{count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {Object.keys(behaviorStats.preysHunted || {}).length > 0 && (
                <div className="mt-1">
                  <div className="text-zinc-500 text-[10px]">Prey Hunted:</div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {Object.entries(behaviorStats.preysHunted).map(([prey, count]) => (
                      <span key={prey} className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300">
                        {prey.replace(/_/g, " ")} ×{count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Evolution Tree */}
            <div className="text-xs bg-zinc-800 rounded p-2">
              <div className="font-semibold text-zinc-300 mb-1">
                Evolution Tree {family ? `— ${family.familyName}` : ""}
              </div>
              {allForms.map((form) => {
                const isCurrent = form.id === species;
                const isAchieved = form.stage < (monsterDef?.stage ?? 1) ||
                  (form.stage === (monsterDef?.stage ?? 1) && form.id === species);

                return (
                  <div key={form.id} className="mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={"w-3 h-3 rounded-full border-2 flex-shrink-0 " +
                          (isCurrent ? "border-amber-400" : isAchieved ? "border-green-500" : "border-zinc-600")}
                        style={{ backgroundColor: isCurrent ? form.color : isAchieved ? form.color + "80" : "transparent" }}
                      />
                      <span className={
                        "font-medium " +
                        (isCurrent ? "text-amber-400" : isAchieved ? "text-green-400" : "text-zinc-500")
                      }>
                        {form.name}
                        <span className="text-zinc-600 ml-1">S{form.stage}</span>
                      </span>
                    </div>

                    {/* Show evolution criteria FROM this form */}
                    {form.evolutions.length > 0 && (
                      <div className="ml-5 mt-0.5 space-y-0.5">
                        {form.evolutions.map((evo) => {
                          const targetDef = MONSTER_DEF_BY_ID[evo.to];
                          return (
                            <div key={evo.to} className="rounded bg-zinc-900/50 p-1.5">
                              <div className="flex items-center gap-1 mb-0.5">
                                <span className="text-[10px] text-zinc-600">&rarr;</span>
                                <span className="text-[11px] font-medium" style={{ color: targetDef?.color || "#888" }}>
                                  {targetDef?.name || evo.to.replace(/_/g, " ")}
                                </span>
                              </div>
                              {isCurrent && evo.criteria.map((c, ci) => {
                                const prog = criteriaProgress(c);
                                return (
                                  <div key={ci} className="ml-3 text-[10px]">
                                    <div className="flex items-center justify-between">
                                      <span className={prog.met ? "text-green-400" : "text-zinc-400"}>
                                        {prog.met ? "✓ " : ""}{c.description}
                                      </span>
                                      <span className={prog.met ? "text-green-400" : "text-zinc-500"}>
                                        {c.type === "special" ? (prog.met ? "Done" : "—") : `${prog.current}/${c.target}`}
                                      </span>
                                    </div>
                                    {!prog.met && c.type !== "special" && (
                                      <div className="h-1 w-full rounded-full bg-zinc-700 mt-0.5">
                                        <div
                                          className="h-full rounded-full bg-cyan-600 transition-all"
                                          style={{ width: `${prog.pct}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {!isCurrent && (
                                <div className="ml-3 text-[10px] text-zinc-600">
                                  {evo.criteria.map((c) => c.description).join(" + ")}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 bg-zinc-900/80 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={() => setTool("dig")}
          className={"rounded-lg px-4 py-2 text-sm font-medium transition-colors " + (tool === "dig" ? "bg-amber-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700")}
        >
          Dig
        </button>
        <button
          onClick={() => setTool("view")}
          className={"rounded-lg px-4 py-2 text-sm font-medium transition-colors " + (tool === "view" ? "bg-amber-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700")}
        >
          View
        </button>
        <button
          onClick={() => setTool("crystal_move")}
          className={"rounded-lg px-4 py-2 text-sm font-medium transition-colors " + (tool === "crystal_move" ? "bg-cyan-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700")}
        >
          Move Crystal (25d)
        </button>
      </div>
    </div>
  );
}
