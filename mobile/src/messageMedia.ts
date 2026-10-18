export function messageLinks(text: string): { url: string; image: boolean }[] {
  return [
    ...new Set(
      (text.match(/https?:\/\/[^\s<>]+/gi) || []).map((url) =>
        url.replace(/[.,;:!?)\]]+$/, ""),
      ),
    ),
  ].flatMap((url) => {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname || parsed.username || parsed.password) return [];
      return [
        {
          url,
          image:
            /\.(png|jpe?g|gif|webp)$/i.test(parsed.pathname) ||
            parsed.pathname.includes("/image/upload/"),
        },
      ];
    } catch {
      return [];
    }
  });
}

export function attachedMessage(text: string, url?: string): string {
  if (url && (!/^https?:\/\//i.test(url) || !messageLinks(url).length))
    throw new Error("The uploaded attachment link is invalid.");
  const body = [text.trim(), url ? `[Attached Media/Link]: ${url}` : ""]
    .filter(Boolean)
    .join("\n");
  if (!body) throw new Error("Write a message or attach a file.");
  if (body.length > 2000)
    throw new Error(
      "Shorten your message to fit the attachment within 2,000 characters.",
    );
  return body;
}
