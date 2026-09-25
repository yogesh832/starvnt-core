import fs from 'fs';
const f = 'D:/starvnt-core/web/src/pages/vendor/pages/PortfolioPage.jsx';
let c = fs.readFileSync(f, 'utf8');

c = c.replace(/<div className="absolute top-3 right-3 flex items-center gap-1">\s*<StatusChip status={p\.status \|\| 'PUBLISHED'} \/>\s*<\/div>/g, 
`<div className="absolute top-3 right-3 flex items-center gap-1">
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      handleDeleteProject(p.projectName);
    }}
    className="w-6 h-6 rounded-md bg-black/40 hover:bg-red-600 text-white grid place-items-center backdrop-blur-sm transition"
    title="Delete Project"
  >
    <Icon name="trash" size={12} />
  </button>
  <StatusChip status={p.status || 'PUBLISHED'} />
</div>`);

fs.writeFileSync(f, c);
console.log("Success patch-del2");
