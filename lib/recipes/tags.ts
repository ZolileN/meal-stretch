/** Recipe tag rules (PRD §11.2). Allergen/diet "contains:" tags are derived from ingredients so they can't be forgotten. */
export const EXCLUSION_TAGS = ['pork', 'beef', 'fish', 'nuts', 'dairy', 'gluten'] as const;
export type ExclusionTag = (typeof EXCLUSION_TAGS)[number];

/** ingredient id → what it contains. Conservative: when unsure (boerewors, polony), include. */
export const INGREDIENT_CONTAINS: Record<string, ExclusionTag[]> = {
  beef_mince: ['beef'],
  beef_stewing: ['beef'],
  boerewors: ['beef', 'pork'],
  polony: ['pork'],
  viennas: ['pork'],
  pork_chops: ['pork'],
  pork_sausages: ['pork'],
  beef_tripe: ['beef'],
  russians: ['beef', 'pork'],
  corned_beef_tin: ['beef'],
  pilchards_tin: ['fish'],
  tuna_tin: ['fish'],
  hake_fillets: ['fish'],
  fish_fingers: ['fish', 'gluten'],
  peanut_butter: ['nuts'],
  milk: ['dairy'],
  cheddar_cheese: ['dairy'],
  margarine: ['dairy'],
  pasta: ['gluten'],
  cake_flour: ['gluten'],
  bread: ['gluten'],
  brown_onion_soup: ['gluten'],
  stock_cubes: ['gluten'],
};

const MEAT_OR_FISH_CATEGORIES = new Set(['meat', 'fish']);
const MEAT_OR_FISH_IDS = new Set(['pilchards_tin', 'tuna_tin', 'hake_fillets', 'corned_beef_tin', 'fish_fingers']);

export function deriveTags(
  authored: string[],
  ingredientIds: string[],
  ingredientCategory: (id: string) => string | undefined,
): string[] {
  const tags = new Set(authored.filter((t) => !t.startsWith('contains:')));
  for (const id of ingredientIds) for (const c of INGREDIENT_CONTAINS[id] ?? []) tags.add(`contains:${c}`);
  const hasMeat = ingredientIds.some((id) => MEAT_OR_FISH_IDS.has(id) || MEAT_OR_FISH_CATEGORIES.has(ingredientCategory(id) ?? ''));
  if (hasMeat) tags.delete('meat_free');
  return [...tags].sort();
}

export const tagValue = (tags: string[], prefix: 'protein' | 'starch') => tags.find((t) => t.startsWith(prefix + ':'))?.slice(prefix.length + 1) ?? null;

/** Does a recipe pass the household's exclusions? Excluding 'pork' drops recipes tagged contains:pork. */
export function isExcluded(tags: string[], exclusions: string[]): boolean {
  return exclusions.some((ex) => tags.includes(`contains:${ex}`) || tags.includes(ex));
}
