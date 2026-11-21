-- 0004: meal ideas (Claude picks from the published recipe catalogue) get their own purpose,
-- so they are capped and costed separately from tweaks. Mirrored by db/schema/core.ts.
alter table llm_calls drop constraint if exists llm_calls_purpose_check;
alter table llm_calls add constraint llm_calls_purpose_check
  check (purpose in ('tweak', 'receipt', 'leaflet', 'recipe_draft', 'translation', 'ideas'));
