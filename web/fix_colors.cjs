const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'theme.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');

const overrides = `
/* Colored Surface Overrides for Dark Mode */
html.dark .bg-emerald-50,
html.dark .bg-emerald-50\\/50,
html.dark .bg-emerald-50\\/80 { background-color: rgba(16, 31, 25, 0.9) !important; }
html.dark .bg-emerald-100 { background-color: rgba(26, 46, 36, 0.9) !important; }
html.dark .border-emerald-200 { border-color: #1e402d !important; }
html.dark .text-emerald-900, html.dark .text-emerald-800, html.dark .text-emerald-700 { color: #34d399 !important; }
html.dark .text-emerald-600 { color: #10b981 !important; }

html.dark .bg-amber-50,
html.dark .bg-amber-50\\/40,
html.dark .bg-amber-50\\/70 { background-color: rgba(41, 30, 19, 0.9) !important; }
html.dark .bg-amber-100 { background-color: rgba(61, 43, 24, 0.9) !important; }
html.dark .border-amber-200 { border-color: #5c3d1f !important; }
html.dark .text-amber-950, html.dark .text-amber-900, html.dark .text-amber-800 { color: #fbbf24 !important; }

html.dark .bg-rose-100 { background-color: rgba(59, 29, 36, 0.9) !important; }
html.dark .text-rose-800 { color: #fda4af !important; }

html.dark .bg-purple-50 { background-color: rgba(37, 29, 56, 0.9) !important; }
html.dark .text-purple-600 { color: #c084fc !important; }

html.dark .bg-sky-50 { background-color: rgba(27, 42, 58, 0.9) !important; }
html.dark .text-sky-600 { color: #7dd3fc !important; }

html.dark .from-purple-50\\/70 { --tw-gradient-from: #251d38 var(--tw-gradient-from-position) !important; }
html.dark .via-white { --tw-gradient-via: #1a1d2e var(--tw-gradient-via-position) !important; }
html.dark .to-amber-50\\/40 { --tw-gradient-to: #291e13 var(--tw-gradient-to-position) !important; }
`;

cssContent += overrides;
fs.writeFileSync(cssPath, cssContent, 'utf8');
console.log('Added dark mode color overrides to theme.css');
