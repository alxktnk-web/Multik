import { quarterTurns } from '../core/orientation';

export function drawOriented(target: HTMLCanvasElement, source: CanvasImageSource, width: number, height: number, turns: number): void {
  const t = quarterTurns(turns);
  target.width = t % 2 ? height : width;
  target.height = t % 2 ? width : height;
  const ctx = target.getContext('2d')!;
  ctx.translate(target.width / 2, target.height / 2);
  ctx.rotate(t * Math.PI / 2);
  ctx.drawImage(source, -width / 2, -height / 2, width, height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Derived image only: the stored JPEG is never re-encoded when rotating a frame. */
export async function orientedBlob(blob: Blob | undefined, turns: number, maxPx = Infinity, type = 'image/png'): Promise<Blob | undefined> {
  if (!blob || !quarterTurns(turns)) return blob;
  const image = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  try {
    const scale = Math.min(1, maxPx / Math.max(image.width, image.height));
    drawOriented(canvas, image, Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)), turns);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Couldn’t rotate this frame')), type, 0.96));
  } finally { image.close(); canvas.width = canvas.height = 1; }
}
