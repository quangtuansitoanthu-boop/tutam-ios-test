<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import type { DailyRoutine } from '$lib/domain/practice/personal-practice';
  import { classifyRoutineLine, isRoutineTextStep, routineStepActivity } from '$lib/domain/practice/routine-activities';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';
  import { createRoutineActivityTranslator } from '$lib/i18n/routine-activity-copy';
  let { routine, index, paused, countdown, waiting, controlsOnly = false, showControls = true,
    returned = false, unavailable = false, onPause, onNext, onExit, onReopen, onSkip }: {
    routine: DailyRoutine; index: number; paused: boolean; countdown: number; waiting: boolean;
    controlsOnly?: boolean;
    showControls?: boolean;
    returned?: boolean;
    unavailable?: boolean;
    onPause: () => void; onNext: () => void; onExit: () => void;
    onReopen?: () => void; onSkip?: () => void;
  } = $props();
  const locale = getLocaleContext();
  const en = $derived(locale.current === 'en');
  const copy = $derived(personalPracticeCopy[en ? 'en' : 'vi']);
  const activityName = createRoutineActivityTranslator();
  const step = $derived(routine.steps[index]);
  const nextStep = $derived(routine.steps[index + 1] ?? null);
  const mode = $derived(step ? routineStepActivity(step).mode : 'dedication');
  const nextMode = $derived(nextStep ? routineStepActivity(nextStep).mode : null);
  const stepProgressPct = $derived(
    routine.steps.length > 0 ? Math.min(100, Math.round(((index + 1) / routine.steps.length) * 100)) : 0
  );
  const showText = $derived(step?.kind === 'dedication' && isRoutineTextStep(mode) && !waiting && !returned && !unavailable);
</script>

