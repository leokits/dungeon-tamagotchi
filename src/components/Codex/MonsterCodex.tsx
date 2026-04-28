"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  MONSTER_FAMILIES,
  MONSTER_DEF_BY_ID,
  MONSTER_FAMILY_BY_ID,
  type MonsterDef,
  type MonsterFamily,
} from "@/game/monsters";
import { monsterSpriteGenerator, type MonsterFamilyType } from "@/game/sprites/monster";

const FAMILY_ELEMENT: Record<string, string> = {
  Slime: "nature",
  Mite: "neutral",
  Beetle: "neutral",
  Fungus: "nature",
  Wisp: "crystal",
  Serpent: "neutral",
  Golem: "neutral",
  Shade: "shadow",
  Fang: "fire",
  Sprite: "crystal",
  Crawler: "nature",
  Salamander: "fire",
};

const ELEMENT_COLORS: Record<string, string> = {
  fire: "text-orange-400",
  nature: "text-green-400",
  crystal: "text-cyan-400",
  shadow: "text-purple-400",
  neutral: "text-zinc-400",
};

const ELEMENT_BG: Record<string, string> = {
  fire: "bg-orange-400/10 text-orange-400 border-orange-400/20",
  nature: "bg-green-400/10 text-green-400 border-green-400/20",
  crystal: "bg-cyan-400/10 text-cyan-400 border-cyan-400/20",
  shadow: "bg-purple-400/10 text-purple-400 border-purple-400/20",
  neutral: "bg-zinc-400/10 text-zinc-400 border-zinc-400/20",
};

interface Discovery {
  monster_type: string;
  count: number;
  first_discovered_at: string;
}

interface SpriteData {
  [monsterId: string]: string;
}

interface SilhouetteData {
  [monsterId: string]: string;
}

function generateSpriteDataUrl(def: MonsterDef, family: MonsterFamily): string {
  const canvas = monsterSpriteGenerator.generate(def, family.familyName as MonsterFamilyType);
  return canvas.toDataURL("image/png");
}

