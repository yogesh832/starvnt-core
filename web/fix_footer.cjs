const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'PublicFooter.jsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  'className="bg-white/85 backdrop-blur-xs border-t border-b border-gray-100 py-6 px-6 sm:px-12"',
  'className="bg-white/85 dark:bg-[#1a1d2e]/85 backdrop-blur-xs border-t border-b border-gray-100 dark:border-gray-800 py-6 px-6 sm:px-12"'
);

content = content.replace(
  'className="bg-white/95 border-t border-gray-100/80 py-12 px-6 sm:px-12"',
  'className="bg-white/95 dark:bg-[#1a1d2e]/95 border-t border-gray-100/80 dark:border-gray-800/80 py-12 px-6 sm:px-12"'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed PublicFooter backgrounds');
