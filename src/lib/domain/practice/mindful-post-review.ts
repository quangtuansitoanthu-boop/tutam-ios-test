import type { MindfulPost, MindfulPostKind, MindfulPostPage } from '$lib/contracts/mindful-community';

export function isMindfulPostPublic(post: MindfulPost): boolean {
  return post.status === 'published'
    && (!post.reviewState || ['legacy', 'approved', 'auto_approved'].includes(post.reviewState));
}

export function mindfulPostPublishedAt(post: MindfulPost): string {
  return post.publishedAt && Number.isFinite(Date.parse(post.publishedAt)) ? post.publishedAt : post.createdAt;
}

/** Merge a Send receipt into existing pages; never turn a private review receipt into a public post. */
export function mergeMindfulReceiptPages(pages: MindfulPostPage[], receipt: MindfulPost, tab: 'mine' | MindfulPostKind): MindfulPostPage[] {
  const next = pages.map(page => ({ ...page, items: page.items.filter(item => item.id !== receipt.id) }));
  const visible = tab === 'mine' ? receipt.isOwn : receipt.kind === tab && isMindfulPostPublic(receipt);
  if (visible && next[0]) next[0].items = [receipt, ...next[0].items];
  return next;
}
