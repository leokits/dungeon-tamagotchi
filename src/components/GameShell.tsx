"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tile, Resource, Dungeon, Player, Pet, Chunk } from "@/types/database";
import {
  MONSTER_DEF_BY_ID,
  MONSTER_FAMILY_BY_ID,
  levelToExp,
  type MonsterDef,
  type MonsterFamily,
  type PetBehaviorStats as BehaviorStats,
} from "@/game/monsters";
import { init as initSprites, spriteCache } from "@/game/sprites";
import { ParticleSystem, emitDig, emitEvolution, emitDeath, emitEat } from "@/game/particles";
import { AudioManager } from "@/game/audio";
import GameCanvas from "./GameCanvas";
import TopBar from "./HUD/TopBar";
import Sidebar from "./Sidebar/Sidebar";
import BottomBar from "./ToolBar/BottomBar";
import ToastContainer from "./Notifications/Toast";
import NotificationPanel from "./Notifications/NotificationPanel";
import TutorialOverlay from "./Tutorial/TutorialOverlay";
import LoadingScreen from "./LoadingScreen";
import VictoryDefeatOverlay from "./VictoryDefeatOverlay";

const TILE_SIZE = 32;

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

type Tool = "dig" | "view" | "crystal_move" | "hatchery" | "raid";

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

interface GameNotification {
  id: string;
  type: string;
  data: Record<string, unknown>;
  seen: boolean;
  created_at: string;
}

interface HatcheryPanel {
  tileId: string;
  chunkX: number;
  chunkY: number;
  localX: number;
  localY: number;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
}

interface GameShellProps {
  playerId: string;
}

