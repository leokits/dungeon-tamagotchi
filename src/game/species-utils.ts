import type { Pet } from '@/types/database';

/** Map legacy pet species names to new bestiary IDs. */
export const LEGACY_SPECIES_MAP: Record<string, string> = {
  shroom_slime: 'glob_slime',
  stone_crawler: 'cave_beetle',
};

/**
 * Resolve the canonical species string for a pet.
 * Checks the `species` column first (new schema), falls back to `base_type`
 * (legacy schema), and applies the legacy mapping.
 */
export function resolveSpecies(pet: Pet): string {
  const species = (pet as unknown as { species?: string }).species;
  if (species) return species;
  const baseType =
    ((pet as unknown as { base_type?: string }).base_type || 'unknown_base') as string;
  return (LEGACY_SPECIES_MAP[baseType] ?? baseType) as string;
}

/**
 * Resolve species from raw string values (for server-side code that works
 * with raw DB rows rather than typed Pet objects).
 */
export function resolveSpeciesRaw(
  species: string | undefined | null,
  baseType: string
): string {
  const raw = species || baseType;
  return LEGACY_SPECIES_MAP[raw] ?? raw;
}
