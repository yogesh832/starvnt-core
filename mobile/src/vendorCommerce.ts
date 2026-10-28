import type { Data } from "./api/client";

export function quotePricing(values: Data): Data {
  const result: Data = {};
  for (const key of [
    "basePrice",
    "travelFee",
    "equipmentFee",
    "setupFee",
    "additionalFee",
  ]) {
    const amount = Number(values[key] ?? 0);
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      (key === "basePrice" && amount === 0)
    )
      throw new Error(
        "Enter a positive base price and valid non-negative charges.",
      );
    result[key] = amount;
  }
  result.totalAmount = Object.values(result).reduce(
    (sum: number, value) => sum + Number(value),
    0,
  );
  return result;
}

export function completionPayload(
  url: string,
  notes: string,
  assets: Data[],
  checklist: Data[],
): Data {
  if (url.trim() && !/^https?:\/\//i.test(url.trim()))
    throw new Error("Use an HTTP or HTTPS delivery link.");
  const files = assets
    .filter((asset) => asset.url)
    .map((asset) => ({
      url: asset.url,
      thumbnailUrl: asset.thumbnailUrl || "",
      publicId: asset.publicId || "",
      resourceType: String(asset.resourceType || "IMAGE").toUpperCase(),
      name: asset.filename || asset.name || "Evidence file",
      size: asset.fileSize
        ? `${(asset.fileSize / (1024 * 1024)).toFixed(1)} MB`
        : asset.size || "",
    }));
  if (!url.trim() && !notes.trim() && !files.length)
    throw new Error(
      "Upload evidence, add a delivery link, or describe the completed work before submitting.",
    );
  const photos = files
    .filter((file) => file.resourceType !== "VIDEO")
    .map((file) => file.url);
  const videos = files
    .filter((file) => file.resourceType === "VIDEO")
    .map((file) => file.url);
  return {
    deliverablesUrl: url.trim() || photos[0] || videos[0] || "",
    notes: notes.trim(),
    files,
    photos,
    videos,
    checklist: checklist.map((item) => ({
      item: item.item,
      checked: !!item.checked,
    })),
  };
}
