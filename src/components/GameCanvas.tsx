"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Tile, Resource, Pet, Chunk } from "@/types/database";
import { MONSTER_DEF_BY_ID } from "@/game/monsters";
import { spriteCache } from "@/game/sprites";
import { ParticleSystem, emitDig, emitEvolution, emitDeath, emitEat, emitDamage, emitCrystalGlow } from "@/game/particles";

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

const LEGACY_SPECIES_MAP: Record<string, string> = {
  shroom_slime: "glob_slime",
  stone_crawler: "cave_beetle",
};

function getPetColor(pet: Pet): string {
  const rawSpecies = (pet as unknown as { species?: string }).species || pet.base_type;
  const species = LEGACY_SPECIES_MAP[rawSpecies] || rawSpecies;
  const def = MONSTER_DEF_BY_ID[species];
  if (def) return def.color;
  return PET_COLORS[pet.base_type] || "#ff6600";
}

function getPetDisplayName(pet: Pet): string {
  const rawSpecies = (pet as unknown as { species?: string }).species || pet.base_type;
  const species = LEGACY_SPECIES_MAP[rawSpecies] || rawSpecies;
  const def = MONSTER_DEF_BY_ID[species];
  return pet.name || def?.name || pet.base_type.replace(/_/g, " ");
}

function resolveSpecies(pet: Pet): string {
  const raw = (pet as unknown as { species?: string }).species || pet.base_type;
  return LEGACY_SPECIES_MAP[raw] || raw;
}

interface GameCanvasProps {
  tiles: Tile[];
  resources: Resource[];
  pets: Pet[];
  chunks: Chunk[];
  selectedPetId: string | null;
  areaCost: number;
  cameraRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>;
  frameRef: React.MutableRefObject<number>;
  particleSystem: ParticleSystem;
  onCanvasClick: (chunkX: number, chunkY: number, localX: number, localY: number, screenX: number, screenY: number) => void;
  onCameraMove: (dx: number, dy: number) => void;
  onCameraZoom: (delta: number) => void;
  onPetSelect: (id: string | null) => void;
}

