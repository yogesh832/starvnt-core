/** Minimal inline SVG icon set — stroke icons matching the design system. */
const PATHS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  customers: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 9v-1a4 4 0 0 0-3-3.87M15 2.13a4 4 0 0 1 0 7.75',
  vendors: 'M3 9l1.5-5h15L21 9M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18M9 21v-7h6v7',
  events: 'M12 2l2.4 4.9 5.6.8-4 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.6-.8z',
  bookings: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  payments: 'M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20M6 15h4',
  operations: 'M13 2L3 14h7l-1 8 10-12h-7z',
  reports: 'M3 3v18h18M8 17v-5M13 17V8M18 17v-8',
  automation: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.9 3a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L16.5 2h-4L11.9 5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2.1l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.6 3h4l.6-3a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.06-.35.1-.7.1-1z',
  access: 'M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10zM9 12l2 2 4-4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.5-3a7.5 7.5 0 0 0-.1-1.2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-2-1.2L15.5 3h-3L12 5.5a7.6 7.6 0 0 0-2 1.2l-2.5-1-2 3.5 2.1 1.6a7.5 7.5 0 0 0 0 2.4l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 2 1.2l.5 2.5h3l.5-2.5a7.6 7.6 0 0 0 2-1.2l2.5 1 2-3.5-2.1-1.6c.07-.4.1-.8.1-1.2z',
  audit: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2l-4.35-4.35',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  quotes: 'M7 7h4v6c0 2.5-2 4.5-4 5M15 7h4v6c0 2.5-2 4.5-4 5',
  calendar: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14h.01M12 14h.01M16 14h.01',
  services: 'M20 7L9 18l-5-5M15 7h6v6',
  availability: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  documents: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  profile: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  mic: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6L9 17l-5-5',
  wallet: 'M20 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2zM16 14h.01M3 10h9',
  trend: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
};

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.7 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name] || PATHS.dashboard} />
    </svg>
  );
}
