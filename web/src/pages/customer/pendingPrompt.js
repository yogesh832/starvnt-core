/**
 * What a logged-out visitor typed on the landing page, kept through
 * sign-up and then opened as /customer/aura?ask=…
 */
const KEY = 'starvnt_pending_prompt';

export function savePendingPrompt(text) {
  try {
    if (text?.trim()) sessionStorage.setItem(KEY, text.trim());
  } catch {
    /* storage unavailable: the prompt is simply not carried over */
  }
}

export function takePendingPrompt() {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v || null;
  } catch {
    return null;
  }
}
