const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'vendor', 'pages', 'BusinessPages.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add state variables for ProfilePic
content = content.replace(
  `  const [activation, setActivation] = useState(null);\n  const [saved, setSaved] = useState(false);`,
  `  const [activation, setActivation] = useState(null);\n  const [saved, setSaved] = useState(false);\n  const [profilePicUrl, setProfilePicUrl] = useState('');\n  const [uploadingPic, setUploadingPic] = useState(false);\n  const picInputRef = React.useRef(null);`
);

// Add React to ProfileManager if not there? Wait, useRef is probably not imported. Let's just use React.useRef.

// 2. Load profilePicUrl
content = content.replace(
  `          bio: profRes.vendor.bio || '',\n        });\n      }\n      if (actRes.ok && actRes.status) {`,
  `          bio: profRes.vendor.bio || '',\n        });\n        if (profRes.vendor.profilePicUrl) {\n          setProfilePicUrl(profRes.vendor.profilePicUrl);\n        }\n      }\n      if (actRes.ok && actRes.status) {`
);

// 3. Add handleProfilePicUpload function
const uploadMethod = `
  async function handleProfilePicUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPG, PNG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5 MB');
      return;
    }
    try {
      setUploadingPic(true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await externalApi.call('/vendor/profile/picture', {
            method: 'PUT',
            body: { image: reader.result },
          });
          if (res.ok && res.profilePicUrl) {
            setProfilePicUrl(res.profilePicUrl);
            window.dispatchEvent(new Event('vendorProfileUpdated'));
          }
        } catch (err) {
          alert(\`Could not upload profile picture: \${err.message}\`);
        } finally {
          setUploadingPic(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploadingPic(false);
      alert(\`Error reading file: \${err.message}\`);
    }
  }
`;

content = content.replace(
  `  function handleOpenAddLocation() {`,
  `${uploadMethod}\n  function handleOpenAddLocation() {`
);

// 4. Inject Profile Picture Card
const profilePictureCard = `
              {/* Profile Picture */}
              <Card title="Profile Picture">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="relative group shrink-0">
                    {profilePicUrl ? (
                      <img
                        src={profilePicUrl}
                        alt="Profile"
                        className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-4 border-white shadow-md dark:border-[#1a1d2e]"
                      />
                    ) : (
                      <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-primary to-[#9b6dff] text-white grid place-items-center text-3xl font-extrabold shadow-md border-4 border-white dark:border-[#1a1d2e]">
                        {(profile.businessName || 'B')[0].toUpperCase()}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => picInputRef.current?.click()}
                      disabled={uploadingPic}
                      className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-primary text-white grid place-items-center shadow-lg hover:bg-primary-dark transition cursor-pointer disabled:opacity-60 border-2 border-white dark:border-[#1a1d2e]"
                      title="Change profile picture"
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    <input
                      ref={picInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleProfilePicUpload}
                    />
                  </div>
                  <div className="flex-1 min-w-0 text-center sm:text-left">
                    <h3 className="font-extrabold text-base text-navy">
                      {profile.businessName || 'Your Brand'}
                    </h3>
                    <p className="text-sm text-muted mt-0.5">
                      {profile.category || 'Setup Pending'} &middot; {profile.location || 'City not set'}
                    </p>
                    <div className="mt-4 flex items-center justify-center sm:justify-start gap-4">
                      <button
                        type="button"
                        onClick={() => picInputRef.current?.click()}
                        disabled={uploadingPic}
                        className="text-xs font-bold bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary-dark transition shadow-sm cursor-pointer disabled:opacity-60"
                      >
                        {uploadingPic ? 'Uploading...' : profilePicUrl ? 'Change Photo' : 'Upload Photo'}
                      </button>
                      {profilePicUrl && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm('Remove profile picture?')) return;
                            try {
                              const res = await externalApi.call('/vendor/profile/picture', {
                                method: 'PUT',
                                body: { image: '' },
                              });
                              if (res.ok) {
                                setProfilePicUrl('');
                                window.dispatchEvent(new Event('vendorProfileUpdated'));
                              }
                            } catch (err) {
                              alert(\`Could not remove picture: \${err.message}\`);
                            }
                          }}
                          className="text-xs font-bold text-rose-500 bg-rose-50 px-4 py-2 rounded-xl hover:bg-rose-100 dark:bg-rose-950/40 transition cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-muted mt-2.5">
                      Recommended: Square image, at least 400x400px. Max 5 MB.
                    </p>
                  </div>
                </div>
              </Card>
`;

content = content.replace(
  `          {/* TAB 1: Business Profile */}\n          {activeTab === 'profile' && (\n            <div className="space-y-5">\n              <Card title="Business Profile Details">`,
  `          {/* TAB 1: Business Profile */}\n          {activeTab === 'profile' && (\n            <div className="space-y-5">\n${profilePictureCard}\n              <Card title="Business Profile Details">`
);

// 5. Fix mobile responsiveness for sub-sidebar (which we did today)
const sidebarTarget = `        <div className="grid lg:grid-cols-[240px_1fr] gap-6 items-start">
          {/* Profile Sub-Sidebar Navigation */}
          <div className="bg-white rounded-2xl p-2.5 border border-gray-100 shadow-xs space-y-1 sticky top-20">
            <div className="px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-muted">
              Profile Sections
            </div>
            {SUB_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={\`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition cursor-pointer \${
                    isActive
                      ? 'bg-primary-soft text-primary font-bold shadow-xs'
                      : 'text-ink/70 hover:bg-lavender hover:text-navy font-medium'
                  }\`}
                >
                  <div className={\`w-8 h-8 rounded-lg grid place-items-center shrink-0 \${
                    isActive ? 'bg-primary text-white' : 'bg-gray-100 text-muted'
                  }\`}>
                    <Icon name={tab.icon === 'mapPin' ? 'availability' : tab.icon} size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate leading-tight">{tab.label}</div>
                    <div className="text-[10px] text-muted truncate leading-tight mt-0.5">{tab.desc}</div>
                  </div>
                </button>
              );
            })}

            <div className="pt-3 mt-2 border-t border-gray-100 px-3 pb-1">`;

const sidebarReplacement = `        <div className="grid lg:grid-cols-[240px_1fr] gap-6 items-start">
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

            <div className="pt-3 mt-2 border-t border-gray-100 px-3 pb-1">`;

content = content.replace(sidebarTarget, sidebarReplacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Restored BusinessPages correctly!');
