import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createCopyingService } from '../../../src/lib/server/services/scripture-copying';
import book from '../../../src/lib/data/scripture-copying/dia-tang.json';
import legacy from '../../../src/lib/data/scripture-copying/dia-tang-legacy.json';
import lotus from '../../../src/lib/data/scripture-copying/phap-hoa.json';
import duocSu from '../../../src/lib/data/scripture-copying/duoc-su.json';
import { copySourceText } from '../../../src/lib/domain/practice/copying-formatting';
import { normalizeCopyText } from '../../../src/lib/domain/practice/scripture-copying';

function harness(owner: string | null = 'a') {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE app_users (id TEXT PRIMARY KEY); INSERT INTO app_users VALUES (\'a\'), (\'b\');');
  db.exec(readFileSync('migrations/0035-scripture-copying.sql', 'utf8'));
  db.exec(readFileSync('migrations/0048-scripture-copying-latest.sql', 'utf8'));
  const prepare = vi.fn((sql: string) => ({ bind: (...args: any[]) => ({
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  }) }));
  const serviceFor = (principal: string | null) => createCopyingService({ DB: { prepare } } as any, principal);
  const service = serviceFor(owner);
  const input = { runId: '00000000-0000-4000-8000-000000000001', sutraId: book.id, chapter: 1,
    sourceVersion: book.version, texts: book.chapters[0].blocks.map(() => ''), revision: 0,
    mutationId: '00000000-0000-4000-8000-000000000002' };
  return { db, prepare, service, serviceFor, input };
}

