import { createWorker } from 'tesseract.js';

/**
 * Compresses an image by resizing it and reducing quality.
 * @param base64 The original base64 image string.
 * @param maxDimension The maximum width or height.
 * @param quality JPEG quality (0 to 1).
 */
export async function compressImage(
  base64: string,
  maxDimension: number = 1200,
  quality: number = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDimension) {
          height *= maxDimension / width;
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width *= maxDimension / height;
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (e) => reject(e);
    img.src = base64;
  });
}

/**
 * Performs OCR on a base64 image using Tesseract.js.
 * @param base64 The base64 image string.
 * @param lang Language code (default 'tur').
 */
export async function performOCR(base64: string, lang: string = 'tur'): Promise<string> {
  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  const worker = await createWorker(lang, 1, {
    workerPath: `${baseUrl}tesseract/worker.min.js`,
    corePath: `${baseUrl}tesseract`,
    langPath: `${baseUrl}tesseract`,
    gzip: true,
  });
  // Dizilimi (tablo boşluklarını) korumak için gerekli ayar
  await worker.setParameters({
    preserve_interword_spaces: '1',
  });
  const ret = await worker.recognize(base64);
  await worker.terminate();
  return ret.data.text;
}
