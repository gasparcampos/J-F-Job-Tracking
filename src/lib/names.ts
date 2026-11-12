/** Compares people's names ignoring case, accents and extra spaces ("Ángel" = "angel"). */
export function sameName(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const norm = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
  return norm(a) === norm(b);
}
