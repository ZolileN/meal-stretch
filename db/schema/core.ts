/** Mirrors db/migrations/0002_core.sql (tests/db/schema.test.ts checks they agree). */
import {
  bigint, bigserial, boolean, date, integer, jsonb, numeric, pgMaterializedView, pgTable, primaryKey, real, serial, text,
  timestamp, unique, uuid,
} from 'drizzle-orm/pg-core';
import { branches, retailers } from './location';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  name: text('name'),
  emailVerified: ts('email_verified'),
  image: text('image'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceId: uuid('device_id').unique(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  light: integer('light').notNull().default(0),
  average: integer('average').notNull().default(1),
  big: integer('big').notNull().default(0),
  loyalty: text('loyalty').array().notNull().default([]),
  exclusions: text('exclusions').array().notNull().default([]),
  neverSwapProteins: text('never_swap_proteins').array().notNull().default([]),
  paydayDom: integer('payday_dom'),
  language: text('language', { enum: ['en', 'xh', 'af'] }).notNull().default('en'),
  mainBranchId: bigint('main_branch_id', { mode: 'number' }).references(() => branches.id),
  topUpBranchId: bigint('top_up_branch_id', { mode: 'number' }).references(() => branches.id),
  receiptConsentAt: ts('receipt_consent_at'),
  pushConsentAt: ts('push_consent_at'),
  notificationOptOut: text('notification_opt_out').array().notNull().default([]),
  mergedInto: uuid('merged_into'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const householdMembersAccess = pgTable(
  'household_members_access',
  {
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] })],
);

export const shareLinks = pgTable('share_links', {
  token: text('token').primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  revokedAt: ts('revoked_at'),
});

export const ingredients = pgTable('ingredients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  unit: text('unit', { enum: ['g', 'ml', 'unit'] }).notNull(),
  roundTo: integer('round_to').notNull().default(1),
  perishable: boolean('perishable').notNull().default(true),
  pantryStaple: boolean('pantry_staple').notNull().default(false),
  category: text('category').notNull(),
});

export const productCategories = pgTable('product_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  aisleOrder: integer('aisle_order').notNull(),
});

export const products = pgTable('products', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  retailerId: text('retailer_id').notNull().references(() => retailers.id),
  ingredientId: text('ingredient_id').references(() => ingredients.id),
  name: text('name').notNull(),
  brand: text('brand'),
  packQty: integer('pack_qty').notNull(),
  packUnit: text('pack_unit', { enum: ['g', 'ml', 'unit'] }).notNull(),
  categoryId: integer('category_id').references(() => productCategories.id),
  isHouseBrand: boolean('is_house_brand').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const productAliases = pgTable(
  'product_aliases',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: bigint('product_id', { mode: 'number' }).notNull().references(() => products.id, { onDelete: 'cascade' }),
    aliasNorm: text('alias_norm').notNull(),
    source: text('source'),
  },
  (t) => [unique().on(t.productId, t.aliasNorm)],
);

