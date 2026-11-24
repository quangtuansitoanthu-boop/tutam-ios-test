import type { CloudflareEnvLike, D1ResultRow } from '../cloudflare-context';
import type { MindfulBulkApprovalPreparation, MindfulBulkApprovalResult, MindfulModerationItem, MindfulModerationPage,
  MindfulModerationState, MindfulPostKind } from '../../contracts/mindful-community';
import { mindfulPostColumns, mindfulPostDto } from './mindful-community-repository';
import { ServerInputError } from '../errors';

interface Cursor { at: string; id: string }
interface Candidate { id: string; revision: number; at: string; eligible: number }
interface OperationRow extends D1ResultRow {
  operation_id: string; actor_id: string; kind: MindfulPostKind | null; cutoff: string; snapshot_sequence: number;
  next_cursor: string | null; last_cursor: string | null; last_updated: number; last_conflicted: number;
  last_response_cursor: string | null; revision: number; expires_at: string; candidates?: string; pending_count?: number;
}
export const encodeMindfulReviewCursor = (cursor: Cursor): string => btoa(JSON.stringify(cursor)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
export function decodeMindfulReviewCursor(value: string | null): Cursor | null {
  if (value === null || value === '') return null;
  try {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('cursor');
    const cursor = JSON.parse(atob(value.replaceAll('-', '+').replaceAll('_', '/')));
    if (!cursor || typeof cursor.at !== 'string' || !Number.isFinite(Date.parse(cursor.at))
      || typeof cursor.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u.test(cursor.id)) throw new Error('cursor');
    return { at: cursor.at, id: cursor.id };
  } catch { throw new ServerInputError(400, 'invalid_cursor', 'Vị trí hàng đợi không hợp lệ.'); }
}
const pending = `(p.status='hidden' AND p.review_state='pending' AND (p.policy_state='unknown' OR p.review_due_at>?))`;
const activeAdmin = `EXISTS (SELECT 1 FROM app_users actor WHERE actor.id=? AND actor.role='admin' AND actor.status='active')`;
const summary = (value: unknown) => ({ count: Math.min(Number(value ?? 0), 99), capped: Number(value ?? 0) >= 100 });
const conflict = () => new ServerInputError(409, 'moderation_conflict', 'Nội dung hoặc phiên duyệt đã thay đổi. Vui lòng tải lại hàng đợi.');
function operationResult(row: OperationRow): MindfulBulkApprovalResult {
  return { operationId: row.operation_id, cutoff: row.cutoff, updated: Number(row.last_updated), conflicted: Number(row.last_conflicted), nextCursor: row.last_response_cursor };
}

export function createMindfulModerationRepository(env: CloudflareEnvLike) {
  return {
    async list(state: MindfulModerationState, adminId: string, options: { after: string | null; limit: number; kind?: MindfulPostKind }, now: string): Promise<MindfulModerationPage> {
      const cursor = decodeMindfulReviewCursor(options.after);
      const predicate = "p.status='hidden' AND p.review_state='rejected'";
      const kindFilter=options.kind ? 'AND p.kind=?' : '';
      const kindValues=options.kind ? [options.kind] : [];
      const branch=(condition:string,sort:string,ordered:string,comparison=sort)=>`SELECT * FROM (SELECT p.id,${sort} AS sort_at
        FROM mindful_posts p WHERE ${condition} ${kindFilter} ${cursor ? `AND (${comparison},p.id)<(?,?)` : ''}
        ORDER BY ${ordered} DESC,p.id DESC LIMIT ${options.limit+1})`;
      const branchValues=(hasTime:boolean)=>[...(hasTime ? [now] : []),...kindValues,
        ...(cursor ? [cursor.at,cursor.id] : [])];
      const published='COALESCE(p.published_at,p.created_at)';
      const candidates=state==='published'
        ? `${branch("p.status='published'",published,published)} UNION ALL ${branch("p.status='hidden' AND p.review_state='pending' AND p.policy_state='clear' AND p.review_due_at<=?",'p.review_due_at','p.review_due_at')}`
        : state==='pending'
          ? `${branch("p.status='hidden' AND p.review_state='pending' AND p.policy_state='unknown'",'p.created_at','p.created_at')} UNION ALL ${branch("p.status='hidden' AND p.review_state='pending' AND p.policy_state='clear' AND p.review_due_at>?",'p.created_at','p.created_at')}`
          : branch(predicate,'p.created_at','p.created_at');
      // Submission ordering and eligibility deadlines are independent stored values.
      // Seek the actual submission cursor; never reconstruct it from a review deadline.
      const candidateValues=state==='rejected' ? branchValues(false) : [...branchValues(false),...branchValues(true)];
      const result = await env.DB.batch([
        env.DB.prepare(`WITH candidates AS MATERIALIZED (${candidates})
          SELECT ${mindfulPostColumns},p.owner_id,u.display_name AS member_name,u.role AS member_role,u.status AS member_status,
          c.sort_at,(SELECT a.reason FROM mindful_moderation_audit a WHERE a.post_id=p.id AND a.revision=p.review_revision) AS admin_reason
          FROM (SELECT * FROM candidates ORDER BY sort_at DESC,id DESC LIMIT ${options.limit+1}) c
          JOIN mindful_posts p ON p.id=c.id JOIN app_users u ON u.id=p.owner_id ORDER BY c.sort_at DESC,p.id DESC`)
          .bind(...candidateValues,adminId,adminId,adminId),
        env.DB.prepare(`SELECT
          (SELECT COUNT(*) FROM (SELECT 1 FROM (
            SELECT * FROM (SELECT p.id FROM mindful_posts p WHERE p.status='hidden' AND p.review_state='pending' AND p.policy_state='unknown' ${kindFilter} LIMIT 100)
            UNION ALL SELECT * FROM (SELECT p.id FROM mindful_posts p WHERE p.status='hidden' AND p.review_state='pending' AND p.policy_state='clear' AND p.review_due_at>? ${kindFilter} LIMIT 100)
          ) LIMIT 100)) AS pending_count,
          (SELECT COUNT(*) FROM (SELECT 1 FROM (
            SELECT * FROM (SELECT p.id FROM mindful_posts p WHERE p.status='published' ${kindFilter} LIMIT 100)
            UNION ALL SELECT * FROM (SELECT p.id FROM mindful_posts p WHERE p.status='hidden' AND p.review_state='pending' AND p.policy_state='clear' AND p.review_due_at<=? ${kindFilter} LIMIT 100)
          ) LIMIT 100)) AS published_count`)
          .bind(...kindValues,now,...kindValues,...kindValues,now,...kindValues),
      ]);
      const rows = result[0].results ?? [];
      const page = rows.slice(0,options.limit);
      const last = page.at(-1);
      const items = page.map(row => ({ ...mindfulPostDto({ ...row,is_own:1 } as Parameters<typeof mindfulPostDto>[0],now),
        isOwn:row.owner_id === adminId,reviewReason:row.admin_reason == null ? null : String(row.admin_reason),
        member:{ id:String(row.owner_id),name:String(row.member_name ?? 'Thành viên'),role:row.member_role === 'admin' ? 'admin' : 'user',
          status:row.member_status === 'suspended' ? 'suspended' : 'active',isSelf:row.owner_id === adminId } })) as MindfulModerationItem[];
      return { items,nextCursor:rows.length>options.limit && last ? encodeMindfulReviewCursor({ at:String(last.sort_at),id:String(last.id) }) : null,
        summary:{ pending:summary(result[1].results?.[0]?.pending_count),published:summary(result[1].results?.[0]?.published_count) } };
    },

    async decide(postId: string, decision: { action:'approve'|'reject'|'delete'; revision:number; reason:string }, adminId: string, now: string, operationId: string): Promise<boolean> {
      const approve = decision.action === 'approve';
      const remove = decision.action === 'delete';
      const results = await env.DB.batch([
        env.DB.prepare(`UPDATE mindful_posts AS p SET status=?,review_state=?,review_revision=review_revision+1,
          reviewed_by=?,reviewed_at=?,review_operation_id=?,published_at=${approve ? '?' : 'published_at'}
          ${remove ? ",content='',nickname='Đồng Tu'" : ''}
          WHERE p.id=? AND p.review_revision=? AND p.status<>'removed' AND p.policy_state<>'blocked'
            ${remove ? '' : `AND ${pending}`} AND ${activeAdmin}`)
          .bind(approve ? 'published' : remove ? 'removed' : 'hidden',approve ? 'approved' : remove ? 'removed' : 'rejected',adminId,now,operationId,
            ...(approve ? [now] : []),postId,decision.revision,...(remove ? [] : [now]),adminId),
        env.DB.prepare(`INSERT INTO mindful_moderation_audit(post_id,revision,operation_id,action,actor_id,reason,policy_code,created_at)
          SELECT p.id,p.review_revision,?,?,?, ?,p.policy_code,? FROM mindful_posts p
          WHERE p.id=? AND p.review_operation_id=? AND p.review_revision=?
          ON CONFLICT(post_id,revision) DO NOTHING`)
          .bind(operationId,decision.action,adminId,decision.reason,now,postId,operationId,decision.revision+1),
        env.DB.prepare(`SELECT id FROM mindful_moderation_audit WHERE post_id=? AND revision=? AND operation_id=?
          AND action=? AND actor_id=? AND reason=?`).bind(postId,decision.revision+1,operationId,decision.action,adminId,decision.reason),
      ]);
      return Boolean(results[2].results?.length);
    },

    async prepareApproveAll(input: { operationId:string; kind?:MindfulPostKind }, adminId:string, now:string): Promise<MindfulBulkApprovalPreparation> {
      const expires = new Date(Date.parse(now)+86400000).toISOString();
      const kindFilter=input.kind ? 'AND p.kind=?' : '';
      const kindValues=input.kind ? [input.kind] : [];
      const results = await env.DB.batch([
        env.DB.prepare(`INSERT INTO mindful_moderation_operations(operation_id,actor_id,kind,cutoff,snapshot_sequence,pending_count,next_cursor,expires_at,created_at,updated_at)
          SELECT ?,?,?,?,COALESCE((SELECT MAX(id) FROM mindful_moderation_audit),0),
            (SELECT COUNT(*) FROM (SELECT 1 FROM (
              SELECT * FROM (SELECT p.id FROM mindful_posts p WHERE p.status='hidden' AND p.review_state='pending'
                AND p.policy_state='unknown' AND p.created_at<=? ${kindFilter} LIMIT 100)
              UNION ALL SELECT * FROM (SELECT p.id FROM mindful_posts p WHERE p.status='hidden' AND p.review_state='pending'
                AND p.policy_state='clear' AND p.review_due_at>? AND p.created_at<=? ${kindFilter} LIMIT 100)
            ) LIMIT 100)),'',?,?,?
          WHERE ${activeAdmin} ON CONFLICT(operation_id) DO NOTHING`)
          .bind(input.operationId,adminId,input.kind ?? null,now,now,...kindValues,now,now,...kindValues,expires,now,now,adminId),
        env.DB.prepare(`SELECT * FROM mindful_moderation_operations WHERE operation_id=? AND actor_id=?`)
          .bind(input.operationId,adminId),
      ]);
      const row = results[1].results?.[0] as OperationRow | undefined;
      if (!row || row.kind !== (input.kind ?? null) || row.expires_at<=now) throw conflict();
      return { operationId:row.operation_id,cutoff:row.cutoff,expiresAt:row.expires_at,summary:summary(row.pending_count) };
    },

    async approveAll(input: { operationId:string; cutoff:string; after:string|null; kind?:MindfulPostKind }, adminId:string, now:string): Promise<MindfulBulkApprovalResult> {
      const after = input.after ?? '';
      const cursor = decodeMindfulReviewCursor(after);
      const kindFilter=input.kind ? 'AND p.kind=?' : '';
      const kindValues=input.kind ? [input.kind] : [];
      // One bounded read obtains both the durable fence and at most 101 eligible candidates.
      const op = await env.DB.prepare(`SELECT op.*,(SELECT json_group_array(json_object('id',candidate.id,'revision',candidate.review_revision,'at',candidate.created_at,'eligible',candidate.eligible))
        FROM (SELECT bounded.id,bounded.review_revision,bounded.created_at,
          EXISTS (SELECT 1 FROM mindful_moderation_audit a WHERE a.post_id=bounded.id AND a.revision=0 AND a.id<=op.snapshot_sequence) AS eligible
          FROM (
            SELECT * FROM (SELECT p.id,p.review_revision,p.created_at FROM mindful_posts p
              WHERE p.status='hidden' AND p.review_state='pending' AND p.policy_state='unknown'
                AND p.created_at<=op.cutoff ${kindFilter} ${cursor ? 'AND (p.created_at,p.id)<(?,?)' : ''}
              ORDER BY p.created_at DESC,p.id DESC LIMIT 101)
            UNION ALL
            SELECT * FROM (SELECT p.id,p.review_revision,p.created_at FROM mindful_posts p
              WHERE p.status='hidden' AND p.review_state='pending' AND p.policy_state='clear'
                AND p.review_due_at>? AND p.created_at<=op.cutoff
                ${kindFilter} ${cursor ? 'AND (p.created_at,p.id)<(?,?)' : ''}
              ORDER BY p.created_at DESC,p.id DESC LIMIT 101)
          ) bounded ORDER BY bounded.created_at DESC,bounded.id DESC LIMIT 101) candidate) AS candidates
        FROM mindful_moderation_operations op WHERE op.operation_id=? AND op.actor_id=?`)
        .bind(...kindValues,...(cursor ? [cursor.at,cursor.id] : []),now,...kindValues,
          ...(cursor ? [cursor.at,cursor.id] : []),input.operationId,adminId).first<OperationRow>();
      if (!op || op.kind !== (input.kind ?? null) || op.cutoff !== input.cutoff || op.expires_at<=now) throw conflict();
      if (op.last_cursor === after) return operationResult(op);
      if (op.next_cursor !== after) throw conflict();
      const candidates = JSON.parse(op.candidates ?? '[]') as Candidate[];
      const scanned = candidates.slice(0,100);
      const selected = scanned.filter(row=>row.eligible===1);
      const last = scanned.at(-1);
      const nextCursor = candidates.length>100 && last ? encodeMindfulReviewCursor(last) : null;
      const chunkOperation = `${input.operationId}:${op.revision}`;
      const json = JSON.stringify(selected.map(row => ({ id:row.id,revision:row.revision })));
      const results = await env.DB.batch([
        env.DB.prepare(`UPDATE mindful_posts AS p SET status='published',review_state='approved',review_revision=review_revision+1,
          reviewed_by=?,reviewed_at=?,published_at=?,review_operation_id=?
          WHERE p.id IN (SELECT json_extract(value,'$.id') FROM json_each(?))
            AND EXISTS (SELECT 1 FROM json_each(?) chosen WHERE json_extract(chosen.value,'$.id')=p.id
              AND json_extract(chosen.value,'$.revision')=p.review_revision)
            AND ${pending} AND ${activeAdmin}
            AND EXISTS (SELECT 1 FROM mindful_moderation_operations op WHERE op.operation_id=? AND op.actor_id=?
              AND op.revision=? AND op.next_cursor=? AND op.expires_at>?
              AND (op.kind IS NULL OR p.kind=op.kind) AND p.created_at<=op.cutoff
              AND EXISTS (SELECT 1 FROM mindful_moderation_audit submitted WHERE submitted.post_id=p.id
                AND submitted.revision=0 AND submitted.id<=op.snapshot_sequence))`)
          .bind(adminId,now,now,chunkOperation,json,json,now,adminId,input.operationId,adminId,op.revision,after,now),
        env.DB.prepare(`INSERT INTO mindful_moderation_audit(post_id,revision,operation_id,action,actor_id,created_at)
          SELECT id,review_revision,?,'approve',?,? FROM mindful_posts WHERE review_operation_id=?
            AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?))
          ON CONFLICT(post_id,revision) DO NOTHING`).bind(chunkOperation,adminId,now,chunkOperation,json),
        env.DB.prepare(`UPDATE mindful_moderation_operations SET last_cursor=?,next_cursor=?,last_response_cursor=?,
          last_updated=(SELECT COUNT(*) FROM mindful_moderation_audit WHERE operation_id=?
            AND post_id IN (SELECT json_extract(value,'$.id') FROM json_each(?))),
          last_conflicted=?-(SELECT COUNT(*) FROM mindful_moderation_audit WHERE operation_id=?
            AND post_id IN (SELECT json_extract(value,'$.id') FROM json_each(?))),
          revision=revision+1,updated_at=? WHERE operation_id=? AND actor_id=? AND revision=? AND next_cursor=? RETURNING *`)
          .bind(after,nextCursor,nextCursor,chunkOperation,json,selected.length,chunkOperation,json,now,input.operationId,adminId,op.revision,after),
      ]);
      const committed = results[2].results?.[0] as OperationRow | undefined;
      if (committed) return operationResult(committed);
      // Concurrent identical requests can lose the CAS but must replay the winner's receipt.
      const replay = await env.DB.prepare('SELECT * FROM mindful_moderation_operations WHERE operation_id=? AND actor_id=?')
        .bind(input.operationId,adminId).first<OperationRow>();
      if (replay?.last_cursor === after && replay.cutoff===input.cutoff && replay.kind===(input.kind ?? null)) return operationResult(replay);
      throw conflict();
    },

    async publishDue(now:string,operationId:string): Promise<{ updated:number }> {
      // Force the due-range partial index: SQLite can otherwise choose the state queue
      // index and sort an entire pending backlog before honoring the bounded LIMIT.
      const results = await env.DB.batch([
        env.DB.prepare(`UPDATE mindful_posts SET status='published',review_state='auto_approved',published_at=review_due_at,
          reviewed_at=?,reviewed_by=NULL,review_operation_id=?,review_revision=review_revision+1
          WHERE id IN (SELECT id FROM mindful_posts INDEXED BY idx_mindful_review_due WHERE status='hidden' AND review_state='pending'
            AND policy_state='clear' AND review_due_at<=? ORDER BY review_due_at,id LIMIT 100)
            AND status='hidden' AND review_state='pending' AND policy_state='clear' AND review_due_at<=?`)
          .bind(now,operationId,now,now),
        env.DB.prepare(`INSERT INTO mindful_moderation_audit(post_id,revision,operation_id,action,created_at)
          SELECT id,review_revision,?,'auto_approve',? FROM mindful_posts WHERE review_operation_id=?
            AND status='published' AND review_state='auto_approved' AND reviewed_at=?
          ON CONFLICT(post_id,revision) DO NOTHING`).bind(operationId,now,operationId,now),
      ]);
      return { updated:Number(results[0].meta?.changes ?? 0) };
    },

    async cleanupOperations(now:string): Promise<number> {
      const result = await env.DB.prepare(`DELETE FROM mindful_moderation_operations WHERE operation_id IN
        (SELECT operation_id FROM mindful_moderation_operations WHERE expires_at<=? ORDER BY expires_at,operation_id LIMIT 100)`).bind(now).run();
      return Number(result.meta?.changes ?? 0);
    },

    async pendingNotifications(limit:number,now:string): Promise<Array<{ id:string;kind:MindfulPostKind;nickname:string;createdAt:string;reviewDueAt:string|null }>> {
      const cap=Math.min(20,Math.max(1,Math.floor(limit)));
      const rows = await env.DB.prepare(`SELECT * FROM (
        SELECT * FROM (SELECT p.id,p.kind,p.nickname,p.created_at,p.review_due_at FROM mindful_posts p
          WHERE p.status='hidden' AND p.review_state='pending' AND p.policy_state='unknown'
          ORDER BY p.created_at DESC,p.id DESC LIMIT ${cap})
        UNION ALL SELECT * FROM (SELECT p.id,p.kind,p.nickname,p.created_at,p.review_due_at FROM mindful_posts p
          WHERE p.status='hidden' AND p.review_state='pending' AND p.policy_state='clear' AND p.review_due_at>?
          ORDER BY p.created_at DESC,p.id DESC LIMIT ${cap})
      ) ORDER BY created_at DESC,id DESC LIMIT ${cap}`).bind(now).all();
      return (rows.results ?? []).map(row => ({ id:String(row.id),kind:row.kind as MindfulPostKind,nickname:String(row.nickname),
        createdAt:String(row.created_at),reviewDueAt:row.review_due_at == null ? null : String(row.review_due_at) }));
    },
  };
}
