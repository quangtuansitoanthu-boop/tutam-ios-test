import { afterEach,describe,expect,it,vi } from 'vitest';
import { createJobsWorker } from '../../src/jobs';
import type { CloudflareEnvLike } from '../../src/lib/server/cloudflare-context';

afterEach(()=>vi.restoreAllMocks());
const cleanup=()=>({
  purgeExpiredAuth:async()=>({hasMore:false,oauthStatesPurged:0,rateLimitBucketsPurged:0,sessionsPurged:0}),
  drainArticleMediaCleanup:async()=>({cleanupErrors:[],failed:0,processed:0,retained:0,tombstoned:0}),
  purgeExpiredMedia:async()=>({cleanupErrors:[],failedUploadsPurged:0,purged:0}),
  purgeExpiredPresence:async()=>({hasMore:false,purged:0}),
});
const facebook=async()=>({attempted:0,imported:0,updated:0,detached:0,removed:0,skipped:true,errors:[]});
const environment=(enabled='true')=>({DB:{} as CloudflareEnvLike['DB'],JOBS_ENABLED:enabled});
const scheduled={cron:'17 * * * *',scheduledTime:Date.parse('2026-11-23T10:17:00.000Z')};
describe('mindful moderation in the existing scheduled owner',()=>{
  it('runs the bounded review runner with scheduled time and leaves the hourly schedule intact',async()=>{
    vi.spyOn(console,'info').mockImplementation(()=>{});
    const review=vi.fn(async()=>({updated:2,operationsPurged:1}));
    const pending:Promise<unknown>[]=[];
    await createJobsWorker(cleanup,async()=>true,facebook,review).scheduled(scheduled,environment(),{waitUntil:value=>pending.push(value)});
    await Promise.all(pending);
    expect(review).toHaveBeenCalledWith(environment(),new Date(scheduled.scheduledTime));
  });
  it('does not materialize or clean operation receipts when jobs are disabled',async()=>{
    vi.spyOn(console,'info').mockImplementation(()=>{});
    const review=vi.fn(async()=>({updated:0,operationsPurged:0}));
    const pending:Promise<unknown>[]=[];
    await createJobsWorker(cleanup,async()=>true,facebook,review).scheduled(scheduled,environment('false'),{waitUntil:value=>pending.push(value)});
    await Promise.all(pending);
    expect(review).not.toHaveBeenCalled();
  });
  it('reports a failed review runner without claiming a complete cleanup',async()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    const review=vi.fn(async()=>{throw new Error('review-failed');});
    const pending:Promise<unknown>[]=[];
    await expect(createJobsWorker(cleanup,async()=>true,facebook,review).scheduled(scheduled,environment(),{waitUntil:value=>pending.push(value)}))
      .rejects.toThrow('jobs-cleanup-partial-failure');
    await Promise.all(pending);
    expect(review).toHaveBeenCalledOnce();
  });
});
