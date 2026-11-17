import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { external } from './runtime';
import type { Data } from './client';

export const eventRequestKey = () => Crypto.randomUUID();
export async function pickPrivateEventMedia(eventId: string, input: Data, evidence = false) {
  const picked = await DocumentPicker.getDocumentAsync({
    type: evidence ? ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf'] : ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  if (asset.size && asset.size > 20 * 1024 * 1024) throw new Error('Choose a file up to 20 MB.');
  const body = new FormData();
  body.append('file', Platform.OS === 'web' && asset.file ? asset.file : new File(asset.uri));
  for (const [key, value] of Object.entries(input)) body.append(key, String(value));
  return external.call(`/customer/events/${encodeURIComponent(eventId)}/media`, 'POST', body);
}
export async function openPrivateEventFile(assetId: string) {
  const response = await external.download(`/customer/event-media/${encodeURIComponent(assetId)}/file`);
  const mime = response.headers.get('content-type') || 'application/octet-stream';
  const extension = mime.includes('pdf') ? 'pdf' : mime.includes('video') ? 'mp4' : 'jpg';
  const blob = await response.blob();
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `starvnt-event.${extension}`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, `starvnt-event-${assetId}.${extension}`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(await blob.arrayBuffer()));
  if (!await Sharing.isAvailableAsync()) throw new Error('A file viewer is unavailable on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: mime });
}
