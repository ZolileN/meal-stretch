/** Install card logic (PRD §6 installable PWA): which version of the card a device gets. Pure, unit-tested. */

/** iPhone/iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(ua: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

/** What the install card shows: the browser's own prompt, how-to steps (iPhone / other phones), or nothing. */
export type InstallMode = 'prompt' | 'ios' | 'menu' | 'hidden';
export function installMode(o: { dismissed: boolean; standalone: boolean; hasEvent: boolean; ios: boolean; touch: boolean }): InstallMode {
  if (o.dismissed || o.standalone) return 'hidden';
  if (o.hasEvent) return 'prompt';
  if (o.ios) return 'ios'; // Safari never fires beforeinstallprompt: Share → Add to Home Screen.
  if (o.touch) return 'menu'; // Phones whose browser didn't offer a prompt: the browser menu has "Install app".
  return 'hidden'; // Laptops without a prompt: nothing to show.
}