describe('authenticated explicit copying saves on real SQLite', () => {
  it('accepts a 90-percent chapter with the same single D1 write', async () => {
    const h = harness();
    h.input.texts = book.chapters[0].blocks.map(source => {
      const words = normalizeCopyText(source).split(' ').filter(Boolean);
      return words.slice(0, Math.ceil(words.length * 0.9)).join(' ');
    });
    expect(await h.service.save(h.input)).toMatchObject({ complete: true });
    expect(h.prepare).toHaveBeenCalledTimes(1);
  });
  it('rejects guests before any database work', async () => {
    const h = harness(null);
    await expect(h.service.save(h.input)).rejects.toMatchObject({ status: 401 });
    await expect(h.service.list(book.id, 1)).rejects.toMatchObject({ status: 401 });
    await expect(h.service.latest()).rejects.toMatchObject({ status: 401 });
    expect(h.prepare).not.toHaveBeenCalled();
  });
  it('saves a partial chapter in one statement, returns ACK, deduplicates a timed-out retry', async () => {
    const h = harness(); h.input.texts[0] = 'Nam mô';
    const ack = await h.service.save(h.input);
    // The Word edition includes one optional-instruction-only block.
    expect(ack).toMatchObject({ revision: 1, completedBlocks: 1, complete: false });
    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(await h.service.save(h.input)).toEqual(ack);
    expect(h.db.prepare('SELECT count(*) AS n FROM scripture_copy_chapters').get()).toMatchObject({ n: 1 });
  });
  it('rejects stale revisions and mutated retry payloads without overwriting saved text', async () => {
    const h = harness(); await h.service.save(h.input);
    await expect(h.service.save({ ...h.input, texts: ['changed', ...h.input.texts.slice(1)] })).rejects.toMatchObject({ status: 409 });
    await expect(h.service.save({ ...h.input, mutationId: '00000000-0000-4000-8000-000000000003' })).rejects.toMatchObject({ status: 409 });
    expect(await h.service.list(book.id, 1)).toHaveLength(1);
  });
  it('scopes reads and mutations by authenticated owner and verifies completion from canonical text', async () => {
    const h = harness(); h.input.texts = book.chapters[0].blocks;
    expect(await h.service.save({ ...h.input, ownerId: 'b', complete: false })).toMatchObject({ complete: true });
    const other = h.serviceFor('b');
    expect(await other.list(book.id, 1)).toEqual([]);
    expect(await other.read(book.id, 1, h.input.runId)).toBeNull();
    await expect(other.save({ ...h.input, revision: 1 })).rejects.toMatchObject({ status: 409 });
  });
  it('rejects unsupported source versions, invalid blocks and oversized text before SQL', async () => {
    const h = harness();
    await expect(h.service.save({ ...h.input, sourceVersion: 'wrong' })).rejects.toMatchObject({ status: 409 });
    await expect(h.service.save({ ...h.input, texts: [] })).rejects.toMatchObject({ status: 400 });
    await expect(h.service.save({ ...h.input, texts: h.input.texts.map(() => 'x'.repeat(100000)) })).rejects.toMatchObject({ status: 413 });
    expect(h.prepare).not.toHaveBeenCalled();
  });
  it('paginates saved attempts without hiding older copies', async () => {
    const h = harness();
    for (let i = 0; i < 23; i++) await h.service.save({ ...h.input, runId: crypto.randomUUID(), mutationId: crypto.randomUUID() });
    const first = await h.service.list(book.id, 1);
    expect(first).toHaveLength(20);
    const last = first.at(-1)!;
    const second = await h.service.list(book.id, 1, `${last.savedAt}~${last.runId}`);
    expect(second).toHaveLength(3);
    expect(new Set([...first, ...second].map(r => r.runId)).size).toBe(23);
  });
  it('returns no latest copy for an empty account with one bounded SQL read', async () => {
    const h = harness();
    expect(await h.service.latest()).toBeNull();
    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(h.prepare.mock.calls[0][0]).toMatch(/WHERE user_id = \? ORDER BY saved_at DESC, run_id DESC LIMIT 1/);
  });
  it('finds the newest saved chapter across books and isolates the authenticated account', async () => {
    const h = harness();
    await h.service.save(h.input);
    const second = { ...h.input, chapter: 2, texts: book.chapters[1].blocks.map(() => ''),
      runId: crypto.randomUUID(), mutationId: crypto.randomUUID() };
    second.texts[0] = 'Bản phẩm hai';
    await h.service.save(second);
    const newest = { ...h.input, sutraId: lotus.id, sourceVersion: lotus.version,
      runId: crypto.randomUUID(), mutationId: crypto.randomUUID(), texts: lotus.chapters[0].blocks.map(() => '') };
    newest.texts[0] = 'Bản Pháp Hoa';
    const newestAck = await h.service.save(newest);
    const other = h.serviceFor('b');
    const otherInput = { ...h.input, runId: crypto.randomUUID(), mutationId: crypto.randomUUID() };
    await other.save(otherInput);
    const setTime = h.db.prepare('UPDATE scripture_copy_chapters SET saved_at = ? WHERE run_id = ?');
    setTime.run('2026-11-26T00:00:00.000Z', h.input.runId);
    setTime.run('2026-11-26T01:00:00.000Z', second.runId);
    setTime.run('2026-11-26T02:00:00.000Z', newest.runId);
    setTime.run('2026-11-27T00:00:00.000Z', otherInput.runId);
    h.prepare.mockClear();
    expect(await h.service.latest()).toEqual({ sutraId: lotus.id, chapter: 1, runId: newest.runId,
      sourceVersion: lotus.version, texts: newest.texts, ...newestAck, savedAt: '2026-11-26T02:00:00.000Z' });
    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(await other.latest()).toMatchObject({ sutraId: book.id, runId: otherInput.runId });
  });
  it('orders equal server timestamps by run id and an idempotent retry cannot become the newest save', async () => {
    const h = harness();
    const second = { ...h.input, runId: '00000000-0000-4000-8000-000000000003', mutationId: crypto.randomUUID() };
    const firstAck = await h.service.save(h.input);
    await h.service.save(second);
    h.db.prepare('UPDATE scripture_copy_chapters SET saved_at = ?').run(firstAck.savedAt);
    expect(await h.service.latest()).toMatchObject({ runId: second.runId });
    expect(await h.service.save(h.input)).toEqual(firstAck);
    expect(await h.service.latest()).toMatchObject({ runId: second.runId, savedAt: firstAck.savedAt });
    h.db.prepare('UPDATE scripture_copy_chapters SET saved_at = ? WHERE run_id = ?')
      .run('2000-01-01T00:00:00.000Z', h.input.runId);
    h.db.prepare('UPDATE scripture_copy_chapters SET saved_at = ? WHERE run_id = ?')
      .run('2001-01-01T00:00:00.000Z', second.runId);
    await h.service.save({ ...h.input, revision: 1, mutationId: crypto.randomUUID(),
      texts: ['New acknowledged content', ...h.input.texts.slice(1)] });
    expect(await h.service.latest()).toMatchObject({ runId: h.input.runId, revision: 2 });
  });
  it('uses the additive latest index without sorting account history or changing existing records', async () => {
    const h = harness();
    const ack = await h.service.save(h.input);
    h.db.exec('DROP INDEX idx_scripture_copy_latest');
    const before = h.db.prepare('SELECT * FROM scripture_copy_chapters').all();
    h.db.exec(readFileSync('migrations/0048-scripture-copying-latest.sql', 'utf8'));
    expect(h.db.prepare('SELECT * FROM scripture_copy_chapters').all()).toEqual(before);
    h.prepare.mockClear();
    expect(await h.service.latest()).toMatchObject({ runId: h.input.runId, texts: h.input.texts, ...ack });
    const sql = h.prepare.mock.calls[0][0];
    const plan = h.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all('a');
    const details = plan.map(row => row.detail).join(' ');
    expect(details).toContain('USING INDEX idx_scripture_copy_latest');
    expect(details).not.toContain('TEMP B-TREE');
    h.db.exec(readFileSync('migrations/0048-scripture-copying-latest.sql', 'utf8'));
    expect(await h.service.read(book.id, 1, h.input.runId)).toMatchObject({ runId: h.input.runId, texts: h.input.texts, ...ack });
  });
});

 it('keeps installed-client old-edition saves/read/list and uncertain retries on their own canonical source', async () => {
  const h = harness();
  const input = { ...h.input, sourceVersion: legacy.version, texts: legacy.chapters[0].blocks };
  const ack = await h.service.save(input);
  expect(ack.complete).toBe(true);
  expect(h.prepare).toHaveBeenCalledTimes(1);
  expect(await h.service.save(input)).toEqual(ack);
  expect(h.prepare).toHaveBeenCalledTimes(3);
  expect(await h.service.list(legacy.id, 1)).toMatchObject([{ sourceVersion: legacy.version }]);
  expect(await h.service.read(legacy.id, 1, input.runId)).toMatchObject({ sourceVersion: legacy.version, texts: input.texts });
  expect(await h.service.latest()).toMatchObject({ sutraId: legacy.id, chapter: 1, sourceVersion: legacy.version, texts: input.texts });
  await expect(h.service.save({ ...h.input, revision: 1, mutationId: crypto.randomUUID() })).rejects.toMatchObject({ status: 409 });
  expect(h.db.prepare('SELECT source_version, texts_json FROM scripture_copy_chapters').get()).toMatchObject({ source_version: legacy.version, texts_json: JSON.stringify(input.texts) });
});

