import { describe, expect, it, vi } from 'vitest';

import {
  findNonWhitePixelBounds,
  detectPdfCropBox,
  normalizePdfPaperPixels,
  pixelBoundsToPdfCropBox,
} from '../../../src/lib/browser/pdf-crop';

function whitePixels(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  pixels.fill(255);
  return pixels;
}

function setPixel(pixels: Uint8ClampedArray, width: number, x: number, y: number, value: number): void {
  const offset = (y * width + x) * 4;
  pixels[offset] = value;
  pixels[offset + 1] = value;
  pixels[offset + 2] = value;
  pixels[offset + 3] = 255;
}

describe('PDF automatic margin crop', () => {
  it.each(['complete', 'failure', 'timeout'])('releases the crop canvas after %s', async outcome => {
    const canvas = { width: 0, height: 0, getContext: () => ({
      fillRect() {}, getImageData: () => ({ data: whitePixels(10, 10) }),
    }) };
    const cancel = vi.fn();
    vi.stubGlobal('document', { createElement: () => canvas });
    try {
      await detectPdfCropBox({
        view: [0, 0, 100, 100], getViewport: () => ({ width: 10, height: 10 }),
        render: () => ({ cancel, promise: outcome === 'timeout' ? new Promise(() => {})
          : outcome === 'failure' ? Promise.reject(new Error('Render failed')) : Promise.resolve() }),
      }, 1, new Map(), 5);
      expect(canvas.width).toBe(0);
      expect(canvas.height).toBe(0);
      expect(cancel).toHaveBeenCalledTimes(outcome === 'timeout' ? 1 : 0);
    } finally { vi.unstubAllGlobals(); }
  });

  it('finds content while ignoring near-white page margins', () => {
    const pixels = whitePixels(10, 10);
    setPixel(pixels, 10, 3, 2, 20);
    setPixel(pixels, 10, 7, 8, 20);

    expect(findNonWhitePixelBounds(pixels, 10, 10)).toEqual({
      maxX: 7,
      maxY: 8,
      minX: 3,
      minY: 2,
    });
  });

  it('converts canvas coordinates into the PDF bottom-up coordinate system', () => {
    expect(pixelBoundsToPdfCropBox(
      { minX: 20, minY: 10, maxX: 80, maxY: 90 },
      100,
      100,
      [0, 0, 200, 300],
    )).toEqual([36, 24, 164, 276]);
  });

  it('does not crop a page whose content already reaches the edges', () => {
    expect(pixelBoundsToPdfCropBox(
      { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      100,
      100,
      [0, 0, 200, 300],
    )).toBeNull();
  });
});

describe('PDF painted paper', () => {
  it('removes a cream paper fill while preserving ink, accents and alpha', () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) pixels.set([250, 242, 222, 255], offset);
    pixels.set([38, 29, 20, 255], 20);
    pixels.set([180, 125, 34, 255], 24);
    pixels.set([250, 242, 222, 100], 36);
    expect(normalizePdfPaperPixels(pixels, 4, 4)).toBe(true);
    expect(Array.from(pixels.slice(0, 4))).toEqual([255, 255, 255, 255]);
    expect(Array.from(pixels.slice(20, 28))).toEqual([38, 29, 20, 255, 180, 125, 34, 255]);
    expect(Array.from(pixels.slice(36, 40))).toEqual([250, 242, 222, 100]);
  });

  it('keeps a white page and its colored content unchanged', () => {
    const pixels = whitePixels(4, 4);
    pixels.set([175, 210, 245, 255], 20);
    const before = pixels.slice();
    expect(normalizePdfPaperPixels(pixels, 4, 4)).toBe(false);
    expect(pixels).toEqual(before);
  });

  it('does not treat dark paper or a nonuniform image as a removable light fill', () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) pixels.set([245, 232, 210, 255], offset);
    pixels.set([200, 224, 245, 255], 12);
    const before = pixels.slice();
    expect(normalizePdfPaperPixels(pixels, 4, 4)).toBe(false);
    expect(pixels).toEqual(before);
    pixels.fill(24);
    expect(normalizePdfPaperPixels(pixels, 4, 4)).toBe(false);
  });
});
