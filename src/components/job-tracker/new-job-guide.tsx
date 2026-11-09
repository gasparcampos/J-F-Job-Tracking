'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, Printer } from 'lucide-react';
import { printHtml, escHtml } from '@/lib/print-html';

/**
 * Step-by-step instructions for loading a job, shown inside New Job as a
 * collapsible panel ("¿Cómo cargar un trabajo?") that can also be printed or
 * saved as PDF. Edit the steps here; the panel and the printout both use them.
 */
interface GuideStep {
  title: string;
  points: string[];
}

const STEPS: GuideStep[] = [
  {
    title: 'Ten a la mano la hoja del trabajo',
    points: ['La hoja de ruta / orden del cliente, en PDF o como foto (JPG, PNG).'],
  },
  {
    title: 'Sube el documento',
    points: [
      'En "Upload document (PDF or image)" toca el botón y escoge el archivo.',
      'Espera a que termine "Reading document…": la app lee la hoja y llena sola Customer, PO#, Line Item, JOB#, Quantity, DWG#, Part#, Due Date y el título.',
      'Abajo aparece la vista previa para que compares.',
    ],
  },
  {
    title: 'Revisa Job Details contra la hoja',
    points: [
      'Corrige cualquier dato que la lectura haya sacado mal o vacío.',
      'Customer: si no es Baker, Halliburton o Liberty, escoge "Other" y escribe el nombre.',
      'NAME (nombre de la pieza, ej. PLUG, HOUSING) no se llena solo: escríbelo.',
      'JOB# y Due Date son obligatorios.',
      'El JOB# no se puede repetir: si ya existe, la app avisa "Duplicate JOB#" y no lo crea.',
    ],
  },
  {
    title: 'Title / Description (obligatorio)',
    points: [
      'Se llena solo con el formato: JOB# 43765 / 37 PCS / DUE DATE: 06/10/2026.',
      'Si quedó vacío, escríbelo con ese mismo formato.',
    ],
  },
  {
    title: 'Initial Stage y Assign To',
    points: [
      'Initial Stage: normalmente NEW MATERIAL.',
      'Assign To: no hace falta escoger, la app asigna sola según el área (New Material → Gaspar).',
    ],
  },
  {
    title: 'Priority',
    points: [
      'Level 1 = más urgente (rojo) · Level 2 (naranja) · Level 3 = normal (amarillo) · Level 4 (azul) · Level 5 = menos urgente (verde).',
    ],
  },
  {
    title: 'Attachment y Out Service (obligatorios)',
    points: [
      'Attachment: todo trabajo debe llevar un archivo adjunto (certificado de material, plano, etc.). Sin él no se puede crear el trabajo.',
      'Out Service: también obligatorio y en inglés. Pon si lleva NDE o NO NDE y todos los servicios de fuera que lleva el trabajo (phosphate, heat treat, plating...). Ej. "NO NDE > PHOSPHATE".',
    ],
  },
  {
    title: 'Crea el trabajo',
    points: [
      'Toca "Create Job". Si falta JOB#, Due Date, Attachment u Out Service, se marcan en rojo y no deja crearlo.',
      'Las mismas reglas aplican al editar un trabajo (Edit Job).',
      'El trabajo aparece en el tablero en el área que escogiste.',
      'Si la lectura falla o no reconoce la hoja, llena los campos a mano y créalo igual.',
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
  printHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cómo cargar un trabajo - J&amp;F</title>
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
    <h1>Cómo cargar un trabajo (New Job)</h1>
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
        <span className="font-semibold text-sm text-card-foreground flex-1">¿Cómo cargar un trabajo? — Instrucciones paso a paso</span>
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
            Imprimir / Guardar como PDF
          </button>
        </div>
      )}
    </div>
  );
}
