'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { emptyShops, readShops, STORAGE_KEY, type SavedShops } from '@/lib/location/store';

interface Ctx {
  shops: SavedShops;
  ready: boolean;
  save: (next: Partial<SavedShops>) => void;
  sheetOpen: false | 'where' | 'shops';
  openSheet: (step: 'where' | 'shops') => void;
  closeSheet: () => void;
}

const LocationCtx = createContext<Ctx | null>(null);

export const SHOPS_CHANGED_EVENT = 'ms:shops-changed';

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [shops, setShops] = useState<SavedShops>(emptyShops);
  const [ready, setReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState<Ctx['sheetOpen']>(false);

  useEffect(() => {
    try {
      // Hydrate from device storage after mount (LOC-4).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShops(readShops(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      /* storage unavailable: start empty */
    }
    setReady(true);
  }, []);

  const save = useCallback((next: Partial<SavedShops>) => {
    setShops((prev) => {
      const merged: SavedShops = { ...prev, ...next, updatedAt: new Date().toISOString() };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent(SHOPS_CHANGED_EVENT, { detail: merged }));
      return merged;
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({ shops, ready, save, sheetOpen, openSheet: (s) => setSheetOpen(s), closeSheet: () => setSheetOpen(false) }),
    [shops, ready, save, sheetOpen],
  );
  return <LocationCtx.Provider value={value}>{children}</LocationCtx.Provider>;
}

export function useShops(): Ctx {
  const c = useContext(LocationCtx);
  if (!c) throw new Error('useShops must be used inside <LocationProvider>');
  return c;
}
