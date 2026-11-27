import { render } from 'svelte/server';
import { afterEach, expect, it, vi } from 'vitest';
import DailyPreceptObservance from '$lib/components/practice/thanh-tinh/DailyPreceptObservance.svelte';
import { COMBINED_IDS, emptyCompanionState, type DailySession } from '$lib/domain/practice/precept-companion';
import { PRECEPT_COMPANION_KEY } from '$lib/browser/precept-companion-storage';

vi.mock('$lib/stores/session.svelte', () => ({ getSessionContext: () => ({ value: { authenticated: false } }) }));
afterEach(() => vi.unstubAllGlobals());

it('shows a verified legacy completion and respects an explicit newer self-assessment', () => {
  const date = '2026-10-29';
  const session: DailySession = {
    id: 'daily', group: 'combined', status: 'ended',
    startsAt: '2026-10-28T03:00:00Z', endsAt: '2026-10-29T03:00:00Z',
    answers: Object.fromEntries(COMBINED_IDS.filter(id => id !== 'conduct').map(id => [id, 'kept'])),
    conductConfirmation: { completedAt: '2026-10-29T04:00:00Z', checkInDate: date },
  };
  const rows = new Map([
    [PRECEPT_COMPANION_KEY, JSON.stringify({ ...emptyCompanionState(), dailySessions: [session] })],
    ['tutam_thanh_tinh_v1', JSON.stringify({ checkInDates: [date] })],
  ]);
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => rows.get(key) ?? null } });
  const result = () => render(DailyPreceptObservance, { props: {
    group: 'combined', session, ready: true, loadError: false, now: Date.parse(session.endsAt),
    onReload: vi.fn(), onContinue: vi.fn(),
  } }).body;
  expect(result()).toContain('data-testid="daily-combined-completed"');
  expect(result()).not.toContain('daily-unmet-precepts');
  session.answers.conduct = 'review';
  expect(result()).toContain('daily-unmet-precepts');
  delete session.answers.conduct;
  rows.delete('tutam_thanh_tinh_v1');
  expect(result()).toContain('daily-unmet-precepts');
});
