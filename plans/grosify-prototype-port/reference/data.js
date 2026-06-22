/* Grosify — mock data (cents are integer minor units, never floats). */
(function () {
  const STORES = [
    { id: 's1', name: 'Atacadão', city: 'São Paulo', hood: 'Vila Mariana' },
    { id: 's2', name: 'Assaí', city: 'São Paulo', hood: 'Saúde' },
    { id: 's3', name: 'Mercado do Zé', city: 'São Paulo', hood: 'Vila Mariana' },
  ];

  // price: cents per store; deltaCents = change vs previous record (neg = caiu)
  const ITEMS = [
    { id: 'i1', name: 'Arroz branco 5kg', cat: 'Grãos', unit: 'un', rec: 2, onHand: 0,
      prices: [{ s: 's1', c: 2490 }, { s: 's2', c: 2690 }, { s: 's3', c: 2790 }], delta: -310, offer: true,
      hist: [2790, 2890, 2790, 2690, 2890, 2490] },
    { id: 'i2', name: 'Feijão carioca 1kg', cat: 'Grãos', unit: 'un', rec: 4, onHand: 1,
      prices: [{ s: 's2', c: 749 }, { s: 's1', c: 799 }, { s: 's3', c: 829 }], delta: 120, offer: false,
      hist: [629, 649, 699, 679, 729, 749] },
    { id: 'i3', name: 'Leite integral 1L', cat: 'Laticínios', unit: 'un', rec: 12, onHand: 3,
      prices: [{ s: 's1', c: 459 }, { s: 's3', c: 489 }, { s: 's2', c: 499 }], delta: -40, offer: false,
      hist: [519, 499, 509, 489, 479, 459] },
    { id: 'i4', name: 'Ovos brancos 12un', cat: 'Laticínios', unit: 'un', rec: 4, onHand: 0,
      prices: [{ s: 's3', c: 899 }, { s: 's1', c: 949 }, { s: 's2', c: 999 }], delta: 50, offer: false,
      hist: [799, 829, 869, 849, 879, 899] },
    { id: 'i5', name: 'Café torrado 500g', cat: 'Bebidas', unit: 'un', rec: 2, onHand: 0,
      prices: [{ s: 's2', c: 1690 }, { s: 's1', c: 1790 }, { s: 's3', c: 1890 }], delta: -200, offer: true,
      hist: [1990, 1890, 1990, 1890, 1890, 1690] },
    { id: 'i6', name: 'Detergente neutro', cat: 'Limpeza', unit: 'un', rec: 3, onHand: 1,
      prices: [{ s: 's1', c: 249 }, { s: 's2', c: 269 }, { s: 's3', c: 279 }], delta: 0, offer: false,
      hist: [239, 249, 249, 259, 249, 249] },
    { id: 'i7', name: 'Sabão em pó 1kg', cat: 'Limpeza', unit: 'un', rec: 1, onHand: 0,
      prices: [{ s: 's2', c: 1290 }, { s: 's1', c: 1390 }, { s: 's3', c: 1450 }], delta: 150, offer: false,
      hist: [1090, 1150, 1190, 1240, 1190, 1290] },
    { id: 'i8', name: 'Papel higiênico 12 rolos', cat: 'Higiene', unit: 'un', rec: 1, onHand: 2,
      prices: [{ s: 's1', c: 1990 }, { s: 's3', c: 2090 }, { s: 's2', c: 2190 }], delta: -100, offer: false,
      hist: [2190, 2090, 2190, 2090, 2090, 1990] },
    { id: 'i9', name: 'Açúcar refinado 1kg', cat: 'Grãos', unit: 'un', rec: 2, onHand: 0,
      prices: [{ s: 's3', c: 419 }, { s: 's1', c: 449 }, { s: 's2', c: 469 }], delta: -30, offer: false,
      hist: [479, 459, 469, 449, 439, 419] },
    { id: 'i10', name: 'Óleo de soja 900ml', cat: 'Grãos', unit: 'un', rec: 2, onHand: 1,
      prices: [{ s: 's1', c: 689 }, { s: 's2', c: 729 }, { s: 's3', c: 749 }], delta: 80, offer: false,
      hist: [589, 619, 649, 669, 609, 689] },
    { id: 'i11', name: 'Macarrão espaguete 500g', cat: 'Grãos', unit: 'un', rec: 4, onHand: 1,
      prices: [{ s: 's2', c: 389 }, { s: 's1', c: 419 }, { s: 's3', c: 449 }], delta: -20, offer: false,
      hist: [429, 419, 409, 399, 409, 389] },
    { id: 'i12', name: 'Suco de laranja 1L', cat: 'Bebidas', unit: 'un', rec: 3, onHand: 0,
      prices: [{ s: 's1', c: 879 }, { s: 's3', c: 929 }, { s: 's2', c: 949 }], delta: 60, offer: false,
      hist: [799, 819, 859, 839, 819, 879] },
  ];

  const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  const STORE = Object.fromEntries(STORES.map((s) => [s.id, s]));
  const cheapest = (it) => it.prices.reduce((a, b) => (b.c < a.c ? b : a));
  const need = (it) => Math.max(0, it.rec - it.onHand);

  const LISTS = [
    { id: 'l1', name: 'Compras do mês', icon: '🛒', recurring: true, due: true, recurrence: 'Mensal',
      budget: 45000, itemIds: ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8', 'i9', 'i10', 'i11', 'i12'] },
    { id: 'l2', name: 'Limpeza', icon: '🧽', recurring: true, due: false, recurrence: 'Mensal',
      budget: 12000, itemIds: ['i6', 'i7', 'i8'] },
    { id: 'l3', name: 'Churrasco sábado', icon: '🔥', recurring: false, due: false, recurrence: null,
      budget: 0, itemIds: ['i9', 'i10'] },
    { id: 'l4', name: 'Farmácia', icon: '💊', recurring: true, due: false, recurrence: 'Mensal',
      budget: 8000, itemIds: [] },
  ];

  // Histórico de compras finalizadas
  const HISTORY = [
    { id: 'h1', date: '2026-05-18', store: 'Atacadão', count: 14, total: 28940, saved: 4210 },
    { id: 'h2', date: '2026-04-20', store: 'Assaí', count: 12, total: 31250, saved: -1180 },
    { id: 'h3', date: '2026-03-22', store: 'Atacadão', count: 15, total: 27680, saved: 3050 },
  ];

  function listStats(list) {
    const items = list.itemIds.map((id) => ITEM[id]).filter(Boolean);
    const needed = items.filter((it) => need(it) > 0);
    const total = needed.reduce((sum, it) => sum + need(it) * cheapest(it).c, 0);
    const noPrice = items.filter((it) => it.prices.length === 0).length;
    return { items, needed, missing: needed.length, total, noPrice };
  }

  // BRL: cents -> { reais, cents, symbol }
  function brl(cents) {
    const neg = cents < 0;
    const v = Math.abs(Math.round(cents));
    const reais = Math.floor(v / 100);
    const c = String(v % 100).padStart(2, '0');
    return { neg, reais: reais.toLocaleString('pt-BR'), cents: c, symbol: 'R$' };
  }
  function fmtBRL(cents) {
    const b = brl(cents);
    return (b.neg ? '-' : '') + b.symbol + ' ' + b.reais + ',' + b.cents;
  }

  window.GroData = {
    STORES, ITEMS, ITEM, STORE, LISTS, HISTORY,
    cheapest, need, listStats, brl, fmtBRL,
    savedThisMonth: 14250, monthLabel: 'junho',
  };
})();