{#snippet controls()}
<aside class="routine-session" aria-label={en ? 'Current routine' : 'Thời khóa đang hành trì'}>
  <div class="routine-session__top">
    <strong>{routine.name}</strong>
    <span class="routine-session__step">{en ? 'Step' : 'Bước'} {index + 1}/{routine.steps.length}</span>
  </div>
  <div class="routine-session__progress" role="progressbar" aria-valuemin="0" aria-valuemax={routine.steps.length} aria-valuenow={index + 1} aria-label={en ? 'Routine progress' : 'Tiến độ thời khóa'}>
    <span class="routine-session__progress-fill" style={`width:${stepProgressPct}%`}></span>
  </div>
  {#if nextMode}
    <p class="routine-session__next">{en ? 'Up next' : 'Tiếp theo'}: <strong>{activityName(nextMode)}</strong></p>
  {/if}
  <div class="routine-session__actions">
    <button type="button" onclick={onPause}>{paused ? (en ? 'Resume' : 'Tiếp tục') : (en ? 'Pause' : 'Tạm dừng')}</button>
    <button type="button" onclick={onNext}>{en ? 'Next step' : 'Chuyển bước'}</button>
    <button type="button" onclick={onExit}>{en ? 'End routine' : 'Kết thúc'}</button>
  </div>
  {#if countdown > 0}<p role="status">{en ? 'Next step in' : 'Chuyển bước sau'} {countdown}s</p>{/if}
</aside>
{/snippet}
{#if controlsOnly}{@render controls()}{/if}
{#if !controlsOnly && (showText || waiting || returned || unavailable)}
  <dialog use:modalDialog class="routine-reading" aria-label={en ? 'Routine practice' : 'Hành trì thời khóa'} oncancel={event => { event.preventDefault(); if (showControls && !returned && !unavailable) onPause(); else onExit(); }}>
    <div class="routine-reading__body">
      {#if returned || unavailable}
        <h2>{activityName(mode)}</h2>
        <p>{routine.name} · {en ? 'Step' : 'Bước'} {index + 1}/{routine.steps.length}</p>
        {#if unavailable}<p role="status">{copy.stepUnavailable}</p>{/if}
        {#if onReopen}<button type="button" onclick={onReopen}>{copy.stepReopen}</button>{/if}
        <button type="button" onclick={unavailable ? onSkip : onNext}>{unavailable ? copy.stepSkip : copy.stepComplete}</button>
        <button type="button" onclick={onExit}>{en ? 'End routine' : 'Kết thúc'}</button>
      {:else}
        {#if showControls}{@render controls()}{/if}
        {#if !showText}<h2>{routine.name}</h2>{/if}
        {#if showText && step?.kind === 'dedication'}
        <div class="routine-reading__verse">
          {#each step.text.split('\n') as line, lineIndex (lineIndex)}
            {@const lineKind = classifyRoutineLine(line)}
            <p class:heading={lineKind === 'heading'} class:verse={lineKind === 'verse'} class:prose={lineKind === 'prose'}>
              {#each line.split(/(\([^)]*\))/u) as part, partIndex (partIndex)}{#if part.startsWith('(') && part.endsWith(')')}<i>{part}</i>{:else}{part}{/if}{/each}
            </p>
          {/each}
        </div>
        {:else}<p>{paused ? (en ? 'Paused' : 'Đã tạm dừng') : (en ? 'Preparing the next step…' : 'Đang chuẩn bị bước tiếp theo…')}</p>{/if}
        <button type="button" onclick={onNext}>{showText ? (en ? 'Finished reading' : 'Đã đọc xong') : (en ? 'Continue now' : 'Tiếp tục ngay')}</button>
      {/if}
    </div>
  </dialog>
{/if}

<style>
  .routine-session{position:relative;flex-shrink:0;padding:calc(var(--space-page)*.4) calc(var(--space-page)*.6);background:var(--card);border-bottom:1px solid var(--border);box-shadow:var(--shadow);font:var(--font-size-label) var(--font-app);color:var(--text)}
  .routine-session__top{display:flex;justify-content:space-between;align-items:center;gap:calc(var(--space-page)*.5)}
  .routine-session__step{color:var(--brown);font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
  .routine-session__progress{height:5px;margin-top:6px;border-radius:999px;background:var(--border2);overflow:hidden}
  .routine-session__progress-fill{display:block;height:100%;border-radius:inherit;background:var(--gold);transition:width .25s ease}
  .routine-session__next{margin:6px 0 0;color:var(--muted);font-size:var(--font-size-meta)}
  .routine-session__next strong{color:var(--text)}
  .routine-session__actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:calc(var(--space-page)*.3);margin-top:calc(var(--space-page)*.3)}
  button{font:inherit;min-height:44px;min-width:44px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--gold-light);color:var(--text);padding:calc(var(--space-page)*.3);cursor:pointer}
  button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .routine-session p{margin:calc(var(--space-page)*.2) 0}
  .routine-reading{position:fixed;inset:0;box-sizing:border-box;margin:0;padding:var(--space-page);width:100%;height:100%;max-width:none;max-height:none;background:var(--bg);border:solid var(--bg);border-width:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);color:var(--text);font-family:var(--font-reader);overflow:auto}
  .routine-reading__body{max-width:680px;margin:auto}.routine-reading h2{text-align:center;font-size:var(--font-size-section-title)}
  .routine-reading__verse{line-height:1.9;overflow-wrap:anywhere}.routine-reading__verse p{min-height:1em;margin:0 0 calc(var(--space-page)*.45)}.routine-reading__verse .heading{text-align:center;font-weight:700;color:var(--brown)}.routine-reading__verse .verse{text-align:center}.routine-reading__verse .prose{text-align:justify}.routine-reading__verse i{opacity:.82}.routine-reading__body>button{display:block;width:100%;margin-top:var(--space-page)}
  :global([data-theme='dark']) .routine-session__step,:global([data-theme='dark']) .routine-reading__verse .heading{color:var(--gold2)}
  @media(prefers-reduced-motion:reduce){.routine-session__progress-fill{transition:none}}
</style>
