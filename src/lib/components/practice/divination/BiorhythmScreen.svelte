<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { loadBiorhythmProfile, saveBiorhythmProfile } from '$lib/browser/spiritual-tools-storage';
  import {
    addBiorhythmDays,
    biorhythmToday,
    calculateBiorhythm,
    formatBiorhythmDisplayDate,
    formatBiorhythmTypingText,
    parseBiorhythmDate,
    parseBiorhythmInputDate,
  } from '$lib/domain/practice/biorhythm';
  import { getBiorhythmCopy } from '$lib/i18n/biorhythm-ui';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import BiorhythmResults from './BiorhythmResults.svelte';
  import DivinationArtwork from './DivinationArtwork.svelte';
  import './divination-shared.css';
  import '$lib/styles/biorhythm.css';

  const locale = getLocaleContext();
  const session = getSessionContext();
  const copy = $derived(getBiorhythmCopy(locale.current === 'en'));
  const principal = $derived(session.value.authenticated ? session.value.user?.id ?? null : null);
  const ready = $derived(session.initialResolutionComplete !== false);
  let mounted = $state(false);
  let name = $state('');
  let birth = $state('');
  let birthText = $state('');
  let birthBlurred = $state(false);
  let today = $state(biorhythmToday());
  let selected = $state(biorhythmToday());
  let loading = $state(true);
  let readFailed = $state(false);
  let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let guideOpen = $state(false);
  let revision = 0;
  let saveRevision = 0;
  let dayTimer: ReturnType<typeof setTimeout> | undefined;
  const parsedBirthInput = $derived(parseBiorhythmInputDate(birthText));
  const dateValid = $derived(
    birth !== '' && parseBiorhythmDate(birth) !== null && birth <= today && birth <= selected,
  );
  const hasBirthError = $derived(
    birthText.trim() !== '' && (
      parsedBirthInput.status === 'invalid' ||
      (parsedBirthInput.status === 'incomplete' && birthBlurred) ||
      (birth !== '' && !dateValid)
    ),
  );
  const snapshot = $derived(dateValid ? calculateBiorhythm(birth, selected) : null);

  function handleBack(): void {
    if (guideOpen) guideOpen = false;
    else if (page.state.homeDivination) window.history.back();
    else void goto('/tu-tap');
  }

  async function restoreProfile(owner: string | null): Promise<void> {
    const request = ++revision;
    name = '';
    birth = '';
    birthText = '';
    birthBlurred = false;
    loading = true;
    readFailed = false;
    saveStatus = 'idle';
    try {
      const profile = await loadBiorhythmProfile(owner);
      if (!mounted || request !== revision || owner !== principal) return;
      name = profile?.name ?? session.value.user?.displayName ?? '';
      birth = profile?.birthDate ?? '';
      birthText = formatBiorhythmDisplayDate(birth);
    } catch {
      if (mounted && request === revision && owner === principal) readFailed = true;
    } finally {
      if (mounted && request === revision && owner === principal) loading = false;
    }
  }

  async function saveProfile(): Promise<void> {
    if (!ready || loading || readFailed || hasBirthError || (birth !== '' && !dateValid)) return;
    const owner = principal;
    const request = ++saveRevision;
    const currentRevision = revision;
    saveStatus = 'saving';
    const saved = await saveBiorhythmProfile(owner, { version: 1, name: name.trim(), birthDate: birth });
    if (!mounted || owner !== principal || request !== saveRevision || currentRevision !== revision) return;
    saveStatus = saved ? 'saved' : 'error';
  }

  function handleBirthTextInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const isDelete = event instanceof InputEvent && event.inputType.startsWith('delete');
    const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    const formatted = atEnd ? formatBiorhythmTypingText(input.value, isDelete) : input.value;
    if (formatted !== input.value) input.value = formatted;
    birthText = formatted;
    birthBlurred = false;

    const parsed = parseBiorhythmInputDate(formatted);
    if (parsed.status === 'empty') {
      birth = '';
    } else if (parsed.status === 'valid') {
      birth = parsed.iso;
      selected = today;
    } else if (parsed.status === 'invalid') {
      birth = '';
    }
  }

  function handleBirthTextCommit(): void {
    birthBlurred = true;
    const parsed = parseBiorhythmInputDate(birthText);
    if (parsed.status === 'empty') {
      birth = '';
      void saveProfile();
      return;
    }
    if (parsed.status === 'valid') {
      birth = parsed.iso;
      birthText = formatBiorhythmDisplayDate(parsed.iso);
      selected = today;
      void saveProfile();
      return;
    }
    birth = '';
  }

  function selectDate(date: string): void {
    if (!date || date < birth || date < addBiorhythmDays(today, -15) || date > addBiorhythmDays(today, 15)) return;
    selected = date;
  }

  function refreshDay(): void {
    if (dayTimer) clearTimeout(dayTimer);
    const next = biorhythmToday();
    if (selected === today || selected < addBiorhythmDays(next, -15) || selected > addBiorhythmDays(next, 15)) selected = next;
    today = next;
    const nextMidnight = Date.parse(`${next}T00:00:00+07:00`) + 86_400_000;
    dayTimer = setTimeout(refreshDay, Math.max(1, nextMidnight - Date.now()));
  }

  $effect(() => {
    if (!mounted) return;
    const owner = principal;
    if (!ready) {
      revision += 1;
      saveRevision += 1;
      name = '';
      birth = '';
      birthText = '';
      birthBlurred = false;
      loading = true;
      readFailed = false;
      saveStatus = 'idle';
      return;
    }
    void restoreProfile(owner);
  });

  $effect(() => {
    if (mounted) {
      document.dispatchEvent(new CustomEvent('qts:subpage-header', {
        detail: {
          active: true,
          onBack: handleBack,
          backLabel: page.state.homeDivination ? copy.backHome : copy.backPractice,
        },
      }));
    }
  });

  onMount(() => {
    mounted = true;
    refreshDay();
    window.addEventListener('focus', refreshDay);
    document.addEventListener('visibilitychange', refreshDay);
    return () => {
      mounted = false;
      revision += 1;
      if (dayTimer) clearTimeout(dayTimer);
      window.removeEventListener('focus', refreshDay);
      document.removeEventListener('visibilitychange', refreshDay);
      document.dispatchEvent(new CustomEvent('qts:subpage-header', { detail: { active: false } }));
    };
  });
