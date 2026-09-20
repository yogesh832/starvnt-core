const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'customer', 'CustomerPortal.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Sidebar avatar
content = content.replace(
  `          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-xs font-bold shrink-0">\n            {firstName[0]?.toUpperCase()}\n          </div>`,
  `          {user?.avatarUrl ? (\n            <img src={user.avatarUrl} alt="Profile" className="w-8 h-8 rounded-full object-cover shrink-0" />\n          ) : (\n            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-xs font-bold shrink-0">\n              {firstName[0]?.toUpperCase()}\n            </div>\n          )}`
);

// Mobile header avatar
content = content.replace(
  `          <div className="ml-auto w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-xs font-bold">\n            {firstName[0]?.toUpperCase()}\n          </div>`,
  `          <div className="ml-auto">\n            {user?.avatarUrl ? (\n              <img src={user.avatarUrl} alt="Profile" className="w-8 h-8 rounded-full object-cover" />\n            ) : (\n              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-xs font-bold">\n                {firstName[0]?.toUpperCase()}\n              </div>\n            )}\n          </div>`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed CustomerPortal avatar');
