import type { Job, Department, ExtraPart } from '@/types';

// Departments hidden from the board (keep in sync with page.tsx).
const HIDDEN_DEPARTMENT_NAMES = new Set(['ARTURO', 'CUT SAW (SEGUETA)']);

export interface JobLocation {
  jobId: string;
  jobNumber: string;
  name?: string;
  customer?: string;
  partNumber?: string;
  dwgNumber?: string;
  matchedBy: string[];
  // Only matched by a DWG#/Part# that was one character off.
  approximate?: boolean;
  status: 'board' | 'shipped' | 'deviation';
  departmentName?: string;
  departmentColor?: string;
  position?: number; // 1-based, as the board column shows it
  columnSize?: number;
  inProgress?: boolean;
  assignedTo?: string;
  priority?: number;
  dueDate?: string;
  shippedAt?: string;
}

export interface ExtraLocation {
  jobNumber?: string;
  partNumber?: string;
  place?: string;
  partQty?: string;
}

const norm = (s?: string) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// "103272951 REV A" -> "103272951": prints often show the revision elsewhere.
const base = (s?: string) => norm((s ?? '').replace(/\bREV\.?\s*[A-Z0-9]*\s*$/i, ''));

const boardSort = (a: Job, b: Job) =>
  (a.priority ?? 3) - (b.priority ?? 3) || (a.order ?? 0) - (b.order ?? 0);

/**
 * Finds the jobs a photo / PDF of a print refers to from its OCR text,
 * matching JOB#, PO#, DWG# and Part#, and says where each one is on the
 * board (department + position in the column).
 */
export function locateJobsFromText(
  text: string,
  jobs: Job[],
  departments: Department[],
  extraParts: ExtraPart[]
): { matches: JobLocation[]; extras: ExtraLocation[]; candidates: string[] } {
  const upper = text.toUpperCase();
  const compact = norm(text);
  const hasNumber = (n: string) => new RegExp(`(?<![0-9])${n}(?![0-9])`).test(upper);
  const hasCode = (code: string) => code.length >= 6 && compact.includes(code);
  const hasWord = (w?: string) => {
    const s = (w ?? '').trim().toUpperCase();
    return s.length >= 4 && new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(upper);
  };

  // Drawing title blocks are small print, so OCR often gets one character
  // wrong (D00363582 read as D00383582). Fold the usual look-alikes and
  // allow a single different character for long codes.
  const fold = (s: string) => s.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
  const tokens = [...new Set(upper.split(/[^A-Z0-9]+/).filter((t) => t.length >= 6).map(fold))];
  const nearCode = (code: string) => {
    if (code.length < 7) return false;
    const c = fold(code);
    return tokens.some((tok) => {
      for (let start = 0; start + c.length <= tok.length; start++) {
        let diff = 0;
        for (let k = 0; k < c.length && diff <= 1; k++) if (tok[start + k] !== c[k]) diff++;
        if (diff <= 1) return true;
      }
      return false;
    });
  };

  // Tiers: 3 = JOB# on the page, 2 = exact PO/DWG/Part, 1 = DWG/Part off by
  // one character. Only the best tier found is reported.
  const scored = jobs
    .map((job) => {
      const matchedBy: string[] = [];
      let tier = 0;
      const jobNo = norm(job.jobNumber);
      if (jobNo.length >= 4 && /^\d+$/.test(jobNo) && hasNumber(jobNo)) {
        tier = 3;
        matchedBy.push('JOB#');
      }
      if (hasCode(norm(job.poNumber))) {
        tier = Math.max(tier, 2);
        matchedBy.push('PO#');
      }
      const dwg = base(job.dwgNumber);
      const part = base(job.partNumber);
      for (const [label, code] of [['DWG#', dwg], ['Part#', part !== dwg ? part : '']] as const) {
        if (!code) continue;
        if (hasCode(code)) {
          tier = Math.max(tier, 2);
          matchedBy.push(label);
        } else if (nearCode(code)) {
          tier = Math.max(tier, 1);
          matchedBy.push(`${label}~`);
        }
      }
      // Customer / part name on the print only back up a code match.
      let support = matchedBy.length;
      if (tier && hasWord(job.name)) support++;
      if (tier && hasWord(job.customer)) support++;
      return { job, tier, support, matchedBy };
    })
    .filter((s) => s.tier > 0);

  const topTier = Math.max(0, ...scored.map((s) => s.tier));
  const best = scored
    .filter((s) => s.tier === topTier)
    .sort((a, b) => Number(!!a.job.shipped) - Number(!!b.job.shipped) || b.support - a.support)
    .slice(0, 6);

  const visibleDeptIds = new Set(
    departments.filter((d) => !HIDDEN_DEPARTMENT_NAMES.has(d.name.trim().toUpperCase())).map((d) => d.id)
  );
  const onBoard = (j: Job) => !j.shipped && j.deviationStatus !== 'pending' && visibleDeptIds.has(j.departmentId);

  const matches: JobLocation[] = best.map(({ job, matchedBy }) => {
    const dept = departments.find((d) => d.id === job.departmentId);
    const column = jobs.filter((j) => j.departmentId === job.departmentId && onBoard(j)).sort(boardSort);
    const idx = column.findIndex((j) => j.id === job.id);
    return {
      jobId: job.id,
      jobNumber: job.jobNumber || job.title,
      name: job.name,
      customer: job.customer,
      partNumber: job.partNumber,
      dwgNumber: job.dwgNumber,
      matchedBy,
      approximate: topTier === 1,
      status: job.shipped ? 'shipped' : job.deviationStatus === 'pending' ? 'deviation' : 'board',
      departmentName: dept?.name,
      departmentColor: dept?.color,
      position: idx >= 0 ? idx + 1 : undefined,
      columnSize: column.length,
      inProgress: !!job.inProgress,
      assignedTo: job.assignedTo,
      priority: job.priority,
      dueDate: job.dueDate,
      shippedAt: job.shippedAt,
    };
  });

  // Extra pieces in stock for the same job / part.
  const matchedJobNos = new Set(matches.map((m) => norm(m.jobNumber)));
  const matchedParts = new Set(matches.map((m) => base(m.partNumber)).filter(Boolean));
  const extras: ExtraLocation[] = extraParts
    .filter((p) => p.active)
    .filter(
      (p) =>
        (p.jobNumber && (matchedJobNos.has(norm(p.jobNumber)) || hasNumber(norm(p.jobNumber)))) ||
        (base(p.partNumber) && (matchedParts.has(base(p.partNumber)) || hasCode(base(p.partNumber))))
    )
    .map((p) => ({ jobNumber: p.jobNumber, partNumber: p.partNumber, place: p.place, partQty: p.partQty }));

  // Numbers that look like a JOB# (43xxx) or PO# (45xxxxxxxx), for the
  // "nothing found" reply.
  const candidates = [...new Set(upper.match(/(?<!\d)(43\d{3}|45\d{8})(?!\d)/g) ?? [])].slice(0, 6);

  return { matches, extras, candidates };
}

