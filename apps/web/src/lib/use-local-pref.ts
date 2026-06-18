import { useCallback, useState } from 'react';

/**
 * Preferência de exibição persistida em localStorage (por dispositivo, não sincroniza).
 * Ex.: ordenação de lista, densidade compacta.
 */
export function useLocalPref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T | null) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, v);
      } catch {
        // armazenamento indisponível — mantém só em memória
      }
      setValue(v);
    },
    [key],
  );
  return [value, set];
}
