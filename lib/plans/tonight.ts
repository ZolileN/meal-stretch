/** Which supper is "tonight": the meal dated today (SA), else the next upcoming one ("up next"). */
export function pickTonight<M extends { date: string }>(meals: M[], todayIso: string): { meal: M; isToday: boolean } | null {
  const today = meals.find((m) => m.date === todayIso);
  if (today) return { meal: today, isToday: true };
  const next = meals.find((m) => m.date > todayIso);
  return next ? { meal: next, isToday: false } : null;
}
