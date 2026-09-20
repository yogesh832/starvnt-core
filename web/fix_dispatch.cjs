const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'vendor', 'pages', 'BusinessPages.jsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  `          if (res.ok && res.profilePicUrl) {
            setProfilePicUrl(res.profilePicUrl);
          }`,
  `          if (res.ok && res.profilePicUrl) {
            setProfilePicUrl(res.profilePicUrl);
            window.dispatchEvent(new Event('vendorProfileUpdated'));
          }`
);

content = content.replace(
  `                              if (res.ok) setProfilePicUrl('');`,
  `                              if (res.ok) {
                                setProfilePicUrl('');
                                window.dispatchEvent(new Event('vendorProfileUpdated'));
                              }`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Added dispatch events');
