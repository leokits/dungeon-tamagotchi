"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tile, Resource, Dungeon, Player } from "@/types/database";

const TILE_SIZE = 32;

// Color map for tile types
const TILE_COLORS: Record<string, string> = {
  solid: "#4a3728",
  corridor: "#8b7355",
  packed: "#a0926b",
  solid_regrowing: "#5a4738",
  resource: "#8b7355",
  hatchery: "#6b5b95",
  crystal: "#00c8ff",
};

const RESOURCE_COLORS: Record<string, string> = {
  mushroom: "#7cb342",
  crystal_shard: "#29b6f6",
  bone: "#e0e0e0",
  mana_orb: "#ab47bc",
  moss: "#558b2f",
};

interface GameViewProps {
  playerId: string;
}

export default function GameView({ playerId }: GameViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [dungeon, setDungeon] = useState<Dungeon | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [tool, setTool] = useState<"dig" | "view">("dig");
  const [loading, setLoading] = useState(true);

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  const supabase = createClient();

  // Load dungeon data
  const loadDungeon = useCallback(async () => {
    const res = await fetch("/api/dungeon/mine");
    if (!res.ok) return;
    const data = await res.json();
    setDungeon(data.dungeon);
    setTiles(data.tiles);
    setResources(data.resources);
    setPlayer(data.player);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDungeon();
  }, [loadDungeon]);

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dungeon, supabase]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || tiles.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function render() {
      if (!ctx || !canvas) return;
      const cam = cameraRef.current;

      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // Build resource lookup
      const resourceMap = new Map<string, Resource>();
      for (const r of resources) {
        resourceMap.set(r.tile_id, r);
      }

      // Render tiles
      for (const tile of tiles) {
        const px = tile.local_x * TILE_SIZE + tile.chunk_x * 20 * TILE_SIZE;
        const py = tile.local_y * TILE_SIZE + tile.chunk_y * 15 * TILE_SIZE;

        // Tile background
        ctx.fillStyle = TILE_COLORS[tile.type] || "#333";
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Grid lines
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);

        // Resource overlay
        const resource = resourceMap.get(tile.id);
        if (resource) {
          ctx.fillStyle = RESOURCE_COLORS[resource.type] || "#fff";
          ctx.beginPath();
          ctx.arc(
            px + TILE_SIZE / 2,
            py + TILE_SIZE / 2,
            TILE_SIZE / 4,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }

        // Crystal glow
        if (tile.type === "crystal") {
          ctx.shadowColor = "#00c8ff";
          ctx.shadowBlur = 12;
          ctx.fillStyle = "rgba(0, 200, 255, 0.6)";
          ctx.beginPath();
          ctx.arc(
            px + TILE_SIZE / 2,
            py + TILE_SIZE / 2,
            TILE_SIZE / 3,
            0,
            Math.PI * 2
          );
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      ctx.restore();
    }

    render();

    // Re-render on state changes (simple approach — not 60fps, just on data change)
    const id = requestAnimationFrame(function loop() {
      render();
      requestAnimationFrame(loop);
    });

    return () => cancelAnimationFrame(id);
  }, [tiles, resources]);

  // Mouse handlers for camera pan + tile click
  function handleMouseDown(e: React.MouseEvent) {
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
    const wasDrag =
      Math.abs(e.clientX - dragRef.current.lastX) > 3 ||
      Math.abs(e.clientY - dragRef.current.lastY) > 3;
    dragRef.current.dragging = false;

    if (wasDrag) return;

    // Click — convert screen coords to tile coords
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const worldX =
      (screenX - canvas.clientWidth / 2) / cam.zoom + cam.x;
    const worldY =
      (screenY - canvas.clientHeight / 2) / cam.zoom + cam.y;

    // For starting chunk (0,0) which is 20x15
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);

    // Find chunk coordinates
    const chunkX = Math.floor(tileX / 20);
    const chunkY = Math.floor(tileY / 15);
    const localX = tileX - chunkX * 20;
    const localY = tileY - chunkY * 15;

    if (tool === "dig") {
      handleDig(chunkX, chunkY, localX, localY);
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    cameraRef.current.zoom = Math.max(
      0.3,
      Math.min(3, cameraRef.current.zoom * delta)
    );
  }

  async function handleDig(
    chunkX: number,
    chunkY: number,
    localX: number,
    localY: number
  ) {
    const res = await fetch("/api/dungeon/dig", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chunk_x: chunkX,
        chunk_y: chunkY,
        local_x: localX,
        local_y: localY,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      // Optimistic update
      setTiles((prev) =>
        prev.map((t) => (t.id === data.tile.id ? data.tile : t))
      );
    }
  }

  async function handleExpand(direction: string) {
    const res = await fetch("/api/dungeon/expand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });

    if (res.ok) {
      // Reload all dungeon data to include new chunk
      await loadDungeon();
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-400">Loading your dungeon...</p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Top HUD */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between bg-zinc-900/80 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-amber-400">
            {player?.username}
          </span>
          <span className="text-sm text-zinc-400">
            Chrono Dust: {player?.chrono_dust ?? 0}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Crystal energy bar */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-cyan-400">Crystal</span>
            <div className="h-3 w-24 overflow-hidden rounded-full bg-zinc-700">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all"
                style={{
                  width: `${Math.min(100, dungeon?.crystal_energy ?? 0)}%`,
                }}
              />
            </div>
            <span className="text-xs text-zinc-400">
              {(dungeon?.crystal_energy ?? 0).toFixed(1)}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 bg-zinc-900/80 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={() => setTool("dig")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tool === "dig"
              ? "bg-amber-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          Dig
        </button>
        <button
          onClick={() => setTool("view")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tool === "view"
              ? "bg-amber-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
          }`}
        >
          View
        </button>

        <div className="mx-2 h-6 w-px bg-zinc-700" />

        <div className="flex gap-1">
          {["north", "south", "east", "west"].map((dir) => (
            <button
              key={dir}
              onClick={() => handleExpand(dir)}
              className="rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            >
              Expand {dir.charAt(0).toUpperCase() + dir.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
