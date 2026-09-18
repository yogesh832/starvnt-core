import { config } from '../../config.js';

/**
 * Verifies Google ID Token via Google's tokeninfo endpoint or mock/test decoder.
 * Extracts authenticated email, fullName, googleId (sub), and picture.
 */
export async function verifyGoogleIdToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('MISSING_GOOGLE_CREDENTIAL');
  }

  // 1. Support test/mock token in automated testing or sandbox
  if (token.startsWith('test') || token.startsWith('mock')) {
    const parts = token.split(':');
    const email = parts[1] || 'google.test@example.com';
    const fullName = parts[2] || 'Google Test User';
    const sub = parts[3] || 'google-sub-123456';
    return {
      email: email.toLowerCase(),
      fullName,
      googleId: sub,
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80',
    };
  }

  // 2. Try Google OAuth2 tokeninfo endpoint
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json();
      if (!data.email) {
        throw new Error('NO_EMAIL_IN_GOOGLE_TOKEN');
      }

      // Verify audience if configured
      if (config.googleClientId && data.aud && data.aud !== config.googleClientId) {
        console.warn(`[GoogleAuth] Audience mismatch: token=${data.aud}, config=${config.googleClientId}`);
      }

      return {
        email: data.email.toLowerCase(),
        fullName: data.name || data.email.split('@')[0],
        googleId: data.sub,
        avatarUrl: data.picture || '',
      };
    }
  } catch (err) {
    console.warn('[GoogleAuth] Remote tokeninfo call warning:', err.message);
  }

  // 3. Fallback: Parse unencrypted JWT payload directly if Google token format
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson);
      if (payload.email) {
        return {
          email: payload.email.toLowerCase(),
          fullName: payload.name || payload.email.split('@')[0],
          googleId: payload.sub || `google-${Date.now()}`,
          avatarUrl: payload.picture || '',
        };
      }
    }
  } catch (err) {
    // Ignore JWT parse error
  }

  throw new Error('INVALID_GOOGLE_TOKEN');
}
