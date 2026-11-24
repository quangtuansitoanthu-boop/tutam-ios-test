import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import application from '../../migrations/0001-application-schema.sql?raw';
import auth from '../../migrations/0002-auth-and-session-schema.sql?raw';
import visitors from '../../migrations/0008-active-visitors.sql?raw';
import activity from '../../migrations/0017-user-activity-foundations.sql?raw';
import community from '../../migrations/0020-practice-community-achievements.sql?raw';
import replies from '../../migrations/0022-comment-replies-and-album-plays.sql?raw';
import members from '../../migrations/0026-member-status.sql?raw';
import moderation from '../../migrations/0038-ugc-moderation.sql?raw';
import mindful from '../../migrations/0041-mindful-community.sql?raw';
import inbox from '../../migrations/0043-mindful-reaction-inbox.sql?raw';
import review from '../../migrations/0047-mindful-review.sql?raw';
import { createMindfulCommunityService } from '../../src/lib/server/services/mindful-community.ts';
import { createMindfulCommunityRepository } from '../../src/lib/server/repositories/mindful-community-repository.ts';
import { createMindfulModerationService } from '../../src/lib/server/services/mindful-moderation.ts';
import { createMindfulModerationRepository } from '../../src/lib/server/repositories/mindful-moderation-repository.ts';

const NOW = '2026-11-21T10:00:00.000Z';
const DUE = '2026-11-23T10:00:00.000Z';
const split = sql => {
  const triggers = [...sql.matchAll(/CREATE TRIGGER[\s\S]*?END;/gu)].map(match => match[0]);
  return [...sql.replace(/CREATE TRIGGER[\s\S]*?END;/gu, '').replace(/^\s*--.*$/gmu, '').split(';').map(part => part.trim()).filter(Boolean).map(part => `${part};`), ...triggers];
};
beforeAll(async () => {
  await applyD1Migrations(env.DB, [application, auth, visitors, activity, community, replies, members, moderation, mindful, inbox, review]
    .map((sql, index) => ({ name: `review-${index}.sql`, queries: split(sql) })));
});
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM app_users').run();
  for (const id of ['owner', 'viewer', 'admin', 'other']) await env.DB.prepare(`INSERT INTO app_users(id,display_name,role,status)
    VALUES(?,?,?,'active')`).bind(id, `Private ${id}`, id === 'admin' ? 'admin' : 'user').run();
});
function context(owner = 'owner') { return { env: { ...env, PRACTICE_COMMUNITY_ENABLED: 'true' }, principal: owner ? { appUserId: owner, role: owner === 'admin' ? 'admin' : 'user' } : null, requestId: 'review-test' }; }
function service(owner = 'owner', now = NOW, repository) { return createMindfulCommunityService(context(owner), { now: () => new Date(now), ...(repository ? { repository } : {}) }); }
function admin(now = NOW) { return createMindfulModerationService(context('admin'), { now: () => new Date(now) }); }
const draft = (id = 'one', kind = 'repentance', content = 'Tôi thành tâm nhận lỗi và nguyện sửa đổi, sống thiện lành mỗi ngày.') => ({ clientPostId: id, kind, nickname: 'Diệu Âm', content });
const reaction = { templateId: 'tam-bao', nickname: 'Thiện Tâm' };

