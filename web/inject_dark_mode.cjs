const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'vendor', 'pages', 'BusinessPages.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add ThemeContext import
if (!content.includes('useTheme')) {
  content = content.replace(
    `import { useSearchParams } from 'react-router-dom';`,
    `import { useSearchParams } from 'react-router-dom';\nimport { useTheme } from '../../../lib/ThemeContext';`
  );
}

// 2. Add useTheme to ProfilePage
if (!content.includes('const { isDarkMode, toggleTheme } = useTheme();')) {
  content = content.replace(
    `  const activeTab = searchParams.get('tab') || defaultTab || 'profile';`,
    `  const activeTab = searchParams.get('tab') || defaultTab || 'profile';\n  const { isDarkMode, toggleTheme } = useTheme();`
  );
}

// 3. Inject Dark Mode toggle card right above Profile Picture Card
const darkModeCard = `
              {/* Dark Mode Toggle */}
              <Card title="Display Settings">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-navy">Dark Mode</h3>
                    <p className="text-xs text-muted mt-0.5">Toggle the application theme</p>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className="w-12 h-6 rounded-full bg-gray-200 dark:bg-primary relative transition-colors"
                  >
                    <div className={\`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform \${isDarkMode ? 'translate-x-7' : 'translate-x-1'}\`} />
                  </button>
                </div>
              </Card>
`;

if (!content.includes('Display Settings')) {
  content = content.replace(
    `              {/* Profile Picture */}`,
    `${darkModeCard}\n              {/* Profile Picture */}`
  );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Added Dark Mode toggle to Profile page!');