it('round-trips a Medicine Buddha copy and uncertain retry on the existing schema without changing legacy rows', async () => {
  const h = harness();
  await h.service.save({ ...h.input, sourceVersion: legacy.version, texts: legacy.chapters[0].blocks });
  const oldRows = h.db.prepare('SELECT * FROM scripture_copy_chapters WHERE sutra_id = ?').all(legacy.id);
  const input = { ...h.input, sutraId: duocSu.id, sourceVersion: duocSu.version,
    runId: '00000000-0000-4000-8000-000000000005', mutationId: '00000000-0000-4000-8000-000000000006',
    texts: duocSu.chapters[0].blocks.map(source => copySourceText(source).normalize('NFD')) };
  h.prepare.mockClear();
  const ack = await h.service.save(input);
  expect(ack).toMatchObject({ revision: 1, complete: true, completedBlocks: input.texts.length });
  expect(h.prepare).toHaveBeenCalledTimes(1);
  const committed = h.db.prepare('SELECT * FROM scripture_copy_chapters WHERE sutra_id = ?').all(duocSu.id);
  expect(committed).toHaveLength(1);

  h.prepare.mockClear();
  expect(await h.service.read(duocSu.id, 1, input.runId)).toEqual({ runId: input.runId,
    sourceVersion: duocSu.version, texts: input.texts, ...ack });
  expect(h.prepare).toHaveBeenCalledTimes(1);
  h.prepare.mockClear();
  expect(await h.service.save(input)).toEqual(ack);
  expect(h.prepare).toHaveBeenCalledTimes(2);
  expect(h.db.prepare('SELECT * FROM scripture_copy_chapters WHERE sutra_id = ?').all(duocSu.id)).toEqual(committed);

  h.prepare.mockClear();
  expect(await h.service.list(duocSu.id, 1)).toEqual([{ runId: input.runId, sourceVersion: duocSu.version, ...ack }]);
  expect(h.prepare).toHaveBeenCalledTimes(1);
  const other = h.serviceFor('b');
  expect(await other.read(duocSu.id, 1, input.runId)).toBeNull();
  expect(await other.list(duocSu.id, 1)).toEqual([]);

  h.prepare.mockClear();
  await expect(h.service.save({ ...input, texts: [input.texts[0] + ' thay đổi', ...input.texts.slice(1)] }))
    .rejects.toMatchObject({ status: 409, code: 'copy_conflict' });
  expect(h.prepare).toHaveBeenCalledTimes(2);
  expect(h.db.prepare('SELECT * FROM scripture_copy_chapters WHERE sutra_id = ?').all(duocSu.id)).toEqual(committed);
  expect(h.db.prepare('SELECT * FROM scripture_copy_chapters WHERE sutra_id = ?').all(legacy.id)).toEqual(oldRows);
});

it('rejects Medicine Buddha version, chapter and identifier mismatches before issuing SQL', async () => {
  const h = harness();
  const input = { ...h.input, sutraId: duocSu.id, sourceVersion: duocSu.version,
    texts: duocSu.chapters[0].blocks.map(() => '') };
  for (const sourceVersion of ['', 'unknown', legacy.version]) {
    await expect(h.service.save({ ...input, sourceVersion })).rejects.toMatchObject({ status: 409, code: 'copy_source_changed' });
  }
  await expect(h.service.save({ ...input, chapter: 2 })).rejects.toMatchObject({ status: 400, code: 'invalid_copy_chapter' });
  await expect(h.service.save({ ...input, sutraId: duocSu.articleId })).rejects.toMatchObject({ status: 400, code: 'invalid_copy_chapter' });
  expect(h.prepare).not.toHaveBeenCalled();
});
