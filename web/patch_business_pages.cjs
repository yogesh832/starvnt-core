const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/vendor/pages/BusinessPages.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const googleSection = `
      {/* Google Rating & Reviews Section */}
      <div className="mt-8 pt-8 border-t border-gray-100">
        <h3 className="font-extrabold text-lg text-navy mb-4 flex items-center gap-2">
          <Icon name="star" size={20} className="text-yellow-500" />
          Google Rating & Reviews
        </h3>
        {loadingGoogle ? (
          <div className="text-sm text-muted">Loading Google Maps data...</div>
        ) : googleInfo ? (
          googleInfo.notFound ? (
            <div className="text-sm font-semibold text-amber-800 bg-amber-50 p-4 rounded-2xl border border-amber-200">
              Google Business listing not found. Make sure your Business Name and Location exactly match Google Maps.
            </div>
          ) : googleInfo.matches ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted">Multiple matches found. Please contact Admin to link the correct listing, or we will automatically link it once verified.</p>
              {googleInfo.matches.map(m => (
                <div key={m.placeId} className="p-3 border border-gray-200 rounded-xl bg-gray-50">
                  <div className="font-bold text-navy">{m.businessName}</div>
                  <div className="text-xs text-muted mt-1">{m.address}</div>
                  <div className="text-xs font-semibold text-yellow-600 mt-1">Rating: {m.rating} ({m.reviewCount} reviews)</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-4xl font-extrabold text-navy">{googleInfo.rating}</div>
                <div>
                  <div className="flex text-yellow-500">
                    {'★'.repeat(Math.round(googleInfo.rating))}{'☆'.repeat(5 - Math.round(googleInfo.rating))}
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
                        <span className="text-yellow-500 text-xs">{'★'.repeat(r.rating)}</span>
                      </div>
                      <p className="text-muted text-xs line-clamp-3">{r.text?.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ) : null}
      </div>
`;

if (!content.includes('Google Rating & Reviews')) {
  // Insert before the profile form closes
  content = content.replace(
    /<\/form>\s*<\/Card>\s*<\/div>\s*\)\}\s*\{\/\* TAB 2:/,
    googleSection + '\n                </form>\n              </Card>\n            </div>\n          )}\n\n          {/* TAB 2:'
  );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched BusinessPages.jsx');
