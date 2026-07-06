import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ===== Better Auth (gerenciadas pelo better-auth, ids text) =====

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Casa ativa (multi-casa): qual das casas do usuário está em foco. App-managed
  // (Better Auth ignora colunas que não conhece). null = resolve pra primeira casa.
  activeHouseholdId: uuid('active_household_id').references((): AnyPgColumn => households.id, {
    onDelete: 'set null',
  }),
  // Idioma da UI escolhido pelo usuário. Preferência da pessoa (não da casa), por isso
  // fica no user — segue em qualquer aparelho/casa. App-managed (Better Auth ignora).
  uiLocale: text('ui_locale'),
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
  /** Entitlement manual (comp/100% off) — vence sobre a assinatura; setável via SQL/admin. */
  planOverride: text('plan_override', { enum: ['pro'] }),
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
    role: text('role', { enum: ['owner', 'admin', 'member', 'viewer'] })
      .notNull()
      .default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    // null = ainda não viu o onboarding; setado ao terminar/pular (por membro, não por aparelho)
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
    // preferências visuais por membro (sincronizam entre aparelhos); null = usa default/local
    uiThemeMode: text('ui_theme_mode'), // 'light' | 'dark' | 'system'
    uiThemeDir: text('ui_theme_dir'), // 'painel' | 'mercado' | 'recibo'
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
  // Convite por e-mail: token opaco (inguessável) amarrado ao e-mail convidado.
  // null = convite só por código humano (compartilhamento manual, confiança menor).
  token: text('token').unique(),
  invitedEmail: text('invited_email'),
});

/**
 * Tentativas de auth por conta — base da trava de força-bruta (durável, sobrevive
 * redeploy e multi-instância, ao contrário do limite por-IP em memória).
 */
export const authAttempts = pgTable(
  'auth_attempts',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    kind: text('kind').notNull(), // 'login_fail'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auth_attempts_email_kind_created_idx').on(t.email, t.kind, t.createdAt)],
);

