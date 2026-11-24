import { fetchWithSessionRefresh, requireBrowserCsrf } from './session-csrf';
import type { MindfulApproveAllInput, MindfulApproveAllPreparation, MindfulApproveAllPreparationInput, MindfulApproveAllResult, MindfulModerationQueueOptions, ModerationDecision, ModerationQueueKind, ModerationQueuePage } from '$lib/contracts/community-moderation';

export class ModerationApiError extends Error {
  public readonly serverMessage?: string;

  constructor(
    public readonly status: number,
    public readonly code?: string,
    serverMessage?: string,
  ) {
    super(`moderation_${status}`);
    this.serverMessage = serverMessage;
  }
}
async function check(response: Response): Promise<void> {
  if (!response.ok) {
    let code: string | undefined;
    let message: string | undefined;
    try {
      const data = await response.json();
      code = data?.error?.code ?? data?.code;
      message = data?.error?.message ?? data?.message;
    } catch {
      // Non-JSON or empty response
    }
    throw new ModerationApiError(response.status, code, message);
  }
}
export async function fetchModerationQueue(kind: ModerationQueueKind, after: string | null, signal: AbortSignal, options?: MindfulModerationQueueOptions): Promise<ModerationQueuePage> {
  const params = new URLSearchParams({ kind, limit: '20' });
  if (after) params.set('after', after);
  if (kind === 'mindful') {
    params.set('state', options?.state ?? 'pending');
    if (options?.postKind) params.set('postKind', options.postKind);
  }
  const response = await fetchWithSessionRefresh(`/api/admin/community/moderation?${params}`, {
    headers: { accept: 'application/json' },
    signal,
  });
  await check(response);
  return response.json() as Promise<ModerationQueuePage>;
}
export async function decideModeration(kind: ModerationQueueKind, id: string, decision: ModerationDecision, signal: AbortSignal): Promise<void> {
  const csrf = await requireBrowserCsrf();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const response = await fetchWithSessionRefresh(`/api/admin/community/moderation/${kind}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify(decision),
    signal,
  });
  await check(response);
}
export async function suspendModerationMember(id: string, signal: AbortSignal): Promise<void> {
  const csrf = await requireBrowserCsrf();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const response = await fetchWithSessionRefresh(`/api/admin/members/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
    credentials: 'include',
    body: JSON.stringify({ status: 'suspended' }),
    signal,
  });
  await check(response);
}

async function mindfulBatchRequest<T>(path: string, input: MindfulApproveAllPreparationInput | MindfulApproveAllInput, signal: AbortSignal): Promise<T> {
  const csrf = await requireBrowserCsrf();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const response = await fetchWithSessionRefresh(`/api/admin/community/moderation/mindful/approve-all${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify(input),
    signal,
  });
  await check(response);
  return response.json() as Promise<T>;
}

export function prepareMindfulApproveAll(input: MindfulApproveAllPreparationInput, signal: AbortSignal): Promise<MindfulApproveAllPreparation> {
  return mindfulBatchRequest('/prepare', input, signal);
}

export function approveAllMindful(input: MindfulApproveAllInput, signal: AbortSignal): Promise<MindfulApproveAllResult> {
  return mindfulBatchRequest('', input, signal);
}
