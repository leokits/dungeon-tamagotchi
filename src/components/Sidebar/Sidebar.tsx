"use client";

import { useState } from "react";
import type { Player, Pet } from "@/types/database";
import PetPanel from "./PetPanel";
import PetDetail from "./PetDetail";
import InventoryPanel from "./InventoryPanel";
import RaidPanel from "./RaidPanel";
import QuestPanel from "./QuestPanel";
import TradePanel from "./TradePanel";
import ShopPanel from "./ShopPanel";
import AchievementPanel from "./AchievementPanel";
import BattlePassPanel from "./BattlePassPanel";

type SidebarTab = "pets" | "inventory" | "raids" | "quests" | "trades" | "shop" | "achievements" | "battlepass";

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

interface HatcheryPanel {
  tileId: string;
  chunkX: number;
  chunkY: number;
  localX: number;
  localY: number;
}

interface SidebarProps {
  isOpen: boolean;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onClose: () => void;
  pets: Pet[];
  player: Player | null;
  selectedPetId: string | null;
  onPetSelect: (id: string) => void;
  onPetBack: () => void;
  onRenamePet: (petId: string, newName: string) => void;
  editingPetName: string | null;
  petNameInput: string;
  onPetNameInputChange: (v: string) => void;
  onEditingPetNameChange: (v: string | null) => void;
  onSendToRaid: (petId: string) => void;
  onFeedPet: (petId: string, resourceType: string) => void;
  showRaidPanel: boolean;
  raidTab: "browse" | "defense" | "history";
  onRaidTabChange: (tab: "browse" | "defense" | "history") => void;
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
  onRaidPanelClose: () => void;
  hatcheryPanel: HatcheryPanel | null;
  onHatcheryClose: () => void;
  onIncubateEgg: (baseType: string) => void;
  eggCosts: Record<string, number>;
  resourceCounts: Record<string, number>;
}

const TABS: { key: SidebarTab; label: string; icon: string }[] = [
  { key: "pets", label: "Pets", icon: "🐾" },
  { key: "inventory", label: "Inventory", icon: "🎒" },
  { key: "raids", label: "Raids", icon: "⚔️" },
  { key: "quests", label: "Quests", icon: "📜" },
  { key: "achievements", label: "Achievements", icon: "🏆" },
  { key: "trades", label: "Trades", icon: "🤝" },
  { key: "shop", label: "Shop", icon: "🛒" },
  { key: "battlepass", label: "Battle Pass", icon: "🎫" },
];

export default function Sidebar({
  isOpen, activeTab, onTabChange, onClose,
  pets, player, selectedPetId, onPetSelect, onPetBack,
  onRenamePet, editingPetName, petNameInput, onPetNameInputChange, onEditingPetNameChange,
  onSendToRaid, onFeedPet,
  showRaidPanel, raidTab, onRaidTabChange,
  browseDungeons, browseLoading, raidHistory, raidHistoryLoading,
  selectedTarget, onTargetSelect, selectedRaidPets, onRaidPetToggle,
  raidLaunching, onLaunchRaid, lastRaidResult, onRaidResultDismiss, onRaidPanelClose,
  hatcheryPanel, onHatcheryClose, onIncubateEgg,   eggCosts, resourceCounts,
}: SidebarProps) {
  return (
    <>
      {isOpen && (
        <div className="absolute inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />
      )}

      <div
        className={`absolute left-0 top-12 bottom-14 z-30 flex flex-col border-r border-zinc-800 bg-zinc-900 dt-sidebar-transition ${
          isOpen ? "w-56 translate-x-0" : "w-56 -translate-x-full"
        }`}
      >
        <div className="flex border-b border-zinc-800">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              data-tutorial={tab.key === "pets" ? "sidebar-pets" : tab.key === "quests" ? "sidebar-quests" : undefined}
              className={`flex-1 px-2 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-b-2 border-amber-400 bg-zinc-800/50 text-amber-400"
                  : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab === "pets" && (
            selectedPetId ? (
              <PetDetail
                petId={selectedPetId}
                pets={pets}
                onBack={onPetBack}
                onRename={onRenamePet}
                editingName={editingPetName}
                nameInput={petNameInput}
                onNameInputChange={onPetNameInputChange}
                onEditingNameChange={onEditingPetNameChange}
                onSendToRaid={onSendToRaid}
                onFeedPet={onFeedPet}
                availableResources={resourceCounts}
              />
            ) : (
              <PetPanel
                pets={pets}
                onPetSelect={onPetSelect}
              />
            )
          )}

          {activeTab === "inventory" && <InventoryPanel player={player} resourceCounts={resourceCounts} />}

          {activeTab === "raids" && showRaidPanel && (
            <RaidPanel
              raidTab={raidTab}
              onTabChange={onRaidTabChange}
              browseDungeons={browseDungeons}
              browseLoading={browseLoading}
              raidHistory={raidHistory}
              raidHistoryLoading={raidHistoryLoading}
              selectedTarget={selectedTarget}
              onTargetSelect={onTargetSelect}
              selectedRaidPets={selectedRaidPets}
              onRaidPetToggle={onRaidPetToggle}
              raidLaunching={raidLaunching}
              onLaunchRaid={onLaunchRaid}
              lastRaidResult={lastRaidResult}
              onRaidResultDismiss={onRaidResultDismiss}
              onClose={onRaidPanelClose}
              alivePets={pets.filter((p) => p.status === "alive")}
            />
          )}

          {activeTab === "raids" && !showRaidPanel && (
            <div className="flex h-full items-center justify-center p-4">
              <button
                onClick={() => onTabChange("raids")}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
              >
                Open Raid Panel
              </button>
            </div>
          )}

{activeTab === "quests" && <QuestPanel />}

      {activeTab === "achievements" && <AchievementPanel />}

      {activeTab === "trades" && <TradePanel />}

      {activeTab === "shop" && <ShopPanel />}

      {activeTab === "battlepass" && <BattlePassPanel />}
        </div>
      </div>

      {hatcheryPanel && (
        <div className="absolute left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-zinc-900/98 p-4 shadow-2xl border border-purple-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-purple-300">🥚 Incubate Egg</h3>
            <button onClick={onHatcheryClose} className="text-zinc-500 hover:text-white text-lg leading-none">&times;</button>
          </div>
          <p className="text-xs text-zinc-400 mb-3">
            You have <span className="text-amber-400 font-semibold">{player?.chrono_dust ?? 0} dust</span>. Choose a species:
          </p>
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
            {Object.entries(eggCosts).map(([species, cost]) => {
              const canAfford = (player?.chrono_dust ?? 0) >= cost;
              return (
                <button
                  key={species}
                  disabled={!canAfford}
                  onClick={() => onIncubateEgg(species)}
                  className={`rounded-lg p-2 text-left transition-colors border ${
                    canAfford
                      ? "bg-zinc-800 border-zinc-600 hover:bg-zinc-700 hover:border-purple-600 cursor-pointer"
                      : "bg-zinc-900 border-zinc-800 opacity-50 cursor-not-allowed"
                  }`}
                >
                  <div className="text-xs font-medium text-zinc-200 capitalize">{species.replace(/_/g, " ")}</div>
                  <div className="text-[10px] text-zinc-500">{cost} dust</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
