import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function openPrivateMedia(api: { download: (path: string) => Promise<Response> }, path: string, assetId: string) {
  const response = await api.download(path);
  const mime = response.headers.get('content-type') || 'application/octet-stream';
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(await response.blob());
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  const extension = mime.includes('pdf') ? 'pdf' : mime.includes('video') ? 'mp4' : mime.includes('text/plain') ? 'txt' : mime.includes('image/png') ? 'png' : mime.includes('image/webp') ? 'webp' : 'jpg';
  const local = new File(Paths.cache, `private-media-${assetId}.${extension}`);
  local.create({ overwrite: true }); local.write(new Uint8Array(await response.arrayBuffer()));
  try {
    if (!await Sharing.isAvailableAsync()) throw new Error('File viewing is unavailable on this device.');
    await Sharing.shareAsync(local.uri, { mimeType: mime });
  } finally { if (local.exists) local.delete(); }
}