describe('mindful 48 hour review on actual D1', () => {
  it.each(['repentance', 'good_deed'])('holds %s until exactly 48 hours, including all public reads and reactions', async kind => {
    const { post } = await service().create(draft('one', kind));
    expect(post).toMatchObject({ status: 'hidden', reviewState: 'pending', reviewDueAt: DUE, reviewRevision: 1, publishedAt: null });
    expect((await service().list(kind, true, null)).items[0]).toMatchObject({ id: post.id, reviewState: 'pending' });
    expect((await service('viewer', '2026-11-23T09:59:59.999Z').list(kind, false, null)).items).toEqual([]);
    await expect(service('viewer').react(post.id, { ...reaction, templateId: kind === 'good_deed' ? 'hoan-hy' : 'tam-bao' })).rejects.toMatchObject({ status: 404 });
    expect((await service('viewer').reactions(post.id, null)).items).toEqual([]);
    const published = await service('viewer', DUE).list(kind, false, null, 'today');
    expect(published.items[0]).toMatchObject({ id: post.id, status: 'published', publishedAt: DUE, createdAt: NOW });
    expect(published.items[0]).not.toHaveProperty('reviewReason');
    expect((await service('owner', DUE).get(post.id)).post.id).toBe(post.id);
    await service('viewer', DUE).react(post.id, { ...reaction, templateId: kind === 'good_deed' ? 'hoan-hy' : 'tam-bao' });
    expect((await service('owner', DUE).notifications(null)).items).toHaveLength(1);
  });

  it('preserves idempotency, Vietnam daily quota across kinds and owner deletion during review', async () => {
    const first = await service().create(draft());
    expect(await service().create(draft())).toEqual(first);
    await service().create(draft('two', 'good_deed'));
    await service().remove(first.post.id);
    await expect(service().create(draft('three'))).rejects.toMatchObject({ code: 'mindful_daily_limit' });
    expect((await service().create(draft('two', 'good_deed'))).post.reviewState).toBe('pending');
    await expect(service().create(draft('two', 'good_deed', 'Khác nội dung'))).rejects.toMatchObject({ status: 409 });
  });

  it('rejects with an owner-only reason and does not auto-publish a rejected or deleted post', async () => {
    const { post } = await service().create(draft());
    await admin().decide(post.id, { action: 'reject', revision: 1, reason: 'Xin chỉnh sửa cách diễn đạt.' });
    expect((await service().list('repentance', true, null)).items[0]).toMatchObject({ reviewState: 'rejected', reviewReason: 'Xin chỉnh sửa cách diễn đạt.', reviewRevision: 2 });
    expect((await service('viewer', DUE).list('repentance', false, null)).items).toEqual([]);
    expect(await createMindfulModerationRepository(env).publishDue(DUE, 'cron-reject')).toMatchObject({ updated: 0 });
    await expect(admin().decide(post.id, { action: 'approve', revision: 1 })).rejects.toMatchObject({ status: 409 });
    await admin().decide(post.id, { action: 'delete', revision: 2, reason: 'Xóa bài theo yêu cầu.' });
    expect(await env.DB.prepare('SELECT status, content FROM mindful_posts WHERE id=?').bind(post.id).first()).toEqual({ status: 'removed', content: '' });
  });

  it('publishes an approval once and gives concurrent stale decisions a conflict', async () => {
    const { post } = await service().create(draft());
    const results = await Promise.allSettled([
      admin().decide(post.id, { action: 'approve', revision: 1 }),
      admin().decide(post.id, { action: 'reject', revision: 1, reason: 'Lý do khác.' }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.status).toBe(409);
    expect((await env.DB.prepare('SELECT revision FROM mindful_moderation_audit WHERE post_id=? AND revision>0').bind(post.id).all()).results).toEqual([{ revision: 2 }]);
  });

  it('uses deadline publication time for today/cursors before and after delayed cron, without resurrection', async () => {
    const { post } = await service().create(draft());
    const before = await service('viewer', DUE).list('repentance', false, null, 'today');
    expect(await createMindfulModerationRepository(env).publishDue('2026-11-23T12:17:00.000Z', 'cron-due')).toMatchObject({ updated: 1 });
    const after = await service('viewer', '2026-11-23T12:18:00.000Z').list('repentance', false, null, 'today');
    expect(after.items).toEqual(before.items);
    await admin('2026-11-23T12:19:00.000Z').decide(post.id, { action: 'delete', revision: 2, reason: 'Xóa bài đã công khai.' });
    expect(await createMindfulModerationRepository(env).publishDue('2026-11-24T00:17:00.000Z', 'cron-again')).toMatchObject({ updated: 0 });
  });

  it('atomically removes only a confidently prohibited post, audits no body, suspends and revokes sessions', async () => {
    await service().create(draft('safe'));
    await env.DB.prepare(`INSERT INTO auth_sessions(id,user_id,token_hash,csrf_token_hash,created_at,expires_at)
      VALUES('s','owner','token-hash','csrf-hash',?,'2027-01-01T00:00:00.000Z')`).bind(NOW).run();
    const result = await service().create(draft('blocked', 'good_deed', 'Hãy chuyển khoản vào số tài khoản 123456789 để quyên góp cho tôi ngay hôm nay.'));
    expect(result).toMatchObject({ accountLocked: true, post: { status: 'removed', content: '', policyCode: 'fundraising_solicitation' } });
    expect(await env.DB.prepare("SELECT status FROM app_users WHERE id='owner'").first()).toEqual({ status: 'suspended' });
    expect(await env.DB.prepare("SELECT revoked_at FROM auth_sessions WHERE id='s'").first()).toEqual({ revoked_at: NOW });
    expect((await env.DB.prepare('SELECT status, content FROM mindful_posts WHERE client_post_id=\'safe\'').first()).content).not.toBe('');
    const audit = await env.DB.prepare("SELECT reason, content_hash FROM mindful_moderation_audit WHERE post_id=? AND action='policy_remove'").bind(result.post.id).first();
    expect(audit.reason).not.toContain('123456789');
    expect(audit.content_hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(await env.DB.prepare("SELECT content_hash,reason FROM mindful_moderation_audit WHERE post_id=? AND revision=0").bind(result.post.id).first())
      .toEqual({content_hash:null,reason:''});
    expect((await service('viewer', DUE).list('good_deed', false, null)).items).toEqual([]);
  });

  it('quarantines legacy-writer submissions without changing pre-migration legacy history', async () => {
    await env.DB.prepare(`INSERT INTO mindful_posts(id,owner_id,client_post_id,kind,nickname,content,created_at)
      VALUES('legacy-new','owner','legacy-new','repentance','Bạn đạo','Nội dung chưa được quét',?)`).bind(NOW).run();
    expect(await env.DB.prepare("SELECT status, review_state, policy_state FROM mindful_posts WHERE id='legacy-new'").first())
      .toEqual({ status: 'hidden', review_state: 'pending', policy_state: 'unknown' });
    expect((await service('viewer', DUE).list('repentance', false, null)).items).toEqual([]);
    expect(await createMindfulModerationRepository(env).publishDue(DUE, 'cron-old')).toMatchObject({ updated: 0 });
    const queue=await admin(DUE).list('pending');
    expect(queue.items.map(row=>row.id)).toEqual(['legacy-new']);
    expect(await createMindfulModerationRepository(env).pendingNotifications(20,DUE)).toMatchObject([{id:'legacy-new'}]);
    await admin(DUE).decide('legacy-new',{action:'approve',revision:1});
    expect((await service('viewer',DUE).list('repentance',false,null)).items.map(row=>row.id)).toEqual(['legacy-new']);
  });

  it('keeps normal submission at one two-statement batch and bulk approval set based at <=100 per chunk', async () => {
    const batches = [];
    const db = { prepare: sql => env.DB.prepare(sql), async batch(statements) { batches.push(statements.length); return env.DB.batch(statements); } };
    await service('owner', NOW, createMindfulCommunityRepository({ DB: db })).create(draft());
    expect(batches).toEqual([2]);
    for (let index = 0; index < 105; index++) await env.DB.prepare(`INSERT INTO mindful_posts
      (id,owner_id,client_post_id,kind,nickname,content,created_at,status,review_state,review_due_at,review_revision,policy_state)
      VALUES(?, 'owner', ?, 'repentance', 'Bạn đạo', 'Nội dung chờ duyệt', ?, 'hidden', 'pending', ?, 1, 'clear')`)
      .bind(`bulk-${index.toString().padStart(3, '0')}`, `bulk-${index}`, NOW, DUE).run();
    const repository = createMindfulModerationRepository({ DB: db });
    const preparation=await repository.prepareApproveAll({operationId:'bulk-op'},'admin',NOW);
    expect(preparation.summary).toEqual({count:99,capped:true});
    batches.length = 0;
    const result = await repository.approveAll({ operationId:'bulk-op',cutoff:preparation.cutoff,after:null }, 'admin', NOW);
    expect(result.updated).toBe(100);
    expect(result.nextCursor).toBeTruthy();
    expect(batches).toEqual([3]);
    expect((await env.DB.prepare("SELECT COUNT(*) AS total FROM mindful_moderation_audit WHERE operation_id='bulk-op:1'").first()).total).toBe(100);
    const sql=[];
    const scheduledRepository=createMindfulModerationRepository({DB:{prepare:query=>{sql.push(query);return env.DB.prepare(query);},batch:statements=>env.DB.batch(statements)}});
    await scheduledRepository.publishDue(DUE,'explain-cron');
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql[0]}`).bind(DUE,'explain-cron',DUE,DUE).all();
    expect(plan.results.some(row => /idx_mindful_review_due/u.test(String(row.detail)))).toBe(true);
    expect(plan.results.some(row=>/USE TEMP B-TREE/u.test(String(row.detail)))).toBe(false);
  });

  it('prepares without decisions, excludes new same-millisecond submissions and survives highest-row deletion', async()=>{
    const first=await service().create(draft('snapshot-one'));
    const highest=await service('viewer').create(draft('snapshot-highest'));
    const preparation=await admin().prepareApproveAll({operationId:'snapshot-op',kind:'repentance'});
    expect(preparation.summary).toEqual({count:2,capped:false});
    expect((await service().list('repentance',true,null)).items[0].reviewState).toBe('pending');
    await env.DB.prepare('DELETE FROM mindful_posts WHERE id=?').bind(highest.post.id).run();
    const later=await service('viewer').create(draft('snapshot-later'));
    const result=await admin().approveAll({operationId:'snapshot-op',cutoff:preparation.cutoff,kind:'repentance'});
    expect(result).toMatchObject({updated:1,conflicted:0,nextCursor:null});
    expect((await service('viewer').list('repentance',false,null)).items.map(row=>row.id)).toEqual([first.post.id]);
    expect((await service('viewer').list('repentance',true,null)).items.find(row=>row.id===later.post.id).reviewState).toBe('pending');
    expect(await admin().approveAll({operationId:'snapshot-op',cutoff:preparation.cutoff,kind:'repentance'})).toEqual(result);
    await expect(admin().approveAll({operationId:'snapshot-op',cutoff:preparation.cutoff,kind:'good_deed'})).rejects.toMatchObject({status:409});
    expect((await env.DB.prepare('SELECT action FROM mindful_moderation_audit WHERE post_id=? AND revision>0').bind(first.post.id).all()).results).toEqual([{action:'approve'}]);
  });

  it('serializes concurrent bulk retries and approves all pages only within the prepared kind',async()=>{
    for(let index=0;index<105;index++) await env.DB.prepare(`INSERT INTO mindful_posts
      (id,owner_id,client_post_id,kind,nickname,content,created_at,status,review_state,review_due_at,policy_state)
      VALUES(?,'owner',?,'repentance','Bạn đạo','Bài chờ',?,'hidden','pending',?,'clear')`)
      .bind(`race-${index.toString().padStart(3,'0')}`,`race-${index}`,NOW,DUE).run();
    await service('viewer').create(draft('other-kind','good_deed'));
    const preparation=await admin().prepareApproveAll({operationId:'race-bulk',kind:'repentance'});
    const input={operationId:'race-bulk',kind:'repentance',cutoff:preparation.cutoff};
    const [first,retry]=await Promise.all([admin().approveAll(input),admin().approveAll(input)]);
    expect(first).toEqual(retry);
    expect(first).toMatchObject({updated:100,conflicted:0});
    const final=await admin().approveAll({...input,after:first.nextCursor});
    expect(final).toMatchObject({updated:5,conflicted:0,nextCursor:null});
    expect((await admin().list('pending',{kind:'repentance'})).summary.pending).toEqual({count:0,capped:false});
    expect((await admin().list('pending',{kind:'good_deed'})).items).toHaveLength(1);
  });

  it('makes reject-versus-deadline cron atomic and protects the only administrator from automatic suspension',async()=>{
    const {post}=await service().create(draft());
    await Promise.allSettled([admin().decide(post.id,{action:'reject',revision:1,reason:'Chờ chỉnh sửa.'}),
      createMindfulModerationRepository(env).publishDue(DUE,'race-cron')]);
    const row=await env.DB.prepare('SELECT review_state,review_revision FROM mindful_posts WHERE id=?').bind(post.id).first();
    expect(['rejected','auto_approved']).toContain(row.review_state);
    expect(row.review_revision).toBe(2);
    expect((await env.DB.prepare('SELECT id FROM mindful_moderation_audit WHERE post_id=? AND revision=2').bind(post.id).all()).results).toHaveLength(1);
    const blocked=await service('admin').create(draft('admin-block','good_deed','Hãy chuyển khoản vào STK 123456789 cho tôi.'));
    expect(blocked.accountLocked).toBe(false);
    expect(await env.DB.prepare("SELECT status FROM app_users WHERE id='admin'").first()).toEqual({status:'active'});
  });

  it.each(['blocked','suspended'])('advances over twenty %s feed candidates without losing older visible posts',async hidden=>{
    for(let index=0;index<23;index++) await env.DB.prepare(`INSERT INTO mindful_posts
      (id,owner_id,client_post_id,kind,nickname,content,created_at,review_state,policy_state)
      VALUES(?,?,?,'repentance','Bạn đạo','Bài công khai',?,'approved','clear')`)
      .bind(`filtered-${index.toString().padStart(2,'0')}`,index<20?'owner':'other',`filtered-${index}`,
        index<20?NOW:'2026-11-21T09:59:59.000Z').run();
    if(hidden==='blocked') await env.DB.prepare('INSERT INTO ugc_user_blocks(blocker_id,blocked_owner_id,created_at) VALUES(?,?,?)').bind('viewer','owner',NOW).run();
    else await env.DB.prepare("UPDATE app_users SET status='suspended' WHERE id='owner'").run();
    const first=await service('viewer').list('repentance',false,null);
    expect(first.items).toEqual([]);
    expect(first.nextCursor).toBeTruthy();
    const next=await service('viewer').list('repentance',false,first.nextCursor);
    expect(next.items).toHaveLength(3);
    expect(next.items.every(row=>row.createdAt==='2026-11-21T09:59:59.000Z')).toBe(true);
    expect(next.nextCursor).toBeNull();
  });

  it('scopes bulk receipts to selected posts even if a decision operation ID matches a bulk chunk',async()=>{
    const other=await service('viewer').create(draft('collision-other','good_deed'));
    await admin().decide(other.post.id,{action:'approve',revision:1,operationId:'collision-op:1'});
    await service().create(draft('collision-one'));
    await service().create(draft('collision-two'));
    const preparation=await admin().prepareApproveAll({operationId:'collision-op',kind:'repentance'});
    expect(await admin().approveAll({operationId:'collision-op',kind:'repentance',cutoff:preparation.cutoff}))
      .toMatchObject({updated:2,conflicted:0,nextCursor:null});
  });

  it('expires prepared decisions and bounds operation cleanup to one hundred receipts',async()=>{
    await service().create(draft());
    const preparation=await admin().prepareApproveAll({operationId:'expired-op'});
    await expect(admin('2026-11-22T10:00:00.000Z').approveAll({operationId:'expired-op',cutoff:preparation.cutoff}))
      .rejects.toMatchObject({status:409});
    await env.DB.prepare(`WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM seq WHERE n<104)
      INSERT INTO mindful_moderation_operations(operation_id,actor_id,cutoff,snapshot_sequence,next_cursor,expires_at,created_at,updated_at)
      SELECT 'expired-'||n,'admin',?,0,'',?,?,? FROM seq`).bind(NOW,NOW,NOW,NOW).run();
    expect(await createMindfulModerationRepository(env).cleanupOperations('2026-11-22T10:00:00.000Z')).toBe(100);
    expect((await env.DB.prepare('SELECT COUNT(*) AS total FROM mindful_moderation_operations').first()).total).toBe(6);
  });

  it('reports a concurrent decision between candidate read and bulk CAS instead of overwriting it',async()=>{
    const first=await service().create(draft('interleave-one'));
    await service().create(draft('interleave-two'));
    const preparation=await admin().prepareApproveAll({operationId:'interleave-op'});
    let intercepted=false;
    const repository=createMindfulModerationRepository({DB:{prepare:sql=>env.DB.prepare(sql),async batch(statements){
      if(!intercepted){intercepted=true;await admin().decide(first.post.id,{action:'reject',revision:1,reason:'Quản trị viên khác đã từ chối.'});}
      return env.DB.batch(statements);
    }}});
    expect(await repository.approveAll({operationId:'interleave-op',cutoff:preparation.cutoff,after:null},'admin',NOW))
      .toMatchObject({updated:1,conflicted:1,nextCursor:null});
    expect(await env.DB.prepare('SELECT review_state,review_revision FROM mindful_posts WHERE id=?').bind(first.post.id).first())
      .toEqual({review_state:'rejected',review_revision:2});
  });

  it('uses stored submission cursors and snapshot cutoff with independently stored future review deadlines',async()=>{
    for(const [id,at,due] of [
      ['wide-newest','2026-11-21T09:59:59.000Z','2099-01-01T00:00:00.000Z'],
      ['wide-middle','2026-11-21T09:59:58.000Z','2030-01-01T00:00:00.000Z'],
      ['wide-oldest','2026-11-21T09:59:57.000Z','2100-01-01T00:00:00.000Z'],
    ]) await env.DB.prepare(`INSERT INTO mindful_posts(id,owner_id,client_post_id,kind,nickname,content,created_at,status,review_state,review_due_at,policy_state)
      VALUES(?,'owner',?,'repentance','Bạn đạo','Bài chờ',?,'hidden','pending',?,'clear')`).bind(id,id,at,due).run();
    const first=await admin().list('pending',{kind:'repentance',limit:1});
    expect(first.items.map(row=>row.id)).toEqual(['wide-newest']);
    const second=await admin().list('pending',{kind:'repentance',limit:1,after:first.nextCursor});
    expect(second.items.map(row=>row.id)).toEqual(['wide-middle']);
    const third=await admin().list('pending',{kind:'repentance',limit:1,after:second.nextCursor});
    expect(third.items.map(row=>row.id)).toEqual(['wide-oldest']);
    expect(third.nextCursor).toBeNull();
    const preparation=await admin().prepareApproveAll({operationId:'wide-deadlines',kind:'repentance'});
    expect(preparation.summary).toEqual({count:3,capped:false});
    expect(await admin().approveAll({operationId:'wide-deadlines',kind:'repentance',cutoff:preparation.cutoff}))
      .toMatchObject({updated:3,conflicted:0,nextCursor:null});
  });

  it('rolls back policy removal, account suspension and session revocation together, then retries the same submission once',async()=>{
    await env.DB.prepare(`INSERT INTO auth_sessions(id,user_id,token_hash,csrf_token_hash,created_at,expires_at)
      VALUES('rollback-session','owner','rollback-token','rollback-csrf',?,'2027-01-01T00:00:00.000Z')`).bind(NOW).run();
    const failingRepository=createMindfulCommunityRepository({DB:{prepare:sql=>env.DB.prepare(sql),batch:statements=>env.DB.batch([
      ...statements.slice(0,-1),
      env.DB.prepare(`INSERT INTO mindful_moderation_audit(post_id,revision,operation_id,action,reason,created_at)
        VALUES('rollback-policy-post',99,'forced-rollback','reject',?,?)`).bind('x'.repeat(1001),NOW),
      statements.at(-1),
    ])}});
    const failing=createMindfulCommunityService(context(),{repository:failingRepository,now:()=>new Date(NOW),createId:()=> 'rollback-policy-post'});
    const input=draft('rollback-policy','good_deed','Hãy chuyển khoản vào STK 123456789 cho tôi.');
    await expect(failing.create(input)).rejects.toThrow();
    expect((await env.DB.prepare('SELECT id FROM mindful_posts').all()).results).toEqual([]);
    expect((await env.DB.prepare('SELECT id FROM mindful_moderation_audit').all()).results).toEqual([]);
    expect(await env.DB.prepare("SELECT status,suspended_at FROM app_users WHERE id='owner'").first()).toEqual({status:'active',suspended_at:null});
    expect(await env.DB.prepare("SELECT revoked_at FROM auth_sessions WHERE id='rollback-session'").first()).toEqual({revoked_at:null});
    const retried=await service().create(input);
    expect(retried).toMatchObject({accountLocked:true,post:{status:'removed'}});
    expect((await env.DB.prepare('SELECT id FROM mindful_posts').all()).results).toHaveLength(1);
    expect((await env.DB.prepare('SELECT revision FROM mindful_moderation_audit ORDER BY revision').all()).results).toEqual([{revision:0},{revision:1}]);
  });

  it('rolls back bulk posts, decision audits and progress receipt before a same-operation retry',async()=>{
    const first=await service().create(draft('rollback-bulk-one'));
    await service().create(draft('rollback-bulk-two'));
    const preparation=await admin().prepareApproveAll({operationId:'rollback-bulk-op'});
    const input={operationId:'rollback-bulk-op',cutoff:preparation.cutoff,after:null};
    const failingRepository=createMindfulModerationRepository({DB:{prepare:sql=>env.DB.prepare(sql),batch:statements=>env.DB.batch([
      ...statements.slice(0,-1),
      env.DB.prepare(`INSERT INTO mindful_moderation_audit(post_id,revision,operation_id,action,reason,created_at)
        VALUES(?,99,'forced-rollback','reject',?,?)`).bind(first.post.id,'x'.repeat(1001),NOW),
      statements.at(-1),
    ])}});
    await expect(failingRepository.approveAll(input,'admin',NOW)).rejects.toThrow();
    expect((await env.DB.prepare('SELECT review_state,review_revision FROM mindful_posts').all()).results)
      .toEqual([{review_state:'pending',review_revision:1},{review_state:'pending',review_revision:1}]);
    expect((await env.DB.prepare('SELECT id FROM mindful_moderation_audit WHERE revision>0').all()).results).toEqual([]);
    expect(await env.DB.prepare("SELECT revision,next_cursor,last_cursor FROM mindful_moderation_operations WHERE operation_id='rollback-bulk-op'").first())
      .toEqual({revision:1,next_cursor:'',last_cursor:null});
    const retried=await admin().approveAll(input);
    expect(retried).toMatchObject({updated:2,conflicted:0,nextCursor:null});
    expect(await admin().approveAll(input)).toEqual(retried);
    expect((await env.DB.prepare('SELECT id FROM mindful_moderation_audit WHERE revision>0').all()).results).toHaveLength(2);
  });

  it('applies policy to the displayed nickname independently and audits a canonical fingerprint of both submitted fields',async()=>{
    const input={...draft('nickname-policy','good_deed',Array(6).fill('Tôi thành tâm sống thiện lành và sửa đổi mỗi ngày.').join(' ')),
      nickname:'Hãy chuyển tiền vào STK123456789'};
    const result=await service().create(input);
    expect(result).toMatchObject({accountLocked:true,post:{status:'removed',content:'',policyCode:'fundraising_solicitation'}});
    expect(await env.DB.prepare("SELECT status FROM app_users WHERE id='owner'").first()).toEqual({status:'suspended'});
    const expected=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([input.nickname,input.content])))))
      .map(byte=>byte.toString(16).padStart(2,'0')).join('');
    const audit=await env.DB.prepare("SELECT content_hash FROM mindful_moderation_audit WHERE post_id=? AND action='policy_remove'").bind(result.post.id).first();
    expect(audit.content_hash).toBe(expected);
    expect(result.post).not.toHaveProperty('submissionFingerprint');
    expect(JSON.stringify(result)).not.toContain(expected);
  });

  it('does not combine an incomplete nickname invitation with unrelated body account details',async()=>{
    const input={...draft('separate-fields','good_deed','Tôi ghi số tài khoản 123456789 trong nhật ký để nhớ việc đã trả lại khoản tiền chuyển nhầm. '+Array(5).fill('Tôi thành tâm sống thiện lành và sửa đổi mỗi ngày.').join(' ')),nickname:'Hãy chuyển tiền'};
    expect(await service().create(input)).toMatchObject({accountLocked:false,post:{status:'hidden',reviewState:'pending',policyCode:null}});
    expect(await env.DB.prepare("SELECT status FROM app_users WHERE id='owner'").first()).toEqual({status:'active'});
  });

  it('keeps a protected admin policy receipt idempotent but rejects the same client ID with a different removed payload',async()=>{
    const input={...draft('admin-policy-retry','good_deed','Tôi thành tâm sửa đổi và làm điều thiện mỗi ngày.'),nickname:'Hãy chuyển tiền vào STK123456789'};
    const first=await service('admin').create(input);
    expect(first).toMatchObject({accountLocked:false,post:{status:'removed',policyCode:'fundraising_solicitation'}});
    expect(await service('admin').create(input)).toEqual(first);
    await expect(service('admin').create({...input,nickname:'Mời chuyển tiền vào STK987654321'})).rejects.toMatchObject({status:409,code:'mindful_post_id_conflict'});
    await expect(service('admin').create({...input,content:'Một nội dung khác nhưng cùng mã bài.'})).rejects.toMatchObject({status:409,code:'mindful_post_id_conflict'});
    await expect(service('admin').create({...input,nickname:'Diệu Âm'})).rejects.toMatchObject({status:409,code:'mindful_post_id_conflict'});
    expect((await env.DB.prepare("SELECT id FROM mindful_posts WHERE owner_id='admin'").all()).results).toHaveLength(1);
    expect((await env.DB.prepare("SELECT action FROM mindful_moderation_audit WHERE action='policy_remove'").all()).results).toHaveLength(1);
    expect(await env.DB.prepare("SELECT status FROM app_users WHERE id='admin'").first()).toEqual({status:'active'});
  });
});
