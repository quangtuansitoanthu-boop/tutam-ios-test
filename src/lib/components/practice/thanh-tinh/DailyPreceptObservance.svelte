<script lang="ts">
  import { recordPracticeParticipation } from '$lib/browser/practice-participation';
  import { tick } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import { getPreceptPracticeCopy, getDailyPreceptPracticeCopy, getPreceptCompletionCopy } from '$lib/i18n/precept-practice-ui';
  import { FIVE_PRECEPTS, TEN_PRECEPTS } from '$lib/content/precept-practice-content';
  import type { DailySession, DayAnswers } from '$lib/domain/practice/precept-companion';
  import { saveDailySession } from '$lib/browser/precept-companion-storage';
  import { createBrowserId } from '$lib/browser/random-id';
  import PracticeConfirmDialog from '../dialog/PracticeConfirmDialog.svelte';
  import PreceptCompletion from './PreceptCompletion.svelte';

  let { group, session, ready, loadError, now, onReload, onContinue, onOpenAbstinence: _onOpenAbstinence, resumeReflection = false, resumeTestingPrincipal = null }: {
    group: 'combined'; session: DailySession | null;
    ready: boolean; loadError: boolean; now: number; resumeReflection?: boolean; resumeTestingPrincipal?: string | null; testingConductConfirmed?: boolean; testingConductAnswer?: 'kept' | 'review';
    onReload: () => void; onContinue: () => void; onOpenAbstinence?: (options: { sessionId: string; principal: string | null }) => void;
  } = $props();
  const groups = [{ id: 'five', items: FIVE_PRECEPTS }, { id: 'ten', items: TEN_PRECEPTS }] as const;
  const locale = getLocaleContext();
  const identity = getSessionContext();
  const ix = $derived(locale.current === 'en' ? 1 : 0);
  const c = $derived(getPreceptPracticeCopy(ix === 1));
  const name = $derived(c.combinedSectionTitle);
  const text = $derived(getDailyPreceptPracticeCopy(ix === 1, name));
  const completion = $derived(getPreceptCompletionCopy(ix === 1));
  const uniqueItems = [...new Map([...FIVE_PRECEPTS, ...TEN_PRECEPTS].map(item => [item.id, item])).values()];
  const requiredItems = uniqueItems;
  let showMissing = $state(false);
  let draft = $state<DayAnswers>({});
  let reflecting = $state(false);
  let preparingNext = $state(false);
  let pledged = $state(false);
  let confirming = $state<'start' | 'finish' | 'test' | null>(null);
  let adminReleasePrincipal = $state<string | null>(null);
  let saveError = $state(false);
  let loadedId = $state('');
  const answers = $derived({ ...session?.answers, ...draft });
  const active = $derived(session?.status === 'active');
  const elapsed = $derived(!!session && now >= Date.parse(session.endsAt));
  const adminPrincipal = $derived(getAdminPrincipal(now));
  const adminTesting = $derived(adminReleasePrincipal !== null && adminReleasePrincipal === adminPrincipal);
  const missing = $derived(requiredItems.filter(item => !answers[item.id]));
  const unmet = $derived(uniqueItems.filter(item => answers[item.id] !== 'kept'));
  const resultComplete = $derived(unmet.length === 0);
  const canReflect = $derived(elapsed || adminTesting);
  const remaining = $derived(session ? Math.max(0, Math.ceil((Date.parse(session.endsAt) - now) / 1000)) : 0);
  const countdown = $derived([Math.floor(remaining / 3600), Math.floor(remaining / 60) % 60, remaining % 60].map(value => String(value).padStart(2, '0')).join(':'));
  const progress = $derived(session ? Math.max(0, Math.min(100, (now - Date.parse(session.startsAt)) / 86_400_000 * 100)) : 0);
  const stage = $derived(active ? (reflecting && canReflect ? 'reflection' : 'tracking') : session?.status === 'ended' && !preparingNext ? 'completed' : session?.status === 'cancelled' && !preparingNext ? 'testing-ended' : 'prepare');
  $effect(() => {
    if ((session?.id ?? '') !== loadedId) {
      const initialSession = loadedId === '';
      loadedId = session?.id ?? ''; draft = {}; showMissing = false; preparingNext = false; pledged = false; confirming = null;
      const validResume = initialSession && resumeTestingPrincipal !== null && resumeTestingPrincipal === getAdminPrincipal(Date.now()) && !!session && session.status === 'active' && Date.now() < Date.parse(session.endsAt);
      adminReleasePrincipal = validResume ? resumeTestingPrincipal : null;
      reflecting = initialSession && resumeReflection && !!session && (now >= Date.parse(session.endsAt) || validResume);
    }
  });
  $effect(() => {
    if (adminReleasePrincipal !== null && (adminReleasePrincipal !== adminPrincipal || elapsed)) revokeTesting();
  });
  export function handleBack(): boolean {
    if (confirming !== null) { confirming = null; return true; }
    return false;
  }
  function getAdminPrincipal(at: number): string | null {
    const current = identity.value;
    const expiry = Date.parse(current.expiresAt ?? '');
    return current.authenticated && current.user?.role === 'admin' && current.user.id && Number.isFinite(expiry) && expiry > at ? current.user.id : null;
  }
  function revokeTesting() { adminReleasePrincipal = null; reflecting = false; confirming = null; }
  function releaseForTesting() {
    const principal = getAdminPrincipal(Date.now());
    if (!principal || !ready || loadError || !session || !active || Date.now() >= Date.parse(session.endsAt)) return;
    adminReleasePrincipal = principal; reflecting = true; saveError = false;
  }
  function requestFinish() {
    if (!ready || loadError || !session || !active || !reflecting) return;
    if (!validateReflection()) return;
    if (adminReleasePrincipal !== null) {
      if (adminReleasePrincipal !== getAdminPrincipal(Date.now()) || Date.now() >= Date.parse(session.endsAt)) { revokeTesting(); return; }
      confirming = 'test';
    } else if (Date.now() >= Date.parse(session.endsAt)) confirming = 'finish';
  }
  function start() {
    if (confirming !== 'start' || !pledged || !ready || loadError || active) return;
    confirming = null;
    try {
      const starts = Date.now();
      const candidate: DailySession = { id: createBrowserId(), group, startsAt: new Date(starts).toISOString(), endsAt: new Date(starts + 86_400_000).toISOString(), status: 'active', answers: {} };
      if (!saveDailySession(candidate)) { saveError = true; return; }
      if (group === 'combined') {
        recordPracticeParticipation('five','started'); recordPracticeParticipation('ten','started');
      } else recordPracticeParticipation(group,'started');
      draft = {}; reflecting = false; preparingNext = false; saveError = false; onReload();
    } catch { saveError = true; }
  }
  function finish() {
    const testing = confirming === 'test';
    if ((!testing && confirming !== 'finish') || !ready || !session || !active || loadError) { confirming = null; return; }
    if (testing && (!adminReleasePrincipal || adminReleasePrincipal !== getAdminPrincipal(Date.now()) || Date.now() >= Date.parse(session.endsAt))) { revokeTesting(); return; }
    if (!testing && Date.now() < Date.parse(session.endsAt)) { confirming = null; return; }
    confirming = null;
    if (!validateReflection()) return;
    if (!saveDailySession({ ...session, status: testing ? 'cancelled' : 'ended', answers: { ...answers } })) { saveError = true; return; }
    if (!testing) {
      if (group === 'combined') { recordPracticeParticipation('five','completed'); recordPracticeParticipation('ten','completed'); }
      else recordPracticeParticipation(group,'completed');
    }
    saveError = false; draft = {}; reflecting = false; adminReleasePrincipal = null; onReload();
  }
  function release() { if (session && active && Date.now() >= Date.parse(session.endsAt)) { adminReleasePrincipal = null; reflecting = true; } }
  function validateReflection() {
    showMissing = missing.length > 0;
    if (showMissing) { confirming = null; return false; }
    return true;
  }
  function formatDate(value: string) { return new Intl.DateTimeFormat(ix === 1 ? 'en-GB' : 'vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)); }
  function focusStage(node: HTMLDivElement, initial: string) {
    let previous = initial; let disposed = false;
    return {
      async update(next: string) {
        if (next === previous) return;
        previous = next; await tick();
        if (!disposed) node.querySelector<HTMLElement>('h2,h3')?.focus();
      },
      destroy() { disposed = true; },
    };
  }
</script>

<div class="daily-observance" data-testid={`daily-${group}`} use:focusStage={stage}>
  <h2 tabindex="-1">{name}</h2>
  <p class="duration">{c.dailyDuration}</p>
  {#if loadError}<p class="error" role="alert">{c.loadError}</p><button type="button" onclick={onReload}>{c.tryAgain}</button>{/if}
  {#if saveError}<p class="error" role="alert">{c.saveError}</p>{/if}
  {#if active && session}
    {#if !reflecting || !canReflect}
      <section class="tracking" data-testid={`daily-${group}-tracking`}>
        <h3 tabindex="-1">{elapsed ? text.elapsed : text.tracking}</h3>
        <div class="countdown" style:--daily-progress={`${progress}%`}><div class="countdown-face"><strong role="timer" aria-live="off">{countdown}</strong><span>{elapsed ? text.elapsed : c.eightCountdownActive}</span></div></div>
        <dl><div><dt>{c.startedAt}</dt><dd>{formatDate(session.startsAt)}</dd></div><div><dt>{c.endsAt}</dt><dd>{formatDate(session.endsAt)}</dd></div></dl>
        <p>{text.wait}</p>{#if elapsed}<button class="primary" type="button" disabled={!ready || loadError} onclick={release}>{text.conclude}</button>{/if}
        {#if adminPrincipal && !elapsed}<button class="admin-testing" type="button" disabled={!ready || loadError} onclick={releaseForTesting}>{text.adminRelease}</button>{/if}
      </section>
    {:else}
      <section data-testid={`daily-${group}-reflection`}>
        <h3 tabindex="-1">{text.reflection}</h3><p>{text.reflectionBody}</p>
        {#if adminTesting}<p class="testing-notice" role="status">{text.testing}</p>{/if}
        <p class="shared-note">{c.combinedSharedNote}</p>
        {#each groups as reflectionGroup (reflectionGroup.id)}
          <details class="reflection-group" open data-testid={`reflection-${reflectionGroup.id}`}>
            <summary>{reflectionGroup.id === 'five' ? c.fiveSectionTitle : c.tenSectionTitle}</summary>
            {#each reflectionGroup.items as item (item.id)}
              <article class="precept-item"><h4 id={`daily-${reflectionGroup.id}-${item.id}`}>{item.title[ix]}</h4>
                <fieldset aria-labelledby={`daily-${reflectionGroup.id}-${item.id}`} disabled={!ready || loadError}>
                  <legend>{c.recordHonestly}</legend>
                  {#each ['kept', 'review'] as answer (answer)}
                    <label class:selected={answers[item.id] === answer}><input type="radio" name={`${reflectionGroup.id}-${item.id}`} checked={answers[item.id] === answer} onchange={() => { draft = { ...draft, [item.id]: answer === 'kept' ? 'kept' : 'review' }; saveError = false; }} /><span>{answer === 'kept' ? c.kept : c.review}</span></label>
                  {/each}
                </fieldset>{#if !answers[item.id]}<small>{c.unanswered}</small>{/if}
              </article>
            {/each}
          </details>
        {/each}
        {#if showMissing && missing.length}<div class="error" role="alert" data-testid="daily-missing-answers"><p>{completion.missingPrefix}</p><ul>{#each missing as item (item.id)}<li>{item.title[ix]}</li>{/each}</ul></div>{/if}
        <button class="primary" type="button" disabled={!ready || loadError || !canReflect} onclick={requestFinish}>{adminTesting ? text.testConfirm : text.confirm}</button>
      </section>
    {/if}
  {:else if (session?.status === 'ended' || session?.status === 'cancelled') && !preparingNext}
    <div data-testid={session.status === 'ended' ? `daily-${group}-completed` : `daily-${group}-testing-ended`}>
      <PreceptCompletion complete={resultComplete} title={resultComplete ? completion.title : completion.incompleteTitle} message={resultComplete ? session.status === 'cancelled' ? completion.testCongratulations : text.completed : completion.incompleteMessage} praiseLabel={completion.praise} dedicationLabel={completion.dedicationTitle} dedication={text.dedication} note={session.status === 'cancelled' ? completion.testNote : undefined} continueLabel={text.continue} {onContinue} />
      {#if !resultComplete}<ul data-testid="daily-unmet-precepts">{#each unmet as item (item.id)}<li>{item.title[ix]}</li>{/each}</ul>{/if}
    </div>
    <button type="button" onclick={() => { preparingNext = true; pledged = false; saveError = false; }}>{text.next}</button>
  {:else}
    <h3 tabindex="-1">{text.vow}</h3>
    <label class="pledge"><input type="checkbox" bind:checked={pledged} disabled={!ready || loadError} /><span>{text.pledge}</span></label>
    <button class="primary" type="button" disabled={!ready || loadError || !pledged} onclick={() => confirming = 'start'}>{text.vow}</button>
  {/if}

</div>
{#if confirming}
  <div class="daily-confirmation">
  <PracticeConfirmDialog open title={confirming === 'start' ? text.vow : confirming === 'test' ? text.testConfirm : text.confirmTitle} description={confirming === 'start' ? text.startQuestion : confirming === 'test' ? text.testQuestion : text.finishQuestion} cancelLabel={c.back} confirmLabel={confirming === 'start' ? text.startConfirm : confirming === 'test' ? text.testAction : text.finishConfirm} onCancel={() => confirming = null} onConfirm={confirming === 'start' ? start : finish} />
  </div>
{/if}

<style>
  .daily-confirmation :global(.practice-confirm__dialog p) { color: var(--text2); font-size: 1em; text-align: justify; }
  .daily-observance, .tracking { display: grid; gap: var(--space-page); min-width: 0; padding-top: var(--space-page); color: var(--text); font-family: var(--font-app); }
  h2, h3, h4 { margin: 0; text-align: center; font-weight: 700; line-height: 1.5; color: var(--brown-dark); }
  h2 { font-size: 1.35em; letter-spacing: -0.01em; }
  h3 { font-size: 1.15em; }
  h4 { font-size: 1.05em; text-align: start; }
  p { margin: 0; text-align: justify; line-height: 1.75; }
  .duration { text-align: center; justify-self: center; padding: 4px 12px; border-radius: 999px; background: linear-gradient(145deg, var(--gold-light), var(--gold-muted)); border: 1px solid color-mix(in srgb, var(--gold) 30%, var(--border)); color: var(--brown); font-weight: 700; font-size: 0.88em; letter-spacing: 0.03em; box-shadow: inset 0 1px 0 color-mix(in srgb, var(--card) 88%, transparent), var(--shadow-sm); }
  .countdown { position: relative; display: grid; place-items: center; width: min(100%, calc(var(--space-page) * 13)); aspect-ratio: 1; margin-inline: auto; border-radius: 50%; background: radial-gradient(circle at 32% 24%, var(--card) 0%, var(--gold-light) 55%, var(--gold-muted) 100%); border: 1.5px solid color-mix(in srgb, var(--card) 85%, var(--border)); box-shadow: inset 0 4px 10px color-mix(in srgb, var(--card) 88%, transparent), inset 0 -8px 16px color-mix(in srgb, var(--gold) 18%, transparent), 0 18px 36px -10px color-mix(in srgb, var(--gold) 30%, transparent), var(--shadow); }
  .countdown::before { content: ''; position: absolute; inset: 4px; border-radius: 50%; background: conic-gradient(from -90deg, var(--gold2), var(--gold) var(--daily-progress), var(--border2) 0); mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px)); }
  .countdown::after { content: ''; position: absolute; top: 10px; left: 26px; right: 26px; height: 40%; border-radius: 50% 50% 45% 45% / 62% 62% 28% 28%; background: linear-gradient(180deg, color-mix(in srgb, var(--card) 62%, transparent), transparent); pointer-events: none; }
  :global([data-theme='dark']) .countdown { background: radial-gradient(circle at 32% 24%, var(--bg3) 0%, var(--bg2) 58%, var(--bg) 100%); border-color: rgba(255, 255, 255, 0.16); box-shadow: inset 0 3px 8px rgba(255, 235, 195, 0.14), inset 0 -10px 18px rgba(0, 0, 0, 0.6), 0 18px 36px -8px rgba(0, 0, 0, 0.65); }
  .countdown-face { position: relative; z-index: 2; display: grid; justify-items: center; gap: 4px; text-align: center; padding: 0 12px; }
  .countdown strong { font-size: clamp(2.1rem, 10vw, 2.85rem); font-weight: 700; font-variant-numeric: tabular-nums; color: var(--brown-dark); line-height: 1.15; }
  .countdown-face span { font-size: var(--font-size-meta); font-weight: 600; color: var(--text2); }
  dl { display: grid; gap: var(--radius-sm); margin: 0; min-width: 0; background: linear-gradient(155deg, var(--card), var(--bg2)); border: 1px solid var(--border); border-radius: var(--radius-card); padding: calc(var(--space-page) * 0.75) var(--space-page); box-shadow: inset 0 1.5px 0 color-mix(in srgb, var(--card) 90%, transparent), inset 0 -3px 0 rgba(60, 40, 10, 0.1), var(--shadow); }
  dl > div { display: flex; justify-content: space-between; gap: var(--radius-sm); line-height: 1.7; }
  dl > div + div { border-top: 1px solid var(--border2); padding-top: var(--radius-xs); }
  dt { color: var(--text2); font-weight: 600; font-size: 0.9em; }
  dd { margin: 0; text-align: end; overflow-wrap: anywhere; font-weight: 700; color: var(--brown-dark); }
  fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
  legend, small { color: var(--text2); font-size: .85em; }
  legend { margin-bottom: calc(var(--space-page) / 4); font-weight: 500; }
  .precept-item { padding-block: calc(var(--space-page) * 0.75); border-top: 1px solid var(--border2); }
  .precept-item h4 { margin-bottom: calc(var(--space-page) / 4); }
  label { display: flex; align-items: center; gap: calc(var(--space-page) / 2); min-height: 44px; padding: calc(var(--space-page) * 0.4) var(--space-page); margin-top: calc(var(--space-page) / 4); border: 1px solid var(--border); border-radius: var(--radius-control); background: linear-gradient(155deg, var(--card), var(--bg2)); color: var(--text2); font-weight: 500; line-height: 1.6; cursor: pointer; box-shadow: inset 0 1px 0 color-mix(in srgb, var(--card) 85%, transparent), var(--shadow-sm); transition: all 0.15s ease; }
  label.selected { background: linear-gradient(145deg, var(--gold-light), var(--gold-muted)); border-color: var(--gold); color: var(--brown-dark); font-weight: 700; box-shadow: inset 0 1.5px 0 color-mix(in srgb, var(--card) 85%, transparent), 0 3px 10px color-mix(in srgb, var(--gold) 24%, transparent); }
  input { accent-color: var(--gold); flex-shrink: 0; }
  .pledge { align-items: flex-start; padding: var(--space-page); border: 1px solid var(--gold-muted); border-radius: var(--radius-card); background: linear-gradient(145deg, var(--gold-light), var(--gold-muted)); color: var(--brown-dark); font-weight: 500; line-height: 1.7; }
  .pledge input { margin-top: 3px; width: 22px; height: 22px; }
  fieldset:disabled label { opacity: .6; cursor: default; }
  button { font: inherit; min-height: 44px; min-width: 0; border: 1px solid var(--border); border-radius: 999px; background: linear-gradient(155deg, var(--card), var(--bg2)); color: var(--text2); font-weight: 700; padding: calc(var(--space-page) / 2) var(--space-page); line-height: 1.5; cursor: pointer; box-shadow: inset 0 1.5px 0 color-mix(in srgb, var(--card) 88%, transparent), inset 0 -2.5px 0 rgba(60, 40, 10, 0.1), var(--shadow-sm); transition: transform 0.12s ease; }
  button:active:not(:disabled) { transform: translateY(1.5px) scale(0.98); }
  .primary { width: 100%; height: 48px; background: linear-gradient(145deg, var(--gold2), var(--gold)); border-color: color-mix(in srgb, var(--card) 45%, var(--gold)); color: var(--on-gold); font-weight: 800; box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.55), inset 0 -3px 0 rgba(90, 56, 8, 0.24), 0 6px 14px -3px color-mix(in srgb, var(--gold) 45%, transparent); }
  button:disabled { opacity: .5; cursor: default; }
  .error { color: var(--danger-text); font-weight: 500; }
  button:focus-visible, summary:focus-visible, label:has(input:focus-visible) { outline: 2px solid var(--gold); outline-offset: 2px; }
  .reflection-group { border: 1px solid var(--border2); border-radius: var(--radius-card); padding: calc(var(--space-page) * 0.75); margin-block: var(--space-page); background: var(--card); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02); }
  .reflection-group summary { text-align: center; font-weight: 700; font-size: 1.05em; color: var(--brown-dark); background: var(--gold-light); border-radius: var(--radius-control); padding: calc(var(--space-page) * 0.5); }
  .shared-note { color: var(--text2); font-size: 0.9em; }
  summary { min-height: 44px; align-content: center; cursor: pointer; }
  .testing-notice { color: var(--brown); background: var(--gold-light); border: 1px solid var(--border); border-radius: var(--radius-control); padding: calc(var(--space-page) / 2); text-align: start; }
  .admin-testing { justify-self: start; }
</style>
