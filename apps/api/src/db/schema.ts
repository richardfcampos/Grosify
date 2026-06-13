import {
  bigint,
  boolean,
  doublePrecision,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// ===== Better Auth (gerenciadas pelo better-auth, ids text) =====

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== Domínio: households (server-authoritative, não syncadas) =====

export const households = pgTable('households', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id),
  plan: text('plan', { enum: ['free', 'pro'] })
    .notNull()
    .default('free'),
  /** ISO 4217 — moeda de todos os preços da casa. */
  currency: text('currency').notNull().default('BRL'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const householdMembers = pgTable(
  'household_members',
  {
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'member'] })
      .notNull()
      .default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.householdId, t.userId] }),
    index('household_members_user_id_idx').on(t.userId),
  ],
);

export const householdInvites = pgTable('household_invites', {
  code: text('code').primaryKey(),
  householdId: uuid('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedBy: text('used_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== Catálogo [sync] — colunas de sync em toda tabela do domínio =====
// updated_at: relógio do escritor (comparador LWW na fase 3)
// deleted_at: tombstone (soft delete)
// server_version: bigint atribuído por trigger via sync_version_seq (cursor do pull, fase 3)

const syncColumns = {
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  serverVersion: bigint('server_version', { mode: 'number' }).notNull().default(0),
};

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category'),
    photoKey: text('photo_key'),
    unit: text('unit', { enum: ['un', 'kg', 'g', 'l', 'ml'] })
      .notNull()
      .default('un'),
    ...syncColumns,
  },
  (t) => [
    index('items_household_version_idx').on(t.householdId, t.serverVersion),
    index('items_household_idx').on(t.householdId),
  ],
);

export const itemBarcodes = pgTable(
  'item_barcodes',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    barcode: text('barcode').notNull(),
    ...syncColumns,
  },
  (t) => [
    index('item_barcodes_household_version_idx').on(t.householdId, t.serverVersion),
    index('item_barcodes_item_idx').on(t.itemId),
    unique('item_barcodes_household_barcode_uq').on(t.householdId, t.barcode),
  ],
);

export const stores = pgTable(
  'stores',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    city: text('city'),
    neighborhood: text('neighborhood'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    ...syncColumns,
  },
  (t) => [
    index('stores_household_version_idx').on(t.householdId, t.serverVersion),
    index('stores_household_idx').on(t.householdId),
  ],
);
