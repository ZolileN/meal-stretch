'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { trackClient } from '@/lib/track-client';
import { ShopLocation } from '@/components/ShopLocation';

/** Onboarding O1 + O2 → O3 (household + budget). */
export function StartFlow() {
  const router = useRouter();
  useEffect(() => trackClient('onboarding_started'), []);
  return <ShopLocation onDone={() => router.push('/start/household')} />;
}
