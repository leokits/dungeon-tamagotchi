"use client";

import { useState } from "react";
import type { Pet } from "@/types/database";
import { MONSTER_DEF_BY_ID } from "@/game/monsters";
import { resolveSpecies } from "@/game/species-utils";

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

interface PetPanelProps {
  pets: Pet[];
  onPetSelect: (id: string) => void;
}

type PetFilter = "all" | "alive" | "raiding" | "dead";
type PetSort = "level" | "hp" | "hunger" | "name";

export default function PetPanel({ pets, onPetSelect }: PetPanelProps) {
  const [filter, setFilter] = useState<PetFilter>("all");
  const [sort, setSort] = useState<PetSort>("level");

  const filtered = pets
    .filter((p) => {
      if (filter === "all") return true;
      return p.status === filter;
    })
    .sort((a, b) => {
      switch (sort) {
        case "level": return (b.level ?? 1) - (a.level ?? 1);
        case "hp": return (b.hp / b.max_hp) - (a.hp / a.max_hp);
        case "hunger": return b.hunger - a.hunger;
        case "name": return getPetDisplayName(a).localeCompare(getPetDisplayName(b));
        default: return 0;
      }
    });

  const aliveCount = pets.filter((p) => p.status === "alive").length;
  const raidingCount = pets.filter((p) => p.status === "raiding").length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 p-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-500">
            {aliveCount} alive · {raidingCount} raiding · {pets.length} total
          </span>
        </div>

        <div className="flex gap-1 mb-2">
          {(["all", "alive", "raiding", "dead"] as PetFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 text-[10px] font-medium capitalize transition-colors ${
                filter === f
                  ? "bg-amber-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {(["level", "hp", "hunger", "name"] as PetSort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`rounded px-2 py-0.5 text-[10px] capitalize transition-colors ${
                sort === s
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-zinc-500">No pets found. Dig deeper to find some!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map((pet) => {
              const hpPct = (pet.hp / pet.max_hp) * 100;
              const hungerPct = pet.hunger * 100;
              const hungerColor = hungerPct > 70 ? "bg-green-500" : hungerPct > 40 ? "bg-yellow-500" : "bg-red-500";

              return (
                <button
                  key={pet.id}
                  onClick={() => onPetSelect(pet.id)}
                  className="rounded-lg bg-zinc-800 p-2 text-left transition-colors hover:bg-zinc-750 hover:ring-1 hover:ring-zinc-600"
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div
                      className="h-8 w-8 rounded-full ring-1 ring-zinc-700"
                      style={{ backgroundColor: getPetColor(pet) }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-zinc-200">
                        {getPetDisplayName(pet)}
                      </div>
                      <div className="text-[10px] text-zinc-500">Lv {pet.level ?? 1}</div>
                    </div>
                  </div>

                  <div className="flex gap-1 mb-1">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full ${
                          i < pet.evolution_stage ? "bg-amber-400" : "bg-zinc-700"
                        }`}
                      />
                    ))}
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-zinc-500 w-5">HP</span>
                      <div className="flex-1 h-1 overflow-hidden rounded-full bg-zinc-700">
                        <div className="h-full rounded-full bg-red-400 transition-all" style={{ width: hpPct + "%" }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-zinc-500 w-5">Hgr</span>
                      <div className="flex-1 h-1 overflow-hidden rounded-full bg-zinc-700">
                        <div className={`h-full rounded-full transition-all ${hungerColor}`} style={{ width: hungerPct + "%" }} />
                      </div>
                    </div>
                  </div>

                  {pet.status !== "alive" && (
                    <div className="mt-1 text-[9px] font-medium capitalize text-zinc-500">
                      {pet.status}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
