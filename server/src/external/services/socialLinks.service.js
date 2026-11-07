const account = /^\/[a-z0-9_.-]+\/?$/i;
const withHandle = /^\/@[a-z0-9_.-]+\/?$/i;
const platforms = {
  facebook: { label: 'Facebook', hosts: ['facebook.com'], path: /^\/(?:[a-z0-9_.-]+|pages\/[a-z0-9_.-]+\/\d+)\/?$/i, reserved: ['login', 'share', 'sharer', 'l.php', 'redirect', 'watch', 'events', 'reel', 'help'] },
  instagram: { label: 'Instagram', hosts: ['instagram.com'], path: account, reserved: ['p', 'reel', 'accounts', 'stories', 'explore'] },
  threads: { label: 'Threads', hosts: ['threads.net', 'threads.com'], path: withHandle },
  linkedin: { label: 'LinkedIn', hosts: ['linkedin.com'], path: /^\/(?:in|company)\/[a-z0-9_.-]+\/?$/i },
  x: { label: 'X', hosts: ['x.com', 'twitter.com'], path: /^\/[a-z0-9_]{1,15}\/?$/i, reserved: ['home', 'search', 'intent', 'share', 'explore', 'login', 'settings', 'i'] },
  pinterest: { label: 'Pinterest', hosts: ['pinterest.com', 'pinterest.co.uk', 'pinterest.ca', 'pinterest.de', 'pinterest.fr'], path: account, reserved: ['pin', 'search', 'ideas', 'login'] },
  snapchat: { label: 'Snapchat', hosts: ['snapchat.com'], path: /^\/add\/[a-z0-9_.-]+\/?$/i },
  tiktok: { label: 'TikTok', hosts: ['tiktok.com'], path: withHandle },
  reddit: { label: 'Reddit', hosts: ['reddit.com'], path: /^\/(?:u|user|r)\/[a-z0-9_-]+\/?$/i },
  bluesky: { label: 'Bluesky', hosts: ['bsky.app'], path: /^\/profile\/(?:[a-z0-9.-]+\.[a-z0-9-]+|did:[a-z0-9:%.-]+)\/?$/i },
  youtube: { label: 'YouTube', hosts: ['youtube.com'], path: /^\/(?:@[\p{L}\p{N}_.-]+|(?:channel|c|user)\/[a-z0-9_.-]+)\/?$/iu },
  vimeo: { label: 'Vimeo', hosts: ['vimeo.com'], path: /^\/[a-z][a-z0-9_.-]+\/?$/i, reserved: ['watch', 'search', 'upload', 'log_in', 'join', 'ondemand'] },
  whatsapp: { label: 'WhatsApp', hosts: ['wa.me'], path: /^\/(?:[1-9]\d{6,14}|(?:message|channel)\/[a-z0-9_-]+)\/?$/i },
  telegram: { label: 'Telegram', hosts: ['t.me', 'telegram.me'], path: /^\/[a-z][a-z0-9_]{3,31}\/?$/i, reserved: ['share', 'proxy', 'login', 'addstickers', 'setlanguage'] },
  messenger: { label: 'Messenger', hosts: ['m.me'], path: account },
  discord: { label: 'Discord', hosts: ['discord.gg', 'discord.com'], path: /^\/(?:invite\/|users\/)?[a-z0-9_-]+\/?$/i, reserved: ['login', 'register', 'channels', 'developers', 'app'] },
  signal: { label: 'Signal', hosts: ['signal.me'], path: /^\/$/, hash: /^#(?:p\/\+[1-9]\d{6,14}|eu\/[a-z0-9_-]+)$/i },
  viber: { label: 'Viber', hosts: ['invite.viber.com'], path: /^\/$/, query: 'g2' },
  line: { label: 'LINE', hosts: ['line.me'], path: /^\/(?:R\/)?ti\/p\/[~@a-z0-9_.%-]+\/?$/i },
};

export const socialPlatforms = Object.entries(platforms).map(([id, { label }]) => ({ id, label }));

export function validateSocialUrl(platform, rawUrl) {
  if (typeof platform !== 'string' || !Object.hasOwn(platforms, platform) || typeof rawUrl !== 'string') return null;
  const url = rawUrl.trim();
  if (url.length > 1024 || !/^https:\/\//i.test(url) || /[\s\\\u0000-\u001f\u007f]/u.test(url)) return null;
  try {
    const rule = platforms[platform];
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const pathname = decodeURIComponent(parsed.pathname);
    if (!rule.hosts.includes(host) || parsed.username || parsed.password || parsed.port ||
        !rule.path.test(pathname) ||
        rule.reserved?.includes(pathname.split('/')[1]?.toLowerCase())) return null;
    if (platform === 'discord' && host === 'discord.com' && !/^\/(invite|users)\//.test(pathname)) return null;
    if (rule.hash ? !rule.hash.test(parsed.hash) : parsed.hash) return null;
    if (rule.query && !parsed.searchParams.get(rule.query)) return null;
    return url;
  } catch {
    return null;
  }
}

export function publicSocialLinks(links = []) {
  return links.flatMap(link => {
    if (link.public !== true) return [];
    const url = validateSocialUrl(link.platform, link.url);
    return url ? [{ platform: link.platform, label: platforms[link.platform].label, url }] : [];
  });
}
