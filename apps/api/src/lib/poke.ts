/** Pub/sub em memória por household para "poke" (avisa clientes a sincronizar via SSE). */
type Listener = () => void;
const subs = new Map<string, Set<Listener>>();

export function pokeHousehold(householdId: string): void {
  subs.get(householdId)?.forEach((fn) => fn());
}

export function subscribePoke(householdId: string, fn: Listener): () => void {
  let set = subs.get(householdId);
  if (!set) {
    set = new Set();
    subs.set(householdId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) subs.delete(householdId);
  };
}