export const ingestBatches = pgTable('ingest_batches', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  kind: text('kind', { enum: ['csv', 'leaflet', 'receipt', 'catalogue', 'manual'] }).notNull(),
  retailerId: text('retailer_id').references(() => retailers.id),
  province: text('province'),
  uploadedBy: uuid('uploaded_by'),
  status: text('status', { enum: ['pending', 'processing', 'review', 'published', 'rejected', 'failed'] }).notNull().default('pending'),
  raw: jsonb('raw'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const priceSources = ['catalogue', 'leaflet', 'receipt', 'manual', 'guide'] as const;
export type PriceSource = (typeof priceSources)[number];

export const priceObservations = pgTable('price_observations', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  productId: bigint('product_id', { mode: 'number' }).notNull().references(() => products.id),
  branchId: bigint('branch_id', { mode: 'number' }).references(() => branches.id),
  /** 0005: province scope (null + null branch = national). */
  province: text('province'),
  retailerId: text('retailer_id').notNull().references(() => retailers.id),
  priceCents: integer('price_cents').notNull(),
  memberPriceCents: integer('member_price_cents'),
  specialPriceCents: integer('special_price_cents'),
  specialEndsOn: date('special_ends_on'),
  source: text('source', { enum: priceSources }).notNull(),
  /** 0006: where the price was found (guide prices: the page a web search led to). */
  sourceUrl: text('source_url'),
  observedAt: ts('observed_at').notNull(),
  ingestBatchId: bigint('ingest_batch_id', { mode: 'number' }).references(() => ingestBatches.id),
  householdId: uuid('household_id').references(() => households.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const unmatchedItems = pgTable('unmatched_items', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  batchId: bigint('batch_id', { mode: 'number' }).references(() => ingestBatches.id),
  retailerId: text('retailer_id').references(() => retailers.id),
  rawName: text('raw_name').notNull(),
  sizeText: text('size_text'),
  priceCents: integer('price_cents'),
  resolvedProductId: bigint('resolved_product_id', { mode: 'number' }).references(() => products.id),
  status: text('status', { enum: ['open', 'resolved', 'ignored'] }).notNull().default('open'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const currentPrices = pgMaterializedView('current_prices', {
  observationId: bigint('observation_id', { mode: 'number' }).notNull(),
  productId: bigint('product_id', { mode: 'number' }).notNull(),
  branchId: bigint('branch_id', { mode: 'number' }),
  province: text('province'),
  retailerId: text('retailer_id').notNull(),
  ingredientId: text('ingredient_id'),
  packQty: integer('pack_qty').notNull(),
  packUnit: text('pack_unit').notNull(),
  priceCents: integer('price_cents').notNull(),
  memberPriceCents: integer('member_price_cents'),
  specialPriceCents: integer('special_price_cents'),
  specialEndsOn: date('special_ends_on'),
  source: text('source', { enum: priceSources }).notNull(),
  sourceUrl: text('source_url'),
  observedAt: ts('observed_at').notNull(),
  isFresh: boolean('is_fresh').notNull(),
  trust: integer('trust').notNull(),
  refreshedAt: ts('refreshed_at').notNull(),
}).existing();

export const recipes = pgTable('recipes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  cookMinutes: integer('cook_minutes').notNull(),
  steps: jsonb('steps').$type<string[]>().notNull().default([]),
  tags: text('tags').array().notNull().default([]),
  imageUrl: text('image_url'),
  published: boolean('published').notNull().default(false),
  version: integer('version').notNull().default(1),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
    recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
    ingredientId: text('ingredient_id').notNull().references(() => ingredients.id),
    qtyPerServing: integer('qty_per_serving').notNull(),
    optional: boolean('optional').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.ingredientId] })],
);

export const recipeTranslations = pgTable(
  'recipe_translations',
  {
    recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
    language: text('language', { enum: ['en', 'xh', 'af'] }).notNull(),
    name: text('name').notNull(),
    steps: jsonb('steps').$type<string[]>().notNull().default([]),
    reviewed: boolean('reviewed').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.language] })],
);

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  startDate: date('start_date').notNull(),
  days: integer('days').notNull(),
  request: jsonb('request').notNull(),
  result: jsonb('result').notNull(),
  engineVersion: text('engine_version').notNull(),
  seed: integer('seed').notNull(),
  priceAsOf: date('price_as_of').notNull(),
  status: text('status', { enum: ['draft', 'active', 'shopped', 'archived'] }).notNull().default('active'),
  paidCents: integer('paid_cents').notNull(),
  normalCents: integer('normal_cents').notNull(),
  savingsCents: integer('savings_cents').notNull(),
  shoppedAt: ts('shopped_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const listTicks = pgTable(
  'list_ticks',
  {
    planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
    lineKey: text('line_key').notNull(),
    ticked: boolean('ticked').notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.lineKey] })],
);

export const pantryItems = pgTable(
  'pantry_items',
  {
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    ingredientId: text('ingredient_id').notNull().references(() => ingredients.id),
    qty: integer('qty').notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.ingredientId] })],
);

export const receipts = pgTable('receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  branchId: bigint('branch_id', { mode: 'number' }).references(() => branches.id),
  retailerId: text('retailer_id').references(() => retailers.id),
  purchasedOn: date('purchased_on'),
  totalCents: integer('total_cents'),
  imageUrl: text('image_url'),
  extraction: jsonb('extraction'),
  status: text('status', { enum: ['uploaded', 'processing', 'needs_review', 'verified', 'failed'] }).notNull().default('uploaded'),
  planId: uuid('plan_id').references(() => plans.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  imageDeleteAfter: ts('image_delete_after'),
});

export const receiptLines = pgTable('receipt_lines', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  receiptId: uuid('receipt_id').notNull().references(() => receipts.id, { onDelete: 'cascade' }),
  rawName: text('raw_name').notNull(),
  productId: bigint('product_id', { mode: 'number' }).references(() => products.id),
  qty: numeric('qty').notNull().default('1'),
  priceCents: integer('price_cents').notNull(),
  normalPriceCents: integer('normal_price_cents'),
  matchConfidence: real('match_confidence'),
});

export const savingsEvents = pgTable(
  'savings_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['plan_shopped', 'receipt_verified'] }).notNull(),
    refId: text('ref_id').notNull(),
    savingsCents: integer('savings_cents').notNull(),
    specialsCents: integer('specials_cents').notNull().default(0),
    memberCents: integer('member_cents').notNull().default(0),
    packEfficiencyCents: integer('pack_efficiency_cents').notNull().default(0),
    planId: uuid('plan_id').references(() => plans.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.kind, t.refId)],
);

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  keys: jsonb('keys').$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const notificationKinds = ['specials_day', 'tonight', 'month_end', 'payday', 'receipt_nudge'] as const;
export type NotificationKind = (typeof notificationKinds)[number];

export const notificationLog = pgTable('notification_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: notificationKinds }).notNull(),
  ref: text('ref'),
  sentAt: ts('sent_at').notNull().defaultNow(),
  openedAt: ts('opened_at'),
});

export const events = pgTable('events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  householdId: uuid('household_id'),
  name: text('name').notNull(),
  props: jsonb('props').notNull().default({}),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const llmCalls = pgTable('llm_calls', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  householdId: uuid('household_id'),
  purpose: text('purpose', { enum: ['tweak', 'receipt', 'leaflet', 'recipe_draft', 'translation', 'ideas'] }).notNull(),
  contentHash: text('content_hash').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  latencyMs: integer('latency_ms'),
  costMicroUsd: integer('cost_micro_usd'),
  output: jsonb('output'),
  ok: boolean('ok').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
});
