import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { shouldPrecachePath } from '../../../src/lib/pwa/service-worker-policy';

describe('DivinationArtwork 3D crystal sprite atlas', () => {
  it('uses the bundled 3D crystal WebP atlas with both divination frames and PWA precache coverage', () => {
    const assetPath = 'static/images/icons/divination-crystal-v1.webp';
    expect(existsSync(assetPath)).toBe(true);
    expect(shouldPrecachePath('/images/icons/divination-crystal-v1.webp')).toBe(true);

    const component = readFileSync('src/lib/components/practice/divination/DivinationArtwork.svelte', 'utf8');
    expect(component).toContain('/images/icons/divination-crystal-v1.webp');
    expect(component).toContain("'quan-am': '0 0 512 512'");
    expect(component).toContain("'moc-luan': '512 0 512 512'");
    expect(component).toContain("kind: 'quan-am' | 'moc-luan'");
    expect(component).toContain('aria-hidden="true"');
    expect(existsSync('static/images/icons/spiritual-tools-crystal-v1.webp')).toBe(true);
    expect(shouldPrecachePath('/images/icons/spiritual-tools-crystal-v1.webp')).toBe(true);
    expect(component).toContain("biorhythm: '0 0 512 512'");
    expect(component).toContain("dream: '512 0 512 512'");
  });
});
