<script lang="ts">
  import {
    addBiorhythmDays,
    biorhythmTransitions,
    calculateBiorhythm,
    type BiorhythmSnapshot,
  } from '$lib/domain/practice/biorhythm';
  import type { BiorhythmCopy } from '$lib/i18n/biorhythm-ui';
  import { formatVietnamDate } from '$lib/utils/vietnam-date-format';
  import BiorhythmChart from './BiorhythmChart.svelte';

  interface Props {
    birth: string;
    today: string;
    snapshot: BiorhythmSnapshot;
    copy: BiorhythmCopy;
    onSelect: (date: string) => void;
  }
  let { birth, today, snapshot, copy, onSelect }: Props = $props();
  let expanded = $state(false);
  const cycles = $derived(snapshot.cycles.slice(0, expanded ? 6 : 3));
  const near = $derived(snapshot.cycles.slice(0, 3).some(cycle => Math.abs(cycle.value - 50) <= 5));
  const summary = $derived(
    near ? copy.transitionSummary
      : snapshot.harmony >= 65 ? copy.highSummary
        : snapshot.harmony < 45 ? copy.lowSummary
          : copy.middleSummary,
  );
  const week = $derived(
    Array.from({ length: 7 }, (_, index) => calculateBiorhythm(birth, addBiorhythmDays(today, index)))
      .filter((day): day is BiorhythmSnapshot => day !== null),
  );
  const transitions = $derived(biorhythmTransitions(birth, snapshot.date));
  const composites = $derived([
    { id: 'action', label: copy.action, value: snapshot.action },
    { id: 'study', label: copy.study, value: snapshot.study },
    { id: 'wisdom', label: copy.wisdom, value: snapshot.wisdom },
  ]);
  const adviceItems = $derived([
    { id: 'body', title: copy.body, text: copy.bodyAdvice },
    { id: 'mind', title: copy.mind, text: copy.mindAdvice },
    { id: 'insight', title: copy.insight, text: copy.insightAdvice },
  ]);
</script>

<section class="bio-hero">
  <div class="bio-hero-top">
    <div class="bio-harmony" style:--bio-score={`${Math.round(snapshot.harmony)}%`}>
      <div>
        <strong>{Math.round(snapshot.harmony)}%</strong>
        <span>{copy.average}</span>
      </div>
    </div>
    <div class="bio-overview">
      <span>{snapshot.date === today ? copy.overview : formatVietnamDate(snapshot.date)}</span>
      <strong>{summary}</strong>
    </div>
  </div>
  <div class="bio-composites">
    {#each composites as metric (metric.id)}
      <div>
        <span>{metric.label}</span>
        <strong>{Math.round(metric.value)}%</strong>
      </div>
    {/each}
  </div>
  <div class="bio-day-stepper">
    <button
      type="button"
      aria-label={copy.before}
      disabled={snapshot.date <= birth || snapshot.date <= addBiorhythmDays(today, -15)}
      onclick={() => onSelect(addBiorhythmDays(snapshot.date, -1))}
    >
      ‹
    </button>
    <button type="button" class="bio-day-center" onclick={() => onSelect(today)} aria-label={copy.returnToday}>
      <strong>{formatVietnamDate(snapshot.date)}</strong>
      <span>{snapshot.date === today ? copy.today : copy.returnToday}</span>
    </button>
    <button
      type="button"
      aria-label={copy.after}
      disabled={snapshot.date >= addBiorhythmDays(today, 15)}
      onclick={() => onSelect(addBiorhythmDays(snapshot.date, 1))}
    >
      ›
    </button>
  </div>
</section>

<div class="bio-section-header">
  <h2>{copy.cycles}</h2>
  <button class="bio-chip" type="button" aria-pressed={expanded} onclick={() => expanded = !expanded}>
    {expanded ? copy.collapse : copy.expand}
  </button>
</div>
<div class="bio-metrics">
  {#each cycles as cycle (cycle.id)}
    <article class="bio-panel bio-metric" style:--bio-cycle-color={`var(--wave-${cycle.id})`}>
      <div class="bio-metric-title">
        <h3>
          <i></i>{copy.cycleNames[cycle.id]}
          <small><em>({copy.period(cycle.period)})</em></small>
        </h3>
        <strong>{Math.round(cycle.value)}%</strong>
      </div>
      <div
        class="bio-track"
        role="meter"
        aria-label={copy.cycleNames[cycle.id]}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(cycle.value)}
      >
        <span style:width={`${cycle.value}%`}></span>
        <i></i>
      </div>
      <div class="bio-metric-meta">
        <span>{Math.abs(cycle.value - 50) <= 5 ? copy.near : cycle.value > 50 ? copy.above : copy.below}</span>
        <span>{cycle.rising ? copy.rising : copy.falling}</span>
      </div>
      <div class="bio-cycle-details">
        <span>{copy.cycleDay(cycle.day, cycle.period, cycle.round)}</span>
        <span>{copy.peak} · {copy.remaining(cycle.daysToPeak)}</span>
        <span>{copy.crossing} · {copy.remaining(cycle.daysToTransition)}</span>
      </div>
    </article>
  {/each}
</div>

<BiorhythmChart {birth} {today} selected={snapshot.date} {cycles} {copy} {onSelect} />

<section class="bio-panel">
  <h2>{copy.nextWeek}</h2>
  <p class="bio-note">{copy.weekHint}</p>
  <div class="bio-table-wrap">
    <table class="bio-table">
      <thead>
        <tr>
          <th>{copy.date}</th>
          <th>{copy.physicalShort}</th>
          <th>{copy.emotionalShort}</th>
          <th>{copy.intellectualShort}</th>
          <th>{copy.averageShort}</th>
          <th>{copy.note}</th>
        </tr>
      </thead>
      <tbody>
        {#each week as day (day.date)}
          <tr class:bio-selected={day.date === snapshot.date}>
            <td>
              <button type="button" aria-pressed={day.date === snapshot.date} onclick={() => onSelect(day.date)}>
                {day.date.slice(8)}/{day.date.slice(5, 7)}
              </button>
            </td>
            {#each day.cycles.slice(0, 3) as cycle (cycle.id)}
              <td>{Math.round(cycle.value)}%</td>
            {/each}
            <td><strong>{Math.round(day.harmony)}%</strong></td>
            <td>{day.cycles.slice(0, 3).some(cycle => Math.abs(cycle.value - 50) <= 5) ? copy.nearPhase : '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<section class="bio-panel">
  <h2>{copy.advice}</h2>
  <div class="bio-advice-grid">
    {#each adviceItems as advice (advice.id)}
      <article>
        <h3>{advice.title}</h3>
        <p>{advice.text}</p>
      </article>
    {/each}
  </div>
  <h3 class="bio-upcoming-title">{copy.upcoming}</h3>
  <div class="bio-crossings">
    {#each transitions as transition (transition.date)}
      <span>{formatVietnamDate(transition.date)} · {transition.cycles.map(id => copy.cycleNames[id]).join(', ')}</span>
    {/each}
  </div>
  <p class="bio-note">{copy.modelNotice}</p>
</section>
