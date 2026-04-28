"use client";

import { useState, useEffect, useCallback } from "react";
import type { ShopItem, Rarity } from "@/lib/shop/catalog";
import { SHOP_CATEGORIES, SHOP_ITEMS } from "@/lib/shop/catalog";

const RARITY_STYLES: Record<Rarity, string> = {
  common: "bg-zinc-600",
  rare: "bg-blue-600",
  epic: "bg-purple-600",
  legendary: "bg-amber-600",
};

interface ShopData {
  categories: Record<string, ShopItem[]>;
  owned_cosmetics: string[];
}

export default function ShopPanel() {
  const [data, setData] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(SHOP_CATEGORIES[0].key);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [purchaseItem, setPurchaseItem] = useState<ShopItem | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);
  const [playerDust, setPlayerDust] = useState<number>(0);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/shop");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to load shop");
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Failed to load shop");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePurchase = async (item: ShopItem) => {
    setPurchasing(item.id);
    try {
      const res = await fetch("/api/shop/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id }),
      });
      const body = await res.json();
      if (res.ok) {
        setPlayerDust(body.new_dust_balance);
        setData((prev) =>
          prev
            ? {
                ...prev,
                owned_cosmetics: [...prev.owned_cosmetics, item.id],
              }
            : prev
        );
        setPurchaseSuccess(`Purchased ${item.name}!`);
        setTimeout(() => setPurchaseSuccess(null), 3000);
      } else {
        setError(body.error || "Purchase failed");
      }
    } catch {
      setError("Purchase failed");
    } finally {
      setPurchasing(null);
      setPurchaseItem(null);
    }
  };

  const currentItems = data?.categories?.[activeCategory] ?? SHOP_ITEMS.filter(
    (i) => i.category === activeCategory
  );
  const ownedSet = new Set(data?.owned_cosmetics ?? []);

  return (
    <div className="flex h-full flex-col">
      {/* Dust Balance */}
      <div className="border-b border-zinc-800 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-amber-400">✦</span>
            <span className="text-sm font-medium text-zinc-200">Chrono Dust</span>
          </div>
          <span className="text-xl font-mono font-bold text-amber-400">
            {playerDust}
          </span>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex border-b border-zinc-800">
        {SHOP_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`flex-1 px-1 py-2 text-[10px] font-medium transition-colors ${
              activeCategory === cat.key
                ? "border-b-2 border-amber-400 bg-zinc-800/50 text-amber-400"
                : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            }`}
          >
            <span className="mr-0.5">{cat.icon}</span>
            <span className="hidden sm:inline">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Error / Success */}
      {error && (
        <div className="mx-2 mt-2 rounded-lg bg-red-900/30 border border-red-800/50 p-2 text-xs text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-white">&times;</button>
        </div>
      )}
      {purchaseSuccess && (
        <div className="mx-2 mt-2 rounded-lg bg-green-900/30 border border-green-800/50 p-2 text-xs text-green-400">
          {purchaseSuccess}
        </div>
      )}

      {/* Item Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-zinc-500">Loading shop...</p>
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-3 gap-2">
            {currentItems.map((item) => {
              const isOwned = ownedSet.has(item.id);
              const isPurchasing = purchasing === item.id;

              return (
                <div
                  key={item.id}
                  className="rounded-lg bg-zinc-800/50 border border-zinc-700 p-3 hover:border-amber-600/50 transition-colors flex flex-col"
                >
                  {/* Preview Swatch */}
                  <div className="w-full aspect-square rounded-lg border border-zinc-600 mb-2 overflow-hidden">
                    {item.preview.type === "gradient" ? (
                      <div className={`w-full h-full bg-gradient-to-br ${item.preview.value}`} />
                    ) : (
                      <div className={`w-full h-full ${item.preview.value}`} />
                    )}
                  </div>

                  {/* Name + Rarity */}
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs font-medium text-zinc-200 truncate flex-1">
                      {item.name}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold text-white ${RARITY_STYLES[item.rarity]}`}>
                      {item.rarity}
                    </span>
                  </div>

                  {/* Price */}
                  <div className="text-[10px] text-amber-400 mb-2">
                    {item.price_dust} dust
                  </div>

                  {/* Action */}
                  <div className="mt-auto">
                    {isOwned ? (
                      <div className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-400 text-center">
                        Owned
                      </div>
                    ) : (
                      <button
                        onClick={() => setPurchaseItem(item)}
                        disabled={isPurchasing}
                        className="w-full rounded bg-amber-600 px-4 py-1.5 text-xs text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isPurchasing ? "..." : "Purchase"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Purchase Confirmation Modal */}
      {purchaseItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-xl bg-zinc-900/98 border border-zinc-700 p-5 w-72 shadow-2xl">
            <h3 className="text-sm font-bold text-zinc-100 mb-3">Confirm Purchase</h3>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Item</span>
                <span className="text-zinc-200 font-medium">{purchaseItem.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Price</span>
                <span className="text-amber-400 font-semibold">{purchaseItem.price_dust} dust</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Your Balance</span>
                <span className="text-amber-400 font-semibold">{playerDust} dust</span>
              </div>
              {playerDust < purchaseItem.price_dust && (
                <div className="text-xs text-red-400 text-center pt-1">
                  Insufficient funds
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setPurchaseItem(null)}
                className="flex-1 rounded bg-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handlePurchase(purchaseItem)}
                disabled={purchasing !== null || playerDust < purchaseItem.price_dust}
                className="flex-1 rounded bg-amber-600 px-3 py-2 text-xs text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {purchasing ? "Purchasing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
