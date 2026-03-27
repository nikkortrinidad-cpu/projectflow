import { useSyncExternalStore } from 'react';
import { store } from './boardStore';

export function useBoard() {
  const state = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState()
  );
  return { state, store };
}
