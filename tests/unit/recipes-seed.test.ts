import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateCsv } from '@/lib/prices/csv';
import { deriveTags, isExcluded, tagValue } from '@/lib/recipes/tags';
import { loadSeedIngredients, loadSeedRecipes } from '@/scripts/seed-lib';

const ingredients = loadSeedIngredients();
const recipes = loadSeedRecipes();
const byId = new Map(ingredients.map((i) => [i.id, i]));

describe('seed recipes', () => {
  it('has at least 60 recipes with unique ids', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(60);
    expect(new Set(recipes.map((r) => r.id)).size).toBe(recipes.length);
  });

  it('every recipe references existing canonical ingredients with integer per-serving quantities', () => {
    for (const r of recipes) {
      expect(r.ingredients.length, r.id).toBeGreaterThan(0);
      for (const i of r.ingredients) {
        expect(byId.has(i.id), `${r.id} → ${i.id}`).toBe(true);
        expect(Number.isInteger(i.qty) && i.qty > 0, `${r.id} ${i.id} qty`).toBe(true);
      }
    }
  });

  it('every recipe has a protein and starch tag, steps and a cook time', () => {
    for (const r of recipes) {
      expect(tagValue(r.tags, 'protein'), r.id).toBeTruthy();
      expect(tagValue(r.tags, 'starch'), r.id).toBeTruthy();
      expect(r.steps.length, r.id).toBeGreaterThanOrEqual(3);
      expect(r.cookMinutes, r.id).toBeGreaterThan(0);
    }
  });

  it('nothing is published by default (a human must cook-test first)', () => {
    expect(recipes.every((r) => r.published === false)).toBe(true);
  });

  it('≥ 70% need no oven (PRD §11.1)', () => {
    expect(recipes.filter((r) => r.tags.includes('no_oven')).length / recipes.length).toBeGreaterThanOrEqual(0.7);
  });

  it('derived tags: contains:* added, meat_free validated', () => {
    const cat = (id: string) => byId.get(id)?.category;
    expect(deriveTags(['meat_free'], ['boerewors', 'pasta'], cat)).toEqual(['contains:beef', 'contains:gluten', 'contains:pork']);
    expect(deriveTags(['meat_free', 'contains:nuts'], ['sugar_beans'], cat)).toEqual(['meat_free']);
    for (const r of recipes) {
      const tags = deriveTags(r.tags, r.ingredients.map((i) => i.id), cat);
      if (r.tags.includes('meat_free')) expect(tags, `${r.id} marked meat_free but has meat/fish`).toContain('meat_free');
    }
    expect(isExcluded(['contains:pork'], ['pork'])).toBe(true);
    expect(isExcluded(['contains:beef'], ['pork', 'fish'])).toBe(false);
  });

  it('every ingredient has ≥ 1 fixture product at Shoprite and Checkers (Phase 2 DoD)', () => {
    const { rows } = validateCsv(readFileSync('seed/prices.fixture.csv', 'utf8'), new Date('2100-01-01'));
    for (const retailer of ['shoprite', 'checkers']) {
      const have = new Set(rows.filter((r) => r.retailer_id === retailer).map((r) => r.ingredient_id));
      for (const r of recipes) for (const i of r.ingredients) expect(have.has(i.id), `${retailer} missing ${i.id}`).toBe(true);
    }
  });
});
