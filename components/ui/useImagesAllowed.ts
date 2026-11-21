'use client';
/**
 * Food photos are optional decoration (THEME §4, PRD §15).
 *  - plan thumbnails: only when the user turned "Show food photos" on, or on Wi-Fi without data saver;
 *  - hero / recipe image: unless data saver is on.
 * Device-only preference in localStorage.
 */
import { useSyncExternalStore } from 'react';

export const PHOTOS_KEY = 'ms_show_photos';
export const PHOTOS_EVENT = 'ms:photos-changed';

type Conn = { saveData?: boolean; type?: string };
const conn = (): Conn | undefined => (navigator as Navigator & { connection?: Conn }).connection;

export function readPhotosSetting(): boolean {
  try {
    return window.localStorage.getItem(PHOTOS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writePhotosSetting(on: boolean) {
  try {
    window.localStorage.setItem(PHOTOS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(PHOTOS_EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(PHOTOS_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(PHOTOS_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function imagesAllowed({ hero = false } = {}): boolean {
  const c = conn();
  if (c?.saveData) return false;
  if (hero) return true;
  return readPhotosSetting() || c?.type === 'wifi';
}

export function useImagesAllowed(opts: { hero?: boolean } = {}): boolean {
  return useSyncExternalStore(
    subscribe,
    () => imagesAllowed(opts),
    () => false, // server render: no images; the solid fallback is the default
  );
}

/** The "Show food photos" switch itself (Settings). */
export function usePhotosSetting(): boolean {
  return useSyncExternalStore(subscribe, readPhotosSetting, () => false);
}
