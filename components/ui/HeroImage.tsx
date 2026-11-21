'use client';
import { useState } from 'react';
import { useImagesAllowed } from './useImagesAllowed';

/** Lazy, decorative (alt=""), and dropped on error or data saver: the card falls back to solid green. */
export function HeroImage({ src }: { src: string }) {
  const allowed = useImagesAllowed({ hero: true });
  const [failed, setFailed] = useState(false);
  if (!allowed || failed) return null;
  // eslint-disable-next-line @next/next/no-img-element -- ≤40 KB WebP, decorative; next/image adds JS we don't need
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 -z-20 size-full object-cover" />;
}