export default function GameCanvas({
  tiles, resources, pets, chunks, selectedPetId, areaCost,
  cameraRef, frameRef, particleSystem, onCanvasClick, onCameraMove, onCameraZoom, onPetSelect,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number; startX: number; startY: number }>({
    dragging: false, lastX: 0, lastY: 0, startX: 0, startY: 0,
  });

  const tileHash = useCallback((x: number, y: number) => {
    return ((x * 73856093) ^ (y * 19349663)) & 0xffff;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || tiles.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    function render() {
      if (!ctx || !canvas) return;
      const cam = cameraRef.current;
      const frame = frameRef.current;

      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      const resourceMap = new Map<string, Resource>();
      for (const r of resources) resourceMap.set(r.tile_id, r);

      for (const chunk of chunks) {
        const chunkPx = chunk.chunk_x * 20 * TILE_SIZE;
        const chunkPy = chunk.chunk_y * 15 * TILE_SIZE;
        const chunkW = 20 * TILE_SIZE;
        const chunkH = 15 * TILE_SIZE;

        if (chunk.locked) {
          const isAdjacent = chunks.some(
            (c) => !c.locked && Math.abs(c.chunk_x - chunk.chunk_x) + Math.abs(c.chunk_y - chunk.chunk_y) === 1
          );
          ctx.fillStyle = isAdjacent ? "#1e1812" : "#0e0c08";
          ctx.fillRect(chunkPx, chunkPy, chunkW, chunkH);

          if (isAdjacent) {
            ctx.strokeStyle = "rgba(255,200,80,0.7)";
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 4]);
            ctx.strokeRect(chunkPx + 2, chunkPy + 2, chunkW - 4, chunkH - 4);
            ctx.setLineDash([]);
            ctx.fillStyle = "rgba(255,200,80,0.05)";
            ctx.fillRect(chunkPx, chunkPy, chunkW, chunkH);
            ctx.fillStyle = "rgba(255,210,100,0.85)";
            ctx.font = `bold ${Math.max(16, Math.round(18 / cam.zoom))}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`[ ${areaCost} dust ]`, chunkPx + chunkW / 2, chunkPy + chunkH / 2);
            ctx.fillStyle = "rgba(255,210,100,0.5)";
            ctx.font = `${Math.max(11, Math.round(12 / cam.zoom))}px monospace`;
            ctx.fillText("click to unlock", chunkPx + chunkW / 2, chunkPy + chunkH / 2 + Math.max(20, Math.round(22 / cam.zoom)));
          } else {
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
          ctx.strokeStyle = "rgba(100,80,60,0.3)";
          ctx.lineWidth = 1;
          ctx.strokeRect(chunkPx, chunkPy, chunkW, chunkH);
        }
      }

      for (const tile of tiles) {
        const px = tile.local_x * TILE_SIZE + tile.chunk_x * 20 * TILE_SIZE;
        const py = tile.local_y * TILE_SIZE + tile.chunk_y * 15 * TILE_SIZE;
        const soil: "green" | "crystal" | "brown" =
          tile.mana >= 2 ? "crystal" : tile.nutrient >= 0.6 ? "green" : "brown";

        const spriteTileType = tile.type === "resource" ? "corridor" : tile.type;
        const sprite = spriteCache.getTile(spriteTileType as import("@/game/sprites/tile").TileType, frame, soil);
        if (sprite) {
          ctx.drawImage(sprite, px, py, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = TILE_COLORS[tile.type] || "#333";
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }

        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);

        const resource = resourceMap.get(tile.id);
        if (resource) {
          const rcx = px + TILE_SIZE / 2;
          const rcy = py + TILE_SIZE / 2;
          const rSprite = spriteCache.getResource(resource.type, frame);
          if (rSprite) {
            ctx.drawImage(rSprite, rcx - TILE_SIZE / 2, rcy - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
          } else {
            ctx.fillStyle = RESOURCE_COLORS[resource.type] || "#fff";
            ctx.beginPath();
            ctx.arc(rcx, rcy, TILE_SIZE / 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      for (const pet of pets) {
        if (pet.status !== "alive" || pet.tile_x === null || pet.tile_y === null) continue;

        const px = pet.tile_x * TILE_SIZE + pet.chunk_x * 20 * TILE_SIZE;
        const py = pet.tile_y * TILE_SIZE + pet.chunk_y * 15 * TILE_SIZE;
        const pcx = px + TILE_SIZE / 2;
        const pcy = py + TILE_SIZE / 2;
        const isSelected = pet.id === selectedPetId;

        const species = resolveSpecies(pet);
        const petSprite = spriteCache.getMonster(species);
        const spriteSize = pet.evolution_stage === 1 ? 32 : pet.evolution_stage === 2 ? 48 : 64;
        const spriteOffset = (spriteSize - TILE_SIZE) / 2;

        if (isSelected) {
          const pulseR = TILE_SIZE / 2 + 3 + (frame === 0 ? 0 : 2);
          ctx.strokeStyle = frame === 0 ? "rgba(255,200,60,0.9)" : "rgba(255,220,80,1)";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(pcx, pcy, pulseR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.shadowColor = "rgba(255,200,60,0.6)";
          ctx.shadowBlur = 12;
        }

        if (petSprite) {
          ctx.drawImage(petSprite, px - spriteOffset, py - spriteOffset, spriteSize, spriteSize);
        } else {
          const bodyR = frame === 0 ? TILE_SIZE / 3 - 0.5 : TILE_SIZE / 3 + 0.5;
          const bodyY = frame === 0 ? 0 : -1;
          ctx.fillStyle = getPetColor(pet);
          ctx.beginPath();
          ctx.arc(pcx, pcy + bodyY, bodyR, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        for (let i = 0; i < pet.evolution_stage; i++) {
          ctx.fillStyle = frame === 0 ? "#fff" : "#ffe066";
          ctx.beginPath();
          ctx.arc(pcx - 6 + i * 6, py + TILE_SIZE - 3, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        if (isSelected) {
          ctx.shadowBlur = 0;
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

      particleSystem.update();
      particleSystem.render(ctx, cameraRef.current);

      ctx.restore();
      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [tiles, resources, pets, chunks, areaCost, selectedPetId, cameraRef, frameRef, tileHash]);

  function handleMouseDown(e: React.MouseEvent) {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    onCameraMove(dx, dy);
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
  }

  function handleMouseUp(e: React.MouseEvent) {
    const start = dragRef.current.startX;
    const startY = dragRef.current.startY;
    dragRef.current.dragging = false;

    const dx = Math.abs(e.clientX - start);
    const dy = Math.abs(e.clientY - startY);
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

    onCanvasClick(chunkX, chunkY, localX, localY, e.clientX, e.clientY);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    onCameraZoom(delta);
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full cursor-crosshair"
      style={{ top: 48, bottom: 56 }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    />
  );
}
