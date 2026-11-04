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
 * Optimizes an uploaded image file if it exceeds maxSizeBytes (default 2MB).
 * If the file is <= maxSizeBytes, it converts directly to base64 with zero quality loss.
 * If > maxSizeBytes, it proportionally resizes (max dimension 2048px) and compresses to <= 2MB.
 */
export async function optimizeImageFile(
  file: File,
  maxSizeBytes: number = 2 * 1024 * 1024
): Promise<string> {
  if (file.size <= maxSizeBytes) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = (e) => reject(e);
    reader.onload = () => {
      const img = new Image();
      img.onerror = (e) => reject(e);
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        const maxDimension = 2048;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // If original was PNG, check if resized PNG is already under size limit
        if (file.type === 'image/png') {
          const pngData = canvas.toDataURL('image/png');
          if (pngData.length * 0.75 <= maxSizeBytes) {
            resolve(pngData);
            return;
          }
        }

        // Convert to high-quality JPEG with white background
        const jpegCanvas = document.createElement('canvas');
        jpegCanvas.width = width;
        jpegCanvas.height = height;
        const jCtx = jpegCanvas.getContext('2d');
        if (jCtx) {
          jCtx.fillStyle = '#ffffff';
          jCtx.fillRect(0, 0, width, height);
          jCtx.imageSmoothingEnabled = true;
          jCtx.imageSmoothingQuality = 'high';
          jCtx.drawImage(canvas, 0, 0);

          let quality = 0.92;
          let dataUrl = jpegCanvas.toDataURL('image/jpeg', quality);
          while (dataUrl.length * 0.75 > maxSizeBytes && quality > 0.6) {
            quality -= 0.08;
            dataUrl = jpegCanvas.toDataURL('image/jpeg', quality);
          }
          resolve(dataUrl);
          return;
        }

        resolve(reader.result as string);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Optimizes a base64 image if it exceeds maxSizeBytes (default 2MB).
 */
export async function optimizeBase64Image(
  base64: string,
  maxSizeBytes: number = 2 * 1024 * 1024
): Promise<string> {
  if (!base64 || base64.length * 0.75 <= maxSizeBytes) {
    return base64;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      const maxDimension = 2048;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.92;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length * 0.75 > maxSizeBytes && quality > 0.6) {
        quality -= 0.08;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(dataUrl);
    };
    img.onerror = () => resolve(base64);
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
