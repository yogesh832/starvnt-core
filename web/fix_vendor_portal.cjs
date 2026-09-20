const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'vendor', 'VendorPortal.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add vendorProfileUpdated listener and fix clear
content = content.replace(
  `          if (res.vendor.profilePicUrl) setProfilePicUrl(res.vendor.profilePicUrl);\n        }\n      } catch (err) {\n        if (user?.vendorOrganization?.businessName) {\n          setBusinessName(user.vendorOrganization.businessName);\n        }\n      }\n    }\n    loadProfile();\n  }, [user]);`,
  `          setProfilePicUrl(res.vendor.profilePicUrl || '');\n        }\n      } catch (err) {\n        if (user?.vendorOrganization?.businessName) {\n          setBusinessName(user.vendorOrganization.businessName);\n        }\n      }\n    }\n    loadProfile();\n\n    window.addEventListener('vendorProfileUpdated', loadProfile);\n    return () => window.removeEventListener('vendorProfileUpdated', loadProfile);\n  }, [user]);`
);

// 2. Sidebar profile pic with fallback to user?.avatarUrl
content = content.replace(
  `          <div className="w-9 h-9 rounded-full bg-primary text-white grid place-items-center text-xs font-bold shrink-0">\n            {user?.fullName?.[0]?.toUpperCase()}\n          </div>\n          <div className="flex-1 min-w-0">`,
  `          {profilePicUrl || user?.avatarUrl ? (\n            <img \n              src={profilePicUrl || user?.avatarUrl} \n              alt={user?.fullName || 'Profile'} \n              className="w-9 h-9 rounded-full object-cover shrink-0 border border-gray-200"\n            />\n          ) : (\n            <div className="w-9 h-9 rounded-full bg-primary text-white grid place-items-center text-xs font-bold shrink-0">\n              {user?.fullName?.[0]?.toUpperCase()}\n            </div>\n          )}\n          <div className="flex-1 min-w-0">`
);

// 3. Header profile pic with fallback to user?.avatarUrl
content = content.replace(
  `              {profilePicUrl ? (\n                <img src={profilePicUrl} alt="Profile" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover shadow-xs" />\n              ) : (\n                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-primary to-primary-dark text-white grid place-items-center text-xs sm:text-sm font-bold shadow-xs">`,
  `              {profilePicUrl || user?.avatarUrl ? (\n                <img src={profilePicUrl || user?.avatarUrl} alt="Profile" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover shadow-xs" />\n              ) : (\n                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-primary to-primary-dark text-white grid place-items-center text-xs sm:text-sm font-bold shadow-xs">`
);

// 4. Search bar dark mode styling
content = content.replace(
  `          <div className="flex-1 max-w-xs sm:max-w-sm md:max-w-md flex items-center gap-2 bg-lavender/80 rounded-xl px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-muted min-w-0">\n            <Icon name="search" size={15} className="shrink-0 text-muted/80" />\n            <input\n              className="bg-transparent flex-1 outline-none placeholder:text-muted/70 text-xs sm:text-sm w-full min-w-0"\n              placeholder="Search enquiries, bookings, events..."\n            />\n          </div>`,
  `          <div className="flex-1 max-w-xs sm:max-w-sm md:max-w-md flex items-center gap-2.5 bg-gray-50 border border-gray-200/80 rounded-xl px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-navy min-w-0 shadow-inner focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all">\n            <Icon name="search" size={15} className="shrink-0 text-muted" />\n            <input\n              className="bg-transparent flex-1 outline-none placeholder:text-muted/60 text-xs sm:text-sm w-full min-w-0 font-medium"\n              placeholder="Search enquiries, bookings..."\n            />\n          </div>`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Restored all fixes in VendorPortal');
