/** Keep the public theme toggle independent of the workspace icon catalog. */
export default function ThemeIcon({ dark, size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={dark
      ? 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-16v2m0 18v2m9-11h-2M5 12H3m14.485-6.485l-1.414 1.414M6.929 18.071l-1.414 1.414M18.485 18.485l-1.414-1.414M6.929 6.929L5.515 5.515'
      : 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'} />
  </svg>;
}
