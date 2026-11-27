<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import './divination-shared.css';
  import DivinationGuideDialog from './DivinationGuideDialog.svelte';
  import DivinationHistoryPanel from './DivinationHistoryPanel.svelte';
  import ItalicParensText from './ItalicParensText.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getDivinationCopy } from '$lib/i18n/divination-ui';
  import {
    MOC_LUAN_HAN_NUMERALS,
    MOC_LUAN_WHEELS,
    formatVietnamDateKey,
    getMocLuanRitual,
    resolveMocLuanEntry,
    rollMocLuanRound,
    sumMocLuanRounds,
    type DivinationHistoryEntry,
    type MocLuanResolvedEntry,
  } from '$lib/domain/practice/divination';
  import {
    clearDivinationHistory,
    loadDivinationHistory,
    saveDivinationHistoryEntry,
  } from '$lib/browser/divination-storage';

  type Stage = 'ritual' | 'roll' | 'result';

  const REST_ANGLES = [-12, 8, -7, 11, -9, 7] as const;

  const session = getSessionContext();
  const locale = getLocaleContext();
  const copy = $derived(getDivinationCopy(locale.current === 'en'));
  const principalId = $derived(session.value.authenticated ? session.value.user?.id ?? null : null);
  const ritual = getMocLuanRitual();

  let stage = $state<Stage>('ritual');
  let chantCount = $state<number>(0);
  let petitionTopic = $state<string>('');
  let ritualConfirmed = $state<boolean>(false);
  let guideOpen = $state<boolean>(false);

  let rolling = $state<boolean>(false);
  let rounds = $state<number[]>([]);
  let lastFaces = $state<(number | null)[]>([null, null, null, null, null, null]);
  let resolvedEntry = $state<MocLuanResolvedEntry | null>(null);
  let savedResult = $state(false);

  let history = $state<DivinationHistoryEntry[]>([]);
  let historyPending = $state(true);
  let disposed = false;
  let toastMessage = $state<string>('');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let rollTimer: ReturnType<typeof setTimeout> | undefined;
  let nextStageTimer: ReturnType<typeof setTimeout> | undefined;

  const runningTotal = $derived(sumMocLuanRounds(rounds));
  const zeroSumAllThree = $derived(rounds.length === 3 && runningTotal === 0);

  function showToast(msg: string): void {
    toastMessage = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMessage = '';
      toastTimer = undefined;
    }, 3200);
  }

  function clearRollTimers(): void {
    if (rollTimer) {
      clearTimeout(rollTimer);
      rollTimer = undefined;
    }
    if (nextStageTimer) {
      clearTimeout(nextStageTimer);
      nextStageTimer = undefined;
    }
  }

  function handleBackStep(): void {
    if (stage === 'result') {
      startNextRound();
    } else if (stage === 'roll') {
      returnToRitual();
    } else if (page.state.homeDivination) {
      window.history.back();
    } else {
      void goto('/tu-tap');
    }
  }

  function startNextRound(): void {
    if (ritualConfirmed) enterRollStage();
    else returnToRitual();
  }

  async function loadHistory(): Promise<void> {
    const entries = await loadDivinationHistory(principalId, 'moc-luan');
    if (disposed) return;
    history = entries;
    historyPending = false;
  }

  onMount(() => {
    void loadHistory();
    document.dispatchEvent(
      new CustomEvent('qts:subpage-header', {
        detail: { active: true, onBack: handleBackStep, backLabel: page.state.homeDivination ? copy.backToHome : copy.backToPractice },
      }),
    );
  });

  onDestroy(() => {
    disposed = true;
    clearRollTimers();
    if (toastTimer) clearTimeout(toastTimer);
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('qts:subpage-header', { detail: { active: false } }));
    }
  });

  function enterRollStage(): void {
    if (!ritualConfirmed) return;
    resetRoll();
    stage = 'roll';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function rollRound(): void {
    if (stage !== 'roll' || !ritualConfirmed || rolling || rounds.length >= 3) return;
    clearRollTimers();
    rolling = true;
    const outcome = rollMocLuanRound();
    lastFaces = [...outcome.faces];

    const reduceMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const rollMs = reduceMotion ? 120 : 1080;

    rollTimer = setTimeout(() => {
      rolling = false;
      const nextRounds = [...rounds, outcome.sum];
      rounds = nextRounds;
      const total = sumMocLuanRounds(nextRounds);
      if (nextRounds.length === 3 && total > 0) {
        nextStageTimer = setTimeout(() => {
          resolvedEntry = resolveMocLuanEntry(total);
          stage = 'result';
          if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
        }, reduceMotion ? 120 : 750);
      }
    }, rollMs);
  }

  function resetRoll(): void {
    clearRollTimers();
    rolling = false;
    rounds = [];
    lastFaces = [null, null, null, null, null, null];
    resolvedEntry = null;
    savedResult = false;
    stage = 'roll';
  }

  function returnToRitual(): void {
    resetRoll();
    ritualConfirmed = false;
    chantCount = 0;
    stage = 'ritual';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function saveCurrentResult(): Promise<void> {
    if (!resolvedEntry || historyPending) return;
    if (savedResult) {
      showToast(copy.savedHistoryToast);
      return;
    }
    const result = resolvedEntry;
    const roundSummary = rounds.length === 3 ? ` (${rounds.join(' + ')})` : '';
    const entry: DivinationHistoryEntry = {
      id: `ml-${Date.now()}-${resolvedEntry.id}`,
      kind: 'moc-luan',
      dateKey: formatVietnamDateKey(),
      createdAt: new Date().toISOString(),
      resultNumber: resolvedEntry.id,
      title: `Số ${resolvedEntry.id}${roundSummary}`,
      topicLabel: petitionTopic.trim() || copy.noNote,
      rounds: [...rounds],
      summary: `${resolvedEntry.scope.badge} — ${resolvedEntry.text}`,
    };
    historyPending = true;
    const res = await saveDivinationHistoryEntry(principalId, entry);
    if (disposed) return;
    historyPending = false;
    if (res.ok) {
      history = res.entries;
      if (resolvedEntry === result) savedResult = true;
    }
    showToast(res.ok ? copy.savedHistoryToast : copy.storageErrorToast);
  }

  function openHistoryEntry(entry: DivinationHistoryEntry): void {
    const item = resolveMocLuanEntry(entry.resultNumber);
    if (!item || historyPending) return;
    resetRoll();
    ritualConfirmed = false;
    resolvedEntry = item;
    const savedRounds = entry.rounds;
    if (Array.isArray(savedRounds) && savedRounds.length === 3 &&
      savedRounds.every((value) => Number.isInteger(value) && value >= 0 && value <= 63) &&
      sumMocLuanRounds(savedRounds) === entry.resultNumber) {
      rounds = [...savedRounds];
    }
    petitionTopic = entry.topicLabel === 'Không ghi chú' || entry.topicLabel === 'No note' ? '' : entry.topicLabel;
    savedResult = true;
    stage = 'result';
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleClearHistory(): Promise<void> {
    if (historyPending) return;
    historyPending = true;
    const res = await clearDivinationHistory(principalId, 'moc-luan');
    if (disposed) return;
    historyPending = false;
    if (res.ok) history = res.entries;
    showToast(res.ok ? copy.clearedHistoryToast : copy.storageErrorToast);
  }
</script>

<div class="div-page" data-practice-route-back>
  <div class="div-subbar">
    <div class="div-subbar-title-wrap">
      <span class="div-subbar-eyebrow">{copy.groupTitle}</span>
      <h1 class="div-subbar-title">{copy.hubMocLuanTitle}</h1>
    </div>
    <button type="button" class="div-guide-btn" onclick={() => (guideOpen = true)}>
      <span aria-hidden="true">?</span> {copy.guideBtn}
    </button>
  </div>

  <!-- Thanh 3 bước -->
  <nav class="ml-stepper" aria-label="Tiến trình Chiêm Luân Tướng Pháp">
    <span class="ml-step-pill" class:ml-step-pill--active={stage === 'ritual'}>
      1. Hành nghi thức
    </span>
    <span class="ml-step-pill" class:ml-step-pill--active={stage === 'roll'}>
      2. Gieo Mộc Luân
    </span>
    <span class="ml-step-pill" class:ml-step-pill--active={stage === 'result'}>
      3. Kết quả 189
    </span>
  </nav>

  {#if stage === 'ritual'}
    <article class="div-card div-card--padded ml-ritual">
      <header class="ml-ritual-header">
        <h2 class="ml-ritual-title">{ritual.title}</h2>
        <p class="ml-ritual-sub">{ritual.subtitle}</p>
        <p class="ml-ritual-opening">
          <ItalicParensText text={ritual.openingNote} />
        </p>
      </header>

      <!-- I. Đảnh lễ -->
      <section class="ml-ritual-sec">
        <h3 class="div-section-accent-heading">I. ĐẢNH LỄ TAM BẢO VÀ ĐỊA TẠNG BỒ TÁT</h3>
        <div class="ml-homage-list">
          {#each ritual.homages as item, idx (idx)}
            <div class="ml-homage-card">
              <div class="ml-homage-head">{item.title}</div>
              <p class="ml-prose">
                <ItalicParensText text={item.prayer} />
              </p>
            </div>
          {/each}
        </div>
      </section>

      <!-- II. Kệ & Văn quán tưởng cúng dường -->
      <section class="ml-ritual-sec">
        <h3 class="div-section-accent-heading">II. QUÁN TƯỞNG CÚNG DƯỜNG</h3>
        <p class="ml-posture-note"><em>(Quỳ gối, chắp tay)</em></p>
        <div class="ml-verse-box">
          {#each ritual.offeringVerse as line, idx (idx)}
            <p class="ml-verse-line">{line}</p>
          {/each}
        </div>
        <div class="ml-contemplation-body">
          {#each ritual.offeringContemplation as para, idx (idx)}
            <p class="ml-prose"><ItalicParensText text={para} /></p>
          {/each}
        </div>
      </section>

      <!-- III. Nhất tâm ngưỡng cáo (Tác bạch) -->
      <section class="ml-ritual-sec">
        <h3 class="div-section-accent-heading">III. NHẤT TÂM TÁC BẠCH</h3>
        <p class="ml-petition-lead">{ritual.petitionLead}</p>
        <p class="ml-prose ml-petition-template">
          <ItalicParensText text={ritual.petitionTemplate} />
        </p>

        <label for="mlPetitionInput" class="ml-field-label">
          Nội dung sự việc cần thỉnh thị <span class="ml-opt">(tùy chọn, giúp đối chiếu kết quả)</span>
        </label>
        <textarea
          id="mlPetitionInput"
          class="ml-textarea"
          rows="4"
          bind:value={petitionTopic}
          maxlength="300"
          placeholder="Ghi một sự việc cần chiêm sát…"
        ></textarea>
      </section>

      <!-- IV. Xưng niệm Thánh hiệu -->
      <section class="ml-ritual-sec">
        <h3 class="div-section-accent-heading">IV. XƯNG NIỆM VÀ THỈNH NGUYỆN</h3>
        <div class="ml-chant-card">
          <p class="ml-posture-note"><em>(Quỳ gối, nhất tâm xưng niệm)</em></p>
          <p class="ml-sacred-name">{ritual.sacredName}</p>
          <p class="ml-sacred-note">
            <ItalicParensText text={ritual.sacredNameNote} />
          </p>
          <div class="ml-chant-controls">
            <button
              type="button"
              class="div-btn div-btn--soft ml-chant-count-btn"
              onclick={() => (chantCount += 1)}
            >
              Đếm câu niệm ({chantCount}/1.000)
            </button>
            <button
              type="button"
              class="div-btn ml-chant-reset-btn"
              disabled={chantCount === 0}
              onclick={() => (chantCount = 0)}
            >
              Đặt lại
            </button>
          </div>
        </div>

        <p class="ml-posture-note">
          <em>(Hướng về Tôn Tượng Địa Tạng Bồ Tát, chắp tay thành kính)</em>
        </p>
        <p class="ml-prose">
          <ItalicParensText text={ritual.closingPrayer} />
        </p>
      </section>

      <!-- Xác nhận hành lễ -->
      <footer class="ml-confirm-footer">
        <label class="ml-confirm-label">
          <input type="checkbox" class="ml-confirm-checkbox" bind:checked={ritualConfirmed} />
          <span>
            Tôi xác nhận đã hành lễ, cúng dường, tác bạch, xưng niệm 1.000 câu và đọc lời thỉnh nguyện.
          </span>
        </label>
        <button
          type="button"
          class="div-btn div-btn--primary div-btn--full"
          disabled={!ritualConfirmed}
          onclick={enterRollStage}
        >
          Xác nhận xong — Vào gieo Mộc Luân →
        </button>
      </footer>
    </article>
  {:else if stage === 'roll'}
    <div class="div-card div-card--padded ml-roll-card">
      <div class="ml-roll-header">
        <span class="ml-roll-eyebrow">BỘ MỘC LUÂN THỨ BA · 6 BÁNH XE GỖ HƯƠNG</span>
        <h2 class="ml-roll-title">GIEO 3 LẦN CỘNG TỔNG (1 – 189)</h2>
        <p class="ml-prose">{ritual.castingInstruction}</p>
      </div>

      <div class="ml-rounds-bar">
        {#each [1, 2, 3] as r (r)}
          <div class="ml-round-chip" class:ml-round-chip--done={rounds[r - 1] !== undefined}>
            <span class="ml-round-k">Lần {r}</span>
            <strong class="ml-round-v">{rounds[r - 1] !== undefined ? rounds[r - 1] : '—'}</strong>
          </div>
        {/each}
      </div>

      <div class="ml-total-row">
        <span>6 khối Mộc Luân (3 mặt số + 1 mặt trống)</span>
        <strong>Tổng: {runningTotal}</strong>
      </div>

      <!-- Khăn trải & 6 khối gỗ Mộc Luân -->
      <div class="ml-cloth-mat">
        <div class="ml-wheels-grid">
          {#each MOC_LUAN_WHEELS as wheel, idx (wheel.idx)}
            {@const face = lastFaces[idx]}
            {@const hanText = face === null ? MOC_LUAN_HAN_NUMERALS[wheel.faces[0]] : MOC_LUAN_HAN_NUMERALS[face]}
            {@const angle = face === null ? 0 : REST_ANGLES[idx]}
            <div class="ml-wheel-cell">
              <div
                class="ml-wheel-motion"
                class:ml-wheel-motion--rolling={rolling}
                style="--rest-angle: {angle}deg; transform: rotate({angle}deg); animation-delay: {idx * 65}ms;"
              >
                <svg class="ml-wheel-svg" viewBox="0 0 64 98" aria-hidden="true">
                  <defs>
                    <linearGradient id={`mlWoodFront-${idx}`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stop-color="#8b3b18" />
                      <stop offset="45%" stop-color="#b55226" />
                      <stop offset="100%" stop-color="#6c2a0d" />
                    </linearGradient>
                  </defs>
                  <ellipse cx="32" cy="92" rx="16" ry="3.5" fill="rgba(55,22,6,0.2)" />
                  <polygon points="32,4 14,19 32,19" fill="#ce6d3d" stroke="#471a08" stroke-width="1.1" />
                  <polygon points="32,4 32,19 50,19" fill="#8f3d19" stroke="#471a08" stroke-width="1.1" />
                  <rect x="14" y="19" width="36" height="54" fill={`url(#mlWoodFront-${idx})`} stroke="#471a08" stroke-width="1.2" />
                  <line x1="32" y1="19" x2="32" y2="73" stroke="#53200a" stroke-width="0.9" opacity="0.35" />
                  <polygon points="14,73 32,73 32,88" fill="#7c3314" stroke="#471a08" stroke-width="1.1" />
                  <polygon points="32,73 50,73 32,88" fill="#521d09" stroke="#471a08" stroke-width="1.1" />
                  {#if face === 0}
                    <circle cx="32" cy="46" r="10" fill="none" stroke="#f7dc84" stroke-width="1.7" opacity="0.5" stroke-dasharray="3 3" />
                  {:else if hanText && hanText.length > 1}
                    <text x="32" y="42" text-anchor="middle" font-size="16" font-weight="800" fill="#fce186">
                      {hanText[0]}
                    </text>
                    <text x="32" y="61" text-anchor="middle" font-size="16" font-weight="800" fill="#fce186">
                      {hanText.slice(1)}
                    </text>
                  {:else}
                    <text x="32" y="52" text-anchor="middle" font-size="20" font-weight="800" fill="#fce186">
                      {hanText}
                    </text>
                  {/if}
                </svg>
              </div>
              <span class="ml-wheel-name">Luân {wheel.idx}</span>
              <span class="ml-wheel-status">
                {#if face === null}
                  {wheel.faces[0]}·{wheel.faces[1]}·{wheel.faces[2]}·∅
                {:else if face === 0}
                  Trống (0)
                {:else}
                  Mặt số {face}
                {/if}
              </span>
            </div>
          {/each}
        </div>
      </div>

      {#if zeroSumAllThree}
        <div class="div-warning-box" role="alert">
          <strong>Tổng 3 lần bằng 0 (Tướng Vô sở hữu):</strong> Cả 3 lần đều rơi vào 6 mặt trống. Theo
          <em>Kinh Chiêm Sát</em>, hành giả nên tạm dừng, chí thành sám hối nghiệp chướng và lễ bái Bồ Tát
          Địa Tạng rồi mới gieo lại lượt mới.
        </div>
        <button type="button" class="div-btn div-btn--primary div-btn--full" onclick={returnToRitual}>
          Gieo lại
        </button>
      {:else}
        <button
          type="button"
          class="div-btn div-btn--primary div-btn--full"
          disabled={rolling || rounds.length >= 3}
          onclick={rollRound}
        >
          {rolling
            ? `Đang gieo 6 thanh gỗ (Lần ${rounds.length + 1} / 3)…`
            : `Gieo 6 Mộc Luân (Lần ${Math.min(3, rounds.length + 1)} / 3)`}
        </button>
      {/if}
    </div>
  {:else if resolvedEntry}
    <article class="div-card ml-result-card">
      <!-- Phần 1: Phiếu kết quả -->
      <header class="ml-res-hero">
        <span class="ml-scope-badge">{resolvedEntry.scope.badge}</span>
        <h2 class="ml-res-title">TƯỚNG CHIÊM SÁT SỐ {String(resolvedEntry.id).padStart(2, '0')}</h2>
        <p class="ml-res-role">{resolvedEntry.scope.realmRole}</p>

        {#if rounds.length === 3}
          <div class="ml-res-chips">
            <span class="ml-res-chip">Lần 1: <strong>{rounds[0]}</strong></span>
            <span class="ml-res-chip">Lần 2: <strong>{rounds[1]}</strong></span>
            <span class="ml-res-chip">Lần 3: <strong>{rounds[2]}</strong></span>
          </div>
        {/if}

        <div class="ml-canon-box">
          <span class="ml-canon-eyebrow">{resolvedEntry.quotation ? 'NGUYÊN VĂN KINH CHIÊM SÁT' : 'DIỄN Ý CÂU KINH CHIÊM SÁT'}</span>
          <p class="ml-canon-quote">{resolvedEntry.text}</p>
          <p class="ml-canon-source">
            Kinh Chiêm Sát Thiện Ác Nghiệp Báo · Quyển Thượng · Câu số {resolvedEntry.id} / 189
            {#if resolvedEntry.quotation} · Chuyển ngữ: Như Hòa{:else} · Đối chiếu bản Hán T0839{/if}
          </p>
        </div>
      </header>

      <!-- Đối chiếu nội dung tác bạch nếu có -->
      {#if petitionTopic.trim()}
        <div class="ml-topic-echo-box">
          <h3 class="div-section-accent-heading">Đối chiếu với sự việc bạn đã tác bạch</h3>
          <p class="ml-topic-echo-quote">“{petitionTopic.trim()}”</p>
          <p class="ml-prose">{resolvedEntry.topicGuide}</p>
        </div>
      {/if}

      <!-- Phần 2: 3 mục phân tích chuyên sâu -->
      <div class="ml-res-sections">
        <section class="ml-res-sec">
          <h3 class="div-section-accent-heading"><span>I. Tóm lược lời giảng <em>(HT. Thích Mộng Tham)</em></span></h3>
          <p class="ml-prose ml-prose--multiline">{resolvedEntry.lecture}</p>
        </section>

        <section class="ml-res-sec ml-res-sec--divider">
          <h3 class="div-section-accent-heading">II. Phân tích chuyên sâu &amp; Ứng dụng tu học</h3>
          {#each resolvedEntry.deepMeaning.split('\n\n').filter(Boolean) as paragraph, index (index)}
            <p class="ml-prose"><ItalicParensText text={paragraph} /></p>
          {/each}
          <div class="ml-guidance-box">
            <div class="ml-guidance-label">Điều nên giữ &amp; Điều cần thận trọng</div>
            <p class="ml-prose">{resolvedEntry.guidance}</p>
          </div>
        </section>

        <section class="ml-res-sec ml-res-sec--divider">
          <h3 class="div-section-accent-heading">III. Pháp hành trì, Sám hối &amp; Hoàn mãn</h3>
          <p class="ml-prose">{resolvedEntry.practice}</p>
          <p class="ml-completion-note">
            Sau khi chiêm sát, hãy thành tâm tri ân Tam Bảo và Đức Địa Tạng Bồ Tát. Trở về với
            chánh niệm, giữ ngũ giới và thực hành thập thiện để chuyển hóa nghiệp duyên.
          </p>
        </section>
      </div>

      <footer class="ml-res-footer">
        <button type="button" class="div-btn div-btn--primary ml-btn-redraw" onclick={startNextRound}>
          Gieo lượt mới
        </button>
        <button type="button" class="div-btn div-btn--soft" disabled={historyPending} onclick={saveCurrentResult}>
          {copy.saveHistoryBtn}
        </button>
        <button type="button" class="div-btn" onclick={returnToRitual}>
          Xem nghi thức
        </button>
      </footer>
    </article>
  {/if}

  {#if toastMessage}
    <div class="div-toast" role="status">{toastMessage}</div>
  {/if}

  <DivinationHistoryPanel
    title="Lịch sử Mộc Luân Chiêm Sát (trên máy)"
    entries={history}
    onSelectEntry={openHistoryEntry}
    onClear={handleClearHistory}
  />

  <DivinationGuideDialog open={guideOpen} kind="moc-luan" onClose={() => (guideOpen = false)} />
</div>

<style>
  .ml-stepper {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 14px;
  }
  .ml-step-pill {
    min-height: 40px;
    padding: 6px 6px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .ml-step-pill--active {
    border-color: var(--gold);
    background: linear-gradient(135deg, var(--gold2), var(--gold));
    color: var(--on-gold);
  }

  /* Ritual */
  .ml-ritual {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .ml-ritual-header {
    text-align: center;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border2);
  }
  .ml-ritual-title {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    text-transform: uppercase;
    color: var(--text);
    text-wrap: balance;
    line-height: 1.3;
  }
  .ml-ritual-sub {
    margin: 4px 0 0;
    font-size: 12.5px;
    color: var(--brown);
    font-weight: 600;
  }
  .ml-ritual-opening {
    margin: 8px 0 0;
    font-size: 13.5px;
    color: var(--text2);
    text-align: center;
  }

  .ml-ritual-sec {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 14px;
    border-top: 1px solid var(--border2);
  }
  .ml-ritual-header + .ml-ritual-sec {
    padding-top: 0;
    border-top: none;
  }
  .ml-homage-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ml-homage-card {
    padding: 12px 14px;
    border-radius: var(--radius-control);
    border: 1px solid var(--border2);
    background: var(--bg2);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ml-homage-head {
    font-size: 12.5px;
    font-weight: 800;
    color: var(--brown-dark);
    text-align: center;
    text-transform: uppercase;
  }
  .ml-posture-note {
    margin: 0;
    text-align: center;
    font-size: 13px;
    color: var(--muted);
  }
  .ml-verse-box {
    padding: 12px 10px;
    border-top: 1px solid color-mix(in srgb, var(--gold) 50%, var(--border));
    border-bottom: 1px solid color-mix(in srgb, var(--gold) 50%, var(--border));
  }
  .ml-verse-line {
    margin: 0;
    font-family: var(--font-reader);
    font-size: 15.5px;
    line-height: 1.7;
    text-align: center;
    color: var(--text);
  }
  .ml-contemplation-body {
    margin-top: 2px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ml-prose {
    margin: 0;
    font-family: var(--font-reader);
    font-size: 15px;
    line-height: 1.72;
    color: var(--text);
    text-align: justify;
  }
  .ml-prose--multiline {
    white-space: pre-line;
  }

  .ml-petition-lead {
    margin: 0;
    text-align: center;
    font-size: 13px;
    font-weight: 800;
    text-transform: uppercase;
    color: var(--brown-dark);
  }
  .ml-petition-template {
    padding: 12px 14px;
    border-radius: var(--radius-control);
    border: 1px solid var(--border2);
    background: var(--bg2);
  }
  .ml-field-label {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
  }
  .ml-opt {
    font-weight: 400;
    color: var(--muted);
  }
  .ml-textarea {
    width: 100%;
    min-height: 96px;
    padding: 10px 12px;
    border-radius: var(--radius-control);
    border: 1px solid var(--border);
    background: var(--bg2);
    color: var(--text);
    font-family: var(--font-app);
    font-size: var(--font-size-input);
    line-height: 1.55;
    resize: vertical;
    box-sizing: border-box;
  }

  .ml-chant-card {
    padding: 16px 12px;
    border-radius: var(--radius-card);
    border: 1px solid color-mix(in srgb, var(--gold) 50%, var(--border));
    background: var(--gold-light);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
  }
  .ml-sacred-name {
    margin: 2px 0;
    font-family: var(--font-reader);
    font-size: clamp(12.5px, 3.6vw, 17.5px);
    font-weight: 800;
    letter-spacing: 0.02em;
    color: var(--brown-dark);
    white-space: nowrap;
  }
  .ml-sacred-note {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text2);
  }
  .ml-chant-controls {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-top: 4px;
    width: 100%;
  }
  .ml-chant-count-btn {
    flex: 1 1 190px;
  }
  .ml-chant-reset-btn {
    flex: 0 0 auto;
  }

  .ml-confirm-footer {
    padding-top: 14px;
    border-top: 1px solid var(--border2);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ml-confirm-label {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-height: 44px;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--text);
    cursor: pointer;
  }
  .ml-confirm-checkbox {
    width: 22px;
    height: 22px;
    margin-top: 2px;
    flex-shrink: 0;
    accent-color: var(--gold);
  }

  /* Roll stage */
  .ml-roll-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .ml-roll-header {
    text-align: center;
  }
  .ml-roll-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--brown);
  }
  .ml-roll-title {
    margin: 2px 0 0;
    font-size: 18px;
    font-weight: 800;
    color: var(--text);
    text-transform: uppercase;
    text-wrap: balance;
  }
  .ml-rounds-bar {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .ml-round-chip {
    padding: 8px 6px;
    border-radius: var(--radius-control);
    border: 1px solid var(--border2);
    background: var(--bg2);
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ml-round-chip--done {
    background: var(--gold-light);
    border-color: color-mix(in srgb, var(--gold) 55%, var(--border));
  }
  .ml-round-k {
    font-size: 11px;
    color: var(--muted);
  }
  .ml-round-v {
    font-size: 15px;
    color: var(--text);
  }
  .ml-total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12.5px;
    color: var(--text2);
  }
  .ml-cloth-mat {
    padding: 16px 12px;
    border-radius: var(--radius-card);
    border: 1px solid var(--border2);
    background: radial-gradient(circle at 50% 40%, var(--gold-light), var(--bg2));
  }
  .ml-wheels-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px 10px;
  }
  .ml-wheel-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .ml-wheel-motion {
    width: 60px;
    height: 92px;
    transition: transform 0.25s ease;
  }
  .ml-wheel-svg {
    width: 100%;
    height: 100%;
  }
  .ml-wheel-motion--rolling {
    animation: woodWheelRoll 1.05s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes woodWheelRoll {
    0% { transform: translateY(0) rotate(0deg); }
    35% { transform: translateY(-20px) rotate(165deg); }
    70% { transform: translateY(4px) rotate(330deg); }
    100% { transform: translateY(0) rotate(var(--rest-angle, 0deg)); }
  }
  .ml-wheel-name {
    margin-top: 2px;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--brown-dark);
  }
  .ml-wheel-status {
    font-size: 11px;
    color: var(--muted);
  }

  /* Result card */
  .ml-res-hero {
    padding: 20px 18px 18px;
    border-bottom: 1px solid var(--border2);
    background: linear-gradient(180deg, var(--gold-light), var(--card));
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 10px;
  }
  .ml-scope-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--gold) 55%, var(--border));
    background: var(--card);
    color: var(--brown-dark);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .ml-res-title {
    margin: 0;
    font-size: clamp(17px, 4.8vw, 22px);
    font-weight: 800;
    text-transform: uppercase;
    color: var(--text);
    text-wrap: balance;
    line-height: 1.3;
  }
  .ml-res-title,
  .ml-res-role,
  .ml-topic-echo-quote,
  .ml-completion-note {
    font-family: var(--font-reader);
  }
  .ml-res-role {
    margin: 0;
    font-size: 12.5px;
    color: var(--muted);
  }
  .ml-res-chips {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    width: 100%;
    max-width: 24rem;
  }
  .ml-res-chip {
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--card);
    font-size: 12px;
    color: var(--text2);
  }
  .ml-canon-box {
    width: 100%;
    padding: 14px 16px;
    border-radius: var(--radius-card);
    border: 1px solid var(--border);
    background: var(--card);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ml-canon-eyebrow {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--muted);
  }
  .ml-canon-quote {
    margin: 0;
    font-family: var(--font-reader);
    font-size: 17px;
    font-weight: 700;
    line-height: 1.55;
    color: var(--text);
    text-align: center;
  }
  .ml-canon-source {
    margin: 2px 0 0;
    padding-top: 6px;
    border-top: 1px solid var(--border2);
    font-size: 11.5px;
    font-weight: 600;
    color: var(--brown);
  }

  .ml-topic-echo-box {
    padding: 14px 18px;
    border-bottom: 1px solid var(--border2);
    border-left: 4px solid var(--gold);
    background: color-mix(in srgb, var(--gold-light) 75%, var(--card));
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ml-topic-echo-quote {
    margin: 0;
    font-size: 13px;
    font-style: italic;
    color: var(--text2);
  }

  .ml-res-sections {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .ml-res-sec {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ml-res-sec--divider {
    padding-top: 14px;
    border-top: 1px solid var(--border2);
  }
  .ml-guidance-box {
    padding: 12px 14px;
    border-radius: var(--radius-control);
    border: 1px solid var(--border2);
    background: var(--bg2);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ml-guidance-label {
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--brown-dark);
  }
  .ml-completion-note {
    margin: 2px 0 0;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--muted);
    text-align: justify;
  }

  .ml-res-footer {
    padding: 14px 18px 18px;
    border-top: 1px solid var(--border2);
    background: var(--bg2);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .ml-btn-redraw {
    grid-column: span 2;
  }
  @media (min-width: 640px) {
    .ml-res-footer {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .ml-btn-redraw {
      grid-column: span 1;
      order: 3;
    }
  }

  :global([data-theme='dark']) .ml-homage-head,
  :global([data-theme='dark']) .ml-petition-lead,
  :global([data-theme='dark']) .ml-sacred-name,
  :global([data-theme='dark']) .ml-wheel-name,
  :global([data-theme='dark']) .ml-scope-badge,
  :global([data-theme='dark']) .ml-guidance-label,
  :global([data-theme='dark']) .ml-canon-source,
  :global([data-theme='dark']) .ml-ritual-sub {
    color: var(--gold2);
  }

  @media (prefers-reduced-motion: reduce) {
    .ml-wheel-motion,
    .ml-wheel-motion--rolling {
      animation: none;
      transition: none;
    }
  }
</style>
