"use client";

import { useState } from "react";
import type { Pet } from "@/types/database";
import {
  MONSTER_DEF_BY_ID,
  MONSTER_FAMILY_BY_ID,
  levelToExp,
  type PetBehaviorStats as BehaviorStats,
} from "@/game/monsters";
import {
  getBondName,
  getBondBonus,
  getBondProgress,
} from "@/game/bond-system";

const LEGACY_SPECIES_MAP: Record<string, string> = {
  shroom_slime: "glob_slime",
  stone_crawler: "cave_beetle",
};

function getPetColor(pet: Pet): string {
  const rawSpecies = (pet as unknown as { species?: string }).species || pet.base_type;
  const species = LEGACY_SPECIES_MAP[rawSpecies] || rawSpecies;
  const def = MONSTER_DEF_BY_ID[species];
  return def?.color || "#ff6600";
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

interface PetDetailProps {
  petId: string;
  pets: Pet[];
  onBack: () => void;
  onRename: (petId: string, newName: string) => void;
  editingName: string | null;
  nameInput: string;
  onNameInputChange: (v: string) => void;
  onEditingNameChange: (v: string | null) => void;
  onSendToRaid: (petId: string) => void;
}

export default function PetDetail({
  petId, pets, onBack, onRename,
  editingName, nameInput, onNameInputChange, onEditingNameChange,
  onSendToRaid,
}: PetDetailProps) {
  const pet = pets.find((p) => p.id === petId);
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

  const hungerPct = pet.hunger * 100;
  const hungerColor = hungerPct > 70 ? "text-green-400" : hungerPct > 40 ? "text-yellow-400" : "text-red-400";
  const hungerBarColor = hungerPct > 70 ? "bg-green-500" : hungerPct > 40 ? "bg-yellow-500" : "bg-red-500";

  const allForms = family ? family.forms : monsterDef ? [monsterDef] : [];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 p-2">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          Back to roster
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className="h-16 w-16 rounded-full ring-2 ring-zinc-700"
            style={{ backgroundColor: getPetColor(pet) }}
          />
          <div className="flex-1 min-w-0">
            {editingName === pet.id ? (
              <form
                onSubmit={(e) => { e.preventDefault(); onRename(pet.id, nameInput); }}
                className="flex items-center gap-1"
              >
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => onNameInputChange(e.target.value)}
                  maxLength={24}
                  className="rounded bg-zinc-700 px-2 py-1 text-sm text-white border border-zinc-500 focus:outline-none focus:border-amber-400 w-full"
                  onBlur={() => { onEditingNameChange(null); onNameInputChange(""); }}
                />
                <button type="submit" className="text-xs text-green-400 hover:text-green-300 px-1">✓</button>
              </form>
            ) : (
              <div
                className="font-bold text-sm cursor-pointer hover:underline hover:underline-offset-2 truncate"
                style={{ color: getPetColor(pet) }}
                onClick={() => { onEditingNameChange(pet.id); onNameInputChange(getPetDisplayName(pet)); }}
                title="Click to rename"
              >
                {getPetDisplayName(pet)}
              </div>
            )}
            <div className="text-[10px] text-zinc-500 mt-0.5">{monsterDef?.lore?.slice(0, 50) || species.replace(/_/g, " ")}...</div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-zinc-400">Level {petLevel}</span>
            <span className="font-mono text-zinc-500">{petExp} / {nextLevelExp}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-700">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: expNeeded > 0 ? Math.min(100, (expProgress / expNeeded) * 100) : 100 + "%" }}
            />
          </div>
        </div>

        <div className="rounded bg-zinc-800 p-2">
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stats</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {[
              { label: "HP", value: `${pet.hp} / ${pet.max_hp}`, pct: (pet.hp / pet.max_hp) * 100, color: "bg-red-400" },
              { label: "MP", value: `${pet.mp} / ${pet.max_mp}`, pct: (pet.mp / pet.max_mp) * 100, color: "bg-blue-400" },
              { label: "ATK", value: String(pet.atk), pct: null, color: null },
              { label: "DEF", value: String(pet.def), pct: null, color: null },
              { label: "SPD", value: String(pet.spd), pct: null, color: null },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center justify-between">
                <span className="text-zinc-500">{stat.label}</span>
                <div className="flex items-center gap-1.5">
                  {stat.pct !== null && stat.color !== null && (
                    <div className="w-12 h-1.5 rounded-full bg-zinc-700">
                      <div className={`h-full rounded-full ${stat.color}`} style={{ width: stat.pct + "%" }} />
                    </div>
                  )}
                  <span className="font-mono text-zinc-200 w-10 text-right">{stat.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded bg-zinc-800 p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Hunger</span>
            <span className={`text-xs font-mono ${hungerColor}`}>{hungerPct.toFixed(0)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-700">
            <div className={`h-full rounded-full transition-all ${hungerBarColor}`} style={{ width: hungerPct + "%" }} />
          </div>
        </div>

        <div className="rounded bg-zinc-800 p-2">
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Behavior</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Tiles Walked</span>
              <span className="font-mono text-zinc-200">{behaviorStats.tilesWalked}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Fights Won</span>
              <span className="font-mono text-zinc-200">{behaviorStats.fightsWon}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Fights Lost</span>
              <span className="font-mono text-zinc-200">{behaviorStats.fightsLost}</span>
            </div>
          </div>
          {Object.keys(behaviorStats.foodEaten || {}).length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] text-zinc-500 mb-1">Food Eaten</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(behaviorStats.foodEaten).map(([food, count]) => (
                  <span key={food} className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 capitalize">
                    {food.replace(/_/g, " ")} ×{count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded bg-zinc-800 p-2">
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Bond</div>
          {(() => {
            const bondXp = (pet as unknown as { bond_level?: number }).bond_level ?? 0;
            const progress = getBondProgress(bondXp);
            const bonus = getBondBonus(progress.currentLevel);
            const bondName = getBondName(progress.currentLevel);

            return (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-amber-400">{bondName}</span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {progress.hasMaxLevel ? "MAX" : `${bondXp} / ${progress.nextLevelXp}`}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-700 mb-2">
                  <div
                    className="h-full rounded-full bg-pink-500 transition-all"
                    style={{ width: progress.progress * 100 + "%" }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[10px]">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">ATK</span>
                    <span className="font-mono text-red-400">+{bonus.atkBonus}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">DEF</span>
                    <span className="font-mono text-blue-400">+{bonus.defBonus}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Combo</span>
                    <span className="font-mono text-yellow-400">{bonus.comboChance}%</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        <div className="rounded bg-zinc-800 p-2">
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
            Evolution {family ? `— ${family.familyName}` : ""}
          </div>
          <div className="flex gap-1 mb-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < pet.evolution_stage ? "bg-amber-400" : "bg-zinc-700"
                }`}
              />
            ))}
          </div>
          {allForms.map((form) => {
            const isCurrent = form.id === species;
            const isAchieved = form.stage < (monsterDef?.stage ?? 1) ||
              (form.stage === (monsterDef?.stage ?? 1) && form.id === species);
            return (
              <div key={form.id} className="mb-1.5">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                      isCurrent ? "border-amber-400" : isAchieved ? "border-green-500" : "border-zinc-600"
                    }`}
                    style={{ backgroundColor: isCurrent ? form.color : isAchieved ? form.color + "80" : "transparent" }}
                  />
                  <span className={`text-xs font-medium ${
                    isCurrent ? "text-amber-400" : isAchieved ? "text-green-400" : "text-zinc-500"
                  }`}>
                    {form.name} <span className="text-zinc-600">S{form.stage}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {pet.status === "alive" && (
          <button
            onClick={() => onSendToRaid(pet.id)}
            className="w-full rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 transition-colors"
          >
            ⚔️ Send to Raid
          </button>
        )}
      </div>
    </div>
  );
}
