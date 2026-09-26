const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/vendor/pages/BusinessPages.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// We need to:
// 1. Add searchQuery state
// 2. Add handleSearchGoogle function
// 3. Add handleLinkGoogle function (to call POST and link)
// 4. Update the Google Section UI

if (!content.includes('const [searchQuery, setSearchQuery]')) {
  content = content.replace(
    /const \[loadingGoogle, setLoadingGoogle\] = useState\(false\);/,
    `const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [linkingGoogle, setLinkingGoogle] = useState(false);`
  );
}

if (!content.includes('async function handleSearchGoogle')) {
  content = content.replace(
    /const loadGoogleInfo = useCallback\(async \(id\) => \{/,
    `const handleSearchGoogle = async (e) => {
    e.preventDefault();
    if (!vendorId || !searchQuery) return;
    try {
      setLoadingGoogle(true);
      const res = await externalApi.call(\`/vendors/\${vendorId}/google?q=\${encodeURIComponent(searchQuery)}\`);
      if (res.ok) {
        setGoogleInfo(res);
      }
    } catch (err) {
      console.warn('Error searching google:', err);
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleLinkGoogle = async (placeId) => {
    if (!vendorId) return;
    try {
      setLinkingGoogle(true);
      const res = await externalApi.call(\`/vendors/\${vendorId}/google\`, {
        method: 'POST',
        body: { placeId }
      });
      if (res.ok) {
        // Reload google info to fetch full details
        await loadGoogleInfo(vendorId);
      }
    } catch (err) {
      alert('Could not link profile: ' + err.message);
    } finally {
      setLinkingGoogle(false);
    }
  };

  const loadGoogleInfo = useCallback(async (id) => {`
  );
}

// Replace the Google UI Section
const oldGoogleSectionRegex = /\{\/\* Google Rating & Reviews Section \*\/\}.*?(?=\n\s*<\/form>)/s;

const newGoogleSection = `{/* Google Rating & Reviews Section */}
      <div className="mt-8 pt-8 border-t border-gray-100">
        <h3 className="font-extrabold text-lg text-navy mb-4 flex items-center gap-2">
          <Icon name="star" size={20} className="text-yellow-500" />
          Google Rating & Reviews
        </h3>
        
        {loadingGoogle || linkingGoogle ? (
          <div className="text-sm text-muted">Loading Google Maps data...</div>
        ) : googleInfo ? (
          googleInfo.matches ? (
            <div className="space-y-4">
              <div className="text-sm font-semibold text-amber-800 bg-amber-50 p-4 rounded-2xl border border-amber-200">
                Please search for your business on Google Maps and select the correct listing below to link it to your profile.
              </div>
              <form onSubmit={handleSearchGoogle} className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Bharat Tents House, Lucknow"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
                <button type="submit" className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold">Search</button>
              </form>
              
              {googleInfo.matches.length === 0 ? (
                <div className="text-sm text-muted">No results found for your search.</div>
              ) : (
                <div className="space-y-3 mt-4">
                  {googleInfo.matches.map(m => (
                    <div key={m.placeId} className="p-4 border border-gray-200 rounded-xl bg-gray-50 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-bold text-navy">{m.businessName}</div>
                        <div className="text-xs text-muted mt-1">{m.address}</div>
                        <div className="text-xs font-semibold text-yellow-600 mt-1">Rating: {m.rating} ({m.reviewCount} reviews)</div>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => handleLinkGoogle(m.placeId)}
                        className="whitespace-nowrap px-4 py-2 bg-white border border-gray-200 text-primary font-bold text-xs rounded-xl hover:bg-gray-50"
                      >
                        Link Profile
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-4xl font-extrabold text-navy">{googleInfo.rating}</div>
                <div>
                  <div className="flex text-yellow-500">
                    {'★'.repeat(Math.round(googleInfo.rating || 0))}{'☆'.repeat(5 - Math.round(googleInfo.rating || 0))}
                  </div>
                  <div className="text-sm font-semibold text-muted">{googleInfo.reviewCount} total reviews</div>
                </div>
                {googleInfo.googleMapsUrl && (
                  <a href={googleInfo.googleMapsUrl} target="_blank" rel="noreferrer" className="ml-auto text-sm font-bold text-primary hover:underline">
                    View on Google Maps ↗
                  </a>
                )}
              </div>
              
              {googleInfo.reviews && googleInfo.reviews.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-4 mt-4">
                  {googleInfo.reviews.slice(0, 4).map((r, i) => (
                    <div key={i} className="p-4 bg-lavender/30 border border-gray-100 rounded-2xl text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-navy text-xs">{r.authorAttribution?.displayName || 'Google User'}</span>
                        <span className="text-yellow-500 text-xs">{'★'.repeat(r.rating || 5)}</span>
                      </div>
                      <p className="text-muted text-xs line-clamp-3">{r.text?.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ) : null}
      </div>`;

content = content.replace(oldGoogleSectionRegex, newGoogleSection + '\n');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched BusinessPages.jsx for manual google search');
