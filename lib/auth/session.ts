/** Current signed-in user (if any). Lazy import keeps Auth.js out of modules that don't need it. */
export async function sessionUser(): Promise<{ id: string; email: string | null; name: string | null } | null> {
  try {
    const { auth } = await import('@/auth');
    const s = await auth();
    return s?.user?.id ? { id: s.user.id, email: s.user.email ?? null, name: s.user.name ?? null } : null;
  } catch {
    return null;
  }
}
