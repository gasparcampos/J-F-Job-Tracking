import type { Job } from '@/types';

export interface JobLookupResult {
  matchedJob: Job | null;
  // How many jobs match what was typed (for the "several jobs match" warning).
  matchCount: number;
}

const norm = (v?: string) => (v ?? '').trim().toLowerCase();

/**
 * Finds the job an Extra Part / Fixture belongs to, by JOB#, DWG# or Part#
 * (case-insensitive). These come from jobs already shipped, so shipped jobs
 * are searched first (most recently shipped first); active jobs only if no
 * shipped job matches. Within each group: exact JOB#, then exact DWG#,
 * exact Part#, then partial.
 */
export function lookupJob(jobs: Job[], query: string): JobLookupResult {
  const q = norm(query);
  if (!q) return { matchedJob: null, matchCount: 0 };
  const hits = (j: Job) =>
    [j.jobNumber, j.dwgNumber, j.partNumber].some((v) => norm(v).includes(q));
  const pick = (list: Job[]) =>
    list.find((j) => norm(j.jobNumber) === q) ||
    list.find((j) => norm(j.dwgNumber) === q) ||
    list.find((j) => norm(j.partNumber) === q) ||
    list.find(hits) ||
    null;
  const shipped = jobs
    .filter((j) => j.shipped === true)
    .sort((a, b) => (b.shippedAt ?? '').localeCompare(a.shippedAt ?? ''));
  const notShipped = jobs.filter((j) => j.shipped !== true);
  // Most records are added by the J&F work order (JOB#). When the lookup is
  // an exact JOB#, only jobs with that exact JOB# count toward the warning,
  // not DWG#/Part# numbers that happen to contain it.
  const exactJob = jobs.filter((j) => norm(j.jobNumber) === q);
  return {
    matchedJob: pick(shipped) || pick(notShipped),
    matchCount: exactJob.length > 0 ? exactJob.length : jobs.filter(hits).length,
  };
}

/** Job with exactly this JOB# (a shipped one wins), for instant auto-fill. */
export function exactJobByNumber(jobs: Job[], query: string): Job | null {
  const q = norm(query);
  if (!q) return null;
  const same = jobs.filter((j) => norm(j.jobNumber) === q);
  return same.find((j) => j.shipped === true) || same[0] || null;
}

/** YYYY-MM-DD -> M/D/YYYY, like Access shows it. */
export function fmtAccessDate(d?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : d || '';
}

/** A record counts as in stock while its QTY is a number above zero. */
export function qtyInStock(qty?: string): boolean {
  const n = Number((qty ?? '').trim());
  return Number.isFinite(n) && n > 0;
}
