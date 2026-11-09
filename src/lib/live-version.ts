import { firestore } from './firebase-admin';

/**
 * Live "data version" for real-time sync between screens.
 *
 * Each server instance keeps ONE Firestore listener per collection (shared by
 * every browser), and tracks a fingerprint of the current data: an XOR of
 * hash(collection + docId + updateTime) over every document. Any create,
 * edit, move or delete changes the fingerprint.
 *
 * The fingerprint depends only on what's in Firestore, so every instance
 * reports the same value for the same data. Browsers poll this tiny value
 * every few seconds and only re-download the full board when it changes.
 */

const COLLECTIONS = ['jobs', 'departments', 'employees', 'extraParts', 'fixtures'];

// 32-bit FNV-1a.
function fnv(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface LiveState {
  hash: number;
  // collection/docId -> that doc's hash contribution
  entries: Map<string, number>;
  ready: Promise<void>;
  // Collections whose listener has delivered at least one snapshot.
  loaded: Set<string>;
  unsubscribers: Array<() => void>;
  failed: boolean;
}

// Survive Next.js dev hot-reloads without stacking listeners.
const g = globalThis as unknown as { __jfLiveState?: LiveState };

function start(): LiveState {
  let resolveReady!: () => void;
  const state: LiveState = {
    hash: 0,
    entries: new Map(),
    ready: new Promise<void>((r) => (resolveReady = r)),
    loaded: new Set(),
    unsubscribers: [],
    failed: false,
  };

  for (const col of COLLECTIONS) {
    const unsub = firestore.collection(col).onSnapshot(
      (snap) => {
        for (const change of snap.docChanges()) {
          const key = `${col}/${change.doc.id}`;
          const old = state.entries.get(key);
          if (old !== undefined) {
            state.hash ^= old;
            state.entries.delete(key);
          }
          if (change.type !== 'removed') {
            const t = change.doc.updateTime?.toMillis() ?? 0;
            const h = fnv(`${key}@${t}`);
            state.entries.set(key, h);
            state.hash ^= h;
          }
        }
        state.loaded.add(col);
        if (state.loaded.size === COLLECTIONS.length) resolveReady();
      },
      (err) => {
        // Listener died (network, credentials...). Drop this state so the
        // next request starts fresh listeners.
        console.error(`[live] listener error on ${col}:`, err);
        state.failed = true;
        resolveReady();
      }
    );
    state.unsubscribers.push(unsub);
  }

  return state;
}

function getState(): LiveState {
  const cur = g.__jfLiveState;
  if (cur && !cur.failed) return cur;
  if (cur) cur.unsubscribers.forEach((u) => u());
  g.__jfLiveState = start();
  return g.__jfLiveState;
}

/** Current data fingerprint, or null if the listeners aren't healthy. */
export async function getLiveVersion(): Promise<string | null> {
  const state = getState();
  // Wait (briefly) for the first snapshot of every collection.
  await Promise.race([state.ready, new Promise((r) => setTimeout(r, 8000))]);
  if (state.failed || state.loaded.size < COLLECTIONS.length) return null;
  return `${state.hash.toString(36)}.${state.entries.size}`;
}
