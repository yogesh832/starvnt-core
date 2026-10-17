import * as DocumentPicker from "expo-document-picker";
import { external } from "./runtime";
import type { Data } from "./client";

export async function pickUpload(
  portfolio = false,
  fileType: string | string[] = "*/*",
): Promise<Data | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: portfolio ? ["image/*", "video/*"] : fileType,
    copyToCacheDirectory: true,
  });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  if (asset.size && asset.size > 20 * 1024 * 1024)
    throw new Error("Choose a file smaller than 20 MB.");
  const body = new FormData();
  body.append("file", {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType || "application/octet-stream",
  } as any);
  body.append(
    "mediaType",
    asset.mimeType?.startsWith("video/") ? "VIDEO" : "IMAGE",
  );
  const result = await external.call(
    portfolio ? "/vendor/portfolio/upload" : "/media/upload",
    "POST",
    body,
  );
  return { ...result, filename: asset.name, fileSize: asset.size };
}
