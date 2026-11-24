<script module lang="ts">
  export interface DedicationTemplate { id: string; title: string; text: string }
</script>
<script lang="ts">
  import { createBrowserId } from '$lib/browser/random-id';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { ChevronDown, Pencil, Trash2, X } from '@lucide/svelte';
  import { tick } from 'svelte';
  import PracticeConfirmDialog from '../dialog/PracticeConfirmDialog.svelte';
  import RosarySelect from '../rosary/RosarySelect.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  import { createRoutineActivityTranslator, routineActivityNames } from '$lib/i18n/routine-activity-copy';
  import { COPYING_BOOKS } from '$lib/domain/practice/scripture-copying';
  import { NAME_COPYING_PHRASES, nameCopyingChoiceId } from '$lib/domain/practice/name-copying';
  import buddhas from '$lib/data/buddhas.json';
  import { ROSARY_PHRASES, normalizeCustomRosaryPhrases } from '$lib/domain/practice/guided-sessions';
  import type { createPersonalPracticeStorage } from '$lib/browser/personal-practice-storage';
  import { cloneDailyRoutine, isDailyRoutine, moveRoutineStep, type DailyRoutine, type RoutineStep } from '$lib/domain/practice/personal-practice';
  import { DEFAULT_SAMPLE_ROUTINES } from '$lib/domain/practice/personal-settings';
  import { loadPracticeDedicationTemplates, loadRoutineRepentanceText } from '$lib/browser/practice-dedication-templates';
  import { ROUTINE_ACTIVITY_GROUPS, ROUTINE_READING_CATEGORIES, isRoutineReadingMode, routineStepActivity, routineToolStep, type RoutineMode, type RoutineReadingMode } from '$lib/domain/practice/routine-activities';
  import { filterPracticeCatalog, type PracticeArticleSummary } from '$lib/domain/practice/state';
  interface Props {
    storage: ReturnType<typeof createPersonalPracticeStorage>;
    dedicationTemplates?: DedicationTemplate[];
    articles?: PracticeArticleSummary[];
    onRun?: (routine: DailyRoutine) => void | Promise<void>;
  }
  let { storage, dedicationTemplates = [], articles = [], onRun }: Props = $props();
  const locale = getLocaleContext();
  const localizeUi = createInterfaceTranslator();
  const activityName = createRoutineActivityTranslator();
  const copy = $derived(personalPracticeCopy[locale.current === 'en' ? 'en' : 'vi']);
  let routines = $state<DailyRoutine[]>([]);
  let draft = $state<DailyRoutine | null>(null);
  let status = $state('');
  let failed = $state(false);
  let busy = $state(false);
  let expandedStep = $state('');
  let revision = 0;
  let pendingRemoval = $state<DailyRoutine | null>(null);
  let deleteTrigger = $state<HTMLButtonElement>();
  let pendingStart = $state<DailyRoutine | null>(null);
  let playTrigger = $state<HTMLButtonElement>();
  let createButton = $state<HTMLButtonElement>();
  let editDialog = $state<HTMLDialogElement>();
  const editing = $derived(draft !== null && routines.some(routine => routine.id === draft?.id));
  const kinds: RoutineMode[] = ['repentance', ...ROUTINE_ACTIVITY_GROUPS.flatMap(group => [...group.modes]), 'dedication'];
  const kindOptions = $derived([
    { value: 'repentance', label: activityName('repentance') },
    ...ROUTINE_ACTIVITY_GROUPS.flatMap(group => group.modes.map(mode => ({ value: mode, label: activityName(mode), group: localizeUi(group.label) }))),
    { value: 'dedication', label: activityName('dedication') }
  ]);
  const readingArticles = $derived({
    sutra: filterPracticeCatalog(articles, '', ROUTINE_READING_CATEGORIES.sutra),
    mantra: filterPracticeCatalog(articles, '', ROUTINE_READING_CATEGORIES.mantra),
    ritual: filterPracticeCatalog(articles, '', ROUTINE_READING_CATEGORIES.ritual),
  });
  const buddhaOptions = buddhas.map(buddha => ({ value: buddha.danhHieu, label: buddha.name }));
  const rosaryOptions = ROSARY_PHRASES.map(phrase => ({ value: phrase, label: phrase }));
  const copyBookOptions = COPYING_BOOKS.map(book => ({ value: book.id, label: book.title.toLocaleUpperCase('vi') }));
  const copyNameOptions = NAME_COPYING_PHRASES.map(phrase => ({ value: nameCopyingChoiceId(phrase), label: phrase }));
  const standardRosaryPhrase = (phrase: string) => ROSARY_PHRASES.find(item =>
    item !== 'Tùy chọn' && item.toLocaleLowerCase('vi') === phrase.trim().toLocaleLowerCase('vi'));
  const bellOptions = $derived([{ value: 'bell', label: copy.bell }, { value: 'bowl', label: copy.bowl }, { value: 'khánh', label: copy.khanh }]);
  const templateOptions = $derived([{ value: '', label: copy.custom }, ...dedicationTemplates.map(template => ({ value: template.id, label: template.title.toLocaleUpperCase(locale.current === 'en' ? 'en' : 'vi') }))]);
  $effect(() => {
    const owner = storage;
    revision += 1; draft = null; pendingRemoval = null; pendingStart = null; busy = false; status = ''; failed = false;
    try {
      let stored = owner.getRoutines();
      if (stored.length === 0) {
        for (const sample of DEFAULT_SAMPLE_ROUTINES) {
          try { owner.saveRoutine(sample); } catch { /* ignore fallback */ }
        }
        stored = owner.getRoutines();
      }
      routines = stored;
    }
    catch { routines = []; failed = true; status = copy.notReady; }
  });
  $effect(() => {
    const dialog = editDialog;
    if (!dialog) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      dialog.style.setProperty('--routine-viewport-height', `${viewport.height}px`);
      dialog.style.setProperty('--routine-viewport-top', `${viewport.offsetTop}px`);
      const bottom = document.documentElement.clientHeight - viewport.height - viewport.offsetTop;
      dialog.style.setProperty('--routine-viewport-bottom', `${Math.max(0, bottom)}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  });
  function step(kind: RoutineMode, template = dedicationTemplates[0]): RoutineStep {
    const id = createBrowserId();
    if (kind === 'prostration') return { id, kind, phrase: 'Nam Mô A Di Đà Phật', count: 3 };
    if (kind === 'meditation') return { id, kind, minutes: 15, cue: 'bell' };
    if (kind === 'rosary') return { id, kind, phrase: 'Nam Mô A Di Đà Phật', count: 108, automatic: false, bpm: 60 };
    if (kind === 'dedication') return { id, kind, text: template?.text ?? '', ...(template ? { sourceId: template.id } : {}) };
    return routineToolStep(id, kind, routineActivityNames[kind]);
  }
  function create(): void {
    draft = { id: createBrowserId(), name: copy.defaultRoutine, steps: [], updatedAt: new Date().toISOString() };
    expandedStep = ''; status = ''; failed = false;
  }
  function select(id: string): void {
    const routine = routines.find(item => item.id === id);
    if (!routine) return;
    draft = cloneDailyRoutine($state.snapshot(routine));
    expandedStep = ''; status = ''; failed = false;
  }
  function cancelEdit(): void {
    revision += 1;
    draft = null;
    busy = false;
    status = ''; failed = false;
  }
  function removeRoutine(): void {
    if (!pendingRemoval) return;
    const id = pendingRemoval.id;
    try {
      routines = storage.deleteRoutine(id);
      if (draft?.id === id) draft = null;
      failed = false; status = copy.routineDeleted;
      pendingRemoval = null;
      void tick().then(() => createButton?.focus());
    } catch { failed = true; status = copy.saveError; pendingRemoval = null; }
  }
  async function addStep(value: string): Promise<void> {
    const kind = kinds.find(item => item === value);
    if (!draft || !kind || draft.steps.length >= 20 || busy) return;
    if (kind !== 'repentance' && (kind !== 'dedication' || dedicationTemplates.length)) {
      const next = step(kind);
      const openOptions = isRoutineReadingMode(kind) || kind === 'scripture-copying' || kind === 'name-copying' || kind === 'rosary';
      if (openOptions) expandedStep = '';
      draft.steps.push(next);
      if (openOptions) {
        const currentDraft = draft;
        await tick();
        if (draft === currentDraft && draft.steps[draft.steps.length - 1]?.id === next.id) expandedStep = next.id;
      }
      return;
    }
    const currentRevision = revision;
    const currentDraft = draft;
    busy = true;
    try {
      const next = kind === 'repentance'
        ? routineToolStep(createBrowserId(), kind, await loadRoutineRepentanceText())
        : step(kind, (await loadPracticeDedicationTemplates())[0]);
      if (revision === currentRevision && draft === currentDraft) currentDraft.steps.push(next);
    } catch {
      if (revision === currentRevision && draft === currentDraft) {
        if (kind === 'dedication') currentDraft.steps.push(step(kind));
        failed = true;
        status = kind === 'repentance' ? copy.repentanceUnavailable : copy.invalidRoutine;
      }
    } finally {
      if (revision === currentRevision) busy = false;
    }
  }
  function move(index: number, offset: number): void { if (draft) draft = moveRoutineStep(draft, index, index + offset); }
  function useTemplate(index: number, id: string): void {
    const selected = dedicationTemplates.find(template => template.id === id);
    if (!draft || draft.steps[index]?.kind !== 'dedication') return;
    const previous = draft.steps[index] as Extract<RoutineStep, { kind: 'dedication' }>;
    draft.steps[index] = { ...previous, text: selected?.text ?? previous.text, sourceId: selected?.id };
  }
  function readingLabel(mode: RoutineReadingMode): string {
    return mode === 'sutra' ? copy.chooseSutra : mode === 'mantra' ? copy.chooseMantra : copy.chooseRitual;
  }
  function readingOptions(mode: RoutineReadingMode, articleId: string | undefined, title: string) {
    const options = readingArticles[mode].map(article => ({ value: article.id, label: article.title.toLocaleUpperCase() }));
    if (articleId && !options.some(option => option.value === articleId)) options.unshift({ value: articleId, label: title });
    return [{ value: '', label: copy.chooseContent, disabled: true }, ...options];
  }
  function selectReading(index: number, mode: RoutineReadingMode, id: string): void {
    const current = draft?.steps[index];
    const article = readingArticles[mode].find(item => item.id === id);
    if (draft && current && article) draft.steps[index] = routineToolStep(current.id, mode, article.originalTitle ?? article.title, article.id);
  }
  function save(): DailyRoutine | null {
    if (!draft) return null;
    if (!draft.name.trim()) { failed = true; status = copy.requiredName; return null; }
    if (draft.steps.length < 2) { failed = true; status = copy.minimumSteps; return null; }
    const saved = { ...cloneDailyRoutine($state.snapshot(draft)), name: draft.name.trim(), updatedAt: new Date().toISOString() };
    if (saved.steps.some(step => { const activity = routineStepActivity(step); return isRoutineReadingMode(activity.mode) && !activity.articleId; })) {
      failed = true; status = copy.requiredContent; return null;
    }
    if (!isDailyRoutine(saved)) { failed = true; status = copy.invalidRoutine; return null; }
    for (const step of saved.steps) {
      if (step.kind !== 'rosary') continue;
      const phrase = step.phrase.trim();
      const existing = ROSARY_PHRASES.find(item => item !== 'Tùy chọn' && item.toLocaleLowerCase('vi') === phrase.toLocaleLowerCase('vi'));
      if (!existing && !normalizeCustomRosaryPhrases([{ id: 'cp_1000000000000_routine', text: phrase, type: 'Niệm danh hiệu' }]).length) {
        failed = true; status = copy.rosaryPhraseInvalid; return null;
      }
      step.phrase = existing ?? phrase;
    }
    try { routines = storage.saveRoutine(saved); draft = null; failed = false; status = copy.routineSaved; return saved; }
    catch { failed = true; status = copy.saveError; return null; }
  }
  async function runSaved(routine: DailyRoutine): Promise<void> {
    if (!onRun || busy) return;
    const currentRevision = revision;
    busy = true;
    try { await onRun(routine); }
    catch { if (revision === currentRevision) { failed = true; status = copy.runError; } }
    finally { if (revision === currentRevision) busy = false; }
  }

  function confirmStart(): void {
    if (!pendingStart) return;
    const routine = cloneDailyRoutine($state.snapshot(pendingStart));
    pendingStart = null;
    failed = false;
    status = '';
    void runSaved(routine);
  }
</script>

<section class="routine-editor" inert={busy} aria-busy={busy}>
  <div class="routine-header">
    {#each routines as routine (routine.id)}
      <div class="saved-routine">
        <button class="routine-name" type="button" aria-label={routine.name} aria-pressed={draft?.id === routine.id} onclick={() => select(routine.id)}>
          <strong>{routine.name}</strong><small>{copy.routineStepCount.replace('{0}', String(routine.steps.length))}</small>
        </button>
        <button class="routine-action" type="button" aria-label={copy.editRoutine.replace('{0}', routine.name)} onclick={() => select(routine.id)}><Pencil size={20} aria-hidden="true" /></button>
        <button class="routine-action" type="button" aria-label={copy.deleteRoutine.replace('{0}', routine.name)} onclick={event => { deleteTrigger = event.currentTarget; pendingRemoval = routine; }}><Trash2 size={20} aria-hidden="true" /></button>
        <button class="routine-play" type="button" disabled={!onRun || busy} aria-label={copy.playRoutine.replace('{0}', routine.name)}
          onclick={event => { playTrigger = event.currentTarget; pendingStart = routine; }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        </button>
      </div>
    {/each}
    <button bind:this={createButton} onclick={create} disabled={busy}>{copy.newRoutine}</button>
  </div>
  <p class:error={failed} role="status">{draft ? '' : status}</p>
</section>

{#if draft}
  <dialog class="routine-dialog" bind:this={editDialog} use:modalDialog aria-labelledby="routine-edit-title" tabindex="-1"
    oncancel={event => { event.preventDefault(); cancelEdit(); }}>
    <header class="routine-dialog-header">
      <h2 id="routine-edit-title">{editing ? copy.editRoutineTitle : copy.newRoutine}</h2>
      <button class="routine-dialog-close" type="button" data-modal-focus aria-label={copy.closeRoutineEditor} onclick={cancelEdit}>
        <X size={20} aria-hidden="true" />
      </button>
    </header>
    <div class="routine-dialog-body">
      <label>{copy.routineName}<input bind:value={draft.name} maxlength="120" disabled={busy} /></label>
      {#each draft.steps as current, index (current.id)}
        {@const activity = routineStepActivity(current)}
        <details class="step-card" name="routine-steps" open={expandedStep === current.id}>
          <summary>
            <span>{index + 1}. {activityName(activity.mode)}{#if (activity.mode === 'scripture-copying' || activity.mode === 'name-copying') && activity.articleId && current.kind === 'dedication'} · {current.text}{/if}{#if current.kind === 'prostration'} · {current.count} {copy.prostrations}{:else if current.kind === 'meditation'} · {current.minutes} {locale.current === 'en' ? 'min' : 'phút'}{/if}</span>
            <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <div class="step-actions"><button aria-label={copy.moveUp} disabled={index === 0 || busy} onclick={() => move(index, -1)}>↑</button><button aria-label={copy.moveDown} disabled={index === draft.steps.length - 1 || busy} onclick={() => move(index, 1)}>↓</button><button aria-label={copy.remove} disabled={busy} onclick={() => { if (draft) draft.steps = draft.steps.filter(item => item.id !== current.id); }}>×</button></div>
          {#if current.kind === 'prostration'}
            <RosarySelect label={copy.buddha} accessibleLabel={copy.buddha} value={current.phrase}
              options={buddhaOptions.some(option => option.value === current.phrase) ? buddhaOptions : [{ value: current.phrase, label: current.phrase }, ...buddhaOptions]}
              onChange={value => { current.phrase = value; }} />
            <RosarySelect label={copy.prostrationCount} accessibleLabel={copy.prostrationCount} value={String(current.count)}
              options={[...new Set([3, 12, 21, current.count])].sort((a, b) => a - b).map(count => ({ value: String(count), label: `${count} ${copy.prostrations}` }))}
              onChange={value => { current.count = Number(value); }} />
          {:else if current.kind === 'rosary'}
            {@const standard = standardRosaryPhrase(current.phrase)}
            <RosarySelect label={copy.chooseName} accessibleLabel={copy.chooseName} value={standard ?? 'Tùy chọn'}
              options={rosaryOptions} onChange={value => { current.phrase = value === 'Tùy chọn' ? '' : value; }} />
            {#if !standard}
              <label>{copy.customName}<input bind:value={current.phrase} maxlength="500" disabled={busy} /></label>
            {/if}
            <label>{copy.target}<input type="number" min="1" max="100000" step="1" bind:value={current.count} disabled={busy} /></label>
            <label class="checkbox"><input type="checkbox" bind:checked={current.automatic} disabled={busy} />{copy.automatic}</label>
            {#if current.automatic}<RosarySelect label={copy.speed} accessibleLabel={copy.speed} value={String(current.bpm)} options={[30,40,60,80].map(bpm => ({ value: String(bpm), label: `${bpm} ${copy.bpm}` }))} onChange={value => { current.bpm = Number(value) as 30 | 40 | 60 | 80; }} />{/if}
          {:else if current.kind === 'meditation'}
            <RosarySelect label={copy.minutes} accessibleLabel={copy.minutes} value={String(current.minutes)} options={[10,15,30].map(minutes => ({ value: String(minutes), label: `${minutes}` }))} onChange={value => { current.minutes = Number(value); }} />
            <RosarySelect label={copy.transitionBell} accessibleLabel={copy.transitionBell} value={current.cue ?? 'bell'} options={bellOptions}
              onChange={value => { current.cue = value as 'bell' | 'bowl' | 'khánh'; }} />
          {:else if activity.mode === 'scripture-copying' || activity.mode === 'name-copying'}
            {@const mode = activity.mode}
            {@const label = mode === 'scripture-copying' ? copy.chooseSutra : copy.chooseName}
            {@const options = mode === 'scripture-copying' ? copyBookOptions : copyNameOptions}
            <RosarySelect {label} accessibleLabel={label} value={activity.articleId ?? ''}
              options={[{ value: '', label: copy.chooseInTool }, ...options]}
              onChange={value => { if (draft) draft.steps[index] = routineToolStep(current.id, mode, options.find(option => option.value === value)?.label ?? activityName(mode)); }} />
          {:else if activity.mode === 'dedication'}
            <RosarySelect label={copy.source} accessibleLabel={copy.source} value={current.sourceId ?? ''} options={templateOptions} onChange={value => useTemplate(index, value)} />
            <label>{copy.dedicationText}<textarea class="reader" bind:value={current.text} maxlength="20000" disabled={busy}></textarea></label>
            <small>{copy.dedicationHint}</small>
          {:else if activity.mode === 'repentance'}
            <label>{copy.repentanceText}<textarea class="reader" bind:value={current.text} maxlength="20000" disabled={busy}></textarea></label>
          {:else if isRoutineReadingMode(activity.mode)}
            {@const mode = activity.mode}
            <RosarySelect label={readingLabel(mode)} accessibleLabel={readingLabel(mode)} value={activity.articleId ?? ''}
              options={readingOptions(mode, activity.articleId, current.text)} onChange={value => selectReading(index, mode, value)} />
          {/if}
        </details>
      {/each}
      {#if draft.steps.length < 20}
        <RosarySelect label={copy.addStep} accessibleLabel={copy.addStep} value="" options={[{ value: '', label: copy.chooseStep, disabled: true }, ...kindOptions]} onChange={value => { void addStep(value); }} />
      {/if}
      {#if draft.steps.length < 2}<p>{copy.minimumSteps}</p>{/if}
    </div>
    <footer class="routine-dialog-footer">
      {#if status}<p class="routine-dialog-status" class:error={failed} role="status">{status}</p>{/if}
      <button type="button" onclick={cancelEdit}>{copy.cancel}</button>
      <button type="button" class="primary" onclick={save} disabled={busy || draft.steps.length < 2}>{copy.saveRoutine}</button>
    </footer>
  </dialog>
{/if}

<PracticeConfirmDialog open={pendingRemoval !== null} title={copy.deleteRoutineTitle}
  description={copy.deleteRoutinePrompt.replace('{0}', pendingRemoval?.name ?? '')}
  cancelLabel={copy.cancel} confirmLabel={copy.deleteRoutineAction} returnFocusTo={deleteTrigger}
  destructive onCancel={() => { pendingRemoval = null; }} onConfirm={removeRoutine} />

<PracticeConfirmDialog open={pendingStart !== null} title={copy.startRoutineTitle}
  description={pendingStart ? `${pendingStart.name} · ${copy.routineStepCount.replace('{0}', String(pendingStart.steps.length))}` : ''}
  cancelLabel={copy.cancel} confirmLabel={copy.startRoutineAction} returnFocusTo={playTrigger}
  onCancel={() => { pendingStart = null; }} onConfirm={confirmStart} />

<style>
  .saved-routine{display:grid;grid-template-columns:minmax(0,1fr) repeat(3,auto);align-items:center;gap:var(--radius-sm);padding:var(--radius-sm);border:1px solid var(--border2);border-radius:var(--radius-card);background:var(--card)}
  .routine-name{display:grid;min-width:0;text-align:start;border:0;background:transparent;box-shadow:none;overflow-wrap:anywhere}
  .routine-action{display:grid;place-items:center;color:var(--brown);border-color:var(--gold)}
  .routine-play{display:grid;place-items:center;width:52px;height:52px;padding:0;border:0;border-radius:50%;background:var(--gold);color:var(--on-gold)}
  .routine-dialog {
    box-sizing:border-box;
    position:fixed;
    inset:calc(env(safe-area-inset-top) + var(--routine-viewport-top, 0px)) env(safe-area-inset-right) calc(env(safe-area-inset-bottom) + var(--routine-viewport-bottom, 0px)) env(safe-area-inset-left);
    margin:auto;
    width:min(600px, calc(100% - 2 * var(--space-page) - env(safe-area-inset-left) - env(safe-area-inset-right)));
    max-height:calc(100vh - 2 * var(--space-page) - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    max-height:calc(var(--routine-viewport-height, 100dvh) - 2 * var(--space-page) - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    padding:0;
    overflow:hidden;
    border:1px solid var(--border);
    border-radius:var(--radius-card);
    background:var(--card);
    color:var(--text);
    font-family:var(--font-app);
    box-shadow:var(--shadow);
  }
  .routine-dialog[open] { display:grid; grid-template-rows:auto minmax(0, 1fr) auto; }
  .routine-dialog::backdrop { background:var(--practice-dialog-backdrop); }
  .routine-dialog-header, .routine-dialog-body, .routine-dialog-footer { padding:var(--space-page); }
  .routine-dialog-header { display:flex; align-items:center; justify-content:space-between; gap:var(--radius-sm); }
  .routine-dialog-header h2 { margin:0; }
  .routine-dialog-close { display:grid; place-items:center; border-color:transparent; box-shadow:none; }
  .routine-dialog-body { min-height:0; overflow:auto; overscroll-behavior:contain; padding-top:0; }
  .routine-dialog-footer { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--radius-sm); border-top:1px solid var(--border); }
  .routine-dialog-status { grid-column:1 / -1; margin:0; }
  .step-card summary { display:flex; align-items:center; justify-content:space-between; gap:var(--radius-sm); list-style:none; }
  .step-card summary::-webkit-details-marker { display:none; }
  .step-card summary :global(svg) { flex-shrink:0; }
  .step-card[open] summary :global(svg) { transform:rotate(180deg); }
  .routine-editor{min-width:0}.routine-header{display:grid;gap:calc(var(--space-page)*.5);margin-bottom:var(--space-page)}.step-card{padding:0 calc(var(--space-page)*.65);margin-bottom:var(--space-page);border:1px solid var(--border2);border-radius:var(--radius-card);background:var(--dialog-glass-background,var(--card))}summary{min-height:44px;align-content:center;cursor:pointer;font-weight:700}details[open]{padding-bottom:calc(var(--space-page)*.65)}.step-actions{display:flex;justify-content:flex-end;gap:calc(var(--space-page)*.2)}label{display:grid;gap:calc(var(--space-page)*.3);font-weight:700;font-size:var(--font-size-label);margin-block:calc(var(--space-page)*.6)}input,textarea,button{box-sizing:border-box;min-height:44px;min-width:44px;font:inherit;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);color:var(--text);padding:calc(var(--space-page)*.5)}input,textarea{width:100%;min-width:0;font-size:var(--font-size-input)}textarea{min-height:calc(var(--space-page)*8);resize:vertical}.reader{font-family:var(--font-reader)}.checkbox{display:flex;align-items:center;gap:calc(var(--space-page)*.5)}.checkbox input{width:20px;min-width:20px;height:20px;min-height:20px;accent-color:var(--gold)}button{cursor:pointer;box-shadow:var(--glass-button-shadow)}button:disabled{opacity:.55;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--gold);outline-offset:2px}.primary{background:var(--gold);color:var(--on-gold)}p,small{line-height:1.7;color:var(--text2)}.error{color:var(--danger-text)}
</style>
