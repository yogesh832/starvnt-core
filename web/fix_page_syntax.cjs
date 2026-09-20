const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'vendor', 'pages', 'BusinessPages.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = `  return (
    <Page
              <span className={activation?.is100Percent`;

const replacementStr = `  return (
    <Page
      title="Vendor Profile & Business Hub"
      sub={\`\${profile.businessName || 'Your Brand'} — \${profile.category || 'Setup Pending'} · Central administration for brand profile, operational locations, KYC documents, and account settings.\`}
    >
      <div className="grid lg:grid-cols-[240px_1fr] gap-6 items-start">
        {/* Profile Sub-Sidebar Navigation */}
        <div className="bg-white rounded-2xl p-2.5 border border-gray-100 shadow-xs flex flex-col lg:sticky lg:top-20">
          <div className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-muted hidden lg:block">
            Profile Sections
          </div>
          <div className="flex overflow-x-auto lg:flex-col gap-2 pb-2 lg:pb-0 hide-scrollbar">
            {SUB_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={\`w-auto lg:w-full shrink-0 flex items-center gap-2 lg:gap-3 px-3 py-2 lg:py-2.5 rounded-xl text-left transition cursor-pointer \${
                    isActive
                      ? 'bg-primary-soft text-primary font-bold shadow-xs'
                      : 'text-ink/70 hover:bg-lavender hover:text-navy font-medium'
                  }\`}
                >
                  <div className={\`w-7 h-7 lg:w-8 lg:h-8 rounded-lg grid place-items-center shrink-0 \${
                    isActive ? 'bg-primary text-white' : 'bg-gray-100 text-muted'
                  }\`}>
                    <Icon name={tab.icon === 'mapPin' ? 'availability' : tab.icon} size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate leading-tight">{tab.label}</div>
                    <div className="text-[10px] text-muted truncate leading-tight mt-0.5 hidden lg:block">{tab.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-3 mt-2 border-t border-gray-100 px-3 pb-1">
            <div className="text-[11px] font-semibold text-muted">Profile Readiness</div>
            <div className="flex items-center justify-between text-xs font-bold text-navy mt-1">
              <span>{activation?.completionPercentage ?? 0}% Complete</span>
              <span className={activation?.is100Percent`;

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replacementStr);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Fixed Page component syntax error!');
} else {
  console.log('Target string not found, wait let me try regex');
  const fallbackRegex = /<Page\s*<span className=\{activation\?\.is100Percent/g;
  content = content.replace(fallbackRegex, replacementStr.replace('  return (\n    ', ''));
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Done with regex');
}
