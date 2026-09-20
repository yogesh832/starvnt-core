const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'vendor', 'VendorPortal.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add profilePicUrl state
if (!content.includes('const [profilePicUrl, setProfilePicUrl] = useState')) {
  content = content.replace(
    /const \[category, setCategory\] = useState\(''\);/,
    `const [category, setCategory] = useState('');\r?\n  const [profilePicUrl, setProfilePicUrl] = useState('');`
  );
}

// 2. Add to loadProfile
if (!content.includes('setProfilePicUrl(res.vendor.profilePicUrl')) {
  content = content.replace(
    /if \(res\.vendor\.category\) setCategory\(res\.vendor\.category\);/,
    `if (res.vendor.category) setCategory(res.vendor.category);\r?\n          setProfilePicUrl(res.vendor.profilePicUrl || '');`
  );
}

// 3. Add listener
if (!content.includes('vendorProfileUpdated')) {
  content = content.replace(
    /loadProfile\(\);\r?\n  \}, \[user\]\);/,
    `loadProfile();\r?\n\r?\n    const handleProfileUpdate = () => loadProfile();\r?\n    window.addEventListener('vendorProfileUpdated', handleProfileUpdate);\r?\n    return () => window.removeEventListener('vendorProfileUpdated', handleProfileUpdate);\r?\n  }, [user]);`
  );
}

// 4. Sidebar avatar
if (!content.includes('profilePicUrl || user?.avatarUrl')) {
  content = content.replace(
    /<div className="w-9 h-9 rounded-full bg-primary text-white grid place-items-center text-xs font-bold shrink-0">\s*\{user\?\.fullName\?\.\[0\]\?\.toUpperCase\(\)\}\s*<\/div>/,
    `{profilePicUrl || user?.avatarUrl ? (\r?\n            <img src={profilePicUrl || user?.avatarUrl} alt="Profile" className="w-9 h-9 rounded-full object-cover shrink-0 border border-gray-200" />\r?\n          ) : (\r?\n            <div className="w-9 h-9 rounded-full bg-primary text-white grid place-items-center text-xs font-bold shrink-0">\r?\n              {user?.fullName?.[0]?.toUpperCase()}\r?\n            </div>\r?\n          )}`
  );
}

// 5. Header avatar
if (!content.includes('className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover shadow-xs"')) {
  content = content.replace(
    /<div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-primary to-primary-dark text-white grid place-items-center text-xs sm:text-sm font-bold shadow-xs">\s*\{\(businessName \|\| user\?\.fullName \|\| 'VN'\)\.slice\(0, 2\)\.toUpperCase\(\)\}\s*<\/div>/,
    `{profilePicUrl || user?.avatarUrl ? (\r?\n                <img src={profilePicUrl || user?.avatarUrl} alt="Profile" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover shadow-xs" />\r?\n              ) : (\r?\n                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-primary to-primary-dark text-white grid place-items-center text-xs sm:text-sm font-bold shadow-xs">\r?\n                  {(businessName || user?.fullName || 'VN').slice(0, 2).toUpperCase()}\r?\n                </div>\r?\n              )}`
  );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Robust replacements applied!');
