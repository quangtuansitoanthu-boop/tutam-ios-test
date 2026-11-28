import { ANONYMOUS_STORAGE_PRINCIPAL, principalStoragePrefix } from './principal-storage';
import { getBrowserStorage } from './storage-contract';
import { isNativeApp } from './native-platform';

const EPOCH_PREFIX = 'quangtu_spiritual_tools_epoch_v1:';
const WRITE_LOCK = 'quangtu-spiritual-tools-write';
interface Marker { epoch: string; purgePending: boolean }
interface PrincipalOperations {
  generation: number;
  purging: boolean;
  pending: Set<Promise<void>>;
  lease?: string;
  marker: Marker;
  purge?: Promise<void>;
}

const principals = new Map<string, PrincipalOperations>();
let selectedPrincipal: string | null | undefined;
let selectedToken: string | null = null;
let removePrincipal: ((principal: string) => Promise<void>) | undefined;

function ownerId(principal: string | null | undefined): string {
  return String(principal ?? '').trim() || ANONYMOUS_STORAGE_PRINCIPAL;
}

function operationsFor(principal: string | null | undefined): PrincipalOperations {
  const prefix = principalStoragePrefix(principal);
  let operations = principals.get(prefix);
  if (!operations) {
    operations = { generation: 0, purging: false, pending: new Set(), marker: { epoch: '0', purgePending: false } };
    principals.set(prefix, operations);
  }
  return operations;
}

function readMarker(principal: string): Marker {
  const raw = getBrowserStorage().getItem(EPOCH_PREFIX + encodeURIComponent(principal));
  if (raw === null) return { epoch: '0', purgePending: false };
  const parsed = JSON.parse(raw) as Partial<Marker>;
  if (typeof parsed.epoch !== 'string' || !parsed.epoch || typeof parsed.purgePending !== 'boolean') {
    throw new Error('invalid_spiritual_tools_epoch');
  }
  return { epoch: parsed.epoch, purgePending: parsed.purgePending };
}

function writeMarker(principal: string, marker: Marker): void {
  getBrowserStorage().setItem(EPOCH_PREFIX + encodeURIComponent(principal), JSON.stringify(marker));
  operationsFor(principal).marker = marker;
}

function operationMarker(principal: string, operations: PrincipalOperations): Marker {
  // Ordinary native read/write remains independent of browser fallback storage.
  return principal === ANONYMOUS_STORAGE_PRINCIPAL || isNativeApp() ? operations.marker : readMarker(principal);
}

export async function withSpiritualToolsWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    // Always return a promise, including a synchronous epoch rejection, so the owner releases the lock.
    return await navigator.locks.request(WRITE_LOCK, async () => await operation());
  }
  // Existing single-context fallback; cross-tab serialization requires Web Locks.
  return operation();
}

export function selectSpiritualToolsSession(principal: string | null, verified: boolean, token: string | null): void {
  const owner = principal ? ownerId(principal) : null;
  const transition = owner !== selectedPrincipal || Boolean(verified && token && token !== selectedToken);
  selectedPrincipal = owner;
  if (verified) selectedToken = token;
  if (!owner || typeof window === 'undefined') return;
  const operations = operationsFor(owner);
  try {
    const marker = readMarker(owner);
    operations.marker = marker;
    // A same-session refresh cannot adopt an epoch changed by deletion in another tab.
    if ((verified && (transition || operations.lease === undefined)) ||
        (!verified && !marker.purgePending && operations.lease === undefined && marker.epoch === '0')) operations.lease = marker.epoch;
  } catch { /* Storage failure must not prevent clearing the authenticated session. */ }
}

// Capture before either owner's queue, a Web Lock, or a native read.
export function beginSpiritualToolsOperation(principal: string | null | undefined) {
  const owner = ownerId(principal);
  const operations = operationsFor(owner);
  const generation = operations.generation;
  let epoch: string | undefined;
  let admitted = false;
  try {
    const marker = operationMarker(owner, operations);
    if (operations.lease === undefined && !marker.purgePending && marker.epoch === '0') operations.lease = marker.epoch;
    if (owner === ANONYMOUS_STORAGE_PRINCIPAL) operations.lease = marker.epoch;
    epoch = marker.epoch;
    admitted = !operations.purging && !marker.purgePending && operations.lease === epoch;
  } catch { /* Invalid/unavailable lifecycle is rejected by assertCurrent. */ }
  let settle!: () => void;
  const pending = new Promise<void>(resolve => { settle = resolve; });
  operations.pending.add(pending);
  return {
    assertCurrent(): void {
      const marker = operationMarker(owner, operations);
      if (!admitted || operations.purging || marker.purgePending || generation !== operations.generation || marker.epoch !== epoch) {
        throw new Error('spiritual_tools_operation_invalidated');
      }
    },
    finish(): void { operations.pending.delete(pending); settle(); },
  };
}

export function registerSpiritualToolsPurgeHandler(remove: (principal: string) => Promise<void>): void {
  removePrincipal = remove;
}

export function pendingSpiritualToolsPurgePrincipals(): string[] {
  if (typeof window === 'undefined') return [];
  const storage = getBrowserStorage();
  const owners: string[] = [];
  for (let index = 0; index < (storage.length ?? 0); index += 1) {
    const key = storage.key?.(index);
    if (!key?.startsWith(EPOCH_PREFIX)) continue;
    const owner = decodeURIComponent(key.slice(EPOCH_PREFIX.length));
    if (owner && owner !== ANONYMOUS_STORAGE_PRINCIPAL && readMarker(owner).purgePending) owners.push(owner);
  }
  return owners;
}

export function purgeSpiritualToolsOperations(principal: string, onlyPending = false): Promise<void> {
  const owner = ownerId(principal);
  if (owner === ANONYMOUS_STORAGE_PRINCIPAL) return Promise.reject(new Error('account_principal_required'));
  const operations = operationsFor(owner);
  if (operations.purge) return operations.purge;
  operations.generation += 1;
  operations.purging = true;
  const previous = [...operations.pending];
  const purging = (async () => {
    const existing = readMarker(owner);
    if (onlyPending && !existing.purgePending) return;
    const marker = existing.purgePending ? existing : {
      epoch: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      purgePending: true,
    };
    writeMarker(owner, marker);
    // Drain issued native I/O and local queues BEFORE acquiring their shared lock.
    await Promise.all(previous);
    await withSpiritualToolsWriteLock(async () => {
      const current = readMarker(owner);
      // Another context may have finished already; do not delete its recreated account data.
      if (current.epoch !== marker.epoch || !current.purgePending) return;
      if (!removePrincipal) throw new Error('spiritual_tools_purge_unavailable');
      await removePrincipal(owner);
      writeMarker(owner, { epoch: marker.epoch, purgePending: false });
    });
  })().finally(() => {
    operations.purging = false;
    operations.purge = undefined;
  });
  operations.purge = purging;
  return purging;
}

export async function retryPendingSpiritualToolsPurges(): Promise<void> {
  const results = await Promise.allSettled(pendingSpiritualToolsPurgePrincipals().map(owner => purgeSpiritualToolsOperations(owner, true)));
  if (results.some(result => result.status === 'rejected')) throw new Error('spiritual_tools_purge_failed');
}
