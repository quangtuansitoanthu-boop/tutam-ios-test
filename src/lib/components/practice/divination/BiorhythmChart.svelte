<script lang="ts">
  import {
    addBiorhythmDays,
    biorhythmValue,
    calculateBiorhythmAge,
    type BiorhythmCycle,
  } from '$lib/domain/practice/biorhythm';
  import type { BiorhythmCopy } from '$lib/i18n/biorhythm-ui';
  import { formatVietnamDate } from '$lib/utils/vietnam-date-format';

  interface Props {
    birth: string;
    today: string;
    selected: string;
    cycles: BiorhythmCycle[];
    copy: BiorhythmCopy;
    onSelect: (date: string) => void;
  }
  let { birth, today, selected, cycles, copy, onSelect }: Props = $props();
  let width = $state(620);
  const plotLeft = 48;
  const plotRight = 16;
  const plotWidth = $derived(Math.max(180, width - plotLeft - plotRight));
  const chartWidth = $derived(plotWidth + plotLeft + plotRight);
  const firstDay = $derived(addBiorhythmDays(today, -15));
  const birthAge = $derived(calculateBiorhythmAge(birth, today)?.totalDays ?? 0);
  const firstDaysAlive = $derived(birthAge - 15);
  const selectionIndex = $derived((calculateBiorhythmAge(firstDay, selected)?.totalDays ?? 15));
  const x = (index: number) => plotLeft + index * plotWidth / 30;
  const y = (value: number) => 18 + (100 - value) * 1.5;
  const lines = $derived(cycles.map(cycle => ({
    ...cycle,
    path: Array.from({ length: 31 }, (_, index) => {
      const age = firstDaysAlive + index;
      if (age < 0) return '';
      return `${age === Math.max(0, firstDaysAlive) ? 'M' : 'L'}${x(index).toFixed(2)} ${y(biorhythmValue(age, cycle.period)).toFixed(2)}`;
    }).filter(Boolean).join(' '),
  })));
  const crossings = $derived(cycles.flatMap(cycle => {
    const half = cycle.period / 2;
    const start = Math.max(0, Math.ceil(firstDaysAlive / half));
    const length = Math.max(0, Math.floor((firstDaysAlive + 30) / half) - start + 1);
    return Array.from({ length }, (_, index) => ({
      id: `${cycle.id}-${index}`,
      cycle: cycle.id,
      x: x((start + index) * half - firstDaysAlive),
    }));
  }));

  function select(event: PointerEvent): void {
    const bounds = event.currentTarget instanceof SVGSVGElement ? event.currentTarget.getBoundingClientRect() : null;
    if (!bounds) return;
    const index = Math.max(0, Math.min(30, Math.round(((event.clientX - bounds.left) * chartWidth / bounds.width - plotLeft) * 30 / plotWidth)));
    const date = addBiorhythmDays(firstDay, index);
    if (date && date >= birth) onSelect(date);
  }
</script>

<section class="bio-panel bio-chart">
  <h2>{copy.chart}</h2>
  <p class="bio-note">{copy.chartHint}</p>
  <div bind:clientWidth={width}>
    <svg
      viewBox={`0 0 ${chartWidth} 200`}
      role="img"
      aria-label={`${copy.chart} · ${formatVietnamDate(selected)}`}
      onpointerdown={select}
    >
      <rect x={plotLeft} y="18" width={plotWidth} height="75" fill="var(--gold)" opacity="0.06" />
      <rect x={plotLeft} y="93" width={plotWidth} height="75" fill="var(--brown)" opacity="0.04" />
      {#each [0, 25, 50, 75, 100] as value (value)}
        <line
          x1={plotLeft}
          x2={chartWidth - plotRight}
          y1={y(value)}
          y2={y(value)}
          stroke={value === 50 ? 'var(--brown)' : 'var(--border2)'}
        />
      {/each}
      {#each [0, 50, 100] as value (value)}
        <text x="1" y={y(value) + 4} fill="var(--text2)">{value}%</text>
      {/each}
      <line
        x1={x(selectionIndex)}
        x2={x(selectionIndex)}
        y1="18"
        y2="168"
        stroke="var(--gold)"
        stroke-width="2"
        stroke-dasharray="4 3"
      />
      {#each lines as cycle (cycle.id)}
        <path
          d={cycle.path}
          fill="none"
          stroke={`var(--wave-${cycle.id})`}
          stroke-width="2.6"
          stroke-dasharray={cycle.dash}
        />
        <circle
          cx={x(selectionIndex)}
          cy={y(cycle.value)}
          r="4"
          fill={`var(--wave-${cycle.id})`}
          stroke="var(--card)"
          stroke-width="1.5"
        />
      {/each}
      {#each crossings as crossing (crossing.id)}
        <circle
          cx={crossing.x}
          cy="93"
          r="2.5"
          fill="var(--card)"
          stroke={`var(--wave-${crossing.cycle})`}
          stroke-width="1.4"
        />
      {/each}
      <text x={plotLeft} y="193" fill="var(--text2)">{formatVietnamDate(firstDay)}</text>
      <text x={chartWidth - plotRight} y="193" text-anchor="end" fill="var(--text2)">
        {formatVietnamDate(addBiorhythmDays(today, 15))}
      </text>
    </svg>
  </div>
  <div class="bio-legend">
    {#each cycles as cycle (cycle.id)}
      <span>
        <i
          style:border-color={`var(--wave-${cycle.id})`}
          style:border-style={cycle.dash ? 'dashed' : 'solid'}
        ></i>{copy.cycleNames[cycle.id]}
      </span>
    {/each}
  </div>
</section>