const fmtDue = (due: string | undefined, lang: 'es' | 'en') => {
  if (!due) return '';
  const m = due.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return due;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  const when =
    days < 0
      ? lang === 'es' ? `${-days} días atrasado` : `${-days} days overdue`
      : days === 0
      ? lang === 'es' ? 'hoy' : 'today'
      : lang === 'es' ? `faltan ${days} días` : `${days} days left`;
  return `${due} (${when})`;
};

/** Short chat reply describing where each matched job is. */
export function describeLocations(
  result: ReturnType<typeof locateJobsFromText>,
  lang: 'es' | 'en'
): string {
  const t = (es: string, en: string) => (lang === 'es' ? es : en);
  const { matches, extras, candidates } = result;

  if (!matches.length) {
    const seen = candidates.length ? ` ${t('Números que leí', 'Numbers I read')}: ${candidates.join(', ')}.` : '';
    return (
      t(
        'No encontré ningún trabajo que coincida con esa imagen.',
        "I couldn't find a job that matches that image."
      ) +
      seen +
      ' ' +
      t(
        'Intenta con una foto más clara donde se vea el JOB#, PO#, DWG# o Part#.',
        'Try a clearer photo showing the JOB#, PO#, DWG# or Part#.'
      )
    );
  }

  const lines = matches.map((m) => {
    const head = `JOB# ${m.jobNumber}${[m.name, m.customer].filter(Boolean).length ? ` (${[m.name, m.customer].filter(Boolean).join(' · ')})` : ''}`;
    if (m.status === 'shipped') {
      return `📦 ${head} ${t('ya fue enviado', 'was already shipped')}${m.shippedAt ? ` ${t('el', 'on')} ${m.shippedAt.slice(0, 10)}` : ''}.`;
    }
    const where =
      m.status === 'deviation'
        ? t(`está en Deviations (pendiente), en ${m.departmentName ?? '?'}`, `is in Deviations (pending), in ${m.departmentName ?? '?'}`)
        : `${t('está en', 'is in')} ${m.departmentName ?? '?'}` +
          (m.position ? ` — ${t('posición', 'position')} ${m.position} ${t('de', 'of')} ${m.columnSize}` : '');
    const bits = [
      m.inProgress ? t('En progreso', 'In progress') : null,
      m.assignedTo ? `${t('Asignado a', 'Assigned to')} ${m.assignedTo}` : null,
      m.priority ? `P${m.priority}` : null,
      m.dueDate ? `${t('Entrega', 'Due')} ${fmtDue(m.dueDate, lang)}` : null,
    ].filter(Boolean);
    return `📍 ${head} ${where}.${bits.length ? ` ${bits.join('. ')}.` : ''}`;
  });

  if (matches.length > 1 && !matches.some((m) => m.matchedBy.includes('JOB#'))) {
    lines.unshift(
      t(
        `Encontré ${matches.length} trabajos con el mismo dibujo/parte:`,
        `Found ${matches.length} jobs with the same drawing/part:`
      )
    );
  }
  if (matches.some((m) => m.approximate)) {
    const m = matches[0];
    const code = m.matchedBy.some((b) => b.startsWith('DWG#')) ? `DWG# ${m.dwgNumber}` : `Part# ${m.partNumber}`;
    lines.push(
      t(
        `⚠️ Coincidencia aproximada: el número del plano se leyó con un carácter distinto a ${code}. Verifícalo.`,
        `⚠️ Approximate match: the print's number was read one character off from ${code}. Please double-check.`
      )
    );
  }

  if (extras.length) {
    lines.push(
      `🗄️ ${t('Piezas extra en stock', 'Extra parts in stock')}: ` +
        extras
          .map((e) => `${e.place || '?'}${e.partQty ? ` (${t('cant.', 'qty')} ${e.partQty})` : ''}${e.jobNumber ? ` — JOB# ${e.jobNumber}` : ''}`)
          .join('; ')
    );
  }

  return lines.join('\n');
}
