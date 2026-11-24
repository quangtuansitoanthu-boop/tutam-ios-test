import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPracticeIdentity, PRACTICE_STARTER_BADGE } from '../../src/lib/domain/practice/progress-achievements';

describe('Cá nhân / Tài khoản badges and practice rank', () => {
  it('correctly derives practice identity for starter and tiered badges', () => {
    // 0 days: no rank
    const emptyIdentity = getPracticeIdentity(undefined);
    expect(emptyIdentity.title).toBe('');
    expect(emptyIdentity.highestBadge).toBeUndefined();

    // 1 day: starter badge "Mới phát tâm"
    const starterIdentity = getPracticeIdentity({ streaks: { longest: 1 } });
    expect(starterIdentity.title).toBe(PRACTICE_STARTER_BADGE.title);
    expect(starterIdentity.highestBadge).toBeUndefined();

    // 7 days: "Sơ Tâm Kiên Cố"
    const streak7Identity = getPracticeIdentity({
      badges: ['streak-7'],
      streaks: { longest: 7 }
    });
    expect(streak7Identity.title).toBe('Sơ Tâm Kiên Cố');
    expect(streak7Identity.highestBadge?.id).toBe('streak-7');
    expect(streak7Identity.avatarBadge?.id).toBe('streak-7');
  });

  it('enables progressQuery whenever authenticated without restricting to tab or verification', () => {
    const pageSource = readFileSync('src/routes/ca-nhan/+page.svelte', 'utf8');
    // progressQuery should not be locked to currentTab === "account" only
    expect(pageSource).not.toMatch(/enabled:\s*browser\s*&&\s*currentTab\s*===\s*["']account["']/);
    // progressQuery should not require sessionStore.verification === "verified"
    expect(pageSource).not.toMatch(/sessionStore\.verification\s*===\s*["']verified["']/);
    // progressQuery should be enabled for any authenticated principal in browser
    expect(pageSource).toMatch(/enabled:\s*browser\s*&&\s*Boolean\(accountPrincipal\)/);
  });

  it('displays avatar badge and practice rank in cn-welcome-banner on main Cá nhân tab', () => {
    const pageSource = readFileSync('src/routes/ca-nhan/+page.svelte', 'utf8');
    // cn-welcome-avatar should support avatar-ring and award icon
    expect(pageSource).toContain('cn-welcome-avatar');
    expect(pageSource).toMatch(/cn-welcome-avatar\s+avatar-ring/);
    expect(pageSource).toContain('PracticeBadgeIcon');
    // cn-welcome-meta should display cn-practice-rank
    expect(pageSource).toMatch(/cn-welcome-meta[\s\S]*?cn-practice-rank/);
  });

  it('applies earned class when rank is present even for starter badge without highestBadge', () => {
    const pageSource = readFileSync('src/routes/ca-nhan/+page.svelte', 'utf8');
    // class:earned should check Boolean(rank), not Boolean(highestBadge)
    expect(pageSource).not.toContain('class:earned={Boolean(highestBadge)}');
    expect(pageSource).toContain('class:earned={Boolean(rank)}');
  });

  it('ensures practice-badge-icon has flex-shrink: 0 so it is never squished in flex containers', () => {
    const iconSource = readFileSync('src/lib/components/practice/community/PracticeBadgeIcon.svelte', 'utf8');
    expect(iconSource).toContain('flex-shrink: 0');
  });

  it('keeps the home badge available for the same cached principal as the account', () => {
    const homeSource = readFileSync('src/lib/components/home/HomeGreetingHeader.svelte', 'utf8');
    expect(homeSource).not.toMatch(/sessionStore\.verification\s*===\s*['"]verified['"]/);
    expect(homeSource).toContain('serverStateKeys.practiceCommunity.progress');
    expect(homeSource).toContain('PRACTICE_PROGRESS_QUERY_POLICY');
    expect(homeSource).toContain('getPracticeIdentity');
  });
});
