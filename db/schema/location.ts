/** Mirrors db/001_stores_location.sql. */
import { bigint, bigserial, boolean, customType, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** geography(Point, 4326). Read/write through SQL functions (st_makepoint …); stored as EWKB hex. */
export const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType: () => 'geography(Point, 4326)',
});

export const retailers = pgTable('retailers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  loyaltyProgramId: text('loyalty_program_id'),
  loyaltyProgramName: text('loyalty_program_name'),
  osmBrandWikidata: text('osm_brand_wikidata'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const branches = pgTable('branches', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  retailerId: text('retailer_id').notNull().references(() => retailers.id),
  name: text('name').notNull(),
  osmId: text('osm_id').unique(),
  address: text('address'),
  suburb: text('suburb'),
  city: text('city'),
  province: text('province'),
  geom: geographyPoint('geom').notNull(),
  verified: boolean('verified').notNull().default(false),
  active: boolean('active').notNull().default(true),
  source: text('source', { enum: ['osm', 'report', 'manual', 'test'] }).notNull().default('osm'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const places = pgTable('places', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  nameNorm: text('name_norm').notNull(),
  kind: text('kind', { enum: ['city', 'town', 'suburb', 'neighbourhood', 'township', 'section', 'village', 'street'] }).notNull(),
  parentName: text('parent_name'),
  province: text('province'),
  geom: geographyPoint('geom').notNull(),
  osmId: text('osm_id').unique(),
  source: text('source', { enum: ['osm', 'seed', 'manual'] }).notNull().default('osm'),
  rank: integer('rank').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userShops = pgTable('user_shops', {
  userId: uuid('user_id').primaryKey(),
  mainBranchId: bigint('main_branch_id', { mode: 'number' }).notNull().references(() => branches.id),
  topUpBranchId: bigint('top_up_branch_id', { mode: 'number' }).references(() => branches.id),
  loyalty: text('loyalty').array().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userSavedPlaces = pgTable('user_saved_places', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull(),
  label: text('label').notNull(),
  lat: numeric('lat', { precision: 6, scale: 3 }).notNull(),
  lng: numeric('lng', { precision: 6, scale: 3 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const branchReports = pgTable('branch_reports', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  kind: text('kind', { enum: ['missing', 'closed', 'wrong_location'] }).notNull().default('missing'),
  retailerId: text('retailer_id').references(() => retailers.id),
  retailerText: text('retailer_text'),
  branchId: bigint('branch_id', { mode: 'number' }).references(() => branches.id),
  note: text('note'),
  geom: geographyPoint('geom'),
  householdId: uuid('household_id'),
  status: text('status', { enum: ['open', 'accepted', 'rejected'] }).notNull().default('open'),
  resolvedBranchId: bigint('resolved_branch_id', { mode: 'number' }).references(() => branches.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});
