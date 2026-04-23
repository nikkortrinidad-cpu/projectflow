import { useSyncExternalStore } from 'react';
import { flizowStore } from './flizowStore';

/**
 * React hook for the Flizow store. Mirrors the useBoard() hook the
 * legacy kanban uses, so component code reads the same on both sides.
 *
 * Returns { data, store } — `data` is the current FlizowData snapshot
 * (re-rendered whenever the store notifies), `store` is the singleton
 * for firing mutations.
 */
export function useFlizow() {
  const data = useSyncExternalStore(
    flizowStore.subscribe,
    flizowStore.getSnapshot,
  );
  return { data, store: flizowStore };
}
