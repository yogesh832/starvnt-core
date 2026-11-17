const providers = {
  google: {
    id: 'starvnt-google-signin',
    src: 'https://accounts.google.com/gsi/client',
    ready: () => Boolean(window.google?.accounts?.id),
    label: 'Google sign-in',
  },
  phone: {
    id: 'starvnt-phone-otp',
    src: 'https://verify.msg91.com/otp-provider.js',
    ready: () => typeof window.initSendOTP === 'function',
    label: 'Mobile OTP',
  },
};

const pending = new Map();

/** Only the selected sign-in method downloads its SDK. Failed loads can retry. */
export function loadAuthScript(name) {
  const provider = providers[name];
  if (!provider) return Promise.reject(new Error('Unsupported sign-in method.'));
  if (provider.ready()) return Promise.resolve();
  if (pending.has(name)) return pending.get(name);

  const job = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = provider.id;
    script.src = provider.src;
    script.async = true;
    const finish = (error) => {
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else resolve();
    };
    const failure = () => new Error(`${provider.label} could not load. Please try again.`);
    const timeout = setTimeout(() => finish(failure()), 15000);
    script.onload = () => finish(provider.ready() ? null : failure());
    script.onerror = () => finish(failure());
    document.head.append(script);
  }).finally(() => pending.delete(name));
  pending.set(name, job);
  return job;
}