/** E-mails suprimidos por bounce/reclamação (webhook do provedor) — não enviar mais. */
export const emailSuppression = pgTable('email_suppression', {
  email: text('email').primaryKey(),
  reason: text('reason').notNull(), // 'bounce' | 'complaint'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Feed de atividades da casa (server-authoritative, não syncado). */
export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    actorName: text('actor_name'),
    action: text('action').notNull(),
    summary: text('summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('activities_household_idx').on(t.householdId, t.createdAt)],
);

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
    /** Estoque mínimo: abaixo disso o item entra em "acabando". */
    minStock: numeric('min_stock', { precision: 10, scale: 3 }),
    unit: text('unit', { enum: ['un', 'kg', 'g', 'l', 'ml'] })
      .notNull()
      .default('un'),
    /**
     * Vetor de embedding do nome (Gemini `gemini-embedding-001` @768d) cacheado
     * pro matching de import de NFC-e — evita re-chamar a API a cada lookup.
     * null = sem GEMINI_API_KEY configurada ou item ainda não embedado; nesse
     * caso o matching cai pra fuzzy puro (nunca é obrigatório).
     */
    embedding: jsonb('embedding').$type<number[]>(),
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

/** Comentário em um item (sincronizado, append-only). */
export const itemComments = pgTable(
  'item_comments',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    authorId: text('author_id'),
    authorName: text('author_name'),
    body: text('body').notNull(),
    ...syncColumns,
  },
  (t) => [
    index('item_comments_household_version_idx').on(t.householdId, t.serverVersion),
    index('item_comments_item_idx').on(t.itemId),
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
    /** CNPJ do emitente (import de NFC-e casa a loja por CNPJ; nome sozinho muda entre notas). */
    cnpj: text('cnpj'),
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
    source: text('source', { enum: ['manual', 'shopping', 'import'] })
      .notNull()
      .default('manual'),
    /** Avaliação de qualidade (1-5), opcional. */
    rating: integer('rating'),
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
    /** Orçamento mensal da lista em unidades mínimas da moeda. */
    budgetCents: integer('budget_cents'),
    /** Emoji da lista (ex.: 🛒, 🔥). */
    icon: text('icon'),
    /** Cor de destaque (hex, ex.: #15803D). */
    color: text('color'),
    /** Frequência quando recorrente; null = avulsa. */
    recurrence: text('recurrence', { enum: ['weekly', 'biweekly', 'monthly'] }),
    /** Dia do ciclo: 0-6 (semana) ou 1-28 (mês). */
    recurrenceDay: integer('recurrence_day'),
    /** Lista privada: só o dono vê (silo total — não toca o estoque da casa). */
    isPrivate: boolean('is_private').notNull().default(false),
    /** Dono da lista privada (null = compartilhada com a casa). */
    ownerId: text('owner_id').references(() => user.id, { onDelete: 'cascade' }),
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
    /** Membro responsável por comprar este item (id + nome desnormalizado). */
    assignedTo: text('assigned_to'),
    assignedToName: text('assigned_to_name'),
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

/** Movimento de estoque (ledger): compra (+), consumo (−), ajuste, contagem. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['purchase', 'consumption', 'adjustment', 'count'] }).notNull(),
    /** Variação aplicada (positiva ou negativa). */
    qty: numeric('qty', { precision: 10, scale: 3 }).notNull(),
    /** Saldo do item após o movimento. */
    balanceAfter: numeric('balance_after', { precision: 10, scale: 3 }).notNull(),
    reason: text('reason'),
    movedAt: timestamp('moved_at', { withTimezone: true }).notNull(),
    ...syncColumns,
  },
  (t) => [
    index('stock_movements_household_version_idx').on(t.householdId, t.serverVersion),
    index('stock_movements_item_idx').on(t.itemId),
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
    /** Foto do recibo (chave R2; blob local até upload). */
    receiptKey: text('receipt_key'),
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

// ===== Import de NFC-e (server-authoritative, sem colunas de sync) =====

/**
 * Nota fiscal (NFC-e) consultada via QR e importada por uma casa. Guarda o
 * resultado do lookup por `chave` — serve de cache (re-scan não re-consulta
 * a SEFAZ), idempotência (unique por household+chave) e base de contagem de
 * quota mensal (Free 2/mês, Pro 60/mês fair-use).
 *
 * `rawJson` guarda só itens + emitente já parseados — NUNCA o CPF do
 * consumidor (LGPD: descartado no parser/adapter antes de qualquer escrita).
 */
export const nfceImports = pgTable(
  'nfce_imports',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    /** Chave de acesso: 44 dígitos numéricos. */
    chave: text('chave').notNull(),
    uf: text('uf').notNull(),
    storeCnpj: text('store_cnpj'),
    storeName: text('store_name'),
    status: text('status', { enum: ['pending', 'parsed', 'confirmed', 'failed'] })
      .notNull()
      .default('pending'),
    itemCount: integer('item_count').notNull().default(0),
    /** Itens + emitente parseados do portal (cache do lookup) — sem CPF do consumidor. */
    rawJson: jsonb('raw_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Nota é imutável: re-scan da mesma chave na mesma casa retorna do cache
    // (não re-consulta o portal, não duplica price_records, não conta quota).
    unique('nfce_imports_household_chave_uq').on(t.householdId, t.chave),
    // Contagem de quota mensal lê por (household, mês-calendário via createdAt).
    index('nfce_imports_household_created_idx').on(t.householdId, t.createdAt),
  ],
);

// ===== Billing (server-authoritative, sem colunas de sync) =====

/**
 * Assinatura de plano Pro. Fonte da verdade é este banco — provedores (Asaas/Stripe)
 * só empurram webhooks que convergem aqui; households.plan é materializado a partir
 * das transições da máquina de estados em billing/lifecycle.ts.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['asaas', 'stripe'] }).notNull(),
    externalId: text('external_id'),
    externalCustomerId: text('external_customer_id'),
    status: text('status', { enum: ['pending', 'active', 'overdue', 'canceled'] })
      .notNull()
      .default('pending'),
    cycle: text('cycle', { enum: ['monthly', 'yearly'] }).notNull(),
    /** ISO 4217 — moeda travada no momento da assinatura (não re-roteia se a casa mudar). */
    currency: text('currency').notNull(),
    priceCents: integer('price_cents').notNull(),
    nextDueDate: timestamp('next_due_date', { withTimezone: true }),
    /** Fim do período pago — Pro permanece até aqui mesmo após cancelamento. */
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    overdueSince: timestamp('overdue_since', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('subscriptions_household_idx').on(t.householdId),
    // Garante no máximo 1 assinatura não-terminal por casa (concorrência de checkout).
    uniqueIndex('subscriptions_active_household_uq')
      .on(t.householdId)
      .where(sql`${t.status} <> 'canceled'`),
  ],
);

/** Eventos de webhook recebidos — dedupe por (provider, eventId) garante idempotência. */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('webhook_events_provider_event_uq').on(t.provider, t.eventId)],
);
