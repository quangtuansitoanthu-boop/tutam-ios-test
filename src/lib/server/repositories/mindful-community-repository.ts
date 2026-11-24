import type { CloudflareEnvLike, D1ResultRow } from '../cloudflare-context';
import { MINDFUL_REACTION_TEMPLATES, type MindfulPost, type MindfulPostDraft, type MindfulPostKind, type MindfulReactionResult } from '../../contracts/mindful-community';
import type { MindfulPostContext } from '../../contracts/mindful-notifications';
import type { MindfulPolicyAssessment } from '../../domain/practice/mindful-policy';

interface PostRow extends D1ResultRow {
  id: string; kind: MindfulPostKind; nickname: string; content: string; created_at: string;
  reaction_count: number; viewer_reacted: number; is_own: number; status: MindfulPost['status'];
  review_state?: MindfulPost['reviewState']; review_due_at?: string | null; review_revision?: number;
  reviewed_at?: string | null; published_at?: string | null; policy_state?: string; policy_code?: MindfulPost['policyCode'];
  review_reason?: string | null; sort_at?: string; visible?: number; account_locked?: number; content_hash?: string | null;
}
interface PostContextRow extends PostRow {
  notification_id?: string | null;
  notification_nickname?: string;
  notification_template_id?: string;
  notification_created_at?: string;
}
export interface MindfulCursor { at: string; id: string }
export interface MindfulDateRange { start: string; end: string }
export interface ReactionRow extends D1ResultRow { nickname: string; template_id: string; created_at: string; cursor_id: string; kind: MindfulPostKind }
export const mindfulPostColumns = `p.id, p.kind, p.nickname, p.content, p.created_at, p.reaction_count, p.status,
  p.review_state, p.review_due_at, p.review_revision, p.reviewed_at, p.published_at, p.policy_state, p.policy_code,
  CASE WHEN p.owner_id = ? THEN (SELECT a.reason FROM mindful_moderation_audit a
    WHERE a.post_id = p.id AND a.revision = p.review_revision) ELSE NULL END AS review_reason,
  EXISTS (SELECT 1 FROM mindful_reactions r WHERE r.post_id = p.id AND r.owner_id = ?) AS viewer_reacted,
  CASE WHEN p.owner_id = ? THEN 1 ELSE 0 END AS is_own`;
export const mindfulPublicPredicate = (alias = 'p', time = '?') => `(${alias}.status = 'published' OR (${alias}.status = 'hidden'
  AND ${alias}.review_state = 'pending' AND ${alias}.policy_state = 'clear' AND ${alias}.review_due_at <= ${time}))`;
export const mindfulPublicationTime = (alias = 'p') => `CASE WHEN ${alias}.status = 'hidden' AND ${alias}.review_state = 'pending'
  THEN ${alias}.review_due_at ELSE COALESCE(${alias}.published_at, ${alias}.created_at) END`;
const available = `${mindfulPublicPredicate()} AND EXISTS (SELECT 1 FROM app_users author WHERE author.id = p.owner_id AND author.status = 'active')
  AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks block WHERE block.blocker_id = ? AND block.blocked_owner_id = p.owner_id)`;
export const mindfulPostDto = (row: PostRow, now = new Date().toISOString()): MindfulPost => {
  const due = row.status === 'hidden' && row.review_state === 'pending' && row.policy_state === 'clear'
    && Boolean(row.review_due_at && row.review_due_at <= now);
  const status = due ? 'published' : row.status;
  return { id: row.id, kind: row.kind, nickname: row.nickname, content: row.content, createdAt: row.created_at,
    reactionCount: Number(row.reaction_count), viewerReacted: Boolean(row.viewer_reacted), isOwn: Boolean(row.is_own), status,
    publishedAt: status === 'published' ? (due ? row.review_due_at! : row.published_at ?? row.created_at) : null,
    ...(row.is_own ? { reviewState: due ? 'auto_approved' : row.review_state ?? 'legacy', reviewDueAt: row.review_due_at ?? null,
      reviewRevision: Number(row.review_revision ?? 1), reviewReason: row.review_reason ?? null, policyCode: row.policy_code ?? null } : {}),
  };
};

