// Copy drafts contain JSON data only; avoid APIs absent from the supported older browsers.
function cloneCopy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
import { createBrowserId } from './random-id';
export const createCopyId = createBrowserId;

export interface CopySaveInput {
  runId: string; sutraId: string; chapter: number; sourceVersion: string;
  texts: string[]; revision: number; mutationId: string;
}
export interface CopyAck { revision: number; savedAt: string }
export interface CopyDraft {
  runId: string; sutraId: string; chapter: number; sourceVersion: string;
  texts: string[]; revision: number; savedAt: string | null; savedTexts: string[];
  pending: CopySaveInput | null; block: number;
  previousRuns?: string[];
  practiceRunId?: string;
  bookRunId?: string;
  unsentBackupRunId?: string;
}
export interface CopyStore { read(key: string): Promise<CopyDraft | null>; write(key: string, value: CopyDraft, expected?: CopyDraft | null): Promise<void> }
export type CopyAuth = { userId: string; csrfToken: string };
export function copyDraftKey(scope: string, sutraId: string, chapter: number, version: string) {
  return `tt_copy_v1:${encodeURIComponent(scope)}:${sutraId}:${version}:${chapter}`;
}
export function createCopyWorkspace(store: CopyStore, send: (input: CopySaveInput, auth: CopyAuth, signal: AbortSignal) => Promise<CopyAck>) {
  let draft: CopyDraft;
  // Only a successful workspace read/write advances the durable receipt.
  let durable: CopyDraft | null = null;
  let key = '', scope = '', generation = 0;
  let writes: Promise<void> = Promise.resolve();
  let controller: AbortController | null = null;
  let saving = false;
  let restoring = false;
  const persist = () => {
    const captured = cloneCopy(draft), target = key;
    const operation = writes.catch(() => undefined).then(async () => {
      await store.write(target, captured, durable);
      durable = cloneCopy(captured);
    });
    writes = operation;
    return operation;
  };
  // Lưu lại bản đang giữ trong bộ nhớ trước khi mở bản khác nếu lần ghi trước lỗi.
  const flushLocal = () => writes.catch(() => persist());
  async function replaceWithBackup(value: CopyDraft, recovering = false) {
    if (saving || restoring) throw new Error('copy_restore_in_progress');
    if (value.sutraId !== draft.sutraId || value.chapter !== draft.chapter || value.sourceVersion !== draft.sourceVersion
      || value.texts.length !== draft.texts.length || !value.texts.every(text => typeof text === 'string')
      || (value.bookRunId !== undefined && value.bookRunId !== draft.bookRunId)) throw new Error('invalid_restore');
    const current = generation, target = key, previous = cloneCopy(draft), next = cloneCopy(value);
    const checkCurrent = () => { if (current !== generation) throw new Error('principal_changed'); };
    if (previous.bookRunId !== undefined) next.bookRunId = previous.bookRunId;
    next.previousRuns = [...new Set([...(previous.previousRuns ?? []), ...(next.previousRuns ?? [])])];
    const olderBackup = recovering ? value.unsentBackupRunId : previous.unsentBackupRunId;
    if (olderBackup) next.unsentBackupRunId = olderBackup;
    else delete next.unsentBackupRunId;
    const dirty = !!previous.pending || JSON.stringify(previous.texts) !== JSON.stringify(previous.savedTexts);
    const needsBackup = dirty && (!!previous.pending || JSON.stringify(previous.texts) !== JSON.stringify(next.texts));
    const backupId = needsBackup ? createCopyId() : null;
    restoring = true;
    const operation = writes.catch(() => undefined).then(async () => {
      checkCurrent();
      if (backupId) {
        const backup = cloneCopy(previous);
        if (olderBackup) backup.unsentBackupRunId = olderBackup;
        else delete backup.unsentBackupRunId;
        await store.write(`${target}:run:${backupId}`, backup);
        checkCurrent();
        next.unsentBackupRunId = backupId;
      }
      await store.write(target, next, durable);
      // Lần ghi đã commit phải cập nhật receipt của đúng key trước khi open()
      // tiếp tục; lỗi principal chỉ thuộc caller, không biến commit thành lỗi ghi.
      if (key === target) {
        durable = cloneCopy(next);
        draft = next;
      }
    });
    writes = operation;
    try { await operation; checkCurrent(); }
    finally { if (current === generation) restoring = false; }
  }
  return {
    async open(nextScope: string, sutraId: string, chapter: number, version: string, blocks: number) {
      generation++; controller?.abort(); saving = false; restoring = false;
      const current = generation;
      await flushLocal();
      if (current !== generation) return;
      const target = copyDraftKey(nextScope, sutraId, chapter, version);
      const stored = await store.read(target);
      if (current !== generation) return;
      key = target; scope = nextScope;
      draft = stored ?? { runId: createCopyId(), sutraId, chapter, sourceVersion: version,
        texts: Array.from({ length: blocks }, () => ''), revision: 0, savedAt: null,
        savedTexts: Array.from({ length: blocks }, () => ''), pending: null, block: 0 };
      if (draft.sourceVersion !== version || draft.texts.length !== blocks || !draft.texts.every(t => typeof t === 'string')) throw new Error('invalid_local_draft');
      durable = stored ? cloneCopy(stored) : null;
    },
    snapshot() { return { ...cloneCopy(draft), dirty: !!draft.pending || JSON.stringify(draft.texts) !== JSON.stringify(draft.savedTexts), saving }; },
    edit(block: number, text: string) { if (restoring) return Promise.reject(new Error('copy_restore_in_progress')); draft.texts[block] = text; draft.block = block; return persist(); },
    selectBlock(block: number) { if (restoring) return Promise.reject(new Error('copy_restore_in_progress')); draft.block = block; return persist(); },
    flushLocal,
    replaceFromCloud: (value: CopyDraft) => replaceWithBackup(value),
    async readUnsentBackup() {
      const current = generation, target = key, backupId = draft.unsentBackupRunId;
      if (!backupId) return null;
      const backup = await store.read(`${target}:run:${backupId}`);
      if (current !== generation) throw new Error('principal_changed');
      return backup;
    },
    async restoreUnsentBackup() {
      if (saving || restoring) throw new Error('copy_restore_in_progress');
      const current = generation, target = key, backupId = draft.unsentBackupRunId;
      if (!backupId) return;
      const backup = await store.read(`${target}:run:${backupId}`);
      if (current !== generation) throw new Error('principal_changed');
      if (!backup) throw new Error('copy_backup_missing');
      await replaceWithBackup(backup, true);
    },
    async startNewRun() {
      if (saving || restoring) throw new Error('copy_save_in_progress');
      const current = generation, previous = cloneCopy(draft), target = key;
      await flushLocal();
      if (current !== generation) throw new Error('principal_changed');
      // Keep the finished text, including an uncertain cloud receipt, before opening a blank run.
      await store.write(`${target}:run:${previous.runId}`, previous);
      if (current !== generation) throw new Error('principal_changed');
      const next: CopyDraft = { ...previous, runId: createCopyId(), texts: previous.texts.map(() => ''),
        savedTexts: previous.texts.map(() => ''), revision: 0, savedAt: null, pending: null, block: 0,
        previousRuns: [...new Set([...(previous.previousRuns ?? []), previous.runId])] };
      next.practiceRunId = next.runId;
      await store.write(target, next, durable);
      if (current !== generation) throw new Error('principal_changed');
      durable = cloneCopy(next);
      draft = next;
    },
    async readPreviousRun(runId: string) {
      if (!draft.previousRuns?.includes(runId)) return null;
      return store.read(`${key}:run:${runId}`);
    },
    async replaceLocal(value: CopyDraft) {
      if (restoring) throw new Error('copy_restore_in_progress');
      if (value.sutraId !== draft.sutraId || value.chapter !== draft.chapter || value.sourceVersion !== draft.sourceVersion || value.texts.length !== draft.texts.length) throw new Error('invalid_restore');
      if (value.bookRunId !== undefined && value.bookRunId !== draft.bookRunId) throw new Error('invalid_restore');
      const next = cloneCopy(value), current = generation, target = key;
      if (draft.bookRunId !== undefined) next.bookRunId = draft.bookRunId;
      const operation = writes.catch(() => undefined).then(async () => {
        await store.write(target, next, durable);
        durable = cloneCopy(next);
      });
      writes = operation;
      await operation;
      if (current !== generation) throw new Error('principal_changed');
      draft = next;
    },
    cancel() { generation++; controller?.abort(); saving = false; restoring = false; },
    async save(auth: CopyAuth | null): Promise<CopyAck | null> {
      if (restoring) throw new Error('copy_restore_in_progress');
      if (!auth || !auth.csrfToken) throw new Error('login_required');
      if (scope !== `account:${auth.userId}`) throw new Error('principal_changed');
      if (saving) return null;
      if (!draft.pending && JSON.stringify(draft.texts) === JSON.stringify(draft.savedTexts)) return null;
      saving = true;
      const current = generation;
      const abort = new AbortController(); controller = abort;
      try {
        if (!draft.pending) draft.pending = { runId: draft.runId, sutraId: draft.sutraId, chapter: draft.chapter,
          sourceVersion: draft.sourceVersion, texts: [...draft.texts], revision: draft.revision, mutationId: createCopyId() };
        const captured = cloneCopy(draft.pending);
        await persist(); // Persist the immutable receipt before sending, including uncertain retries.
        if (current !== generation) throw new Error('principal_changed');
        const ack = await send(captured, auth, abort.signal);
        if (current !== generation) throw new Error('principal_changed');
        draft.revision = ack.revision; draft.savedAt = ack.savedAt;
        draft.savedTexts = [...captured.texts]; draft.pending = null;
        await persist();
        return ack;
      } finally {
        if (current === generation) { saving = false; controller = null; }
      }
    },
  };
}
