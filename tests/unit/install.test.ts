import { describe, expect, it } from 'vitest';
import { installMode, isIos } from '@/lib/install';

const base = { dismissed: false, standalone: false, hasEvent: false, ios: false, touch: false };

describe('install card', () => {
  it('uses the browser prompt when the browser offers one (Android Chrome, desktop Chrome)', () => {
    expect(installMode({ ...base, hasEvent: true })).toBe('prompt');
    expect(installMode({ ...base, hasEvent: true, touch: true })).toBe('prompt');
  });
  it('shows Share → Add to Home Screen steps on iPhone (Safari has no prompt)', () => {
    expect(installMode({ ...base, ios: true, touch: true })).toBe('ios');
  });
  it('shows browser-menu steps on other phones without a prompt', () => {
    expect(installMode({ ...base, touch: true })).toBe('menu');
  });
  it('shows nothing on a laptop without a prompt, once installed, or once dismissed', () => {
    expect(installMode(base)).toBe('hidden');
    expect(installMode({ ...base, hasEvent: true, standalone: true })).toBe('hidden');
    expect(installMode({ ...base, ios: true, touch: true, dismissed: true })).toBe('hidden');
  });
  it('recognises iPhones and iPads (iPadOS says Macintosh)', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIos('Mozilla/5.0 (Linux; Android 14; SM-A155F)', 5)).toBe(false);
  });
});
