import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";
import { File } from "expo-file-system";
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
  return uploadAsset(picked.assets[0], portfolio);
}

async function uploadAsset(
  asset: DocumentPicker.DocumentPickerAsset,
  portfolio: boolean,
): Promise<Data> {
  if (asset.size && asset.size > 20 * 1024 * 1024)
    throw new Error("Choose a file smaller than 20 MB.");
  const body = new FormData();
  body.append(
    "file",
    Platform.OS === "web" && asset.file
      ? asset.file
      : new File(asset.uri),
  );
  body.append(
    "mediaType",
    asset.mimeType?.startsWith("video/") ? "VIDEO" : "IMAGE",
  );
  const result = await external.call(
    portfolio ? "/vendor/portfolio/upload" : "/media/upload",
    "POST",
    body,
  );
  return {
    ...result,
    mediaType:
      result.mediaType ||
      result.resourceType ||
      (asset.mimeType?.startsWith("video/") ? "VIDEO" : "IMAGE"),
    filename: asset.name,
    fileSize: asset.size,
  };
}

export async function pickUploads(
  portfolio = false,
  fileType: string | string[] = "*/*",
): Promise<{ uploads: Data[]; failures: string[] }> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: portfolio ? ["image/*", "video/*"] : fileType,
    multiple: true,
    copyToCacheDirectory: true,
  });
  const uploads: Data[] = [],
    failures: string[] = [];
  if (!picked.canceled) {
    for (const asset of picked.assets) {
      try {
        uploads.push(await uploadAsset(asset, portfolio));
      } catch (error) {
        failures.push(`${asset.name}: ${(error as Error).message}`);
      }
    }
  }
  return { uploads, failures };
}
