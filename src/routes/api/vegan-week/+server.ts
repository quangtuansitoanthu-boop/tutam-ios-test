import { vietnamWeek } from '$lib/contracts/vegan-week';
import type { R2BucketLike } from '$lib/server/cloudflare-context';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, platform }) => {
  const week = url.searchParams.get('week');
  const { current, next, preload } = vietnamWeek();
  if (week !== current && !(preload && week === next)) {
    return new Response(null, { status: 404 });
  }
  const bucket = platform?.env?.MEDIA as R2BucketLike | undefined;
  const object = await bucket?.get(`vegan/weeks/v1/${week}.json`);
  if (!object?.body) return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return new Response(object.body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
};