function generateSilhouetteDataUrl(def: MonsterDef, family: MonsterFamily): string {
  const size = def.stage <= 1 ? 32 : def.stage === 2 ? 48 : 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const tempCanvas = monsterSpriteGenerator.generate(def, family.familyName as MonsterFamilyType);
  const tempCtx = tempCanvas.getContext("2d")!;
  const imageData = tempCtx.getImageData(0, 0, size, size);

  for (let i = 0; i < imageData.data.length; i += 4) {
    if (imageData.data[i + 3] > 0) {
      imageData.data[i] = 26;
      imageData.data[i + 1] = 26;
      imageData.data[i + 2] = 46;
      imageData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function getStageLabel(stage: number): string {
  return `S${stage}`;
}

function getStatsSummary(def: MonsterDef): string {
  const { hp, mp, atk, def: d, spd } = def.baseStats;
  return `HP${hp} MP${mp} ATK${atk} DEF${d} SPD${spd}`;
}

function getEvolutionTree(def: MonsterDef, family: MonsterFamily): { current: MonsterDef; evolutions: { target: MonsterDef; criteria: string[] }[] } | null {
  if (!family) return null;

  const evolutions = def.evolutions.map((evo) => {
    const targetDef = MONSTER_DEF_BY_ID[evo.to];
    return {
      target: targetDef,
      criteria: evo.criteria.map((c) => c.description),
    };
  }).filter((e) => e.target);

  return { current: def, evolutions };
}

function getPreviousForms(def: MonsterDef, family: MonsterFamily): MonsterDef[] {
  if (!family) return [];
  return family.forms.filter((f) => f.stage < def.stage);
}

function getEvolutionPath(def: MonsterDef, family: MonsterFamily): MonsterDef[] {
  if (!family) return [def];
  return family.forms.filter((f) => isAncestorOf(f, def, family)).sort((a, b) => a.stage - b.stage);
}

function isAncestorOf(ancestor: MonsterDef, descendant: MonsterDef, family: MonsterFamily): boolean {
  if (ancestor.id === descendant.id) return true;
  for (const evo of ancestor.evolutions) {
    if (isAncestorOf(MONSTER_DEF_BY_ID[evo.to], descendant, family)) return true;
  }
  return false;
}

export default function MonsterCodex() {
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [sprites, setSprites] = useState<SpriteData>({});
  const [silhouettes, setSilhouettes] = useState<SilhouetteData>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterFamily, setFilterFamily] = useState<string>("all");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [filterElement, setFilterElement] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("family");
  const [selectedMonster, setSelectedMonster] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDiscoveries() {
      try {
        const res = await fetch("/api/codex");
        if (res.ok) {
          const data = await res.json();
          setDiscoveries(data.discoveries || []);
        }
      } catch {
        // Silently fail — show all as undiscovered
      } finally {
        setLoading(false);
      }
    }
    fetchDiscoveries();
  }, []);

  useEffect(() => {
    const spriteMap: SpriteData = {};
    const silhouetteMap: SilhouetteData = {};

    for (const family of MONSTER_FAMILIES) {
      for (const form of family.forms) {
        try {
          spriteMap[form.id] = generateSpriteDataUrl(form, family);
          silhouetteMap[form.id] = generateSilhouetteDataUrl(form, family);
        } catch {
          // Skip if generation fails
        }
      }
    }

    setSprites(spriteMap);
    setSilhouettes(silhouetteMap);
  }, []);

  const discoveredSet = new Set(discoveries.map((d) => d.monster_type));
  const discoveryCounts = new Map(discoveries.map((d) => [d.monster_type, d.count]));
  const discoveryDates = new Map(discoveries.map((d) => [d.monster_type, d.first_discovered_at]));

  const totalForms = MONSTER_FAMILIES.reduce((sum, f) => sum + f.forms.length, 0);
  const discoveredCount = discoveries.filter((d) => MONSTER_DEF_BY_ID[d.monster_type]).length;
  const discoveryPct = totalForms > 0 ? Math.round((discoveredCount / totalForms) * 100) : 0;

  const allFamilies = MONSTER_FAMILIES.map((f) => f.familyName);
  const allStages = ["1", "2", "3"];
  const allElements = ["fire", "nature", "crystal", "shadow", "neutral"];

  const allMonsters = MONSTER_FAMILIES.flatMap((family) =>
    family.forms.map((form) => ({ form, family }))
  );

  const filtered = allMonsters
    .filter(({ form, family }) => {
      if (search && !form.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterFamily !== "all" && family.familyName !== filterFamily) return false;
      if (filterStage !== "all" && String(form.stage) !== filterStage) return false;
      if (filterElement !== "all" && FAMILY_ELEMENT[family.familyName] !== filterElement) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "family":
          return a.family.familyName.localeCompare(b.family.familyName) || a.form.stage - b.form.stage;
        case "stage":
          return a.form.stage - b.form.stage || a.family.familyName.localeCompare(b.family.familyName);
        case "discovery": {
          const aDiscovered = discoveredSet.has(a.form.id) ? 0 : 1;
          const bDiscovered = discoveredSet.has(b.form.id) ? 0 : 1;
          if (aDiscovered !== bDiscovered) return aDiscovered - bDiscovered;
          const aDate = discoveryDates.get(a.form.id) || "";
          const bDate = discoveryDates.get(b.form.id) || "";
          return bDate.localeCompare(aDate);
        }
        default:
          return 0;
      }
    });

  const selectedDef = selectedMonster ? MONSTER_DEF_BY_ID[selectedMonster] : null;
  const selectedFamily = selectedMonster ? MONSTER_FAMILY_BY_ID[selectedMonster] : null;
  const selectedDiscovered = selectedMonster ? discoveredSet.has(selectedMonster) : false;

  const handleSpriteClick = useCallback((monsterId: string) => {
    setSelectedMonster((prev) => (prev === monsterId ? null : monsterId));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-zinc-500 text-sm">Loading codex...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="rounded-lg bg-zinc-900/80 border border-zinc-700 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-zinc-100">Monster Codex</h2>
          <span className="text-sm text-zinc-400">
            {discoveredCount} / {totalForms} forms discovered ({discoveryPct}%)
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{ width: discoveryPct + "%" }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-600/50 w-full md:w-64"
        />
        <div className="flex flex-wrap gap-2">
        <select
          value={filterFamily}
            onChange={(e) => setFilterFamily(e.target.value)}
            className="rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-600/50"
          >
            <option value="all">All Families</option>
            {allFamilies.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>

        <select
          value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            className="rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-600/50"
          >
            <option value="all">All Stages</option>
            {allStages.map((s) => (
              <option key={s} value={s}>S{s}</option>
            ))}
          </select>

        <select
          value={filterElement}
            onChange={(e) => setFilterElement(e.target.value)}
            className="rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-600/50"
          >
            <option value="all">All Elements</option>
            {allElements.map((e) => (
              <option key={e} value={e} className="capitalize">{e}</option>
            ))}
          </select>

        <select
          value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-600/50"
          >
            <option value="family">Sort: Family</option>
            <option value="stage">Sort: Stage</option>
            <option value="discovery">Sort: Discovery Date</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map(({ form, family }) => {
          const isDiscovered = discoveredSet.has(form.id);
          const count = discoveryCounts.get(form.id) || 0;
          const element = FAMILY_ELEMENT[family.familyName] || "neutral";

          return (
            <div key={form.id}>
              <div
                className={`rounded-lg bg-zinc-900 border p-4 transition-colors cursor-pointer ${
                  selectedMonster === form.id
                    ? "border-amber-500 ring-1 ring-amber-500/30"
                    : isDiscovered
                    ? "border-zinc-700 hover:border-amber-600/50"
                    : "border-zinc-700 opacity-50 grayscale hover:opacity-70 hover:grayscale-0"
                }`}
                onClick={() => handleSpriteClick(form.id)}
              >
                <div className="flex justify-center mb-3">
                  {isDiscovered ? (
                    sprites[form.id] ? (
                      <img
                        src={sprites[form.id]}
                        alt={form.name}
                        className="image-render-pixel"
                        style={{ imageRendering: "pixelated", width: form.stage <= 1 ? 64 : form.stage === 2 ? 96 : 128, height: "auto" }}
                      />
                    ) : (
                      <div className="w-16 h-16 rounded bg-zinc-800 animate-pulse" />
                    )
                  ) : (
                    silhouettes[form.id] ? (
                      <img
                        src={silhouettes[form.id]}
                        alt="Undiscovered"
                        className="image-render-pixel"
                        style={{ imageRendering: "pixelated", width: form.stage <= 1 ? 64 : form.stage === 2 ? 96 : 128, height: "auto" }}
                      />
                    ) : (
                      <div className="w-16 h-16 rounded bg-zinc-800 flex items-center justify-center">
                        <span className="text-2xl text-zinc-600">?</span>
                      </div>
                    )
                  )}
                </div>

                <div className="text-center">
                  <div className={`text-sm font-semibold ${isDiscovered ? "text-zinc-100" : "text-zinc-500"}`}>
                    {isDiscovered ? form.name : "???"}
                  </div>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className="text-[10px] text-zinc-500">{family.familyName}</span>
                    <span className="text-[10px] text-zinc-600">·</span>
                    <span className={`text-[10px] font-mono ${ELEMENT_COLORS[element]}`}>{getStageLabel(form.stage)}</span>
                  </div>
                  {isDiscovered && (
                    <div className="mt-1.5">
                      <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] capitalize ${ELEMENT_BG[element]}`}>
                        {element}
                      </span>
                    </div>
                  )}
                  {!isDiscovered && (
                    <div className="mt-1 text-[10px] text-zinc-600">Undiscovered</div>
                  )}
                </div>
              </div>

              {selectedMonster === form.id && isDiscovered && selectedDef && selectedFamily && (
                <div className="mt-2 rounded-lg bg-zinc-900 border border-zinc-700 p-4">
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Base Stats</div>
                      <div className="grid grid-cols-5 gap-1 text-xs">
                        {[
                          { label: "HP", value: form.baseStats.hp },
                          { label: "MP", value: form.baseStats.mp },
                          { label: "ATK", value: form.baseStats.atk },
                          { label: "DEF", value: form.baseStats.def },
                          { label: "SPD", value: form.baseStats.spd },
                        ].map((stat) => (
                          <div key={stat.label} className="text-center">
                            <div className="text-zinc-500 text-[10px]">{stat.label}</div>
                            <div className="font-mono text-zinc-200">{stat.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Growth / Level</div>
                      <div className="grid grid-cols-5 gap-1 text-xs">
                        {[
                          { label: "HP", value: form.growth.hp },
                          { label: "MP", value: form.growth.mp },
                          { label: "ATK", value: form.growth.atk },
                          { label: "DEF", value: form.growth.def },
                          { label: "SPD", value: form.growth.spd },
                        ].map((stat) => (
                          <div key={stat.label} className="text-center">
                            <div className="text-zinc-500 text-[10px]">{stat.label}</div>
                            <div className="font-mono text-zinc-300">+{stat.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      <span>Encountered: {count}×</span>
                      {discoveryDates.has(form.id) && (
                        <span>First: {new Date(discoveryDates.get(form.id)!).toLocaleDateString()}</span>
                      )}
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Lore</div>
                      <div className="text-xs text-zinc-300 italic">{form.lore}</div>
                    </div>

                    {selectedFamily && (
                      <div>
                        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Evolution Path</div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {getEvolutionPath(form, selectedFamily).map((f, idx, arr) => (
                            <div key={f.id} className="flex items-center gap-1">
                              <div
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                                  f.id === form.id
                                    ? "border-amber-400 text-amber-400"
                                    : f.stage < form.stage
                                    ? "border-green-500 text-green-500"
                                    : "border-zinc-600 text-zinc-600"
                                }`}
                                style={{ backgroundColor: f.id === form.id ? form.color + "40" : f.stage < form.stage ? f.color + "20" : "transparent" }}
                              >
                                {f.stage}
                              </div>
                              <span className={`text-xs ${
                                f.id === form.id ? "text-amber-400 font-medium" : f.stage < form.stage ? "text-green-400" : "text-zinc-500"
                              }`}>
                                {f.name}
                              </span>
                              {idx < arr.length - 1 && (
                                <svg width="12" height="12" viewBox="0 0 12 12" className="text-zinc-600">
                                  <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                                </svg>
                              )}
                            </div>
                          ))}
                        </div>

                        {form.evolutions.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {form.evolutions.map((evo) => {
                              const targetDef = MONSTER_DEF_BY_ID[evo.to];
                              if (!targetDef) return null;
                              return (
                                <div key={evo.to} className="text-xs text-zinc-400">
                                  <span className="text-zinc-300">→ {targetDef.name}</span>
                                  <span className="text-zinc-600">: </span>
                                  <span>{evo.criteria.map((c) => c.description).join(", ")}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Behavior</div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        {[
                          { label: "Wanderlust", value: form.behavior.wanderlust },
                          { label: "Foraging", value: form.behavior.foraging },
                          { label: "Aggression", value: form.behavior.aggression },
                          { label: "Cowardice", value: form.behavior.cowardice },
                        ].map((b) => (
                          <div key={b.label} className="flex items-center justify-between">
                            <span className="text-zinc-500">{b.label}</span>
                            <div className="flex items-center gap-1.5">
                              <div className="w-12 h-1.5 rounded-full bg-zinc-700">
                                <div
                                  className="h-full rounded-full bg-amber-500"
                                  style={{ width: (b.value * 100) + "%" }}
                                />
                              </div>
                              <span className="font-mono text-zinc-300 w-8 text-right">{(b.value * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedMonster === form.id && !isDiscovered && (
                <div className="mt-2 rounded-lg bg-zinc-900 border border-zinc-700 p-4 text-center">
                  <div className="text-2xl mb-2">?</div>
                  <div className="text-sm text-zinc-500">This monster has not been discovered yet.</div>
                  <div className="text-xs text-zinc-600 mt-1">Encounter it in the dungeon to unlock its entry.</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          No monsters match your filters.
        </div>
      )}
    </div>
  );
}
