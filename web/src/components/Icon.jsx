// Small inline icons (24 px grid, stroke = currentColor). No packages. Each has an aria-label, or pass
// label={null} when the text beside it already says the same thing (then it is hidden from screen readers).
const P = {
  bus: <><rect x="5" y="3" width="14" height="14" rx="3" /><path d="M5 10h14M8 20v-3M16 20v-3" /><circle cx="8.5" cy="13.5" r="0.6" /><circle cx="15.5" cy="13.5" r="0.6" /></>,
  walk: <><circle cx="13" cy="4" r="1.6" /><path d="M10 21l2-6 3 3v3M9 12l2-4 3 1 2 3M12 15l-1-5" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  dollar: <><path d="M12 3v18" /><path d="M16.5 7.5c-.8-1.3-2.4-2-4.5-2-2.5 0-4 1.2-4 3s1.6 2.6 4 3.2 4.5 1.4 4.5 3.3-1.7 3.3-4.5 3.3c-2.2 0-3.9-.8-4.7-2.2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  bed: <><path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" /><circle cx="7" cy="11" r="1.6" /></>,
  laundry: <><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="13" r="4.5" /><path d="M7.5 6.5h.01M10.5 6.5h.01" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l3 3M14 9l2 2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
};

export const ICON_LABELS = { bus: 'Bus', walk: 'Walk', moon: 'Late nights', dollar: 'Rent', clock: 'Travel time', bed: 'Room', laundry: 'Laundry', calendar: 'Tour', star: 'Best', key: 'Book', check: 'Done' };

export default function Icon({ name, size = 16, label, className = '' }) {
  const body = P[name];
  if (!body) return null;
  const text = label === undefined ? ICON_LABELS[name] : label;
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role={text ? 'img' : undefined}
      aria-label={text || undefined} aria-hidden={text ? undefined : true} focusable="false">
      {body}
    </svg>
  );
}

// Pick an icon for a one-line fact ("18 min to Beyster Building by bus", "A ride home for every late trip").
export function iconFor(text) {
  const t = String(text).toLowerCase();
  if (/budget|\$|rent/.test(t)) return 'dollar';
  if (/late|night|dark|ride home/.test(t)) return 'moon';
  if (/by bus|bus /.test(t)) return 'bus';
  if (/on foot|walk/.test(t)) return 'walk';
  if (/travel|min|h \d+ min/.test(t)) return 'clock';
  if (/laundry|washer/.test(t)) return 'laundry';
  if (/room|bed|sq ft/.test(t)) return 'bed';
  return null;
}
