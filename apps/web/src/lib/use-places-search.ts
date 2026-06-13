import { useEffect, useState } from 'react';

export interface PlaceResult {
  name: string;
  city: string | null;
  neighborhood: string | null;
  lat: number;
  lng: number;
  label: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    city?: string;
    district?: string;
    suburb?: string;
    locality?: string;
    state?: string;
    countrycode?: string;
  };
}

function toPlace(f: PhotonFeature): PlaceResult {
  const p = f.properties;
  const name = p.name ?? p.street ?? '';
  const neighborhood = p.district ?? p.suburb ?? p.locality ?? null;
  const city = p.city ?? null;
  const parts = [neighborhood, city, p.state].filter(Boolean);
  return {
    name,
    city,
    neighborhood,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    label: parts.length ? `${name} — ${parts.join(', ')}` : name,
  };
}

/**
 * Busca lugares/estabelecimentos no Photon (OpenStreetMap, grátis, sem chave).
 * Debounce de 350ms; uso justo. Atribuição © OpenStreetMap.
 */
export function usePlacesSearch(query: string): { results: PlaceResult[]; loading: boolean } {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6`,
          { signal: controller.signal },
        );
        const data = (await res.json()) as { features: PhotonFeature[] };
        setResults(data.features.map(toPlace).filter((p) => p.name));
      } catch {
        // ignora aborto / rede; mantém campos manuais
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { results, loading };
}