export default function GameShell({ playerId }: GameShellProps) {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [dungeon, setDungeon] = useState<Dungeon | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [tool, setTool] = useState<Tool>("dig");
  const [loading, setLoading] = useState(true);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [areaCost, setAreaCost] = useState(50);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [hatcheryPanel, setHatcheryPanel] = useState<HatcheryPanel | null>(null);
  const [editingPetName, setEditingPetName] = useState<string | null>(null);
  const [petNameInput, setPetNameInput] = useState("");

  const resourceCounts = useRef<Record<string, number>>({});

  const [resourceCountsState, setResourceCountsState] = useState<Record<string, number>>({});

  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const r of resources) {
      counts[r.type] = (counts[r.type] || 0) + r.quantity;
    }
    resourceCounts.current = counts;
    setResourceCountsState({ ...counts });
  }, [resources]);

  const [showRaidPanel, setShowRaidPanel] = useState(false);
  const [raidTab, setRaidTab] = useState<"browse" | "defense" | "history">("browse");
  const [browseDungeons, setBrowseDungeons] = useState<BrowseDungeon[]>([]);
  const [browsLoading, setBrowseLoading] = useState(false);
  const [raidHistory, setRaidHistory] = useState<RaidHistoryEntry[]>([]);
  const [raidHistoryLoading, setRaidHistoryLoading] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<BrowseDungeon | null>(null);
  const [selectedRaidPets, setSelectedRaidPets] = useState<string[]>([]);
  const [raidLaunching, setRaidLaunching] = useState(false);
  const [lastRaidResult, setLastRaidResult] = useState<LastRaidResult | null>(null);

  const [notifications, setNotifications] = useState<GameNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  const [showAdmin, setShowAdmin] = useState(false);
  const [tickInterval, setTickInterval] = useState(5);
  const [autoTick, setAutoTick] = useState(true);
  const [dustMultiplier, setDustMultiplier] = useState(1);
  const [crystalGrowthRate, setCrystalGrowthRate] = useState(1.7);
  const [petMoveChance, setPetMoveChance] = useState(1);
  const [regrowthSpeed, setRegrowthSpeed] = useState(1);
  const [hatchSpeedMultiplier, setHatchSpeedMultiplier] = useState(1);
  const [animSpeed, setAnimSpeed] = useState(1000);
  const [tickCount, setTickCount] = useState(0);
  const [lastTickResult, setLastTickResult] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"pets" | "inventory" | "raids" | "quests" | "trades" | "shop" | "achievements" | "battlepass">("pets");
  const [petDetailView, setPetDetailView] = useState<string | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const [cameraKey, setCameraKey] = useState(0);
  const particleSystemRef = useRef<ParticleSystem>(new ParticleSystem());
  const audioRef = useRef<AudioManager | null>(null);
  const ambientPositions = useMemo(() => (
    Array.from({ length: 12 }, () => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      dur: `${8 + Math.random() * 14}s`,
      delay: `${-Math.random() * 12}s`,
    }))
  ), []);

  useEffect(() => {
    initSprites();
    audioRef.current = AudioManager.instance;
  }, []);

  const supabase = createClient();

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadDungeon = useCallback(async () => {
    const res = await fetch("/api/dungeon/mine");
    if (!res.ok) return;
    const data = await res.json();
    setDungeon(data.dungeon);
    setTiles(data.tiles);
    setResources(data.resources);
    setPlayer(data.player);
    const fetchedChunks: Chunk[] = data.chunks || [];
    setChunks(fetchedChunks);
    setLoading(false);

    setCameraKey((prev) => {
      if (prev === 0 && fetchedChunks.length > 0) {
        const startChunk = fetchedChunks.find((c) => !c.locked);
        if (startChunk) {
          const CHUNK_W = 20;
          const CHUNK_H = 15;
          cameraRef.current = {
            x: startChunk.chunk_x * CHUNK_W * TILE_SIZE + (CHUNK_W / 2) * TILE_SIZE,
            y: startChunk.chunk_y * CHUNK_H * TILE_SIZE + (CHUNK_H / 2) * TILE_SIZE,
            zoom: 1.5,
          };
        }
        return 1;
      }
      return prev;
    });
  }, []);

  const loadPets = useCallback(async () => {
    const res = await fetch("/api/pets");
    if (!res.ok) return;
    const data = await res.json();
    setPets(data.pets ?? []);
  }, []);

  const loadBrowse = useCallback(async () => {
    setBrowseLoading(true);
    const res = await fetch("/api/dungeon/browse");
    if (res.ok) {
      const data = await res.json();
      setBrowseDungeons(data.dungeons ?? []);
    }
    setBrowseLoading(false);
  }, []);

  const loadRaidHistory = useCallback(async () => {
    setRaidHistoryLoading(true);
    const res = await fetch("/api/raid/history");
    if (res.ok) {
      const data = await res.json();
      setRaidHistory(data.raids ?? []);
    }
    setRaidHistoryLoading(false);
  }, []);

  const loadNotifications = useCallback(async () => {
    const res = await fetch("/api/notifications");
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unread_count ?? 0);
    }
  }, []);

  useEffect(() => {
    loadDungeon();
    loadPets();
    loadNotifications();
  }, [loadDungeon, loadPets, loadNotifications]);

  useEffect(() => {
    if (!dungeon) return;

    const channel = supabase
      .channel("dungeon-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tiles", filter: `dungeon_id=eq.${dungeon.id}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setTiles((prev) => prev.map((t) => (t.id === (payload.new as Tile).id ? (payload.new as Tile) : t)));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "resources", filter: `dungeon_id=eq.${dungeon.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setResources((prev) => [...prev, payload.new as Resource]);
          } else if (payload.eventType === "DELETE") {
            setResources((prev) => prev.filter((r) => r.id !== (payload.old as Resource).id));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dungeons", filter: `id=eq.${dungeon.id}` },
        (payload) => {
          setDungeon(payload.new as Dungeon);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pets", filter: `dungeon_id=eq.${dungeon.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setPets((prev) => [...prev, payload.new as Pet]);
          } else if (payload.eventType === "UPDATE") {
            setPets((prev) => prev.map((p) => (p.id === (payload.new as Pet).id ? (payload.new as Pet) : p)));
          } else if (payload.eventType === "DELETE") {
            setPets((prev) => prev.filter((p) => p.id !== (payload.old as Pet).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dungeon?.id, supabase]);

  const frameRef = useRef(0);
  useEffect(() => {
    const interval = setInterval(() => {
      frameRef.current = frameRef.current === 0 ? 1 : 0;
    }, animSpeed);
    return () => clearInterval(interval);
  }, [animSpeed]);

  const fireTick = useCallback(async () => {
    try {
      const res = await fetch("/api/dev-tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dustMultiplier, crystalGrowthRate, petMoveChance, regrowthSpeed, hatchSpeedMultiplier,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTickCount((c) => c + 1);
        setLastTickResult(`+${data.dustGained}d | CE ${data.crystalEnergy} | R+${data.resourcesSpawned} | P${data.petsMoved}`);
        loadDungeon();
        loadPets();
      }
    } catch {
    }
  }, [dustMultiplier, crystalGrowthRate, petMoveChance, regrowthSpeed, hatchSpeedMultiplier, loadDungeon, loadPets]);

  useEffect(() => {
    if (!autoTick || tickInterval <= 0) return;
    const id = setInterval(fireTick, tickInterval * 1000);
    return () => clearInterval(id);
  }, [autoTick, tickInterval, fireTick]);

  const handleBuyArea = useCallback(async (chunkX: number, chunkY: number) => {
    const isAdjacent = chunks.some(
      (c) => !c.locked && Math.abs(c.chunk_x - chunkX) + Math.abs(c.chunk_y - chunkY) === 1
    );
    if (!isAdjacent) {
      addToast("Must buy an area adjacent to an unlocked one", "warning");
      return;
    }
    if (!confirm(`Buy area (${chunkX},${chunkY}) for ${areaCost} dust?`)) return;

    const res = await fetch("/api/dungeon/buy-area", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chunk_x: chunkX, chunk_y: chunkY, cost_override: areaCost }),
    });
    let data;
    try { data = await res.json(); } catch { addToast("Server error", "error"); return; }
    if (res.ok) {
      addToast(data.message, "success");
      await loadDungeon();
    } else {
      addToast(data.error || "Failed to buy area", "error");
    }
  }, [chunks, areaCost, loadDungeon, addToast]);

  const handleDig = useCallback(async (chunkX: number, chunkY: number, localX: number, localY: number) => {
    const worldX = chunkX * 20 * TILE_SIZE + localX * TILE_SIZE + TILE_SIZE / 2;
    const worldY = chunkY * 15 * TILE_SIZE + localY * TILE_SIZE + TILE_SIZE / 2;
    emitDig(particleSystemRef.current, worldX, worldY);
    audioRef.current?.playDig();

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
        const rWorldX = chunkX * 20 * TILE_SIZE + localX * TILE_SIZE + TILE_SIZE / 2;
        const rWorldY = chunkY * 15 * TILE_SIZE + localY * TILE_SIZE + TILE_SIZE / 2;
        emitEat(particleSystemRef.current, rWorldX, rWorldY, data.resource.type);
        audioRef.current?.playEat();
        audioRef.current?.playItemAcquire();
      }
      if (data.pet) {
        setPets((prev) => [...prev, data.pet]);
        msgs.push("A " + data.pet.base_type.replace(/_/g, " ") + " emerged from the soil!");
        const pWorldX = chunkX * 20 * TILE_SIZE + localX * TILE_SIZE + TILE_SIZE / 2;
        const pWorldY = chunkY * 15 * TILE_SIZE + localY * TILE_SIZE + TILE_SIZE / 2;
        emitEvolution(particleSystemRef.current, pWorldX, pWorldY, "#7cb342");
        audioRef.current?.playHatch();
        audioRef.current?.playItemAcquire();
      }
      addToast(msgs.length > 0 ? msgs.join(" ") : "Tile dug!", "success");
    } else {
      addToast(data.error || "Failed to dig", "error");
    }
  }, [addToast]);

  const handleMoveCrystal = useCallback(async (chunkX: number, chunkY: number, localX: number, localY: number) => {
    const res = await fetch("/api/dungeon/move-crystal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chunk_x: chunkX, chunk_y: chunkY, local_x: localX, local_y: localY }),
    });
    const data = await res.json();
    if (res.ok) {
      addToast(data.message, "success");
      loadDungeon();
    } else {
      addToast(data.error || "Failed to move crystal", "error");
    }
  }, [loadDungeon, addToast]);

  const handlePlaceHatchery = useCallback(async (chunkX: number, chunkY: number, localX: number, localY: number) => {
    const clickedTile = tiles.find(
      (t) => t.chunk_x === chunkX && t.chunk_y === chunkY && t.local_x === localX && t.local_y === localY
    );
    if (!clickedTile) { addToast("No tile found here", "warning"); return; }
    if (clickedTile.type === "hatchery") {
      setHatcheryPanel({ tileId: clickedTile.id, chunkX, chunkY, localX, localY });
      return;
    }
    if (clickedTile.type !== "corridor" && clickedTile.type !== "packed") {
      addToast("Can only place hatchery on corridor or packed tiles", "warning");
      return;
    }
    const res = await fetch("/api/dungeon/place-hatchery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chunk_x: chunkX, chunk_y: chunkY, local_x: localX, local_y: localY }),
    });
    const data = await res.json();
    if (res.ok) {
      setTiles((prev) => prev.map((t) => (t.id === data.tile.id ? data.tile : t)));
      addToast("Hatchery placed! Click it again to incubate an egg.", "success");
    } else {
      addToast(data.error || "Failed to place hatchery", "error");
    }
  }, [tiles, addToast]);

  const handleIncubateEgg = useCallback(async (baseType: string) => {
    if (!hatcheryPanel) return;
    const res = await fetch("/api/egg/incubate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_type: baseType, hatchery_tile_id: hatcheryPanel.tileId }),
    });
    const data = await res.json();
    if (res.ok) {
      setHatcheryPanel(null);
      addToast("Egg incubating! Hatches in ~1 minute (dev speed).", "success");
      await loadPets();
    } else {
      addToast(data.error || "Failed to incubate egg", "error");
    }
  }, [hatcheryPanel, loadPets, addToast]);

  const handleRenamePet = useCallback(async (petId: string, newName: string) => {
    if (!newName.trim()) return;
    const res = await fetch(`/api/pets/${petId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setPets((prev) => prev.map((p) => (p.id === petId ? { ...p, name: data.pet.name } : p)));
      addToast("Pet renamed!", "success");
    } else {
      addToast(data.error || "Failed to rename pet", "error");
    }
    setEditingPetName(null);
    setPetNameInput("");
  }, [addToast]);

  const handleFeedPet = useCallback(async (petId: string, resourceType: string) => {
    const res = await fetch(`/api/pets/${petId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource_type: resourceType }),
    });
    const data = await res.json();
    if (res.ok) {
      setPets((prev) =>
        prev.map((p) =>
          p.id === petId ? { ...p, hunger: data.pet.hunger } : p
        )
      );
      addToast("Pet fed!", "success");
    } else {
      addToast(data.error || "Failed to feed pet", "error");
    }
  }, [addToast]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  }, [supabase]);

  const handleLaunchRaid = useCallback(async () => {
    if (!selectedTarget || selectedRaidPets.length === 0) return;
    setRaidLaunching(true);
    audioRef.current?.playRaidStart();
    try {
      const res = await fetch("/api/raid/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defender_player_id: selectedTarget.player_id, pet_ids: selectedRaidPets }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.result === "attacker_win") audioRef.current?.playRaidVictory();
        else audioRef.current?.playRaidDefeat();

        if (data.dead_pets?.length > 0) {
          for (const deadPet of data.dead_pets) {
            const pet = pets.find((p) => p.id === deadPet);
            if (pet && pet.tile_x !== null && pet.tile_y !== null) {
              const wx = pet.chunk_x * 20 * TILE_SIZE + pet.tile_x * TILE_SIZE + TILE_SIZE / 2;
              const wy = pet.chunk_y * 15 * TILE_SIZE + pet.tile_y * TILE_SIZE + TILE_SIZE / 2;
              emitDeath(particleSystemRef.current, wx, wy);
            }
          }
        }

        setLastRaidResult({
          result: data.result, depth_reached: data.depth_reached, loot: data.loot,
          dead_pets: data.dead_pets ?? [], surviving_pets: data.surviving_pets ?? [],
          energy_drained: data.energy_drained,
        });
        setSelectedTarget(null);
        setSelectedRaidPets([]);
        setShowRaidPanel(false);
        await loadPets();
        await loadDungeon();
        await loadNotifications();
        addToast(`Raid ${data.result === "attacker_win" ? "won!" : data.result === "draw" ? "drew" : "lost"}`, data.result === "attacker_win" ? "success" : "error");
      } else {
        addToast(data.error || "Failed to launch raid", "error");
      }
    } catch {
      addToast("Error launching raid", "error");
    } finally {
      setRaidLaunching(false);
    }
  }, [selectedTarget, selectedRaidPets, pets, loadPets, loadDungeon, loadNotifications, addToast]);

  const markNotificationSeen = useCallback(async (id: string) => {
    await fetch(`/api/notifications/${id}/seen`, { method: "POST" });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, seen: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const handleCanvasClick = useCallback((chunkX: number, chunkY: number, localX: number, localY: number, screenX: number, screenY: number) => {
    const clickedChunk = chunks.find((c) => c.chunk_x === chunkX && c.chunk_y === chunkY);
    if (clickedChunk && clickedChunk.locked) {
      handleBuyArea(chunkX, chunkY);
      return;
    }

    if (tool === "dig") {
      handleDig(chunkX, chunkY, localX, localY);
    } else if (tool === "crystal_move") {
      handleMoveCrystal(chunkX, chunkY, localX, localY);
    } else if (tool === "hatchery") {
      handlePlaceHatchery(chunkX, chunkY, localX, localY);
    }
  }, [chunks, tool, handleBuyArea, handleDig, handleMoveCrystal, handlePlaceHatchery]);

  const handleCameraMove = useCallback((dx: number, dy: number) => {
    cameraRef.current.x -= dx / cameraRef.current.zoom;
    cameraRef.current.y -= dy / cameraRef.current.zoom;
  }, []);

  const handleCameraZoom = useCallback((delta: number) => {
    const cam = cameraRef.current;
    cam.zoom = Math.max(0.3, Math.min(3, cam.zoom * delta));
  }, []);

  const handleToolChange = useCallback((newTool: string) => {
    setTool(newTool as Tool);
    if (newTool === "raid") {
      setShowRaidPanel((v) => !v);
      if (!showRaidPanel) {
        if (raidTab === "browse") loadBrowse();
        else loadRaidHistory();
      }
    }
  }, [showRaidPanel, raidTab, loadBrowse, loadRaidHistory]);

  const alivePets = pets.filter((p) => p.status === "alive");

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950">
      <div className="absolute inset-0 z-12 pointer-events-none overflow-hidden">
        {ambientPositions.map((p, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-amber-400/10 blur-[1px]"
            style={{
              left: p.left,
              top: p.top,
              animation: `ambientDrift ${p.dur} ease-in-out infinite`,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>
      <TopBar
        player={player}
        dungeon={dungeon}
        unreadCount={unreadCount}
        resourceCounts={resourceCountsState}
        onToggleNotifications={() => {
          setShowNotifications((v) => !v);
          if (!showNotifications) loadNotifications();
        }}
        onToggleAdmin={() => setShowAdmin((v) => !v)}
        onLogout={handleLogout}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
      />

      <Sidebar
        isOpen={sidebarOpen}
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
        onClose={() => setSidebarOpen(false)}
        pets={pets}
        player={player}
        selectedPetId={petDetailView}
        onPetSelect={(id) => setPetDetailView(id)}
        onPetBack={() => setPetDetailView(null)}
        onRenamePet={handleRenamePet}
        editingPetName={editingPetName}
        petNameInput={petNameInput}
        onPetNameInputChange={setPetNameInput}
        onEditingPetNameChange={setEditingPetName}
        onSendToRaid={(petId) => {
          setSelectedRaidPets((prev) => prev.includes(petId) ? prev : [...prev, petId]);
          setShowRaidPanel(true);
          setSidebarTab("raids");
        }}
        onFeedPet={handleFeedPet}
        showRaidPanel={showRaidPanel}
        raidTab={raidTab}
        onRaidTabChange={(tab) => {
          setRaidTab(tab);
          if (tab === "browse") loadBrowse();
          else loadRaidHistory();
        }}
        browseDungeons={browseDungeons}
        browseLoading={browsLoading}
        raidHistory={raidHistory}
        raidHistoryLoading={raidHistoryLoading}
        selectedTarget={selectedTarget}
        onTargetSelect={setSelectedTarget}
        selectedRaidPets={selectedRaidPets}
        onRaidPetToggle={(petId) => {
          setSelectedRaidPets((prev) => prev.includes(petId) ? prev.filter((id) => id !== petId) : [...prev, petId]);
        }}
        raidLaunching={raidLaunching}
        onLaunchRaid={handleLaunchRaid}
        lastRaidResult={lastRaidResult}
        onRaidResultDismiss={() => setLastRaidResult(null)}
        onRaidPanelClose={() => { setShowRaidPanel(false); setSelectedTarget(null); setSelectedRaidPets([]); }}
        hatcheryPanel={hatcheryPanel}
        onHatcheryClose={() => setHatcheryPanel(null)}
        onIncubateEgg={handleIncubateEgg}
        eggCosts={{
          glob_slime: 5, dust_mite: 5, cave_beetle: 5, mycelid: 6, wisp: 8,
          cave_serpent: 7, stone_golem: 8, shade_wraith: 9, fang_beetle: 6,
            moss_crawler: 5, ember_salamander: 8, crystal_sprite: 8,
          }}
          resourceCounts={resourceCountsState}
        />

      <GameCanvas
        tiles={tiles}
        resources={resources}
        pets={pets}
        chunks={chunks}
        selectedPetId={selectedPetId}
        areaCost={areaCost}
        cameraRef={cameraRef}
        frameRef={frameRef}
        particleSystem={particleSystemRef.current}
        onCanvasClick={handleCanvasClick}
        onCameraMove={handleCameraMove}
        onCameraZoom={handleCameraZoom}
        onPetSelect={setSelectedPetId}
      />

      {lastRaidResult && (
        <VictoryDefeatOverlay
          result={lastRaidResult}
          onClose={() => setLastRaidResult(null)}
        />
      )}

      <BottomBar
        activeTool={tool}
        onToolChange={handleToolChange}
      />

      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <TutorialOverlay />

      {showNotifications && (
        <NotificationPanel
          notifications={notifications}
          onMarkSeen={markNotificationSeen}
          onClose={() => setShowNotifications(false)}
        />
      )}

      {process.env.NODE_ENV === 'development' && showAdmin && (
        <div className="absolute left-2 top-14 z-50 w-72 rounded-lg bg-zinc-900/95 p-3 backdrop-blur-sm shadow-xl border border-zinc-700">
          <h3 className="mb-2 text-xs font-bold text-red-400 uppercase tracking-wider">Admin Panel</h3>
          <div className="mb-3 rounded bg-zinc-800 p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-400">Auto Tick</span>
              <button onClick={() => setAutoTick((v) => !v)} className={"rounded px-2 py-0.5 text-xs font-medium " + (autoTick ? "bg-green-600 text-white" : "bg-zinc-700 text-zinc-400")}>
                {autoTick ? "ON" : "OFF"}
              </button>
            </div>
            <label className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span>Interval (sec)</span>
              <input type="number" min={1} max={300} value={tickInterval} onChange={(e) => setTickInterval(Math.max(1, Number(e.target.value)))} className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200" />
            </label>
            <button onClick={fireTick} className="w-full rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500">Fire Tick Now</button>
            <div className="mt-1 text-xs text-zinc-500">Ticks: {tickCount}{lastTickResult && " | " + lastTickResult}</div>
          </div>
          <div className="mb-3 rounded bg-zinc-800 p-2 space-y-1">
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Dust Multiplier</span>
              <input type="number" min={0.1} max={100} step={0.5} value={dustMultiplier} onChange={(e) => setDustMultiplier(Number(e.target.value))} className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200" />
            </label>
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Crystal Growth/hr</span>
              <input type="number" min={0} max={50} step={0.1} value={crystalGrowthRate} onChange={(e) => setCrystalGrowthRate(Number(e.target.value))} className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200" />
            </label>
          </div>
          <div className="mb-3 rounded bg-zinc-800 p-2 space-y-1">
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Pet Move Chance</span>
              <input type="number" min={0} max={1} step={0.1} value={petMoveChance} onChange={(e) => setPetMoveChance(Number(e.target.value))} className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200" />
            </label>
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Regrowth Speed</span>
              <input type="number" min={0.1} max={1000} step={1} value={regrowthSpeed} onChange={(e) => setRegrowthSpeed(Math.max(0.1, Number(e.target.value)))} className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200" />
            </label>
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Hatch Speed x</span>
              <input type="number" min={1} max={100} step={1} value={hatchSpeedMultiplier} onChange={(e) => setHatchSpeedMultiplier(Math.max(1, Number(e.target.value)))} className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200" />
            </label>
          </div>
          <div className="rounded bg-zinc-800 p-2 space-y-1">
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Area Cost (dust)</span>
              <input type="number" min={1} max={10000} step={5} value={areaCost} onChange={(e) => setAreaCost(Math.max(1, Number(e.target.value)))} className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200" />
            </label>
            <label className="flex items-center justify-between text-xs text-zinc-400">
              <span>Anim Speed (ms)</span>
              <input type="number" min={100} max={5000} step={100} value={animSpeed} onChange={(e) => setAnimSpeed(Math.max(100, Number(e.target.value)))} className="w-16 rounded bg-zinc-700 px-2 py-0.5 text-right text-zinc-200" />
            </label>
          </div>
          <div className="mt-3 rounded bg-red-950/50 border border-red-800/50 p-2">
            <button onClick={async () => {
              if (!confirm("Reset dungeon? All tiles, pets will be deleted.")) return;
              const res = await fetch("/api/dev-reset", { method: "POST" });
              const data = await res.json();
              if (res.ok) { addToast(data.message, "success"); window.location.reload(); }
              else { addToast(data.error || "Reset failed", "error"); }
            }} className="w-full rounded bg-red-700 px-2 py-1 text-xs font-medium text-white hover:bg-red-600">
              Reset Dungeon (new layout)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
