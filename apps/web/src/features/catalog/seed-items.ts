import type { Unit } from '@grosify/shared';
import { db } from '../../db/dexie.js';
import { createItem } from '../../db/repositories.js';

/** Itens de mercado comuns (pt-BR) pra começar a lista rápido. */
const COMMON_ITEMS: { name: string; category: string; unit: Unit }[] = [
  { name: 'Arroz 5kg', category: 'Grãos', unit: 'un' },
  { name: 'Feijão carioca 1kg', category: 'Grãos', unit: 'un' },
  { name: 'Açúcar 1kg', category: 'Mercearia', unit: 'un' },
  { name: 'Café 500g', category: 'Mercearia', unit: 'un' },
  { name: 'Óleo de soja', category: 'Mercearia', unit: 'un' },
  { name: 'Sal 1kg', category: 'Mercearia', unit: 'un' },
  { name: 'Farinha de trigo 1kg', category: 'Mercearia', unit: 'un' },
  { name: 'Macarrão 500g', category: 'Mercearia', unit: 'un' },
  { name: 'Leite integral', category: 'Laticínios', unit: 'l' },
  { name: 'Ovos dúzia', category: 'Laticínios', unit: 'un' },
  { name: 'Manteiga 200g', category: 'Laticínios', unit: 'un' },
  { name: 'Queijo mussarela', category: 'Laticínios', unit: 'kg' },
  { name: 'Pão de forma', category: 'Padaria', unit: 'un' },
  { name: 'Banana', category: 'Hortifrúti', unit: 'kg' },
  { name: 'Tomate', category: 'Hortifrúti', unit: 'kg' },
  { name: 'Cebola', category: 'Hortifrúti', unit: 'kg' },
  { name: 'Batata', category: 'Hortifrúti', unit: 'kg' },
  { name: 'Detergente', category: 'Limpeza', unit: 'un' },
  { name: 'Sabão em pó 1kg', category: 'Limpeza', unit: 'un' },
  { name: 'Papel higiênico 12 rolos', category: 'Higiene', unit: 'un' },
];

export async function seedCommonItems(): Promise<void> {
  // Defesa: nunca semeia se a casa já tem itens — evita duplicar o catálogo
  // (ex.: usuário existente re-vendo o onboarding, ou um futuro "rever tour").
  if ((await db.items.count()) > 0) return;
  for (const it of COMMON_ITEMS) {
    await createItem({ name: it.name, category: it.category, unit: it.unit, barcodes: [] });
  }
}
