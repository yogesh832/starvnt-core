/** Plain, bounded speech output; keep the full reply in the conversation. */
export function spokenReply(text: string) {
  return text.replace(/https?:\/\/\S+/g, '').replace(/[*_#`>]/g, '').trim().slice(0, 3000);
}
export function shouldFinishVoice(duration: number, metering: number | undefined, now: number, lastSpeech: number | null) {
  if (duration >= 60000) return true;
  return metering != null && lastSpeech != null && duration >= 1000 && now - lastSpeech > 1400;
}
