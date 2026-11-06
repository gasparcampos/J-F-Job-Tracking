'use client';

import { useState } from 'react';
import { StickyNote } from 'lucide-react';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';

const LONG = 60;

/**
 * Short notes show inline. Long ones (e.g. a deviation write-up) collapse
 * into a small box; hovering (or tapping, on phones) opens the full note
 * in a floating panel so it doesn't take over the table row.
 */
export function LongNote({
  text,
  className = '',
  label,
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (text.length <= LONG) {
    return <span className={`text-[11px] whitespace-nowrap flex-shrink-0 ${className}`}>{text}</span>;
  }
  // "• SN #1 ... • SN #2 ..." reads better one bullet per line.
  const pretty = text.replace(/\s+•\s*/g, '\n• ').trim();
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex items-center gap-1 max-w-[190px] flex-shrink-0 text-[11px] border border-current/30 bg-current/5 rounded-md px-1.5 py-0.5 cursor-help ${className}`}
        >
          <StickyNote size={11} className="flex-shrink-0" />
          <span className="truncate">{text}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-[440px] max-w-[90vw] p-0">
        {label && (
          <div className={`px-4 pt-3 text-[10px] font-bold uppercase tracking-wider ${className}`}>{label}</div>
        )}
        <div className="px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap max-h-[50vh] overflow-y-auto">
          {pretty}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
