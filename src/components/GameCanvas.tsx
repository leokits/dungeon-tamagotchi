"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Tile, Resource, Pet, Chunk } from "@/types/database";
import { MONSTER_DEF_BY_ID } from "@/game/monsters";
import { resolveSpecies } from "@/game/species-utils";
import { spriteCache } from "@/game/sprites";
import { ParticleSystem, emitDig, emitEvolution, emitDeath, emitEat, emitDamage, emitCrystalGlow, emitAmbient } from "@/game/particles";

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

function getPetColor(pet: Pet): string {
  const species = resolveSpecies(pet);
  const def = MONSTER_DEF_BY_ID[species];
  if (def) return def.color;
  return PET_COLORS[pet.base_type] || "#ff6600";
}

function getPetDisplayName(pet: Pet): string {
  const species = resolveSpecies(pet);
  const def = MONSTER_DEF_BY_ID[species];
  return pet.name || def?.name || pet.base_type.replace(/_/g, " ");
}

function resolveMonsterDef(pet: Pet): import("@/game/monsters").MonsterDef | null {
  const species = resolveSpecies(pet);
  return MONSTER_DEF_BY_ID[species] ?? null;
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
  const hoverTileRef = useRef<{ chunkX: number; chunkY: number; localX: number; localY: number } | null>(null);
  const emittedAmbientRef = useRef<Set<string>>(new Set());
  const tileHash = useCallback((x: number, y: number) => {
    return ((x * 73856093) ^ (y * 19349663)) & 0xffff;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || tiles.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let ambientFrameCounter = 0;

    function render() {
      if (!ctx || !canvas) return;
      const cam = cameraRef.current;
      const frame = frameRef.current;

      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background — deep dungeon dark
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, "#0a0806");
      bgGrad.addColorStop(1, "#12100a");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // Viewport bounds for culling
      const viewLeft = cam.x;
      const viewTop = cam.y;
      const viewRight = cam.x + canvas.width / cam.zoom;
      const viewBottom = cam.y + canvas.height / cam.zoom;

      const resourceMap = new Map<string, Resource>();
      for (const r of resources) resourceMap.set(r.tile_id, r);

      // ── Draw chunks ──
      for (const chunk of chunks) {
        const chunkPx = chunk.chunk_x * 20 * TILE_SIZE;
        const chunkPy = chunk.chunk_y * 15 * TILE_SIZE;
        const chunkW = 20 * TILE_SIZE;
        const chunkH = 15 * TILE_SIZE;

        // Chunk out-of-view skip
        if (chunkPx + chunkW < viewLeft || chunkPx > viewRight || chunkPy + chunkH < viewTop || chunkPy > viewBottom) continue;

        if (chunk.locked) {
          const isAdjacent = chunks.some(
            (c) => !c.locked && Math.abs(c.chunk_x - chunk.chunk_x) + Math.abs(c.chunk_y - chunk.chunk_y) === 1
          );
          ctx.fillStyle = isAdjacent ? "#1e1812" : "#0e0c08";
          ctx.fillRect(chunkPx, chunkPy, chunkW, chunkH);

          if (isAdjacent) {
            // Animated pulsing border
            const pulseAlpha = 0.5 + 0.3 * Math.sin(frame * 0.05);
            const pulseWidth = 2 + Math.sin(frame * 0.08) * 1;
            ctx.strokeStyle = `rgba(255,200,80,${pulseAlpha.toFixed(2)})`;
            ctx.lineWidth = pulseWidth;
            ctx.setLineDash([8, 4]);
            ctx.lineDashOffset = -frame * 0.5;
            ctx.strokeRect(chunkPx + 2, chunkPy + 2, chunkW - 4, chunkH - 4);
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;

            // Subtle inner glow filling
            const glowGrad = ctx.createRadialGradient(
              chunkPx + chunkW / 2, chunkPy + chunkH / 2, 0,
              chunkPx + chunkW / 2, chunkPy + chunkH / 2, chunkW * 0.5
            );
            glowGrad.addColorStop(0, `rgba(255,200,80,${(0.02 + 0.01 * Math.sin(frame * 0.04)).toFixed(3)})`);
            glowGrad.addColorStop(1, "rgba(255,200,80,0)");
            ctx.fillStyle = glowGrad;
            ctx.fillRect(chunkPx, chunkPy, chunkW, chunkH);

            ctx.fillStyle = `rgba(255,210,100,${(0.7 + 0.2 * Math.sin(frame * 0.06)).toFixed(2)})`;
            ctx.font = `bold ${Math.max(16, Math.round(18 / cam.zoom))}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(255,200,80,0.5)";
            ctx.shadowBlur = 8;
            ctx.fillText(`[ ${areaCost} dust ]`, chunkPx + chunkW / 2, chunkPy + chunkH / 2);
            ctx.shadowBlur = 0;
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

      // ── Draw tiles ──
      for (const tile of tiles) {
        const px = tile.local_x * TILE_SIZE + tile.chunk_x * 20 * TILE_SIZE;
        const py = tile.local_y * TILE_SIZE + tile.chunk_y * 15 * TILE_SIZE;

        // Culling
        if (px + TILE_SIZE < viewLeft || px > viewRight || py + TILE_SIZE < viewTop || py > viewBottom) continue;

        const soil: "green" | "crystal" | "brown" =
          tile.mana >= 2 ? "crystal" : tile.nutrient >= 0.6 ? "green" : "brown";

        const spriteTileType = tile.type === "resource" ? "corridor" : tile.type;

        // Subtle tile glow/pulse for special tiles
        if (tile.type === "crystal" || tile.type === "hatchery" || (tile.mana >= 2)) {
          const glowIntensity = 0.15 + 0.08 * Math.sin(frame * 0.06 + tile.local_x * 2.7 + tile.local_y * 1.9);
          const glowColor = tile.type === "crystal" ? `rgba(0,200,255,${glowIntensity.toFixed(3)})` : tile.type === "hatchery" ? `rgba(180,120,255,${glowIntensity.toFixed(3)})` : `rgba(100,200,100,${glowIntensity.toFixed(3)})`;
          
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 6 + 3 * Math.sin(frame * 0.05 + tile.local_x + tile.local_y);
          ctx.fillStyle = glowColor.replace(glowIntensity.toFixed(3), (glowIntensity * 0.5).toFixed(3));
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          ctx.shadowBlur = 0;
        }

        // Try sprite first, then fallback
        const sprite = spriteCache.getTile(spriteTileType as import("@/game/sprites/tile").TileType, frame, soil);
        if (sprite) {
          ctx.drawImage(sprite, px, py, TILE_SIZE, TILE_SIZE);
        } else {
          // Fallback with depth/gradient shading
          const grad = ctx.createLinearGradient(px, py, px + TILE_SIZE, py + TILE_SIZE);
          const base = TILE_COLORS[tile.type] || "#333";
          grad.addColorStop(0, lighten(base, 0.15));
          grad.addColorStop(1, base);
          ctx.fillStyle = grad;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }

        // Hover highlight
        const isHovered = hoverTileRef.current &&
          hoverTileRef.current.chunkX === tile.chunk_x &&
          hoverTileRef.current.chunkY === tile.chunk_y &&
          hoverTileRef.current.localX === tile.local_x &&
          hoverTileRef.current.localY === tile.local_y;

        if (isHovered) {
          ctx.fillStyle = "rgba(255,220,120,0.15)";
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = "rgba(255,220,120,0.5)";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        }
      }

      // ── Draw resources ──
      for (const tile of tiles) {
        const resource = resourceMap.get(tile.id);
        if (!resource) continue;

        const px = tile.local_x * TILE_SIZE + tile.chunk_x * 20 * TILE_SIZE;
        const py = tile.local_y * TILE_SIZE + tile.chunk_y * 15 * TILE_SIZE;
        const rcx = px + TILE_SIZE / 2;
        const rcy = py + TILE_SIZE / 2;

        if (px + TILE_SIZE < viewLeft || px > viewRight || py + TILE_SIZE < viewTop || py > viewBottom) continue;

        const glowSize = 3 + Math.sin(frame * 0.08 + tile.local_x * 3.7 + tile.local_y * 2.3) * 2;
        const glowAlpha = 0.2 + Math.sin(frame * 0.06 + tile.local_x * 1.9) * 0.08;
        const rColor = RESOURCE_COLORS[resource.type] || "#fff";
        const glowGrad = ctx.createRadialGradient(rcx, rcy, 0, rcx, rcy, TILE_SIZE * 0.7 + glowSize);
        glowGrad.addColorStop(0, rColor + Math.round(Math.min(255, glowAlpha * 300)).toString(16).padStart(2, "0"));
        glowGrad.addColorStop(0.5, rColor + Math.round(Math.min(255, glowAlpha * 80)).toString(16).padStart(2, "0"));
        glowGrad.addColorStop(1, rColor + "00");
        ctx.fillStyle = glowGrad;
        ctx.fillRect(px - 6, py - 6, TILE_SIZE + 12, TILE_SIZE + 12);

        // Resource sprite with bobbing animation
        const spriteOffsetY = Math.sin(frame * 0.06 + tile.local_x * 2.1) * 1.5;
        const rSprite = spriteCache.getResource(resource.type, frame);
        if (rSprite) {
          ctx.drawImage(rSprite, rcx - TILE_SIZE / 2, rcy - TILE_SIZE / 2 + spriteOffsetY - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = RESOURCE_COLORS[resource.type] || "#fff";
          ctx.beginPath();
          ctx.arc(rcx, rcy + spriteOffsetY, TILE_SIZE / 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Crystal sparkles on mana-saturated tiles
        if (tile.mana >= 2) {
          const sparkleCount = 2 + (tileHash(tile.local_x, tile.local_y) % 3);
          for (let si = 0; si < sparkleCount; si++) {
            const sparkleAngle = (frame * 0.03 + si * (Math.PI * 2 / sparkleCount) + tile.local_x * 4.7);
            const sparkleDist = 4 + Math.sin(frame * 0.04 + si * 2.1) * 3;
            const sparkleX = rcx + Math.cos(sparkleAngle) * sparkleDist;
            const sparkleY = rcy + Math.sin(sparkleAngle) * sparkleDist;
            const sparkleAlpha = 0.3 + Math.sin(frame * 0.1 + si * 1.5) * 0.25;
            const sparkleSize = 1 + Math.sin(frame * 0.12 + si) * 0.8;

            ctx.fillStyle = `rgba(200,240,255,${sparkleAlpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(sparkleX, sparkleY, Math.max(0.3, sparkleSize), 0, Math.PI * 2);
            ctx.fill();

            // Tiny cross sparkle
            if (frame % 3 === si % 3) {
              ctx.strokeStyle = `rgba(150,230,255,${(sparkleAlpha * 0.6).toFixed(2)})`;
              ctx.lineWidth = 0.5;
              const sw = sparkleSize * 2.5;
              ctx.beginPath();
              ctx.moveTo(sparkleX - sw, sparkleY);
              ctx.lineTo(sparkleX + sw, sparkleY);
              ctx.moveTo(sparkleX, sparkleY - sw);
              ctx.lineTo(sparkleX, sparkleY + sw);
              ctx.stroke();
            }
          }
        }
      }

      // ── Draw pets ──
      for (const pet of pets) {
        if (pet.status !== "alive" || pet.tile_x === null || pet.tile_y === null) continue;

        const px = pet.tile_x * TILE_SIZE + pet.chunk_x * 20 * TILE_SIZE;
        const py = pet.tile_y * TILE_SIZE + pet.chunk_y * 15 * TILE_SIZE;
        const pcx = px + TILE_SIZE / 2;
        const pcy = py + TILE_SIZE / 2;
        const isSelected = pet.id === selectedPetId;

        if (px + TILE_SIZE < viewLeft || px > viewRight || py + TILE_SIZE < viewTop || py > viewBottom) continue;

        const species = resolveSpecies(pet);
        const def = resolveMonsterDef(pet);
        const petSprite = spriteCache.getMonster(species, frame % 2);
        const spriteSize = pet.evolution_stage === 1 ? 32 : pet.evolution_stage === 2 ? 48 : 64;

        // Breathing animation for ALL pets
        const breathPhase = pet.id.charCodeAt(0) * 1.7;
        const breathAmp = isSelected ? 1.5 : 0.5;
        const breathRate = isSelected ? 0.12 : 0.07;
        const breathY = Math.sin(frame * breathRate + breathPhase) * breathAmp;

        // Pet movement tracking for dust trails
        const petKey = `pet_${pet.id}`;
        const posStore = dragRef.current as unknown as Record<string, { x: number; y: number } | undefined>;
        const prevPetPos = posStore[petKey];
        const petMoved = prevPetPos && (prevPetPos.x !== px || prevPetPos.y !== py);
        posStore[petKey] = { x: px, y: py };

        if (petMoved && frame % 3 === 0) {
          const life = 12 + Math.floor(Math.random() * 6);
          particleSystem.addParticle({
            x: (pet.tile_x + pet.chunk_x * 20 + 0.5) + (Math.random() - 0.5) * 0.5,
            y: (pet.tile_y + pet.chunk_y * 15 + 0.8),
            vx: (Math.random() - 0.5) * 0.3,
            vy: -Math.random() * 0.2,
            life,
            maxLife: life,
            size: 1.5 + Math.random() * 1.5,
            color: ["#8d6e63", "#a1887f", "#bcaaa4"][Math.floor(Math.random() * 3)],
            alpha: 0.3,
            alphaDecay: 0.025,
            sizeDecay: 0.015,
            gravity: 0.03,
            type: "dust",
          });
        }

        // Shadow under pet
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(pcx, py + TILE_SIZE - 1, TILE_SIZE * 0.35, TILE_SIZE * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();

        // Selection glow aura
        if (isSelected) {
          const auraRadius = TILE_SIZE / 2 + 5 + 3 * Math.sin(frame * 0.1);
          const auraAlpha = 0.1 + 0.05 * Math.sin(frame * 0.12);
          const auraGrad = ctx.createRadialGradient(pcx, pcy + breathY, TILE_SIZE * 0.2, pcx, pcy + breathY, auraRadius);
          auraGrad.addColorStop(0, `rgba(255,200,60,${auraAlpha.toFixed(2)})`);
          auraGrad.addColorStop(1, "rgba(255,200,60,0)");
          ctx.fillStyle = auraGrad;
          ctx.fillRect(px - 10, py - 10, TILE_SIZE + 20, TILE_SIZE + 20);

          // Selection ring
          ctx.strokeStyle = frame % 2 === 0 ? "rgba(255,200,60,0.9)" : "rgba(255,220,80,1)";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.lineDashOffset = frame * -0.3;
          ctx.beginPath();
          ctx.arc(pcx, pcy + breathY, TILE_SIZE / 2 + 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        }

        if (petSprite) {
          ctx.drawImage(
            petSprite,
            px + (TILE_SIZE - spriteSize) / 2,
            py + (TILE_SIZE - spriteSize) / 2 + breathY,
            spriteSize,
            spriteSize
          );
        } else {
          // Fallback: colored circle with animation
          const bodyR = frame % 2 === 0 ? TILE_SIZE / 3 - 0.5 : TILE_SIZE / 3 + 0.5;
          const bodyY = frame % 2 === 0 ? 0 : -1;
          ctx.fillStyle = getPetColor(pet);
          ctx.beginPath();
          ctx.arc(pcx, pcy + bodyY + breathY, bodyR, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Evolution stars
        for (let i = 0; i < pet.evolution_stage; i++) {
          const starX = pcx - 6 + i * 6;
          const starY = py + TILE_SIZE - 3 + breathY * 0.3;
          const starPulse = frame % 2 === 0 ? 2 : 1.5;
          ctx.fillStyle = frame % 2 === 0 ? "#fff" : "#ffe066";
          ctx.beginPath();
          ctx.arc(starX, starY, starPulse, 0, Math.PI * 2);
          ctx.fill();
        }

        // Name label for selected pet
        if (isSelected) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          const label = getPetDisplayName(pet) + " Lv" + (pet.level ?? 1);
          ctx.font = "bold 9px monospace";
          const tw = ctx.measureText(label).width;
          const labelY = py - 14 + breathY;
          ctx.fillRect(pcx - tw / 2 - 3, labelY, tw + 6, 12);
          ctx.strokeStyle = "rgba(255,200,60,0.3)";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(pcx - tw / 2 - 3, labelY, tw + 6, 12);
          ctx.fillStyle = "#ffe066";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, pcx, labelY + 6);
          ctx.textAlign = "start";
        }

        // HP bar for pets below max hp
        if (pet.hp != null && pet.max_hp != null && pet.hp < pet.max_hp) {
          const barW = TILE_SIZE - 2;
          const barH = 3;
          const hpPct = pet.hp / pet.max_hp;
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect(px + 1, py - 2, barW, barH);
          const barColor = hpPct > 0.6 ? "#4caf50" : hpPct > 0.3 ? "#ff9800" : "#f44336";
          ctx.fillStyle = barColor;
          ctx.fillRect(px + 1, py - 2, barW * hpPct, barH);
        }
      }

      // ── Draw locked chunk hover ──
      for (const chunk of chunks) {
        if (chunk.locked) {
          const isAdjacent = chunks.some(
            (c) => !c.locked && Math.abs(c.chunk_x - chunk.chunk_x) + Math.abs(c.chunk_y - chunk.chunk_y) === 1
          );
          if (isAdjacent && dragRef.current.dragging) {
            const chunkPx = chunk.chunk_x * 20 * TILE_SIZE;
            const chunkPy = chunk.chunk_y * 15 * TILE_SIZE;
            ctx.fillStyle = "rgba(255,200,80,0.03)";
            ctx.fillRect(chunkPx, chunkPy, 20 * TILE_SIZE, 15 * TILE_SIZE);
          }
        }
      }

      ambientFrameCounter++;
      if (ambientFrameCounter % 40 === 0) {
        const viewLeftTile = Math.floor(viewLeft / TILE_SIZE) - 1;
        const viewTopTile = Math.floor(viewTop / TILE_SIZE) - 1;
        const viewWidth = Math.ceil((viewRight - viewLeft) / TILE_SIZE) + 2;
        const viewHeight = Math.ceil((viewBottom - viewTop) / TILE_SIZE) + 2;

        emitAmbient(
          particleSystem,
          viewLeftTile,
          viewTopTile,
          viewWidth,
          viewHeight
        );

        const areaHash = viewLeftTile * 1000 + viewTopTile;
        const shouldGlow = areaHash % 3 === 0;
        if (shouldGlow) {
          const glowX = viewLeftTile + (areaHash * 7 + 13) % viewWidth;
          const glowY = viewTopTile + (areaHash * 11 + 7) % viewHeight;
          const glowColors = ["#00c8ff", "#ab47bc", "#4caf50", "#ff9800", "#e040fb"];
          const glowColor = glowColors[areaHash % glowColors.length];

          for (let i = 0; i < 2; i++) {
            const l = 50 + Math.floor(Math.random() * 40);
            particleSystem.addParticle({
              x: glowX + 0.5 + (Math.random() - 0.5) * 0.5,
              y: glowY + 0.5 + (Math.random() - 0.5) * 0.5,
              vx: (Math.random() - 0.5) * 0.15,
              vy: -0.1 - Math.random() * 0.15,
              life: l,
              maxLife: l,
              size: 2 + Math.random() * 2,
              color: glowColor,
              alpha: 0.4 + Math.random() * 0.2,
              alphaDecay: 0.005 + Math.random() * 0.005,
              sizeDecay: 0.008 + Math.random() * 0.01,
              gravity: -0.005,
              type: "glow",
            });
          }
        }

        // Green soil tile drips
        const dripsSpawned = new Set();
        for (const tile of tiles) {
          if (tile.nutrient >= 0.6) {
            const tileKey = `${tile.local_x}_${tile.local_y}_${tile.chunk_x}_${tile.chunk_y}`;
            if (dripsSpawned.has(tileKey)) continue;
            dripsSpawned.add(tileKey);
            
            if (Math.random() < 0.008 && frame % 5 === 0) {
              const pLife = 20 + Math.floor(Math.random() * 10);
              particleSystem.addParticle({
                x: (tile.local_x + tile.chunk_x * 20) + 0.5 + (Math.random() - 0.5) * 0.8,
                y: (tile.local_y + tile.chunk_y * 15) + 0.5,
                vx: (Math.random() - 0.5) * 0.1,
                vy: 0.1 + Math.random() * 0.2,
                life: pLife,
                maxLife: pLife,
                size: 1 + Math.random(),
                color: "#4caf50",
                alpha: 0.3 + Math.random() * 0.2,
                alphaDecay: 0.015,
                sizeDecay: 0.01,
                gravity: 0.04,
                type: "sparkle",
              });
            }
          }
        }
      }

      // ── Update & render particles ──
      particleSystem.update();
      particleSystem.render(ctx, cameraRef.current);

      ctx.restore();
      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [tiles, resources, pets, chunks, areaCost, selectedPetId, cameraRef, frameRef, tileHash]);

  // ── Mouse move for hover detection ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleMouseMove(e: MouseEvent) {
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

      // Check if this tile exists in our tile data
      const tileExists = tiles.some(
        t => t.chunk_x === chunkX && t.chunk_y === chunkY && t.local_x === localX && t.local_y === localY
      );

      if (tileExists) {
        hoverTileRef.current = { chunkX, chunkY, localX, localY };
      } else {
        hoverTileRef.current = null;
      }
    }

    canvas.addEventListener("mousemove", handleMouseMove);
    return () => canvas.removeEventListener("mousemove", handleMouseMove);
  }, [tiles]);

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

    for (const pet of pets) {
      if (pet.status !== "alive") continue;
      if (pet.tile_x === null || pet.tile_y === null) continue;
      // Simpler pet click check
      const petPx = pet.tile_x * TILE_SIZE + pet.chunk_x * 20 * TILE_SIZE;
      const petPy = pet.tile_y * TILE_SIZE + pet.chunk_y * 15 * TILE_SIZE;
      if (worldX >= petPx && worldX < petPx + TILE_SIZE && worldY >= petPy && worldY < petPy + TILE_SIZE) {
        onPetSelect(pet.id);
        return;
      }
    }

    onCanvasClick(chunkX, chunkY, localX, localY, e.clientX, e.clientY);
  }

  function handleTouchStart(e: React.TouchEvent) {
    e.preventDefault();
    const touch = e.touches[0];
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    dragRef.current = {
      dragging: true,
      lastX: touch.clientX,
      lastY: touch.clientY,
      startX: touch.clientX,
      startY: touch.clientY,
    };
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    const touch = e.touches[0];
    if (!dragRef.current.dragging) return;
    const dx = touch.clientX - dragRef.current.lastX;
    const dy = touch.clientY - dragRef.current.lastY;
    onCameraMove(dx, dy);
    dragRef.current.lastX = touch.clientX;
    dragRef.current.lastY = touch.clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    e.preventDefault();
    const last = dragRef.current;
    last.dragging = false;

    const dx = Math.abs(last.startX - last.lastX);
    const dy = Math.abs(last.startY - last.lastY);
    if (dx > 5 || dy > 5) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const touch = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const screenX = touch.clientX - rect.left;
    const screenY = touch.clientY - rect.top;

    const worldX = (screenX - canvas.clientWidth / 2) / cam.zoom + cam.x;
    const worldY = (screenY - canvas.clientHeight / 2) / cam.zoom + cam.y;

    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    const chunkX = Math.floor(tileX / 20);
    const chunkY = Math.floor(tileY / 15);
    const localX = tileX - chunkX * 20;
    const localY = tileY - chunkY * 15;

    for (const pet of pets) {
      if (pet.status !== "alive") continue;
      if (pet.tile_x === null || pet.tile_y === null) continue;
      const petPx = pet.tile_x * TILE_SIZE + pet.chunk_x * 20 * TILE_SIZE;
      const petPy = pet.tile_y * TILE_SIZE + pet.chunk_y * 15 * TILE_SIZE;
      if (worldX >= petPx && worldX < petPx + TILE_SIZE && worldY >= petPy && worldY < petPy + TILE_SIZE) {
        onPetSelect(pet.id);
        return;
      }
    }

    onCanvasClick(chunkX, chunkY, localX, localY, touch.clientX, touch.clientY);
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    />
  );
}

function lighten(color: string, amount: number): string {
  const h = color.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const nr = Math.round(r + (255 - r) * amount);
  const ng = Math.round(g + (255 - g) * amount);
  const nb = Math.round(b + (255 - b) * amount);
  return `#${[nr, ng, nb].map(c => c.toString(16).padStart(2, "0")).join("")}`;
}

function petSpriteFrame(frame: number, pet: Pet): number {
  return Math.floor(frame / 15) % 2;
}
