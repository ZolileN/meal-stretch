import { describe, expect, it } from 'vitest';
import { catalogueLines, ideasTool, keywordIdeas, MAX_IDEAS, sanitizePicks, type IdeaCandidate } from '@/lib/plans/ideas';

const c = (id: string, minutes: number, tags: string[]): IdeaCandidate => ({ id, name: id.replace(/_/g, ' '), description: null, cookMinutes: minutes, tags });
const CANDIDATES: IdeaCandidate[] = [
  c('penne_arrabbiata', 15, ['protein:cheddar_cheese', 'starch:pasta', 'meat_free', 'no_oven', 'cuisine:italian']),
  c('meatball_spaghetti', 45, ['protein:beef_mince', 'starch:pasta', 'kid_friendly', 'no_oven', 'cuisine:italian']),
  c('chicken_chow_mein', 20, ['protein:chicken_breast_fillets', 'starch:egg_noodles', 'no_oven', 'cuisine:chinese']),
  c('chana_masala_rice', 25, ['protein:chickpeas_tin', 'starch:rice', 'meat_free', 'no_oven', 'cuisine:indian']),
  c('chicken_curry_roti', 50, ['protein:chicken_portions_mixed', 'starch:cake_flour', 'no_oven', 'cuisine:indian']),
  c('bobotie_yellow_rice', 55, ['protein:beef_mince', 'starch:rice', 'cuisine:cape_malay']),
];

describe('meal ideas: keyword fallback (no API key)', () => {
  it('respects time limits and cuisine', () => {
    expect(keywordIdeas('something Italian in 15 minutes', CANDIDATES).recipe_ids).toEqual(['penne_arrabbiata']);
  });
  it('meat-free means only meat_free recipes', () => {
    const r = keywordIdeas('a vegetarian curry', CANDIDATES);
    expect(r.recipe_ids[0]).toBe('chana_masala_rice');
    expect(r.recipe_ids.every((id) => CANDIDATES.find((x) => x.id === id)!.tags.includes('meat_free'))).toBe(true);
  });
  it('matches proteins and cuisines from every community', () => {
    expect(keywordIdeas('chicken', CANDIDATES).recipe_ids).toEqual(expect.arrayContaining(['chicken_chow_mein', 'chicken_curry_roti']));
    expect(keywordIdeas('bobotie please', CANDIDATES).recipe_ids[0]).toBe('bobotie_yellow_rice');
    expect(keywordIdeas('no oven tonight', CANDIDATES).recipe_ids).not.toContain('bobotie_yellow_rice');
  });
  it('not understood when nothing fits', () => {
    expect(keywordIdeas('what is the weather', CANDIDATES)).toEqual({ understood: false, recipe_ids: [] });
  });
});

describe('meal ideas: Claude output is constrained to our catalogue', () => {
  it('the tool only allows ids from the candidate list', () => {
    const tool = ideasTool(['a', 'b']);
    expect(JSON.stringify(tool.input_schema)).toContain('"enum":["a","b"]');
  });
  it('invented, duplicate or extra ids are dropped', () => {
    const r = sanitizePicks({ understood: true, recipe_ids: ['penne_arrabbiata', 'made_up_dish', 'penne_arrabbiata', 'chicken_chow_mein'] }, CANDIDATES.map((x) => x.id));
    expect(r).toEqual({ understood: true, recipeIds: ['penne_arrabbiata', 'chicken_chow_mein'] });
    const many = sanitizePicks({ understood: true, recipe_ids: CANDIDATES.map((x) => x.id) }, CANDIDATES.map((x) => x.id));
    expect(many.recipeIds).toHaveLength(MAX_IDEAS);
    expect(sanitizePicks({ understood: true, recipe_ids: ['nope'] }, ['a'])).toEqual({ understood: false, recipeIds: [] });
  });
  it('catalogue lines carry what Claude needs and no prices', () => {
    const lines = catalogueLines(CANDIDATES);
    expect(lines.split('\n')).toHaveLength(CANDIDATES.length);
    expect(lines).toContain('penne_arrabbiata | penne arrabbiata | 15 min | italian | protein cheddar cheese, meat-free, no oven');
    expect(lines).not.toMatch(/R\d/);
  });
});
