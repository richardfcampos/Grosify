# Feature: Offline sync (Phase 3)

## Context
Shopping happens at the store, often with no signal. The app needs to work offline and upload the data when the connection returns. The repository over Dexie (phases 1-2) already isolates the UI — now it becomes local-first.

## Approach (pragmatic)
- **Local-first writes**: repos write to Dexie immediately (optimistic) + enqueue the operation in an **outbox**. Instant reactive UI.
- **Engine** replays the outbox against the existing (idempotent) routes when online; removes items from the queue on success.
- **New incremental pull**: `/sync/pull?cursor=N` returns rows with `server_version > N` across all sync tables, **including tombstones** (deletes propagate). Monotonic cursor (a global sequence already exists).
- **Idempotency**: id generated on the client (UUIDv7) + `ON CONFLICT (id) DO NOTHING` on creates → a replay doesn't duplicate.
- **Simplified LWW**: the server is the source of truth on pull; "last-sync-wins" between members. Acceptable at household scale (2-4 people, edits rarely collide on the same item). True per-field LWW is deferred until there's real concurrency.

## Requirements
- SY-1: create/edit/delete offline → changes in the UI immediately, stays pending.
- SY-2: on coming back online → the outbox uploads automatically (order preserved).
- SY-3: incremental pull brings changes from other devices/members, including deletes (tombstone).
- SY-4: the pull merge preserves the local photo (blob) and does not overwrite a row with a local pending change.
- SY-5: a status indicator (offline / N pending) in the UI.
- SY-6: the app shell loads offline (Workbox precache — already via vite-plugin-pwa autoUpdate).
- SY-7: idempotent replay (reconnecting after a lost response doesn't duplicate).

## Out of scope
- Shopping mode / scan-to-check (phase 4).
- Real-time SSE/push, per-field LWW with a vector clock (post-MVP).
- A storage-agnostic packages/sync (phase 7, once Expo exists).

## Acceptance criteria
- DevTools offline → create an item → it appears in the list + a pending indicator → reconnect → it uploads → pending count goes to zero.
- A second browser pulls and sees the item.
- Delete an item → it disappears in the second browser after a pull (tombstone).
- Reload offline → the app shell opens, Dexie data visible.
