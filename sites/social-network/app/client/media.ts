import { api } from './api-client';
export async function photoBlob(file: File): Promise<Blob> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 12 * 1024 * 1024
  )
    throw new Error('Selecciona una foto JPG, PNG o WebP de menos de 12 MB.');
  const image = await createImageBitmap(file),
    ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * ratio));
  canvas.height = Math.max(1, Math.round(image.height * ratio));
  const context = canvas.getContext('2d');
  if (!context) {
    image.close();
    throw new Error('No se pudo preparar la foto.');
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo preparar la foto.'))),
      'image/webp',
      0.84,
    ),
  );
}
export async function upload(file: File) {
  return api<{ id: string; url: string }>('/api/media', 'POST', await photoBlob(file));
}
