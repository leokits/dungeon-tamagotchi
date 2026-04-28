import type { CosmeticType } from "@/types/database";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface ShopItem {
  id: string;
  name: string;
  category: string;
  price_dust: number;
  preview_description: string;
  rarity: Rarity;
  cosmetic_type: CosmeticType;
  /** Visual preview for the shop card */
  preview: {
    type: "swatch" | "emoji" | "gradient";
    value: string;
  };
}

export const SHOP_CATEGORIES = [
  { key: "pet_skins", label: "Pet Skins", icon: "🎨" },
  { key: "dungeon_themes", label: "Dungeon Themes", icon: "🏰" },
  { key: "crystal_effects", label: "Crystal Effects", icon: "✨" },
  { key: "name_colors", label: "Name Colors", icon: "🔤" },
] as const;

export const SHOP_ITEMS: ShopItem[] = [
  // ── Pet Skins ──
  {
    id: "pet_skin_gold",
    name: "Golden Coat",
    category: "pet_skins",
    price_dust: 200,
    preview_description: "A shimmering gold color overlay for your pet",
    rarity: "rare",
    cosmetic_type: "pet_skin",
    preview: { type: "gradient", value: "from-yellow-400 to-amber-600" },
  },
  {
    id: "pet_skin_silver",
    name: "Silver Coat",
    category: "pet_skins",
    price_dust: 150,
    preview_description: "A sleek silver color overlay for your pet",
    rarity: "common",
    cosmetic_type: "pet_skin",
    preview: { type: "gradient", value: "from-gray-300 to-gray-500" },
  },
  {
    id: "pet_skin_rainbow",
    name: "Rainbow Prism",
    category: "pet_skins",
    price_dust: 500,
    preview_description: "A vibrant rainbow gradient that shifts across your pet",
    rarity: "legendary",
    cosmetic_type: "pet_skin",
    preview: { type: "gradient", value: "from-red-500 via-green-500 to-blue-500" },
  },
  {
    id: "pet_skin_stripes",
    name: "Tiger Stripes",
    category: "pet_skins",
    price_dust: 100,
    preview_description: "Bold stripe pattern overlay",
    rarity: "common",
    cosmetic_type: "pet_skin",
    preview: { type: "swatch", value: "bg-orange-500" },
  },
  {
    id: "pet_skin_spots",
    name: "Leopard Spots",
    category: "pet_skins",
    price_dust: 120,
    preview_description: "Dappled spot pattern overlay",
    rarity: "common",
    cosmetic_type: "pet_skin",
    preview: { type: "swatch", value: "bg-yellow-700" },
  },
  {
    id: "pet_skin_gradient",
    name: "Sunset Fade",
    category: "pet_skins",
    price_dust: 300,
    preview_description: "A warm sunset gradient from pink to orange",
    rarity: "epic",
    cosmetic_type: "pet_skin",
    preview: { type: "gradient", value: "from-pink-500 to-orange-400" },
  },

  // ── Dungeon Themes ──
  {
    id: "theme_ice_cave",
    name: "Ice Cave",
    category: "dungeon_themes",
    price_dust: 400,
    preview_description: "Frozen walls with frost-covered crystals",
    rarity: "rare",
    cosmetic_type: "dungeon_theme",
    preview: { type: "gradient", value: "from-cyan-300 to-blue-600" },
  },
  {
    id: "theme_lava_dungeon",
    name: "Lava Dungeon",
    category: "dungeon_themes",
    price_dust: 400,
    preview_description: "Molten rock and glowing lava rivers",
    rarity: "rare",
    cosmetic_type: "dungeon_theme",
    preview: { type: "gradient", value: "from-red-600 to-orange-500" },
  },
  {
    id: "theme_crystal_cavern",
    name: "Crystal Cavern",
    category: "dungeon_themes",
    price_dust: 600,
    preview_description: "Prismatic crystal formations everywhere",
    rarity: "epic",
    cosmetic_type: "dungeon_theme",
    preview: { type: "gradient", value: "from-purple-400 via-pink-400 to-cyan-400" },
  },
  {
    id: "theme_void_abyss",
    name: "Void Abyss",
    category: "dungeon_themes",
    price_dust: 800,
    preview_description: "Dark matter and swirling void energy",
    rarity: "legendary",
    cosmetic_type: "dungeon_theme",
    preview: { type: "gradient", value: "from-gray-900 via-purple-900 to-black" },
  },

  // ── Crystal Effects ──
  {
    id: "effect_rainbow_glow",
    name: "Rainbow Glow",
    category: "crystal_effects",
    price_dust: 350,
    preview_description: "Your crystal pulses with rainbow light",
    rarity: "rare",
    cosmetic_type: "crystal_effect",
    preview: { type: "gradient", value: "from-red-400 via-yellow-400 to-blue-400" },
  },
  {
    id: "effect_fire_aura",
    name: "Fire Aura",
    category: "crystal_effects",
    price_dust: 300,
    preview_description: "Flames dance around your crystal",
    rarity: "rare",
    cosmetic_type: "crystal_effect",
    preview: { type: "gradient", value: "from-orange-500 to-red-600" },
  },
  {
    id: "effect_ice_shards",
    name: "Ice Shards",
    category: "crystal_effects",
    price_dust: 250,
    preview_description: "Frozen shards orbit your crystal",
    rarity: "common",
    cosmetic_type: "crystal_effect",
    preview: { type: "gradient", value: "from-cyan-200 to-blue-400" },
  },
  {
    id: "effect_void_pulse",
    name: "Void Pulse",
    category: "crystal_effects",
    price_dust: 700,
    preview_description: "Dark energy pulses emanate from your crystal",
    rarity: "legendary",
    cosmetic_type: "crystal_effect",
    preview: { type: "gradient", value: "from-purple-800 via-gray-900 to-black" },
  },

  // ── Name Colors ──
  {
    id: "name_gold",
    name: "Golden Name",
    category: "name_colors",
    price_dust: 200,
    preview_description: "Your name shines in gold",
    rarity: "rare",
    cosmetic_type: "name_color",
    preview: { type: "swatch", value: "bg-amber-400" },
  },
  {
    id: "name_cyan",
    name: "Cyan Name",
    category: "name_colors",
    price_dust: 150,
    preview_description: "Your name glows in cyan",
    rarity: "common",
    cosmetic_type: "name_color",
    preview: { type: "swatch", value: "bg-cyan-400" },
  },
  {
    id: "name_pink",
    name: "Pink Name",
    category: "name_colors",
    price_dust: 150,
    preview_description: "Your name sparkles in pink",
    rarity: "common",
    cosmetic_type: "name_color",
    preview: { type: "swatch", value: "bg-pink-400" },
  },
  {
    id: "name_rainbow",
    name: "Rainbow Name",
    category: "name_colors",
    price_dust: 600,
    preview_description: "Your name cycles through rainbow colors",
    rarity: "epic",
    cosmetic_type: "name_color",
    preview: { type: "gradient", value: "from-red-500 via-green-500 to-blue-500" },
  },
];

export function getShopItemsByCategory(): Record<string, ShopItem[]> {
  const result: Record<string, ShopItem[]> = {};
  for (const cat of SHOP_CATEGORIES) {
    result[cat.key] = SHOP_ITEMS.filter((item) => item.category === cat.key);
  }
  return result;
}

export function getShopItemById(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((item) => item.id === id);
}
