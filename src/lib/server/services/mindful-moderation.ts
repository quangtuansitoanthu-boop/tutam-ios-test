import { MINDFUL_POST_KINDS, type MindfulPostKind, type MindfulModerationState } from '../../contracts/mindful-community';
import type { CloudflareRequestContext } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import { createMindfulModerationRepository } from '../repositories/mindful-moderation-repository';

const operationPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
function inputObject(input:unknown):Record<string,unknown> {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw invalid();
  return input as Record<string,unknown>;
}
const invalid = () => new ServerInputError(400,'invalid_moderation_decision','Yêu cầu kiểm duyệt không hợp lệ.');
function operationId(value:unknown):string {
  if (typeof value!=='string' || !operationPattern.test(value)) throw invalid();
  return value;
}
function postKind(value:unknown):MindfulPostKind|undefined {
  if (value===undefined || value===null) return undefined;
  if (!MINDFUL_POST_KINDS.includes(value as MindfulPostKind)) throw invalid();
  return value as MindfulPostKind;
}
export function createMindfulModerationService(context:CloudflareRequestContext,dependencies:{
  repository?:ReturnType<typeof createMindfulModerationRepository>;now?:()=>Date;createId?:()=>string;
}={}) {
  const repository=dependencies.repository ?? createMindfulModerationRepository(context.env);
  const clock=dependencies.now ?? (()=>new Date());
  const actor=()=>{
    if (!context.principal?.appUserId) throw new ServerInputError(401,'authentication_required','Cần đăng nhập.');
    if (context.principal.role!=='admin') throw new ServerInputError(403,'forbidden','Không đủ quyền.');
    return context.principal.appUserId;
  };
  return {
    async list(state:unknown,options:{after?:string|null;limit?:number;kind?:MindfulPostKind}={}) {
      const admin=actor();
      if (!['pending','published','rejected'].includes(String(state)) || (options.limit!=null && (!Number.isInteger(options.limit)||options.limit<1))) throw invalid();
      return repository.list(state as MindfulModerationState,admin,{after:options.after ?? null,limit:Math.min(50,options.limit ?? 20),kind:postKind(options.kind)},clock().toISOString());
    },
    async decide(postId:string,input:unknown) {
      const admin=actor();
      const body=inputObject(input);
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u.test(postId) || !['approve','reject','delete'].includes(String(body.action))
        || !Number.isSafeInteger(body.revision) || Number(body.revision)<1
        || Object.keys(body).some(key=>!['action','revision','reason','operationId'].includes(key))
        || (body.reason!=null && (typeof body.reason!=='string'||body.reason.length>1000))
        || (body.action==='reject' && (typeof body.reason!=='string'||!body.reason.trim()))) throw invalid();
      const op=body.operationId==null ? dependencies.createId?.() ?? crypto.randomUUID() : operationId(body.operationId);
      const decision={action:body.action as 'approve'|'reject'|'delete',revision:Number(body.revision),reason:typeof body.reason==='string'?body.reason.trim():''};
      if (!await repository.decide(postId,decision,admin,clock().toISOString(),op)) {
        throw new ServerInputError(409,'moderation_conflict','Nội dung đã thay đổi. Vui lòng tải lại hàng đợi.');
      }
      return {updated:true as const};
    },
    async prepareApproveAll(input:unknown) {
      const admin=actor();
      const body=inputObject(input);
      if (Object.keys(body).some(key=>!['operationId','kind'].includes(key))) throw invalid();
      return repository.prepareApproveAll({operationId:operationId(body.operationId),kind:postKind(body.kind)},admin,clock().toISOString());
    },
    async approveAll(input:unknown) {
      const admin=actor();
      const body=inputObject(input);
      if (Object.keys(body).some(key=>!['operationId','kind','cutoff','after'].includes(key))
        || typeof body.cutoff!=='string'||!Number.isFinite(Date.parse(body.cutoff))
        || (body.after!=null&&typeof body.after!=='string')) throw invalid();
      return repository.approveAll({operationId:operationId(body.operationId),kind:postKind(body.kind),cutoff:body.cutoff,after:body.after as string|null ?? null},admin,clock().toISOString());
    },
  };
}
