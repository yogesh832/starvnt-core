const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'vendor', 'pages', 'BusinessPages.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add state variables
content = content.replace(
  `  const [activation, setActivation] = useState(null);\n  const [saved, setSaved] = useState(false);`,
  `  const [activation, setActivation] = useState(null);\n  const [saved, setSaved] = useState(false);\n  const [profilePicUrl, setProfilePicUrl] = useState('');\n  const [uploadingPic, setUploadingPic] = useState(false);\n  const picInputRef = useRef(null);`
);

// 2. Add profilePicUrl load logic
content = content.replace(
  `          bio: profRes.vendor.bio || '',\n        });\n      }\n      if (actRes.ok && actRes.status) {`,
  `          bio: profRes.vendor.bio || '',\n        });\n        if (profRes.vendor.profilePicUrl) {\n          setProfilePicUrl(profRes.vendor.profilePicUrl);\n        }\n      }\n      if (actRes.ok && actRes.status) {`
);

// 3. Add handleProfilePicUpload method before handleOpenAddLocation
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

// 4. Add the Profile Picture Card UI back!
const profilePictureCard = `
              {/* Profile Picture */}
              <Card title="Profile Picture">
                <div className="flex items-center gap-6">
                  <div className="relative group">
                    {profilePicUrl ? (
                      <img
                        src={profilePicUrl}
                        alt="Profile"
                        className="w-24 h-24 rounded-2xl object-cover border-2 border-gray-100 shadow-sm"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white grid place-items-center text-3xl font-extrabold shadow-sm">
                        {(profile.businessName || 'B')[0].toUpperCase()}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => picInputRef.current?.click()}
                      disabled={uploadingPic}
                      className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-primary text-white grid place-items-center shadow-md hover:bg-primary-dark transition cursor-pointer disabled:opacity-60"
                      title="Change profile picture"
                    >
                      <Icon name="edit" size={14} />
                    </button>
                    <input
                      ref={picInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleProfilePicUpload}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-sm text-navy">
                      {profile.businessName || 'Your Brand'}
                    </h3>
                    <p className="text-xs text-muted mt-0.5">
                      {profile.category || 'Setup Pending'} · {profile.location || 'City not set'}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => picInputRef.current?.click()}
                        disabled={uploadingPic}
                        className="text-xs font-bold text-primary hover:underline cursor-pointer disabled:opacity-60"
                      >
                        {uploadingPic ? 'Uploading…' : profilePicUrl ? 'Change Photo' : 'Upload Photo'}
                      </button>
                      {profilePicUrl && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await externalApi.call('/vendor/profile/picture', {
                                method: 'PUT',
                                body: { image: '' },
                              });
                              if (res.ok) setProfilePicUrl('');
                            } catch (err) {
                              alert(\`Could not remove picture: \${err.message}\`);
                            }
                          }}
                          className="text-xs font-semibold text-rose-500 hover:text-rose-700 cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-muted mt-1.5">
                      Recommended: Square image, at least 400×400px. Max 5 MB.
                    </p>
                  </div>
                </div>
              </Card>
`;
content = content.replace(
  `          {/* TAB 1: Business Profile */}\n          {activeTab === 'profile' && (\n            <div className="space-y-5">\n              <Card title="Business Profile Details">`,
  `          {/* TAB 1: Business Profile */}\n          {activeTab === 'profile' && (\n            <div className="space-y-5">\n${profilePictureCard}\n              <Card title="Business Profile Details">`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Restored profile picture upload feature');
