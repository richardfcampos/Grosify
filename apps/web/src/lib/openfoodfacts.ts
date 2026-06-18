export interface OffProduct {
  name: string | null;
  brand: string | null;
}

/**
 * Busca nome/marca de um produto pelo código de barras no OpenFoodFacts.
 * Só para EAN/UPC numérico; retorna null se offline, 404 ou produto sem nome.
 */
export async function lookupOpenFoodFacts(barcode: string): Promise<OffProduct | null> {
  if (!/^\d{8,14}$/.test(barcode)) return null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_pt,brands`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: number;
      product?: { product_name?: string; product_name_pt?: string; brands?: string };
    };
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    const name = (p.product_name_pt || p.product_name || '').trim() || null;
    const brand = p.brands ? p.brands.split(',')[0]!.trim() : null;
    return { name, brand: brand || null };
  } catch {
    return null;
  }
}
