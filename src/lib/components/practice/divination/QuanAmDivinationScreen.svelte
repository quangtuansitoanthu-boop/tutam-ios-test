<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import './divination-shared.css';
  import DivinationGuideDialog from './DivinationGuideDialog.svelte';
  import DivinationHistoryPanel from './DivinationHistoryPanel.svelte';
  import ItalicParensText from './ItalicParensText.svelte';
  import QuanAmArtwork from './QuanAmArtwork.svelte';
  import type { CoinFaces } from './quan-am-artwork';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getDivinationCopy } from '$lib/i18n/divination-ui';
  import {
    QUAN_AM_DAILY_VOW_NOTE,
    QUAN_AM_PRAYER_CHANT,
    QUAN_AM_TOPICS,
    canDrawQuanAmTopicToday,
    drawQuanAmStickId,
    evaluateKeoRounds,
    findAspectForTopic,
    formatVietnamDateKey,
    getQuanAmStick,
    tossKeoCoins,
    type DivinationHistoryEntry,
    type KeoKind,
    type KeoToss,
    type QuanAmStick,
  } from '$lib/domain/practice/divination';
  import {
    clearDivinationHistory,
    loadDivinationHistory,
    saveDivinationHistoryEntry,
  } from '$lib/browser/divination-storage';

  type Stage = 'draw' | 'keo' | 'result';

  const session = getSessionContext();
  const locale = getLocaleContext();
  const copy = $derived(getDivinationCopy(locale.current === 'en'));
  const principalId = $derived(session.value.authenticated ? session.value.user?.id ?? null : null);

  let stage = $state<Stage>('draw');
  let selectedTopicId = $state('');
  let customTopicNote = $state<string>('');
  let prayerOpen = $state(false);
  let guideOpen = $state<boolean>(false);

  let bambooShaking = $state<boolean>(false);
  let stickLanded = $state(false);
  let drawnStickId = $state<number | null>(null);
  let currentStick = $state<QuanAmStick | null>(null);

  let pendingToss = $state<KeoToss | null>(null);
  const coinTossing = $derived(pendingToss !== null);
  let keoTosses = $state<KeoToss[]>([]);
  let lastCoins = $state<CoinFaces>(['sap', 'ngua']);
  let coinAction = $state<HTMLButtonElement>();

  let history = $state<DivinationHistoryEntry[]>([]);
  let historyPending = $state(true);
  let disposed = false;
  let toastMessage = $state<string>('');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let transitionTimer: ReturnType<typeof setTimeout> | undefined;
  let savedCurrentDraw = $state(false);
  let referenceOnly = $state(false);
  let todayKey = $state(formatVietnamDateKey());
  let drawDateKey = '';
  let dayTimer: ReturnType<typeof setTimeout> | undefined;

  const selectedTopic = $derived(QUAN_AM_TOPICS.find((topic) => topic.id === selectedTopicId));
  const effectiveTopicLabel = $derived.by(() => {
    if (selectedTopicId === 'other') {
      return customTopicNote.trim() || copy.privateWish;
    }
    return selectedTopic?.label ?? '';
  });

  const dailyTopicGuard = $derived(canDrawQuanAmTopicToday(history, selectedTopicId, todayKey));
  const keoEval = $derived(evaluateKeoRounds(keoTosses));
  const matchedAspect = $derived(
    currentStick && selectedTopicId !== 'other' ? findAspectForTopic(currentStick, selectedTopicId) : null,
  );

  function showToast(msg: string): void {
    toastMessage = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMessage = '';
      toastTimer = undefined;
    }, 3200);
  }

  function clearTimers(): void {
    if (transitionTimer !== undefined) clearTimeout(transitionTimer);
    transitionTimer = undefined;
  }

  function keoLabel(kind: KeoKind): string {
    if (kind === 'thanh') return 'Thánh keo (1 Sấp · 1 Ngửa)';
    if (kind === 'am') return 'Âm keo (2 Sấp)';
    return 'Tiếu keo (2 Ngửa)';
  }

  function keoShort(kind: KeoKind): string {
    if (kind === 'thanh') return 'Thánh keo';
    if (kind === 'am') return 'Âm keo';
    return 'Tiếu keo';
  }

  function handleBackStep(): void {
    if (stage === 'result' || stage === 'keo') {
      resetToDraw();
    } else if (page.state.homeDivination) {
      window.history.back();
    } else {
      void goto('/tu-tap');
    }
  }

  function refreshDay(): void {
    if (dayTimer) clearTimeout(dayTimer);
    const now = new Date();
    todayKey = formatVietnamDateKey(now);
    const tomorrow = Date.parse(todayKey + 'T00:00:00+07:00') + 86_400_000;
    dayTimer = setTimeout(refreshDay, Math.max(1, tomorrow - now.getTime()));
  }

  async function loadHistory(): Promise<void> {
    const entries = await loadDivinationHistory(principalId, 'quan-am');
    if (disposed) return;
    history = entries;
    historyPending = false;
  }

  onMount(() => {
    refreshDay();
    window.addEventListener('focus', refreshDay);
    void loadHistory();
    document.dispatchEvent(
      new CustomEvent('qts:subpage-header', {
        detail: { active: true, onBack: handleBackStep, backLabel: page.state.homeDivination ? copy.backToHome : copy.backToPractice },
      }),
    );
  });

  onDestroy(() => {
    disposed = true;
    clearTimers();
    if (dayTimer) clearTimeout(dayTimer);
    if (toastTimer) clearTimeout(toastTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', refreshDay);
      document.dispatchEvent(new CustomEvent('qts:subpage-header', { detail: { active: false } }));
    }
  });

  function startBambooShake(): void {
    refreshDay();
    if (stage !== 'draw' || bambooShaking || stickLanded || historyPending || !dailyTopicGuard.allowed) return;
    clearTimers();
    drawDateKey = todayKey;
    referenceOnly = false;
    savedCurrentDraw = false;
    keoTosses = [];
    const chosenId = drawQuanAmStickId();
    drawnStickId = chosenId;
    currentStick = getQuanAmStick(chosenId);
    bambooShaking = true;
  }

  async function enterKeo(): Promise<void> {
    transitionTimer = undefined;
    stage = 'keo';
    await tick();
    if (!disposed && stage === 'keo') coinAction?.focus({ preventScroll: true });
  }

  function finishBambooShake(reducedMotion: boolean): void {
    if (stage !== 'draw' || !bambooShaking) return;
    bambooShaking = false;
    stickLanded = true;
    transitionTimer = setTimeout(enterKeo, reducedMotion ? 240 : 570);
  }

  function handleKeoToss(): void {
    if (stage !== 'keo' || coinTossing || keoTosses.length >= 3) return;
    const nextRound = (keoTosses.length + 1) as 1 | 2 | 3;
    pendingToss = tossKeoCoins(nextRound);
  }

  function finishKeoToss(reducedMotion: boolean): void {
    if (stage !== 'keo' || !pendingToss) return;
    const toss = pendingToss;
    pendingToss = null;
    lastCoins = [toss.coin1, toss.coin2];
    keoTosses = [...keoTosses, toss];
    if (keoEval.approved) {
      transitionTimer = setTimeout(() => {
        transitionTimer = undefined;
        approveAndShowResult(false);
      }, reducedMotion ? 120 : 700);
    }
  }

  function approveAndShowResult(asReference: boolean): void {
    if (!currentStick || stage !== 'keo' || !(asReference ? keoEval.needsRedraw : keoEval.approved)) return;
    referenceOnly = asReference;
    stage = 'result';
    if (!referenceOnly) void persistDraw(currentStick, false);
  }

  async function persistDraw(stick: QuanAmStick, manualToast: boolean): Promise<void> {
    if (referenceOnly || historyPending) return;
    if (savedCurrentDraw) {
      if (manualToast) showToast(copy.savedHistoryToast);
      return;
    }
    if (!keoEval.approved) return;
    const entry: DivinationHistoryEntry = {
      id: `qa-${Date.now()}-${stick.id}`,
      kind: 'quan-am',
      dateKey: drawDateKey,
      createdAt: new Date().toISOString(),
      resultNumber: stick.id,
      title: `Quẻ số ${stick.id} — ${stick.title}`,
      topicId: selectedTopicId,
      topicLabel: effectiveTopicLabel || copy.noTopic,
      summary: `${stick.level} · ${stick.comment || stick.omen || stick.story}`,
    };
    historyPending = true;
    const res = await saveDivinationHistoryEntry(principalId, entry);
    if (disposed) return;
    historyPending = false;
    if (res.ok) {
      history = res.entries;
      if (stage === 'result' && currentStick?.id === stick.id) savedCurrentDraw = true;
      if (manualToast) showToast(copy.savedHistoryToast);
    } else {
      showToast(copy.storageErrorToast);
    }
  }

  function resetToDraw(): void {
    clearTimers();
    bambooShaking = false;
    stickLanded = false;
    pendingToss = null;
    lastCoins = ['sap', 'ngua'];
    drawnStickId = null;
    currentStick = null;
    keoTosses = [];
    savedCurrentDraw = false;
    referenceOnly = false;
    drawDateKey = '';
    stage = 'draw';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function openHistoryEntry(entry: DivinationHistoryEntry): void {
    const stick = getQuanAmStick(entry.resultNumber);
    if (!stick || historyPending) return;
    resetToDraw();
    currentStick = stick;
    drawnStickId = stick.id;
    selectedTopicId = entry.topicId ?? '';
    customTopicNote = entry.topicId === 'other' ? entry.topicLabel : '';
    savedCurrentDraw = true;
    stage = 'result';
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleClearHistory(): Promise<void> {
    if (historyPending) return;
    historyPending = true;
    const res = await clearDivinationHistory(principalId, 'quan-am');
    if (disposed) return;
    historyPending = false;
    if (res.ok) history = res.entries;
    showToast(res.ok ? copy.clearedHistoryToast : copy.storageErrorToast);
  }

  function levelBadgeTone(level: string): 'upper' | 'mid' | 'low' {
    if (/Thượng/i.test(level)) return 'upper';
    if (/Trung/i.test(level)) return 'mid';
    return 'low';
  }
</script>

<div class="div-page" data-practice-route-back>
  <div class="div-subbar">
    <div class="div-subbar-title-wrap">
      <span class="div-subbar-eyebrow">{copy.groupTitle}</span>
      <h1 class="div-subbar-title">{copy.hubQuanAmTitle}</h1>
    </div>
    <button type="button" class="div-guide-btn" onclick={() => (guideOpen = true)}>
      <span aria-hidden="true">?</span> {copy.guideBtn}
    </button>
  </div>

  {#if stage === 'draw'}
    <div class="div-card div-card--padded qa-stage">
      <details class="qa-prayer-box" bind:open={prayerOpen}>
        <summary class="qa-prayer-summary">
          <span>Lời khấn nguyện &amp; Quy tắc định tâm</span>
          <span class="qa-prayer-toggle">{prayerOpen ? 'Thu gọn' : 'Mở xem'}</span>
        </summary>
        <div class="qa-prayer-content">
          <p class="qa-chant">
            <ItalicParensText text={QUAN_AM_PRAYER_CHANT} />
          </p>
          <p class="qa-rule-callout">
            <ItalicParensText text={QUAN_AM_DAILY_VOW_NOTE} />
          </p>
        </div>
      </details>

      <div class="qa-topic-field">
        <label for="qaTopicSelect" class="qa-field-label">Chọn 1 việc cần thỉnh ý hôm nay</label>
        <select id="qaTopicSelect" class="qa-select" disabled={bambooShaking || stickLanded} bind:value={selectedTopicId}>
          <option value="">{copy.noTopicChoice}</option>
          {#each QUAN_AM_TOPICS as topic (topic.id)}
            <option value={topic.id}>{topic.label}</option>
          {/each}
        </select>

        {#if selectedTopicId === 'other'}
          <label for="qaCustomNote" class="qa-field-label qa-field-label--sub">
            Ghi chú việc cần cầu <span class="qa-opt">(không bắt buộc)</span>
          </label>
          <textarea
            id="qaCustomNote"
            class="qa-textarea"
            rows="2"
            bind:value={customTopicNote}
            disabled={bambooShaking || stickLanded}
            placeholder="Ví dụ: Xin hỏi thuận duyên cho việc học tập, công việc mới…"
          ></textarea>
        {/if}
      </div>

      {#if !dailyTopicGuard.allowed && dailyTopicGuard.existingEntry}
        <div class="div-warning-box qa-daily-guard" role="status">
          <p class="qa-daily-guard-text">
            Hôm nay bạn đã xin quẻ cho việc <strong>“{effectiveTopicLabel}”</strong>
            (<em>Quẻ số {dailyTopicGuard.existingEntry.resultNumber}</em>). Mỗi ngày xin 1 việc gì chỉ
            nên gieo đúng 1 lần để giữ tâm chí thành thanh tịnh.
          </p>
          <button
            type="button"
            class="div-btn div-btn--soft qa-guard-view-btn"
            onclick={() => dailyTopicGuard.existingEntry && openHistoryEntry(dailyTopicGuard.existingEntry)}
          >
            Xem lại quẻ đã xin hôm nay →
          </button>
        </div>
      {/if}

      <!-- Sân khấu Ống tre xăm động -->
      <div class="qa-altar">
        <div class="qa-bamboo-stage">
          <QuanAmArtwork
            scene={{ kind: 'tube', number: drawnStickId, shaking: bambooShaking, landed: stickLanded }}
            onMotionEnd={finishBambooShake}
          />

          <p class="qa-stage-caption" aria-live="polite">
            {#if bambooShaking}
              Đang thành tâm lắc ống tre…
            {:else if stickLanded && drawnStickId !== null}
              {copy.oracleStickLanded(drawnStickId)}
            {:else}
              Sau khi niệm danh hiệu Đức Quán Thế Âm Bồ Tát <em>(3 lần)</em>, bấm nút dưới để lắc xăm.
            {/if}
          </p>
        </div>

        <button
          type="button"
          class="div-btn div-btn--primary div-btn--full"
          disabled={bambooShaking || stickLanded || historyPending || !dailyTopicGuard.allowed}
          onclick={startBambooShake}
        >
          {bambooShaking
            ? 'Đang lắc ống tre…'
            : dailyTopicGuard.allowed
              ? 'Thành tâm lắc ống tre'
              : 'Hôm nay đã gieo cho việc này'}
        </button>
      </div>
    </div>
  {:else if stage === 'keo'}
    <div class="div-card div-card--padded qa-stage">
      <div class="qa-keo-header">
        <span class="qa-keo-badge">BƯỚC 2 · XIN KEO ÂM DƯƠNG XÁC CHỨNG</span>
        <h2 class="qa-keo-title">THẺ XĂM SỐ {drawnStickId}</h2>
        <p class="qa-keo-sub">
          <ItalicParensText
            text="Tung 2 đồng tiền cổ tối đa (3 lần); cần ít nhất (1 lần Thánh keo) — tức 1 mặt Sấp (Âm) và 1 mặt Ngửa (Dương) — để Bồ Tát chuẩn y quẻ này."
          />
        </p>
      </div>

      <!-- 3 ô tiến trình -->
      <div class="qa-round-pills" aria-label="Kết quả 3 lần xin keo">
        {#each [1, 2, 3] as idx (idx)}
          {@const toss = keoTosses[idx - 1]}
          <div
            class="qa-round-pill"
            class:qa-round-pill--thanh={toss?.kind === 'thanh'}
            class:qa-round-pill--other={toss && toss.kind !== 'thanh'}
          >
            <span class="qa-round-label">Lần {idx}</span>
            <strong class="qa-round-val">
              {toss ? keoShort(toss.kind) : '—'}
            </strong>
          </div>
        {/each}
      </div>

      <!-- 2 đồng tiền cổ -->
      <div class="qa-coin-mat">
        <QuanAmArtwork
          scene={{
            kind: 'coins',
            faces: lastCoins,
            landing: pendingToss ? [pendingToss.coin1, pendingToss.coin2] : undefined,
          }}
          onMotionEnd={finishKeoToss}
        />
        <div class="qa-coin-labels" class:qa-coin-labels--moving={coinTossing}>
          {#each lastCoins as face, index (index)}
            <span>{face === 'ngua' ? copy.coinFaceUp : copy.coinFaceDown}</span>
          {/each}
        </div>

        <p class="qa-keo-status" aria-live="polite">
          {#if coinTossing}
            Đang tung 2 đồng tiền cổ…
          {:else if keoEval.needsRedraw}
            Cả 3 lần đều chưa có <strong>Thánh keo</strong> (0/3). Theo lệ xin xăm, hãy tĩnh tâm bấm
            <strong>Gieo lại</strong> từ đầu.
          {:else if keoEval.approved}
            Đã ứng <strong>Thánh keo</strong> — đang mở lời giải quẻ…
          {:else if keoTosses.length > 0}
            Kết quả Lần {keoTosses.length}: <strong>{keoLabel(keoTosses[keoTosses.length - 1].kind)}</strong>
          {:else}
            Bấm nút dưới để tung 2 đồng tiền (Lần 1 / 3).
          {/if}
        </p>
      </div>

      <div class="qa-keo-actions">
        {#if keoEval.needsRedraw}
          <button type="button" class="div-btn div-btn--primary div-btn--full" onclick={resetToDraw}>
            Gieo lại
          </button>
          <button type="button" class="qa-ref-link" onclick={() => approveAndShowResult(true)}>
            Xem nội dung Quẻ số {drawnStickId} để tham khảo (không lưu vào lượt hôm nay)
          </button>
        {:else}
          <button
            type="button"
            class="div-btn div-btn--primary div-btn--full"
            disabled={coinTossing || keoEval.approved}
            bind:this={coinAction}
            onclick={handleKeoToss}
          >
            {coinTossing
              ? 'Đang tung đồng tiền…'
              : `Tung đồng tiền (Lần ${Math.min(3, keoTosses.length + 1)} / 3)`}
          </button>
        {/if}
      </div>
    </div>
  {:else if currentStick}
    {@const tone = levelBadgeTone(currentStick.level)}
    <article class="div-card qa-result-card">
      <!-- Đầu phiếu quẻ -->
      <header class="qa-res-hero">
        <span class="qa-level-badge qa-level-badge--{tone}">{currentStick.level}</span>
        <h2 class="qa-res-title">QUẺ SỐ {currentStick.id} — {currentStick.title}</h2>
        {#if referenceOnly}
          <p class="qa-res-topic-meta">{copy.referenceOnly}</p>
        {/if}
        {#if effectiveTopicLabel}
          <p class="qa-res-topic-meta">Việc thỉnh ý: <strong>{effectiveTopicLabel}</strong></p>
        {/if}

        <div class="qa-poem-block">
          {#if !currentStick.poem.length}<p class="qa-phonetic-line">{copy.phoneticOnly}</p>{/if}
          {#each (currentStick.poem.length ? currentStick.poem : currentStick.poemPhonetic) as line, i (i)}
            <p class="qa-poem-line">{line}</p>
          {/each}
        </div>

        {#if currentStick.poem.length}
          <details class="qa-phonetic-details">
            <summary>Xem nguyên văn phiên âm Hán – Việt</summary>
            <div class="qa-phonetic-lines">
              {#each currentStick.poemPhonetic as line, i (i)}
                <p class="qa-phonetic-line">{line}</p>
              {/each}
            </div>
          </details>
        {/if}
      </header>

      <!-- Luận giải riêng cho việc đã chọn -->
      {#if matchedAspect}
        <div class="qa-matched-topic">
          <h3 class="div-section-accent-heading">Đối chiếu việc bạn đã khấn ({effectiveTopicLabel})</h3>
          <p class="qa-matched-value">
            <strong>{matchedAspect.label}:</strong> {matchedAspect.value}
          </p>
        </div>
      {/if}

      <div class="qa-res-sections">
        <section class="qa-res-sec">
          <h3 class="div-section-accent-heading">Phân tích mở rộng từ thơ xăm &amp; Lời bàn</h3>
          {#if currentStick.comment}
            <p class="qa-prose qa-prose--highlight">
              <strong>Lời bàn cổ nhân:</strong> {currentStick.comment}
            </p>
          {/if}
          {#each currentStick.analysis.split('\n\n') as paragraph, index (index)}
            <p class="qa-prose">{paragraph}</p>
          {/each}
        </section>

        <section class="qa-res-sec qa-res-sec--divider">
          <details class="qa-story-details">
            <summary>Điển tích cổ &amp; Điềm quẻ ứng ({currentStick.story})</summary>
            <div class="qa-story-body">
              <p class="qa-prose"><strong>Tích cổ:</strong> {currentStick.story}</p>
              {#if currentStick.omen}
                <p class="qa-prose"><strong>Điềm quẻ ứng:</strong> {currentStick.omen}</p>
              {/if}
            </div>
          </details>
        </section>

        <section class="qa-res-sec qa-res-sec--divider">
          <h3 class="div-section-accent-heading">Chi tiết từng phương diện</h3>
          <div class="qa-aspects-table">
            {#each currentStick.aspects as aspect, idx (idx)}
              {@const isMatch = matchedAspect?.label === aspect.label}
              <div class="qa-aspect-row" class:qa-aspect-row--matched={isMatch}>
                <span class="qa-aspect-key">{isMatch ? `★ ${aspect.label}` : aspect.label}</span>
                <span class="qa-aspect-val">{aspect.value}</span>
              </div>
            {/each}
          </div>
        </section>

        <section class="qa-res-sec qa-res-sec--divider">
          <h3 class="div-section-accent-heading">Hướng tu tâm &amp; chuyển hóa theo quẻ</h3>
          {#each currentStick.cultivationAdvice.split('\n\n') as paragraph, index (index)}
            <p class="qa-prose">{paragraph}</p>
          {/each}
        </section>
      </div>

      <footer class="qa-res-footer">
        {#if !referenceOnly}
          <button
            type="button"
            class="div-btn div-btn--soft"
            disabled={historyPending}
            onclick={() => currentStick && persistDraw(currentStick, true)}
          >
            {copy.saveHistoryBtn}
          </button>
        {/if}
        <button type="button" class="div-btn div-btn--primary" onclick={resetToDraw}>
          Gieo quẻ khác
        </button>
      </footer>
    </article>
  {/if}

  {#if toastMessage}
    <div class="div-toast" role="status">{toastMessage}</div>
  {/if}

  <DivinationHistoryPanel
    title="Lịch sử Quan Âm Linh Xăm (trên máy)"
    entries={history}
    onSelectEntry={openHistoryEntry}
    onClear={handleClearHistory}
  />

  <DivinationGuideDialog open={guideOpen} kind="quan-am" onClose={() => (guideOpen = false)} />
</div>

<style>
  .qa-stage {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .qa-prayer-box {
    border-radius: var(--radius-control);
    border: 1px solid color-mix(in srgb, var(--gold) 42%, var(--border2));
    background: var(--gold-light);
    overflow: hidden;
  }

  .qa-prayer-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 44px;
    padding: 8px 14px;
    cursor: pointer;
    list-style: none;
    font-size: 13.5px;
    font-weight: 700;
    color: var(--brown-dark);
  }
  .qa-prayer-summary::-webkit-details-marker {
    display: none;
  }
  .qa-prayer-toggle {
    font-size: 12px;
    font-weight: 600;
    color: var(--brown);
  }
  .qa-prayer-content {
    padding: 0 14px 12px;
    border-top: 1px solid color-mix(in srgb, var(--gold) 25%, var(--border2));
  }
  .qa-chant {
    margin: 10px 0 8px;
    font-family: var(--font-reader);
    font-size: 14.5px;
    line-height: 1.65;
    text-align: center;
    color: var(--brown-dark);
    font-weight: 600;
  }
  .qa-rule-callout {
    margin: 0;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--card) 75%, transparent);
    border: 1px solid color-mix(in srgb, var(--gold) 35%, var(--border2));
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--text2);
    text-align: justify;
  }

  .qa-topic-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .qa-field-label {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
  }
  .qa-field-label--sub {
    margin-top: 6px;
  }
  .qa-opt {
    font-weight: 400;
    color: var(--muted);
  }
  .qa-select,
  .qa-textarea {
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border-radius: var(--radius-control);
    border: 1px solid var(--border);
    background: var(--bg2);
    color: var(--text);
    font-family: var(--font-app);
    font-size: var(--font-size-input);
    box-sizing: border-box;
  }
  .qa-textarea {
    resize: vertical;
    line-height: 1.5;
  }

  .qa-daily-guard {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .qa-daily-guard-text {
    margin: 0;
  }
  .qa-guard-view-btn {
    align-self: flex-start;
    font-size: 13px;
    min-height: 44px;
  }

  .qa-altar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 16px 14px;
    border-radius: var(--radius-card);
    border: 1px solid var(--border2);
    background: radial-gradient(circle at 50% 25%, var(--gold-light), var(--bg2));
  }
  .qa-bamboo-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .qa-stage-caption {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--text2);
    text-align: center;
  }

  .qa-keo-header {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .qa-keo-badge {
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--gold-light);
    border: 1px solid color-mix(in srgb, var(--gold) 50%, var(--border));
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--brown-dark);
  }
  .qa-keo-title {
    margin: 2px 0 0;
    font-size: 18px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text);
  }
  .qa-keo-sub {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--text2);
    text-align: center;
    max-width: 34rem;
  }

  .qa-round-pills {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .qa-round-pill {
    padding: 8px 6px;
    border-radius: var(--radius-control);
    border: 1px solid var(--border2);
    background: var(--bg2);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    text-align: center;
  }
  .qa-round-pill--thanh {
    background: color-mix(in srgb, var(--green-ok) 14%, var(--card));
    border-color: color-mix(in srgb, var(--green-ok) 55%, var(--border));
  }
  .qa-round-pill--other {
    background: var(--gold-light);
    border-color: color-mix(in srgb, var(--gold) 45%, var(--border));
  }
  .qa-round-label {
    font-size: 11px;
    color: var(--muted);
  }
  .qa-round-val {
    font-size: 12.5px;
    color: var(--text);
  }

  .qa-coin-mat {
    padding: 18px 14px;
    border-radius: var(--radius-card);
    border: 1px solid var(--border2);
    background: var(--bg2);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }
  .qa-coin-labels {
    box-sizing: border-box;
    width: min(100%, 440px);
    padding-inline: 9%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    text-align: center;
    font-size: var(--font-size-label);
    color: var(--muted);
    font-weight: 600;
  }

  .qa-coin-labels--moving {
    visibility: hidden;
  }

  .qa-keo-status {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.55;
    text-align: center;
    color: var(--text);
  }
  .qa-keo-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .qa-ref-link {
    min-height: 44px;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--brown);
    font-family: var(--font-app);
    font-size: 13px;
    font-weight: 600;
    text-decoration: underline;
    cursor: pointer;
    text-align: center;
  }

  /* Result Card */
  .qa-res-hero {
    padding: 20px 18px 18px;
    border-bottom: 1px solid var(--border2);
    background: linear-gradient(180deg, var(--gold-light), var(--card));
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 10px;
  }
  .qa-level-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 14px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .qa-level-badge--upper {
    background: color-mix(in srgb, var(--green-ok) 18%, var(--card));
    color: var(--green-ok);
    border: 1px solid color-mix(in srgb, var(--green-ok) 45%, var(--border));
  }
  .qa-level-badge--mid {
    background: var(--gold-light);
    color: var(--brown-dark);
    border: 1px solid color-mix(in srgb, var(--gold) 55%, var(--border));
  }
  .qa-level-badge--low {
    background: color-mix(in srgb, var(--danger-text) 14%, var(--card));
    color: var(--danger-text);
    border: 1px solid color-mix(in srgb, var(--danger-text) 45%, var(--border));
  }
  .qa-res-title {
    margin: 0;
    font-size: clamp(17px, 4.6vw, 21px);
    font-weight: 800;
    text-transform: uppercase;
    color: var(--text);
    text-wrap: balance;
    line-height: 1.3;
  }
  .qa-res-topic-meta {
    margin: 0;
    font-size: 12.5px;
    color: var(--muted);
  }
  .qa-poem-block {
    width: 100%;
    max-width: 28rem;
    margin-top: 4px;
    padding: 12px 6px;
    border-top: 1px solid color-mix(in srgb, var(--gold) 55%, var(--border));
    border-bottom: 1px solid color-mix(in srgb, var(--gold) 55%, var(--border));
  }
  .qa-poem-line {
    margin: 0;
    font-family: var(--font-reader);
    font-size: 16px;
    line-height: 1.7;
    color: var(--text);
    text-align: center;
    font-weight: 600;
  }
  .qa-phonetic-details {
    font-size: 12.5px;
    color: var(--muted);
  }
  .qa-phonetic-details summary {
    cursor: pointer;
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    font-weight: 600;
  }
  .qa-phonetic-lines {
    margin-top: 6px;
  }
  .qa-phonetic-line {
    margin: 0;
    font-family: var(--font-reader);
    font-size: 13.5px;
    line-height: 1.6;
    font-style: italic;
    text-align: center;
    color: var(--text2);
  }

  .qa-matched-topic {
    padding: 14px 18px;
    border-bottom: 1px solid var(--border2);
    border-left: 4px solid var(--gold);
    background: color-mix(in srgb, var(--gold-light) 78%, var(--card));
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .qa-matched-value {
    margin: 0;
    font-family: var(--font-reader);
    font-size: 15px;
    line-height: 1.65;
    color: var(--text);
    text-align: justify;
  }

  .qa-res-sections {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .qa-res-sec {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .qa-res-sec--divider {
    padding-top: 14px;
    border-top: 1px solid var(--border2);
  }
  .qa-prose {
    margin: 0;
    font-family: var(--font-reader);
    font-size: 15px;
    line-height: 1.72;
    color: var(--text);
    text-align: justify;
  }
  .qa-prose--highlight {
    color: var(--brown-dark);
  }
  .qa-story-details summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    font-size: 13.5px;
    font-weight: 700;
    color: var(--brown-dark);
    cursor: pointer;
  }
  .qa-story-body {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .qa-aspects-table {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border2);
    border-radius: var(--radius-control);
    overflow: hidden;
  }
  .qa-aspect-row {
    display: grid;
    grid-template-columns: minmax(108px, 34%) 1fr;
    gap: 10px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--border2);
    font-size: 13.5px;
    line-height: 1.5;
    background: var(--card);
  }
  .qa-aspect-row:last-child {
    border-bottom: none;
  }
  .qa-aspect-row--matched {
    background: var(--gold-light);
    font-weight: 600;
  }
  .qa-aspect-key {
    font-weight: 700;
    color: var(--brown-dark);
  }
  .qa-aspect-val {
    color: var(--text);
  }

  .qa-res-footer {
    padding: 14px 18px 18px;
    border-top: 1px solid var(--border2);
    background: var(--bg2);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  :global([data-theme='dark']) .qa-prayer-summary,
  :global([data-theme='dark']) .qa-chant,
  :global([data-theme='dark']) .qa-prose--highlight,
  :global([data-theme='dark']) .qa-story-details summary,
  :global([data-theme='dark']) .qa-aspect-key,
  :global([data-theme='dark']) .qa-keo-badge,
  :global([data-theme='dark']) .qa-level-badge--mid {
    color: var(--gold2);
  }

</style>
