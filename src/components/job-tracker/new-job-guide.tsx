'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, Printer } from 'lucide-react';
import { printHtml, escHtml } from '@/lib/print-html';

/**
 * Step-by-step instructions for loading a job, shown inside New Job as a
 * collapsible panel ("How to load a job") that can also be printed or
 * saved as PDF. Edit the steps here; the panel and the printout both use them.
 */
interface GuideStep {
  title: string;
  points: string[];
}

const STEPS: GuideStep[] = [
  {
    title: 'Have the job sheet ready',
    points: ['The customer router / work order, as a PDF or a photo (JPG, PNG).'],
  },
  {
    title: 'Upload the document',
    points: [
      'In "Upload document (PDF or image)", tap the button and pick the file.',
      'Wait for "Reading document…" to finish: the app reads the sheet and fills in Customer, PO#, Line Item, JOB#, Quantity, DWG#, Part#, Due Date and the title automatically.',
      'A preview appears below so you can compare.',
    ],
  },
  {
    title: 'Check Job Details against the sheet',
    points: [
      'Fix any value the reader got wrong or left empty.',
      'Customer: if it is not Baker, Halliburton or Liberty, choose "Other" and type the name.',
      'NAME (part name, e.g. PLUG, HOUSING) is not filled in automatically: type it.',
      'JOB# and Due Date are required.',
      'A JOB# cannot be repeated: if it already exists, the app shows "Duplicate JOB#" and does not create it.',
    ],
  },
  {
    title: 'Title / Description (required)',
    points: [
      'Filled in automatically with the format: JOB# 43765 / 37 PCS / DUE DATE: 06/10/2026.',
      'If it is empty, type it using that same format.',
    ],
  },
  {
    title: 'Priority',
    points: [
      'Level 1 = most urgent (red) · Level 2 (orange) · Level 3 = normal (yellow) · Level 4 (blue) · Level 5 = least urgent (green).',
    ],
  },
  {
    title: 'Attachment and Out Service (required)',
    points: [
      'Attachment: every job must have an attached file (material cert, drawing, etc.). The job cannot be created without it.',
      'Out Service: also required, in English. State NDE or NO NDE and every outside service the job needs (phosphate, heat treat, plating...). e.g. "NO NDE > PHOSPHATE".',
    ],
  },
  {
    title: 'Create the job',
    points: [
      'Tap "Create Job". If JOB#, Due Date, Attachment or Out Service is missing, it is marked in red and the job is not created.',
      'The same rules apply when editing a job (Edit Job).',
      'The job always starts in NEW MATERIAL and is assigned automatically.',
      'If the reader fails or does not recognize the sheet, fill in the fields by hand and create it anyway.',
    ],
  },
];

function printGuide() {
  const steps = STEPS.map(
    (s, i) =>
      `<li><h3>${i + 1}. ${escHtml(s.title)}</h3><ul>${s.points
        .map((p) => `<li>${escHtml(p)}</li>`)
        .join('')}</ul></li>`
  ).join('');
  printHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>How to load a job - J&amp;F</title>
    <style>
      @page { margin: 14mm; }
      .print-page { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
      h1 { font-size: 20px; margin: 0 0 2px; }
      .sub { font-size: 11px; letter-spacing: 2px; color: #555; margin-bottom: 14px; }
      ol { list-style: none; padding: 0; margin: 0; }
      ol > li { border: 1px solid #ccc; border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; break-inside: avoid; }
      h3 { font-size: 14px; margin: 0 0 4px; }
      ul { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.45; }
    </style></head><body>
    <h1>How to load a job (New Job)</h1>
    <div class="sub">J&amp;F MACHINE SHOP — JOB TRACKER</div>
    <ol>${steps}</ol>
  </body></html>`);
}

export function NewJobGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-primary/10 transition-colors"
      >
        <BookOpen size={16} className="text-primary flex-shrink-0" />
        <span className="font-semibold text-sm text-card-foreground flex-1">How to load a job — Step-by-step instructions</span>
        <ChevronDown size={18} className={`text-primary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <ol className="space-y-2">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3 rounded-lg bg-card border border-border p-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-card-foreground">{s.title}</p>
                  <ul className="mt-1 space-y-0.5 list-disc pl-4 text-xs text-muted-foreground">
                    {s.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={printGuide}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-background text-xs font-semibold hover:bg-muted"
          >
            <Printer size={14} />
            Print / Save as PDF
          </button>
        </div>
      )}
    </div>
  );
}
