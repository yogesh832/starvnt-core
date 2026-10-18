import type { Data } from "./api/client";
export function completionEvidence(value: unknown) {
  const notes: string[] = [],
    files = new Map<string, { url: string; label: string; image: boolean }>(),
    checklist: Data[] = [];
  const add = (url: unknown, label = "Evidence file", photo = false) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
    const image =
      photo ||
      /\.(jpe?g|png|webp|gif)(?:\?|$)/i.test(url) ||
      url.includes("/image/upload/");
    if (!files.has(url)) files.set(url, { url, label, image });
  };
  for (const item of Array.isArray(value) ? value : value ? [value] : []) {
    if (typeof item === "string") {
      if (/^https?:\/\//i.test(item)) add(item);
      else notes.push(item);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    if (item.notes || item.note) notes.push(String(item.notes || item.note));
    for (const url of item.photos || item.photoUrls || [])
      add(url, "Photo", true);
    for (const url of item.videos || []) add(url, "Video");
    for (const url of item.pdfs || []) add(url, "Document");
    for (const file of item.files || [])
      typeof file === "string"
        ? add(file)
        : add(file?.url, file?.name || "Evidence file");
    add(item.url);
    add(item.deliverablesUrl || item.deliverableUrl, "Delivery link");
    if (Array.isArray(item.checklist))
      checklist.push(
        ...item.checklist.filter(
          (check: unknown) => !!check && typeof check === "object",
        ),
      );
  }
  return { notes, files: [...files.values()], checklist };
}
