'use client';
import { useRouter } from 'next/navigation';
import { ShopLocation } from '@/components/ShopLocation';

/** Onboarding O1 + O2 → O3 (household + budget). */
export function StartFlow() {
  const router = useRouter();
  return <ShopLocation onDone={() => router.push('/start/household')} />;
}
