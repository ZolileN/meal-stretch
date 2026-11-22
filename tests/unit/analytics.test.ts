import { describe, expect, it } from 'vitest';
import { cleanAnalyticsUrl, redactEvent } from '@/lib/analytics';

describe('analytics url cleaning', () => {
  it('drops query strings and fragments', () => {
    expect(cleanAnalyticsUrl('https://app.example/signin?email=a%40b.co&token=xyz#top')).toBe('https://app.example/signin');
    expect(cleanAnalyticsUrl('/plan?seed=4')).toBe('/plan');
  });
  it('hides share-link tokens', () => {
    expect(cleanAnalyticsUrl('https://app.example/s/AbC123secret')).toBe('https://app.example/s/[token]');
    expect(cleanAnalyticsUrl('/s/AbC123secret/extra')).toBe('/s/[token]/extra');
  });
  it('does not report admin or dev pages', () => {
    for (const u of ['/admin', '/admin/prices', 'https://app.example/dev/ui', '/dev']) expect(cleanAnalyticsUrl(u)).toBeNull();
    expect(cleanAnalyticsUrl('/administrator-tips')).toBe('/administrator-tips');
  });
  it('keeps ordinary pages and the event type', () => {
    expect(redactEvent({ type: 'pageview' as const, url: 'https://app.example/recipe/chakalaka_pap?x=1' })).toEqual({
      type: 'pageview',
      url: 'https://app.example/recipe/chakalaka_pap',
    });
    expect(redactEvent({ type: 'vital' as const, url: '/admin/pilot' })).toBeNull();
  });
});
