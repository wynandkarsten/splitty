import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { uid } from './db';

/** Copy a picked/captured image into app storage. Native: file in the document directory (path stored in SQLite).
 *  Web: no filesystem, so the image is stored as a data URI in SQLite itself. */
async function persist(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  if (Platform.OS === 'web') {
    if (asset.uri.startsWith('data:')) return asset.uri;
    const blob = await (await fetch(asset.uri)).blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  const dir = new Directory(Paths.document, 'receipts');
  if (!dir.exists) dir.create();
  const ext = (asset.uri.split('?')[0].split('.').pop() || 'jpg').slice(0, 5);
  const dest = new File(dir, `${uid()}.${ext}`);
  new File(asset.uri).copy(dest);
  return dest.uri;
}

export async function scanReceipt(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ['images'] });
  if (res.canceled || !res.assets[0]) return null;
  return persist(res.assets[0]);
}

export async function pickReceipt(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
  if (res.canceled || !res.assets[0]) return null;
  return persist(res.assets[0]);
}

export function deleteReceiptFile(uri: string) {
  if (Platform.OS === 'web' || uri.startsWith('data:')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    /* ignore */
  }
}
