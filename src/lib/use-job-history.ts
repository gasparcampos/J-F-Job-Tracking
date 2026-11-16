'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Job } from '@/types';

/**
 * Adds matches from the Access job archive (/api/job-history) to the
 * current jobs, so the Extra Parts / Fixtures lookup also finds old jobs
 * by JOB#, DWG# or Part#. Debounced; only searches with 3+ characters.
 */
export function useJobsWithHistory(jobs: Job[], query: string): Job[] {
  const [hits, setHits] = useState<Job[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/job-history?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: Job[]) => setHits(Array.isArray(data) ? data : []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  return useMemo(() => {
    if (!hits.length) return jobs;
    const ids = new Set(jobs.map((j) => j.id));
    return [...jobs, ...hits.filter((h) => !ids.has(h.id))];
  }, [jobs, hits]);
}
