const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'theme.css');
let content = fs.readFileSync(filePath, 'utf8');

const overrides = `
/* Accent Text Colors for Dark Mode */
html.dark .text-amber-500 { color: #f59e0b !important; }
html.dark .text-amber-600 { color: #fbbf24 !important; }
html.dark .text-amber-700 { color: #fcd34d !important; }
html.dark .text-amber-800 { color: #fde68a !important; }
html.dark .text-amber-900 { color: #fef3c7 !important; }
html.dark .text-amber-950 { color: #fffbeb !important; }

html.dark .text-emerald-500 { color: #10b981 !important; }
html.dark .text-emerald-600 { color: #34d399 !important; }
html.dark .text-emerald-700 { color: #6ee7b7 !important; }
html.dark .text-emerald-800 { color: #a7f3d0 !important; }
html.dark .text-emerald-900 { color: #d1fae5 !important; }

html.dark .text-rose-500 { color: #f43f5e !important; }
html.dark .text-rose-600 { color: #fb7185 !important; }
html.dark .text-rose-700 { color: #fda4af !important; }
html.dark .text-red-500 { color: #ef4444 !important; }
html.dark .text-red-600 { color: #f87171 !important; }
html.dark .text-red-700 { color: #fca5a5 !important; }

html.dark .text-sky-500 { color: #0ea5e9 !important; }
html.dark .text-sky-600 { color: #38bdf8 !important; }
html.dark .text-sky-700 { color: #7dd3fc !important; }

html.dark .text-indigo-500 { color: #6366f1 !important; }
html.dark .text-indigo-600 { color: #818cf8 !important; }
html.dark .text-indigo-700 { color: #a5b4fc !important; }

/* Accent Border Colors for Dark Mode */
html.dark .border-amber-200 { border-color: rgba(245, 158, 11, 0.3) !important; }
html.dark .border-emerald-200 { border-color: rgba(16, 185, 129, 0.3) !important; }
html.dark .border-rose-200 { border-color: rgba(244, 63, 94, 0.3) !important; }
html.dark .border-red-200 { border-color: rgba(239, 68, 68, 0.3) !important; }
html.dark .border-sky-200 { border-color: rgba(14, 165, 233, 0.3) !important; }
html.dark .border-indigo-200 { border-color: rgba(99, 102, 241, 0.3) !important; }
`;

content = content + overrides;
fs.writeFileSync(filePath, content, 'utf8');
console.log('Appended dark mode text and border overrides to theme.css!');
