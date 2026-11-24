import type { CloudflareRequestContext } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import type { ModerationDecision, ModerationQueueKind, ModerationQueuePage, MindfulModerationKind } from '../../contracts/community-moderation';
import { createCommunityModerationRepository } from '../repositories/community-moderation-repository';
import { createMindfulModerationService } from './mindful-moderation';

type Repository = Pick<ReturnType<typeof createCommunityModerationRepository>, 'listModerationQueue' | 'moderate'>;
type MindfulService = Pick<ReturnType<typeof createMindfulModerationService>, 'list' | 'decide' | 'prepareApproveAll' | 'approveAll'>;
export function createAdminCommunityModerationService(
  context: CloudflareRequestContext,
  dependencies: { repository?: Repository; mindfulService?: MindfulService; now?: () => Date } = {},
) {
  const repository = dependencies.repository ?? createCommunityModerationRepository(context.env);
  const mindful = dependencies.mindfulService ?? createMindfulModerationService(context, { now: dependencies.now });
  const actor = () => {
    if (!context.principal?.appUserId) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
    if (context.principal.role !== 'admin') throw new ServerInputError(403, 'forbidden', 'Không đủ quyền.');
    return context.principal.appUserId;
  };
  const queueKind = (value: unknown): ModerationQueueKind => {
    if (value !== 'comments' && value !== 'profiles' && value !== 'reports' && value !== 'mindful') throw new ServerInputError(400, 'invalid_queue', 'Hàng đợi không hợp lệ.');
    return value;
  };
  const postKind = (value: unknown): MindfulModerationKind | undefined => {
    if (value === undefined) return undefined;
    if (value !== 'repentance' && value !== 'good_deed') throw new ServerInputError(400, 'invalid_mindful_kind', 'Loại bài không hợp lệ.');
    return value;
  };
  const operationId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
  function bulkInput(input: unknown, prepared: boolean) {
    const body = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const allowed = prepared ? ['operationId', 'postKind', 'cutoff', 'after'] : ['operationId', 'postKind'];
    if (!operationId(body.operationId) || Object.keys(body).some(key => !allowed.includes(key))
      || (prepared && (typeof body.cutoff !== 'string' || body.cutoff.length > 40
        || !/^\d{4}-\d{2}-\d{2}T/u.test(body.cutoff) || !Number.isFinite(Date.parse(body.cutoff))))
      || (body.after != null && (typeof body.after !== 'string' || !body.after.length || body.after.length > 512))) {
      throw new ServerInputError(400, 'invalid_mindful_operation', 'Thao tác duyệt không hợp lệ.');
    }
    const kind = postKind(body.postKind);
    return { operationId: body.operationId, ...(kind ? { kind } : {}),
      ...(prepared ? { cutoff: body.cutoff as string, ...(body.after === undefined ? {} : { after: body.after as string | null }) } : {}) };
  }
  return {
    async list(kind: unknown, options: { after?: string | null; limit?: number; state?: unknown; postKind?: unknown } = {}): Promise<ModerationQueuePage> {
      const adminId = actor();
      if (options.limit != null && (!Number.isFinite(options.limit) || options.limit < 1)) throw new ServerInputError(400, 'invalid_limit', 'Giới hạn không hợp lệ.');
      const targetKind = queueKind(kind);
      if (targetKind === 'mindful') {
        const state = options.state ?? 'pending';
        if (state !== 'pending' && state !== 'published') throw new ServerInputError(400, 'invalid_mindful_state', 'Trạng thái không hợp lệ.');
        const page = await mindful.list(state, { after: options.after ?? null,
          limit: Math.min(50, Math.floor(options.limit ?? 50)), kind: postKind(options.postKind) });
        return { items: page.items.map(post => ({ id: post.id, kind: 'mindful', mindfulKind: post.kind,
          revision: post.reviewRevision ?? 1, submittedAt: post.createdAt, displayName: post.nickname, avatarUrl: '',
          content: post.content, articleId: null, member: post.member,
          moderationStatus: post.reviewState === 'pending' ? 'pending' : post.reviewState === 'rejected' || post.reviewState === 'removed' ? 'rejected' : 'approved',
          publishedAt: post.publishedAt ?? null, reviewDueAt: post.reviewDueAt ?? null,
          reviewState: post.reviewState ?? 'legacy', reviewReason: post.reviewReason ?? null, policyCode: post.policyCode ?? null,
        })), nextCursor: page.nextCursor, summary: page.summary };
      }
      return repository.listModerationQueue(targetKind, adminId, {
        after: options.after ?? null, limit: Math.min(50, Math.floor(options.limit ?? 50)),
      });
    },
    async decide(kind: unknown, id: string, input: unknown) {
      const adminId = actor();
      const targetKind = queueKind(kind);
      const body = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
      if (targetKind === 'mindful') {
        if (!['approve', 'reject', 'delete'].includes(String(body.action)) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1
          || Object.keys(body).some(key => !['action', 'revision', 'reason', 'operationId'].includes(key))
          || (body.operationId !== undefined && !operationId(body.operationId))
          || (body.reason != null && (typeof body.reason !== 'string' || body.reason.length > 1000))
          || (body.action === 'reject' && (typeof body.reason !== 'string' || !body.reason.trim()))
          || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u.test(id)) {
          throw new ServerInputError(400, 'invalid_moderation_decision', 'Quyết định kiểm duyệt không hợp lệ.');
        }
        return mindful.decide(id, body);
      }
      const validAction = targetKind === 'reports' ? body.action === 'resolve' : ['approve', 'reject', 'hide'].includes(String(body.action));
      if (!validAction || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1
        || Object.keys(body).some(key => !['action', 'revision', 'reason'].includes(key))
        || (body.reason != null && (typeof body.reason !== 'string' || body.reason.length > 1000))
        || (body.action === 'reject' && (typeof body.reason !== 'string' || !body.reason.trim()))
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(id)
        || (targetKind === 'comments' && !/^[1-9]\d*$/u.test(id))) {
        throw new ServerInputError(400, 'invalid_moderation_decision', 'Quyết định kiểm duyệt không hợp lệ.');
      }
      const decision: ModerationDecision & { reason: string } = { action: body.action as ModerationDecision['action'],
        revision: Number(body.revision), reason: typeof body.reason === 'string' ? body.reason.trim() : '' };
      if (!await repository.moderate(targetKind, id, decision, adminId, (dependencies.now?.() ?? new Date()).toISOString())) {
        throw new ServerInputError(409, 'moderation_conflict', 'Nội dung đã thay đổi. Vui lòng tải lại hàng đợi.');
      }
      return { updated: true as const };
    },
    async prepareApproveAll(input: unknown) {
      actor();
      return mindful.prepareApproveAll(bulkInput(input, false));
    },
    async approveAll(input: unknown) {
      actor();
      return mindful.approveAll(bulkInput(input, true));
    },
  };
}
