import type { ImageInput } from '../ai/engine';

/**
 * Prepare a screenshot for the model, entirely on-device: Gemini Nano accepts only
 * JPEG/PNG, so anything else (WebP, HEIC via the browser, GIF) is re-encoded locally,
 * and very large images are scaled down.
 */
export async function fileToImageInput(file: Blob, maxSide = 1600): Promise<{ input: ImageInput; previewUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const keep = (file.type === 'image/png' || file.type === 'image/jpeg') && scale === 1;
  let blob: Blob = file;
  if (!keep) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read image'))), 'image/jpeg', 0.9));
  }
  bitmap.close();
  const base64 = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
  return {
    input: { mimeType: blob.type === 'image/png' ? 'image/png' : 'image/jpeg', base64 },
    previewUrl: URL.createObjectURL(blob),
  };
}
