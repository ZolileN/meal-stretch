/** Which sign-in options are switched on (one source of truth for auth.ts and every screen that offers sign-in). */
import { env, features } from '@/lib/env';

export interface SignInMethods {
  google: boolean;
  email: boolean;
}

export function signInMethods(): SignInMethods {
  const e = env();
  return {
    google: features.googleAuth(),
    // Outside production (and in e2e) email links go to the dev mailbox, so email always works there.
    email: features.emailAuth() || e.NODE_ENV !== 'production' || Boolean(e.E2E),
  };
}

export const anySignIn = (m: SignInMethods) => m.google || m.email;
