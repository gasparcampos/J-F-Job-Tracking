import type { Fixture, Gage } from '@/types';

/**
 * Links Fixtures and Gages to jobs. A fixture/gage is kept for a part, so a
 * re-order of that part (new JOB#) should find it too: it matches a job by
 * the same job record, the same JOB#, or the same DWG# / Part# ignoring the
 * revision (a fixture made for REV 05 is still the one to check for REV 06).
 */

// Identifying fields shared by jobs, fixtures and gages.
export interface ToolingKeys {
  id?: string;
  jobId?: string;
  jobNumber?: string;
  dwgNumber?: string;
  partNumber?: string;
}

/** Upper-case, drop a trailing "REV xx", keep only letters and digits. */
export function partKey(v?: string): string {
  const s = (v ?? '')
    .toUpperCase()
    // "REV" may be glued to the number ("VP02244REV 01").
    .replace(/\s*(?:\b|(?<=[0-9]))REV(ISION)?\b\.?[\s:#-]*[A-Z0-9.-]*\s*$/, '')
    .replace(/[^A-Z0-9]/g, '');
  // Very short values (e.g. "1", "N/A") would link unrelated jobs.
  return s.length >= 4 ? s : '';
}

const jobKey = (v?: string) => (v ?? '').trim().toUpperCase();

/** True when two records point at the same job or the same part. */
export function sameTooling(a: ToolingKeys, b: ToolingKeys): boolean {
  if (a.jobId && b.jobId && a.jobId === b.jobId) return true;
  const ja = jobKey(a.jobNumber);
  if (ja && ja === jobKey(b.jobNumber)) return true;
  const da = partKey(a.dwgNumber);
  if (da && da === partKey(b.dwgNumber)) return true;
  const pa = partKey(a.partNumber);
  if (pa && pa === partKey(b.partNumber)) return true;
  return false;
}

/** A fixture still on the shelf. */
export const fixtureAvailable = (f: Fixture) => f.active !== false;

/** A gage still here (not out, not given back to the customer). */
export const gageAvailable = (g: Gage) =>
  g.active !== false && !(g.ownership === 'customer' && g.returnedDate);

/** Job record seen as ToolingKeys: its own id is what fixtures store as jobId. */
const jobAsKeys = (job: ToolingKeys & { id: string }): ToolingKeys => ({
  jobId: job.id,
  jobNumber: job.jobNumber,
  dwgNumber: job.dwgNumber,
  partNumber: job.partNumber,
});

/** Fixtures and gages on hand for this job's part. */
export function toolingForJob(
  job: ToolingKeys & { id: string },
  fixtures: Fixture[],
  gages: Gage[]
): { fixtures: Fixture[]; gages: Gage[] } {
  const keys = jobAsKeys(job);
  return {
    fixtures: fixtures.filter((f) => fixtureAvailable(f) && sameTooling(keys, f)),
    gages: gages.filter((g) => gageAvailable(g) && sameTooling(keys, g)),
  };
}