</script>

<div class="bio-page" data-practice-route-back>
  <header class="div-subbar">
    <div class="div-subbar-title-wrap">
      <span class="div-subbar-eyebrow">{copy.group}</span>
      <h1 class="div-subbar-title">{copy.title}</h1>
    </div>
    <button class="div-guide-btn" type="button" onclick={() => guideOpen = true}>
      <span aria-hidden="true">?</span> {copy.guide}
    </button>
  </header>

  <section class="bio-profile">
    <div class="bio-profile-inputs">
      <label>
        <span>{copy.name}</span>
        <input
          type="text"
          maxlength="200"
          bind:value={name}
          placeholder={copy.namePlaceholder}
          disabled={loading || readFailed || !ready}
          onblur={saveProfile}
          autocomplete="name"
        />
      </label>
      <div class="bio-field">
        <label for="bio-birth-input">{copy.birth}</label>
        <div class="bio-date-field" aria-invalid={hasBirthError}>
          <input
            id="bio-birth-input"
            type="text"
            inputmode="numeric"
            maxlength="10"
            value={birthText}
            placeholder={copy.birthPlaceholder}
            disabled={loading || readFailed || !ready}
            aria-invalid={hasBirthError}
            oninput={handleBirthTextInput}
            onchange={handleBirthTextCommit}
            onblur={handleBirthTextCommit}
          />
          <span class="bio-date-picker-wrap">
            <span class="bio-date-picker-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="3" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </span>
            <input
              type="date"
              class="bio-date-native"
              aria-label={copy.pickBirthDate}
              value={dateValid ? birth : ''}
              max={today}
              disabled={loading || readFailed || !ready}
              onclick={(event) => {
                try { event.currentTarget.showPicker?.(); } catch { /* WebView hỗ trợ tap trực tiếp vào input date. */ }
              }}
              onchange={(event) => {
                const picked = event.currentTarget.value;
                birth = picked;
                birthText = formatBiorhythmDisplayDate(picked);
                birthBlurred = false;
                selected = today;
                void saveProfile();
              }}
            />
          </span>
        </div>
      </div>
    </div>
    {#if snapshot}
      <div class="bio-age-bar">
        <span>
          <strong>{name.trim() || copy.you}</strong> · {copy.age(snapshot.age)}
          <em>({copy.daysAlive(snapshot.age.totalDays)})</em>
        </span>
        <strong class="bio-age-badge">{copy.ageBadge(snapshot.age.years)}</strong>
      </div>
    {/if}
    <div aria-live="polite">
      {#if loading || !ready}
        <p class="bio-note">{copy.loading}</p>
      {:else if readFailed}
        <p class="bio-error">{copy.readError}</p>
        <button class="bio-chip" type="button" onclick={() => restoreProfile(principal)}>
          {copy.retry}
        </button>
      {:else if hasBirthError}
        <p class="bio-error" role="alert">{copy.invalid}</p>
      {:else if saveStatus === 'error'}
        <p class="bio-error">{copy.saveError}</p>
        <button class="bio-chip" type="button" onclick={saveProfile}>{copy.retry}</button>
      {:else if saveStatus === 'saving'}
        <p class="bio-note">{copy.saving}</p>
      {:else if saveStatus === 'saved'}
        <p class="bio-note">{copy.saved}</p>
      {/if}
    </div>
  </section>

  {#if snapshot}
    <BiorhythmResults {birth} {today} {snapshot} {copy} onSelect={selectDate} />
  {:else if !loading && !readFailed && ready && birth === '' && !hasBirthError}
    <div class="bio-panel bio-empty">
      <DivinationArtwork kind="biorhythm" size={48} />
      <p>{copy.empty}</p>
    </div>
  {/if}
</div>

{#if guideOpen}
  <dialog
    class="bio-guide-dialog"
    use:modalDialog
    aria-labelledby="biorhythm-guide-title"
    oncancel={(event) => {
      event.preventDefault();
      guideOpen = false;
    }}
    onclick={(event) => {
      if (event.target === event.currentTarget) guideOpen = false;
    }}
  >
    <header>
      <h2 id="biorhythm-guide-title">{copy.guide} · {copy.title}</h2>
      <button
        class="bio-icon-button"
        type="button"
        data-modal-focus
        aria-label={copy.close}
        onclick={() => guideOpen = false}
      >
        ✕
      </button>
    </header>
    <ol>
      {#each copy.guideSteps as step (step)}
        <li>{step}</li>
      {/each}
    </ol>
    <p>{copy.modelNotice}</p>
  </dialog>
{/if}
