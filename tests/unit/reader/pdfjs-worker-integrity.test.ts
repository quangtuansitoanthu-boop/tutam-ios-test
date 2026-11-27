import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

it('ships the compatibility worker matching the installed PDF.js engine', () => {
  // Git may normalize text line endings on Windows; compare executable content.
  const digest = (path: string) => createHash('sha256')
    .update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
  expect(digest('static/vendor/pdfjs/pdf.worker.min.mjs'))
    .toBe(digest('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'));
});

it.each(['wasm', 'standard_fonts'])('ships matching PDF.js %s assets and their license notices', directory => {
  const source = `node_modules/pdfjs-dist/${directory}`;
  const target = `static/vendor/pdfjs/${directory}`;
  const files = readdirSync(source).sort();
  expect(readdirSync(target).sort()).toEqual(files);
  for (const file of files) {
    const bytes = (root: string) => {
      const data = readFileSync(`${root}/${file}`);
      return /\.(wasm|ttf|pfb)$/.test(file) ? data : Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
    };
    expect(bytes(target), file).toEqual(bytes(source));
  }
});
