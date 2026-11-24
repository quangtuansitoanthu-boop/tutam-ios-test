<script lang="ts">
  import type { RiteBlock } from '$lib/content/eight-precept-rite';
  let { blocks, language }: { blocks: readonly RiteBlock[]; language: 0 | 1 } = $props();

  function parts(text: string) {
    // Giữ cả dấu ngoặc trong phần in nghiêng, không dựng HTML từ nội dung.
    const result: { value: string; italic: boolean }[] = [];
    let value = '';
    let depth = 0;
    for (const character of text.replace(/\(C\)/g, '')) {
      if (character === '(' && depth === 0 && value) { result.push({ value, italic: false }); value = ''; }
      if (character === '(') depth += 1;
      value += character;
      if (character === ')' && depth > 0) {
        depth -= 1;
        if (depth === 0) { result.push({ value, italic: true }); value = ''; }
      }
    }
    if (value) result.push({ value, italic: depth > 0 });
    return result;
  }
</script>

{#snippet text(value: string)}
  {#each parts(value) as part, index (index)}{#if part.italic}<em>{part.value}</em>{:else}{part.value}{/if}{/each}
{/snippet}

<section class="eight-rite-content">
  {#each blocks as block (block.id)}
    {#if block.kind === 'title'}
      <h3>{@render text(block.text[language])}</h3>
    {:else if block.kind === 'verse'}
      <p class="verse">{#each block.lines as line, index (index)}<span>{@render text(line[language])}</span>{/each}</p>
    {:else if block.kind === 'instruction'}
      <p class="instruction"><em>{block.text[language].replace(/\(C\)/g, '')}</em></p>
    {:else}
      <p>{@render text(block.text[language])}</p>
    {/if}
  {/each}
</section>

<style>
  .eight-rite-content {
    display: grid;
    gap: calc(var(--space-page) * 0.85);
    font-family: var(--font-reader);
    line-height: 1.85;
    overflow-wrap: anywhere;
    color: var(--text);
  }

  h3 {
    margin: calc(var(--space-page) * 1.25) 0 0;
    padding-bottom: calc(var(--space-page) * 0.4);
    border-bottom: 1px solid var(--gold-muted);
    text-align: center;
    font-family: var(--font-app);
    font-size: 1.05em;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--brown-dark);
    text-transform: uppercase;
  }
  h3:first-child { margin-top: 0; }

  p {
    margin: 0;
    text-align: justify;
    line-height: 1.85;
  }

  .verse {
    text-align: center;
    margin: calc(var(--space-page) * 0.25) 0;
    padding: calc(var(--space-page) * 0.85) var(--space-page);
    background: var(--bg2);
    border: 1px solid var(--border2);
    border-radius: var(--radius-card);
    line-height: 2;
    color: var(--text);
  }
  .verse span {
    display: block;
    margin: 2px 0;
  }

  .instruction {
    text-align: center;
    margin: calc(var(--space-page) * 0.25) 0;
  }

  /* Huy hiệu hành lễ trang nghiêm cho các chỉ dẫn trong ngoặc */
  .eight-rite-content em {
    display: inline-block;
    padding: 2px 10px;
    margin: 2px 3px;
    font-style: italic;
    font-weight: 600;
    font-size: 0.9em;
    line-height: 1.5;
    color: var(--brown-dark);
    background: var(--gold-light);
    border: 1px solid var(--gold-muted);
    border-radius: var(--radius-sm);
    vertical-align: middle;
  }

  .instruction em {
    display: inline-block;
    padding: 4px 14px;
    font-style: italic;
    font-weight: 600;
    font-size: 0.92em;
    color: var(--brown);
    background: var(--gold-light);
    border: 1px solid var(--gold-muted);
    border-radius: var(--radius-control);
  }
</style>
