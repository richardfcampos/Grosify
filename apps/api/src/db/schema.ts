import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  numeric,
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
    /** Nome da categoria (cache desnormalizado de categories.name, evita join). */
    category: text('category'),
    /** Categoria como entidade (fonte da verdade). */
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    photoKey: text('photo_key'),
    /** Observações livres do item. */
    notes: text('notes'),
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

/** Categoria de itens (Grãos, Limpeza…). Entidade com ícone/cor/ordem. */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    isHidden: boolean('is_hidden').notNull().default(false),
    ...syncColumns,
  },
  (t) => [
    index('categories_household_version_idx').on(t.householdId, t.serverVersion),
    index('categories_household_idx').on(t.householdId),
  ],
);

/** Marca de um item (Camil, Kicaldo…). Opcional — item pode ter 0+ marcas. */
export const itemBrands = pgTable(
  'item_brands',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Marca preferida do item (no máx. uma por item; resto são alternativas). */
    isPreferred: boolean('is_preferred').notNull().default(false),
    ...syncColumns,
  },
  (t) => [
    index('item_brands_household_version_idx').on(t.householdId, t.serverVersion),
    index('item_brands_item_idx').on(t.itemId),
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
    /** Marca à qual o código pertence (opcional). */
    brandId: uuid('brand_id').references(() => itemBrands.id, { onDelete: 'set null' }),
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

export const priceRecords = pgTable(
  'price_records',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    brandId: uuid('brand_id').references(() => itemBrands.id, { onDelete: 'set null' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    /** Unidades mínimas da moeda da casa. */
    priceCents: integer('price_cents').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    source: text('source', { enum: ['manual', 'shopping'] })
      .notNull()
      .default('manual'),
    ...syncColumns,
  },
  (t) => [
    index('price_records_household_version_idx').on(t.householdId, t.serverVersion),
    index('price_records_lookup_idx').on(t.householdId, t.itemId, t.storeId, t.recordedAt),
  ],
);

export const shoppingLists = pgTable(
  'shopping_lists',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isRecurring: boolean('is_recurring').notNull().default(false),
    /** Emoji da lista (ex.: 🛒, 🔥). */
    icon: text('icon'),
    /** Cor de destaque (hex, ex.: #15803D). */
    color: text('color'),
    /** Frequência quando recorrente; null = avulsa. */
    recurrence: text('recurrence', { enum: ['weekly', 'biweekly', 'monthly'] }),
    /** Dia do ciclo: 0-6 (semana) ou 1-28 (mês). */
    recurrenceDay: integer('recurrence_day'),
    ...syncColumns,
  },
  (t) => [
    index('shopping_lists_household_version_idx').on(t.householdId, t.serverVersion),
    index('shopping_lists_household_idx').on(t.householdId),
  ],
);

export const shoppingListEntries = pgTable(
  'shopping_list_entries',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    listId: uuid('list_id')
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    qty: numeric('qty', { precision: 10, scale: 3 }).notNull(),
    ...syncColumns,
  },
  (t) => [
    index('shopping_list_entries_household_version_idx').on(t.householdId, t.serverVersion),
    index('shopping_list_entries_list_idx').on(t.listId),
    unique('shopping_list_entries_list_item_uq').on(t.listId, t.itemId),
  ],
);

export const inventoryCounts = pgTable(
  'inventory_counts',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    qtyOnHand: numeric('qty_on_hand', { precision: 10, scale: 3 }).notNull().default('0'),
    countedAt: timestamp('counted_at', { withTimezone: true }).notNull(),
    ...syncColumns,
  },
  (t) => [
    index('inventory_counts_household_version_idx').on(t.householdId, t.serverVersion),
    unique('inventory_counts_household_item_uq').on(t.householdId, t.itemId),
  ],
);

export const shoppingSessions = pgTable(
  'shopping_sessions',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    listId: uuid('list_id').references(() => shoppingLists.id, { onDelete: 'set null' }),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['active', 'completed', 'abandoned'] })
      .notNull()
      .default('active'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...syncColumns,
  },
  (t) => [index('shopping_sessions_household_version_idx').on(t.householdId, t.serverVersion)],
);

export const shoppingSessionItems = pgTable(
  'shopping_session_items',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => shoppingSessions.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    /** Marca efetivamente comprada (escolhida na compra). */
    actualBrandId: uuid('actual_brand_id').references(() => itemBrands.id, { onDelete: 'set null' }),
    neededQty: numeric('needed_qty', { precision: 10, scale: 3 }).notNull(),
    estimatedUnitPriceCents: integer('estimated_unit_price_cents'),
    estimatedPriceStoreId: uuid('estimated_price_store_id'),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    actualQty: numeric('actual_qty', { precision: 10, scale: 3 }),
    actualUnitPriceCents: integer('actual_unit_price_cents'),
    ...syncColumns,
  },
  (t) => [
    index('shopping_session_items_household_version_idx').on(t.householdId, t.serverVersion),
    index('shopping_session_items_session_idx').on(t.sessionId),
    unique('shopping_session_items_session_item_uq').on(t.sessionId, t.itemId),
  ],
);