export function createMindfulCommunityRepository(env: CloudflareEnvLike) {
  return {
    async getOwned(ownerId: string, postId: string, reactionId: string | null = null, now = new Date().toISOString()): Promise<MindfulPostContext | null> {
      // Cold deep link lấy đúng tương tác bằng PK trong cùng query, không dò các trang.
      const row = await env.DB.prepare(`SELECT ${mindfulPostColumns}${reactionId ? `,
          focus.id AS notification_id, focus.nickname AS notification_nickname,
          focus.template_id AS notification_template_id, focus.created_at AS notification_created_at` : ''}
        FROM mindful_posts p ${reactionId ? `
          LEFT JOIN mindful_reaction_inbox n ON n.reaction_id = ? AND n.recipient_id = ?
          LEFT JOIN mindful_reactions focus ON focus.id = n.reaction_id AND focus.post_id = p.id
            AND focus.owner_id <> p.owner_id
            AND EXISTS (SELECT 1 FROM app_users reactor WHERE reactor.id = focus.owner_id AND reactor.status = 'active')
            AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks b WHERE b.blocker_id = p.owner_id AND b.blocked_owner_id = focus.owner_id)` : ''}
        WHERE p.id = ? AND p.owner_id = ? AND ${available}`)
        .bind(ownerId, ownerId, ownerId, ...(reactionId ? [reactionId, ownerId] : []), postId, ownerId, now, ownerId).first<PostContextRow>();
      if (!row) return null;
      const result: MindfulPostContext = { post: mindfulPostDto(row, now) };
      if (reactionId) result.notification = row.notification_id ? {
        id: row.notification_id, postId: row.id, kind: row.kind,
        nickname: row.notification_nickname ?? '', templateId: row.notification_template_id ?? '',
        text: MINDFUL_REACTION_TEMPLATES[row.kind].find(template => template.id === row.notification_template_id)?.text ?? '',
        createdAt: row.notification_created_at ?? '',
      } : null;
      return result;
    },
    async list(viewerId: string | null, kind: MindfulPostKind, mine: boolean, cursor: MindfulCursor | null, range: MindfulDateRange | null = null, now = new Date().toISOString()) {
      // Own feed uses its owner/time index; public feed uses kind/status/time. No N+1 per card.
      if (mine) {
        const rows = await env.DB.prepare(`SELECT ${mindfulPostColumns}, p.created_at AS sort_at FROM mindful_posts p
          WHERE p.owner_id = ? AND p.status <> 'removed' ${range ? 'AND p.created_at >= ? AND p.created_at < ?' : ''}
            ${cursor ? 'AND (p.created_at,p.id) < (?,?)' : ''}
          ORDER BY p.created_at DESC,p.id DESC LIMIT 21`)
          .bind(viewerId, viewerId, viewerId, viewerId, ...(range ? [range.start, range.end] : []), ...(cursor ? [cursor.at, cursor.id] : [])).all<PostRow>();
        return rows.results ?? [];
      }
      // Each indexed branch scans at most 21 candidates before account/block joins. A hidden
      // candidate advances the cursor too, so blocked history never causes an unbounded scan.
      const publishedTime = 'COALESCE(p.published_at,p.created_at)';
      const bounds = (time: string) => `${range ? `AND ${time} >= ? AND ${time} < ?` : ''} ${cursor ? `AND (${time},p.id) < (?,?)` : ''}`;
      const boundValues = [...(range ? [range.start, range.end] : []), ...(cursor ? [cursor.at, cursor.id] : [])];
      const rows = await env.DB.prepare(`WITH candidates AS MATERIALIZED (
        SELECT * FROM (SELECT p.id,${publishedTime} AS sort_at FROM mindful_posts p
          WHERE p.kind = ? AND p.status = 'published' ${bounds(publishedTime)}
          ORDER BY ${publishedTime} DESC,p.id DESC LIMIT 21)
        UNION ALL
        SELECT * FROM (SELECT p.id,p.review_due_at AS sort_at FROM mindful_posts p
          WHERE p.kind = ? AND p.status = 'hidden' AND p.review_state = 'pending' AND p.policy_state = 'clear'
            AND p.review_due_at <= ? ${bounds('p.review_due_at')}
          ORDER BY p.review_due_at DESC,p.id DESC LIMIT 21)
      ) SELECT ${mindfulPostColumns},c.sort_at,
        CASE WHEN EXISTS (SELECT 1 FROM app_users author WHERE author.id=p.owner_id AND author.status='active')
          AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks b WHERE b.blocker_id=? AND b.blocked_owner_id=p.owner_id)
          THEN 1 ELSE 0 END AS visible
        FROM candidates c JOIN mindful_posts p ON p.id=c.id ORDER BY c.sort_at DESC,p.id DESC LIMIT 21`)
        .bind(kind, ...boundValues, kind, now, ...boundValues, viewerId, viewerId, viewerId, viewerId).all<PostRow>();
      return rows.results ?? [];
    },

    async create(ownerId: string, draft: MindfulPostDraft, id: string, now: string, dayStart: string, dayEnd: string,
      policy: MindfulPolicyAssessment = { state: 'clear', code: null, reason: null }, contentHash = '') {
      const blocked = policy.state === 'blocked';
      const due = new Date(Date.parse(now) + 48 * 60 * 60 * 1000).toISOString();
      const statements = [
        env.DB.prepare(`INSERT INTO mindful_posts (id,owner_id,client_post_id,kind,nickname,content,created_at,status,
          review_state,review_due_at,review_revision,policy_state,policy_code,review_operation_id)
          SELECT ?,u.id,?,?,?,?,?,?,?, ?,1,?,?,? FROM app_users u
          WHERE u.id=? AND u.status='active'
            AND (SELECT COUNT(*) FROM (SELECT 1 FROM mindful_posts daily
              WHERE daily.owner_id=u.id AND daily.created_at>=? AND daily.created_at<? LIMIT 2))<2
          ON CONFLICT(owner_id,client_post_id) DO NOTHING`)
          .bind(id,draft.clientPostId,draft.kind,draft.nickname,blocked ? '' : draft.content,now,blocked ? 'removed' : 'hidden',
            blocked ? 'removed' : 'pending',due,policy.state,policy.code,id,ownerId,dayStart,dayEnd),
      ];
      if (blocked) statements.push(
        env.DB.prepare(`INSERT INTO mindful_moderation_audit(post_id,revision,operation_id,action,actor_id,reason,policy_code,content_hash,created_at)
          SELECT id,review_revision,review_operation_id,'policy_remove',NULL,?,?,?,? FROM mindful_posts
          WHERE id=? AND review_operation_id=? ON CONFLICT(post_id,revision) DO NOTHING`)
          .bind(policy.reason,policy.code,contentHash,now,id,id),
        // Automated policy cannot suspend an administrator, including the only active admin.
        // Human admin changes continue through the existing self/last-admin guarded owner.
        env.DB.prepare(`UPDATE app_users SET status='suspended',suspended_at=?,updated_at=?
          WHERE id=? AND status='active' AND role<>'admin'
            AND EXISTS (SELECT 1 FROM mindful_posts p WHERE p.id=? AND p.owner_id=app_users.id
              AND p.review_operation_id=? AND p.policy_state='blocked')`).bind(now,now,ownerId,id,id),
        env.DB.prepare(`UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND changes()>0`).bind(now,ownerId),
      );
      statements.push(env.DB.prepare(`SELECT ${mindfulPostColumns},
        CASE WHEN p.policy_state='blocked' THEN (SELECT a.content_hash FROM mindful_moderation_audit a
          WHERE a.post_id=p.id AND a.action='policy_remove' ORDER BY a.revision LIMIT 1) ELSE NULL END AS content_hash,
        CASE WHEN p.policy_state='blocked' AND EXISTS (SELECT 1 FROM app_users u WHERE u.id=p.owner_id AND u.status='suspended')
          THEN 1 ELSE 0 END AS account_locked FROM mindful_posts p WHERE p.owner_id=? AND p.client_post_id=?`)
        .bind(ownerId,ownerId,ownerId,ownerId,draft.clientPostId));
      const results = await env.DB.batch(statements);
      const row = results.at(-1)?.results?.[0] as PostRow | undefined;
      return row ? { ...mindfulPostDto(row,now), accountLocked:Boolean(row.account_locked), accountLockReason:row.account_locked ? row.review_reason ?? policy.reason : null,
        ...(typeof row.content_hash === 'string' ? { submissionFingerprint:row.content_hash } : {}) } : null;
    },

    async react(ownerId: string, postId: string, templateId: string, nickname: string, now: string, reactionId: string): Promise<MindfulReactionResult | null> {
      const results = await env.DB.batch([
        env.DB.prepare(`INSERT INTO mindful_reactions (id, post_id, owner_id, template_id, nickname, created_at)
          SELECT ?, p.id, u.id, ?, ?, ? FROM mindful_posts p JOIN app_users u ON u.id = ? AND u.status = 'active'
          WHERE p.id = ? AND ${available}
            AND ((p.kind = 'repentance' AND ? IN ('tam-bao', 'bo-de', 'quan-am'))
              OR (p.kind = 'good_deed' AND ? IN ('hoan-hy', 'thien-can')))
          ON CONFLICT(post_id, owner_id) DO NOTHING`)
          .bind(reactionId, templateId, nickname, now, ownerId, postId, now, ownerId, templateId, templateId),
        // changes() refers to the immediately preceding statement in this atomic batch.
        env.DB.prepare(`UPDATE mindful_posts SET reaction_count = reaction_count + 1
          WHERE id = ? AND changes() = 1`).bind(postId),
        env.DB.prepare(`SELECT p.id AS postId, p.reaction_count AS reactionCount, r.template_id AS templateId
          FROM mindful_posts p JOIN mindful_reactions r ON r.post_id = p.id AND r.owner_id = ?
          WHERE p.id = ? AND ${available}`).bind(ownerId, postId, now, ownerId),
      ]);
      const row = results[2].results?.[0];
      return row ? { postId: String(row.postId), reactionCount: Number(row.reactionCount), viewerReacted: true,
        templateId: String(row.templateId) } : null;
    },

    async reactions(viewerId: string | null, postId: string, cursor: MindfulCursor | null, now = new Date().toISOString()) {
      const results = await env.DB.prepare(`SELECT r.nickname, r.template_id, r.created_at, r.id AS cursor_id, p.kind
        FROM mindful_reactions r JOIN mindful_posts p ON p.id = r.post_id
        JOIN app_users reactor ON reactor.id = r.owner_id AND reactor.status = 'active'
        WHERE r.post_id = ? AND ${available}
          AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks block WHERE block.blocker_id = ? AND block.blocked_owner_id = r.owner_id)
          ${cursor ? 'AND (r.created_at, r.id) < (?, ?)' : ''}
        ORDER BY r.created_at DESC, r.id DESC LIMIT 21`)
        .bind(postId, now, viewerId, viewerId, ...(cursor ? [cursor.at, cursor.id] : [])).all<ReactionRow>();
      return results.results ?? [];
    },

    async remove(ownerId: string, postId: string, admin: boolean) {
      const result = await env.DB.prepare(`UPDATE mindful_posts SET status = 'removed', content = '', nickname = 'Đồng Tu',
        review_state='removed',review_revision=review_revision+1
        WHERE id = ? AND (owner_id = ? OR ? = 1)
          AND EXISTS (SELECT 1 FROM app_users actor WHERE actor.id = ? AND actor.status = 'active')
        RETURNING id`).bind(postId, ownerId, Number(admin), ownerId).first();
      return Boolean(result);
    },
  };
}
