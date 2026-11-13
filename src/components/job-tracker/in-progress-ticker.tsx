/**
 * Yellow "IN PROGRESS" ticker that scrolls left to right in a seamless loop.
 * Used on the shop board (login), the admin Dashboard and the Kanban cards.
 * Styles live in globals.css (.marquee / .marquee-track / .marquee-text).
 */
export function InProgressTicker({ className = '', size = 10 }: { className?: string; size?: number }) {
  return (
    <div className={`marquee rounded bg-black/40 py-0.5 ${className}`} aria-label="In progress">
      {/* Two identical halves, so sliding by half a track width loops without a jump. */}
      <div className="marquee-track" aria-hidden="true">
        {[0, 1].map((half) => (
          <span key={half} className="flex">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="marquee-text px-3" style={{ fontSize: size }}>
                » IN PROGRESS
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
