<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Leaf, Search, ShoppingCart, Soup } from '@lucide/svelte';
  import { downloadVeganWeek, latestVeganWeek, needsVeganWeekUpdate, readVeganWeek } from '$lib/browser/vegan-week';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { solarToLunar } from '$lib/components/lunar/lunar-calendar';
  import { ingredientMeasureHint, matchesVeganRegion, quantityText, recipeStep, sameVeganDish, shoppingItems, veganMealPlan, ROTATING_VEGAN_VERSION, VEGAN_GROUPS, VEGAN_MEAL_REGIONS, VEGAN_REGIONS, vietnamWeek, weekDate, type OfflineRecipe, type VeganMealRegion, type VeganWeek } from '$lib/contracts/vegan-week';
  import { veganUi } from '$lib/i18n/vegan-ui';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const locale = getLocaleContext();
  const c = $derived(veganUi[locale.current === 'en' ? 'en' : 'vi']);
  const lang = $derived(locale.current === 'en' ? 'en' : 'vi');
  const settingsKey = 'tutam:vegan-settings:v1';
  const minRecipeFontScale = 90;
  const maxRecipeFontScale = 150;
  const dayIndices = [0, 1, 2, 3, 4, 5, 6];
  const initialCalendar = vietnamWeek();
  let calendar = $state(initialCalendar);
  let menu = $state.raw<VeganWeek | null>(null);
  let tab = $state(0);
  let day = $state(initialCalendar.day);
  let servings = $state(2);
  let recipeFontScale = $state(100);
  let wholeWeek = $state(false);
  let checks = $state<Record<string, Record<string, string>>>({});
  let query = $state('');
  let group = $state('');
  let region = $state('');
  let mealRegion = $state<VeganMealRegion>('');
  let recipe = $state.raw<OfflineRecipe | null>(null);
  let failed = $state(false);
  let mounted = false;
  let active = false;
  let timer: ReturnType<typeof setTimeout>;
  const recipeId = $props.id();

  const mealPlan = $derived(menu ? veganMealPlan(menu, mealRegion) : []);
  const todaysIngredients = $derived(ingredientsFor([calendar.day]));
  const shopping = $derived(ingredientsFor(wholeWeek ? dayIndices : [day]));
  const scope = $derived(checklistKey(wholeWeek ? 'week' : day));
  const todayDate = $derived(weekDate(calendar.today, 0));
  const lunar = $derived(solarToLunar(todayDate.getUTCDate(), todayDate.getUTCMonth() + 1, todayDate.getUTCFullYear()));
  const searchIndex = $derived((menu?.recipes ?? []).map(item => ({
    item, terms: [item.name, ...item.ingredients.map(ingredient => ingredient.name)].map(searchText),
  })));
  const searchQuery = $derived(searchText(query.trim()));
  const filtered = $derived(searchIndex.filter(({ item, terms }) =>
    (!group || item.group === group) && (menu?.version === 1 || matchesVeganRegion(item.region, region))
    && terms.some(term => term.includes(searchQuery))
  ).map(({ item }) => item));

  function searchText(text: string) {
    return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gu, 'd');
  }

  function ingredientsFor(indices: number[]) {
    return shoppingItems(indices.flatMap(index => mealPlan[index]?.flat() ?? []), servings);
  }

  function save() {
    try {
      localStorage.setItem(settingsKey, JSON.stringify({ servings, checks, recipeFontScale, mealRegion }));
    } catch {
      // Settings remain available for this session.
    }
  }

  function amountKey(item: typeof shopping[number]) {
    return JSON.stringify([item.quantity, item.unit]);
  }

  function checklistKey(index: number | 'week') {
    if (!menu) return '';
    const regional = menu.version === ROTATING_VEGAN_VERSION && mealRegion;
    return menu.week + ':' + index + (regional ? ':' + regional : '');
  }

  function reconcileChecks() {
    if (!menu) return;
    for (const index of [...dayIndices, 'week' as const]) {
      const key = checklistKey(index);
      if (!checks[key]) continue;
      const items = ingredientsFor(index === 'week' ? dayIndices : [index]);
      const entries = new Map(items.map(item => [item.key, amountKey(item)]));
      for (const [itemKey, amount] of Object.entries(checks[key])) {
        if (entries.get(itemKey) !== amount) delete checks[key][itemKey];
      }
    }
    for (const key of Object.keys(checks)) {
      if (!key.startsWith(menu.week + ':')) delete checks[key];
    }
  }

  function openRecipe(event: MouseEvent, item: OfflineRecipe) {
    (event.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
    recipe = item;
  }

  function changeServings(delta: number) {
    servings = Math.min(12, Math.max(1, servings + delta));
    reconcileChecks();
    save();
  }

  function changeRecipeFont(delta: number) {
    recipeFontScale = Math.min(maxRecipeFontScale, Math.max(minRecipeFontScale, recipeFontScale + delta));
    save();
  }

  function toggle(item: typeof shopping[number], checked: boolean) {
    checks[scope] ??= {};
    if (checked) checks[scope][item.key] = amountKey(item);
    else delete checks[scope][item.key];
    save();
  }

  function showWeek(current: VeganWeek) {
    menu = current;
    const open = recipe;
    if (open) recipe = current.recipes.find(item => sameVeganDish(item, open)) ?? open;
  }

  async function refresh() {
    if (active) return;
    active = true;
    const now = new Date();
    const next = vietnamWeek(now);
    if (next.today !== calendar.today) day = next.day;
    calendar = next;
    const saved = readVeganWeek(next.current) ?? latestVeganWeek(next.current);
    if (saved) showWeek(saved);
    else menu = null;
    try {
      if (needsVeganWeekUpdate(next.current, menu?.week === next.current ? menu : null)) {
        const current = await downloadVeganWeek(next.current);
        if (!mounted) return;
        showWeek(current);
      }
      reconcileChecks();
      if (mounted) failed = false;
      if (next.preload && needsVeganWeekUpdate(next.next)) {
        // Lỗi tải trước tuần sau không làm tuần đang xem bị báo lỗi.
        await downloadVeganWeek(next.next).catch(() => undefined);
      }
    } catch {
      if (!mounted) return;
      failed = true;
      // The saved week remains readable when this week's download is offline.
      if (menu && menu.week !== next.current && menu.version === ROTATING_VEGAN_VERSION && needsVeganWeekUpdate(menu.week, menu)) {
        const fallback = await downloadVeganWeek(menu.week).catch(() => null);
        if (mounted && fallback) showWeek(fallback);
      }
    } finally {
      active = false;
      if (mounted) {
        clearTimeout(timer);
        const local = new Date(now.getTime() + 7 * 3_600_000);
        const boundary = local.getUTCDay() === 0 && local.getUTCHours() < 18 ? 18 : 24;
        const target = new Date(local);
        target.setUTCHours(boundary, 0, 0, 0);
        timer = setTimeout(refresh, Math.max(100, target.getTime() - local.getTime() - (Date.now() - now.getTime()) + 100));
      }
    }
  }

  onMount(() => {
    mounted = true;
    try {
      const stored = JSON.parse(localStorage.getItem(settingsKey) ?? '{}');
      mealRegion = VEGAN_MEAL_REGIONS.find(option => option === stored.mealRegion) ?? '';
      if (Number.isInteger(stored.servings) && stored.servings >= 1 && stored.servings <= 12) servings = stored.servings;
      if (Number.isInteger(stored.recipeFontScale) && stored.recipeFontScale >= minRecipeFontScale && stored.recipeFontScale <= maxRecipeFontScale) {
        recipeFontScale = stored.recipeFontScale;
      }
      if (stored.checks && typeof stored.checks === 'object' && !Array.isArray(stored.checks)) checks = stored.checks;
    } catch {
      // Use default settings.
    }
    function visible() { if (!document.hidden) void refresh(); }
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', refresh);
    void refresh();
    return () => {
      mounted = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', refresh);
    };
  });

  function formatDay(date: Date, weekday: boolean) {
    return new Intl.DateTimeFormat(lang, {
      timeZone: 'UTC', weekday: weekday ? 'long' : 'short', month: '2-digit', day: '2-digit',
    }).format(date);
  }

  function formatMonth(date: Date) {
    const month = new Intl.DateTimeFormat(lang, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(date);
    return month.charAt(0).toLocaleUpperCase(lang) + month.slice(1);
  }
</script>

<svelte:head><title>{c.title}</title></svelte:head>

{#snippet servingPicker()}
  <div class="picker">
    <button type="button" onclick={() => changeServings(-1)} disabled={servings === 1} aria-label={c.less}>−</button>
    <strong aria-live="polite">{servings} {c.people}</strong>
    <button type="button" onclick={() => changeServings(1)} disabled={servings === 12} aria-label={c.more}>+</button>
  </div>
{/snippet}

{#snippet ingredientAmount(item: { name: string; unit: string; note?: string }, quantity: number | null)}
  {@const hint = ingredientMeasureHint(item.name, quantity, item.unit, lang)}
  <span>
    {quantityText(quantity, item.unit, lang) || item.note}
    {#if hint}<small>{hint}</small>{/if}
  </span>
{/snippet}

{#snippet meals(index: number)}
  {#if menu?.version === ROTATING_VEGAN_VERSION}
  <section class="card meal-region" aria-labelledby={recipeId + '-meal-region'}>
    <h2 id={recipeId + '-meal-region'}>{c.mealRegion}</h2>
    <div class="meal-region-options">
      {#each VEGAN_MEAL_REGIONS as option, optionIndex (option)}
        <button type="button" aria-pressed={mealRegion === option} onclick={() => { mealRegion = option; reconcileChecks(); save(); }}>
          {c.mealRegions[optionIndex]}
        </button>
      {/each}
    </div>
  </section>
  {/if}
  <section class="card">
    <h2>{c.menu}</h2>
    {#each mealPlan[index] ?? [] as items, meal (meal)}
      <div class="meal">
        <h3><Soup size={19} aria-hidden="true" />{c.meals[meal]}</h3>
        {#each items as item (item.id)}
          <button class="row dish" type="button" onclick={event => openRecipe(event, item)}>
            <span>{item.name}</span>
            <span class="dish-view">{c.viewRecipe}<ArrowRight size={16} aria-hidden="true" /></span>
          </button>
        {/each}
      </div>
    {/each}
  </section>
{/snippet}

<main class="vegan">
  <header class="heading">
    <h1>{c.title}</h1>
  </header>
  <nav class="glass" aria-label={c.title}>
    {#each c.tabs as title, index (title)}
      <button type="button" aria-pressed={tab === index} onclick={() => tab = index}>{title}</button>
    {/each}
  </nav>
  {#if failed}<p role="alert" class="message">{c.error}</p>{/if}
  {#if !menu}
    {#if failed}<button type="button" onclick={refresh}>{c.retry}</button>{/if}
  {:else if tab === 0 && menu.week !== calendar.current}
    <p>{c.missing}</p>
    <button type="button" onclick={refresh}>{c.retry}</button>
  {:else if tab === 0}
    <div class="meal-tools">
      <strong>{formatDay(todayDate, true)}{lunar.day === 1 ? ' · ' + c.first : lunar.day === 15 ? ' · ' + c.full : ''}</strong>
      {@render servingPicker()}
    </div>
    <aside class="nutrition-note" aria-label={c.nutritionNote}>
      <Leaf size={16} aria-hidden="true" class="nutrition-note-icon" />
      <p>{c.nutritionNote}</p>
    </aside>
    {@render meals(calendar.day)}
    <details class="card meal-disclosure">
      <summary><h2>{c.todayIngredients}</h2><ChevronDown size={20} aria-hidden="true" /></summary>
      {#each todaysIngredients as item (item.key)}
        <div class="row"><span>{item.name}</span>{@render ingredientAmount(item, item.quantity)}</div>
      {/each}
    </details>
  {:else if tab === 1}
    {#if menu.week !== calendar.current}<p>{c.saved} · {menu.week}</p>{/if}
    <section class="card week-calendar" aria-label={c.tabs[1]}>
      <h2>{formatMonth(weekDate(menu.week, day))}</h2>
      <div class="days">
        {#each dayIndices as index (index)}
          {@const date = weekDate(menu.week, index)}
          <button type="button" aria-pressed={day === index} aria-label={formatDay(date, true)} onclick={() => day = index}>
            <span>{lang === 'vi' ? (index === 6 ? 'CN' : 'T' + (index + 2)) : new Intl.DateTimeFormat(lang, { timeZone: 'UTC', weekday: 'short' }).format(date)}</span>
            <strong>{String(date.getUTCDate()).padStart(2, '0')}</strong>
          </button>
        {/each}
      </div>
      {@render servingPicker()}
    </section>
    {@render meals(day)}
    <details class="card meal-disclosure">
      <summary><h2><ShoppingCart size={21} aria-hidden="true" />{c.shopping}</h2><ChevronDown size={20} aria-hidden="true" /></summary>
      <div class="meal-tools">
        <select aria-label={c.scope} bind:value={wholeWeek}><option value={false}>{c.day}</option><option value={true}>{c.week}</option></select>
      </div>
      {#each shopping as item (item.key)}
        <label class="row check">
          <input type="checkbox" checked={checks[scope]?.[item.key] === amountKey(item)} onchange={event => toggle(item, event.currentTarget.checked)} />
          <span>{item.name}</span>{@render ingredientAmount(item, item.quantity)}
        </label>
      {/each}
    </details>
  {:else}
    <div class="filters">
      <label class="search"><Search size={20} aria-hidden="true" /><input type="search" aria-label={c.search} placeholder={c.search} bind:value={query} /></label>
      <select aria-label={c.group} bind:value={group}>
        <option value="">{c.all}</option>
        {#each VEGAN_GROUPS as key, index (key)}<option value={key}>{c.groups[index]}</option>{/each}
      </select>
      {#if menu.version !== 1}
        <select aria-label={c.region} bind:value={region}>
          <option value="">{c.allRegions}</option>
          {#each VEGAN_REGIONS as key, index (key)}<option value={key}>{c.regions[index]}</option>{/each}
        </select>
      {/if}
    </div>
    <section class="card" aria-label={c.tabs[2]}>
      {#each filtered as item (item.id)}
        <button class="row dish" type="button" onclick={event => openRecipe(event, item)}>
          <span><strong>{item.name}</strong><small>{#if item.region}{c.regions[VEGAN_REGIONS.indexOf(item.region)]} · {/if}{c.groups[VEGAN_GROUPS.indexOf(item.group)]} · {item.minutes} {c.minutes}</small></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      {:else}<p>{c.empty}</p>{/each}
    </section>
  {/if}
</main>

{#if recipe}
  <dialog class="recipe-screen" use:modalDialog aria-labelledby={recipeId} tabindex="-1" oncancel={event => { event.preventDefault(); recipe = null; }}>
    <header class="recipe-header" data-dialog-glass>
      <div class="recipe-header-inner">
        <button class="recipe-back" type="button" aria-label={c.recipeBack} data-modal-focus onclick={() => recipe = null}><ArrowLeft size={22} aria-hidden="true" /></button>
        <h2 id={recipeId}>{recipe.name}</h2>
      </div>
    </header>
    <div class="recipe-content" style:--recipe-font-size={recipeFontScale + '%'}>
      <div class="recipe-toolbar">
        <span>{recipe.minutes} {c.minutes}</span>
        <div class="picker font-picker">
          <button type="button" aria-label={c.smallerText} disabled={recipeFontScale === minRecipeFontScale} onclick={() => changeRecipeFont(-10)}>A−</button>
          <button type="button" aria-label={c.largerText} disabled={recipeFontScale === maxRecipeFontScale} onclick={() => changeRecipeFont(10)}>A+</button>
        </div>
        {@render servingPicker()}
      </div>
      <section class="card">
        <h3>{c.ingredients}</h3>
        {#each recipe.ingredients as item, index (index)}
          <div class="row">
            <span>{item.name}{#if item.quantity !== null && item.note}<small>{item.note}</small>{/if}</span>
            {@render ingredientAmount(item, item.quantity === null ? null : item.quantity * servings / recipe.servings)}
          </div>
        {/each}
      </section>
      <section class="card">
        <h3>{c.steps}</h3>
        <ol>
          {#each recipe.steps as step, index (index)}<li>{recipeStep(recipe, step, servings, lang)}</li>{/each}
        </ol>
      </section>
    </div>
  </dialog>
{/if}

<style>
  .vegan {
    --vegan-page-gutter: clamp(var(--radius-sm),3vw,var(--space-page));
    --vegan-header-height: var(--practice-topbar-height,calc(64px + var(--app-safe-top,env(safe-area-inset-top,0px))));
    max-width:52rem;
    margin:auto;
    padding-block:var(--space-page);
    padding-top:calc(var(--vegan-header-height) + var(--space-page));
    padding-left:max(var(--vegan-page-gutter),env(safe-area-inset-left,0px));
    padding-right:max(var(--vegan-page-gutter),env(safe-area-inset-right,0px));
    color:var(--text);
    border-radius:var(--radius-card);
    background:
      radial-gradient(ellipse at 95% 4%,color-mix(in srgb,var(--green-ok) 30%,transparent),transparent 48%),
      radial-gradient(ellipse at 0% 56%,color-mix(in srgb,var(--gold) 23%,transparent),transparent 57%),
      var(--bg);
  }
  .meal-tools,.row,.picker,.search{display:flex;align-items:center;gap:var(--radius-sm)}
  .heading{margin-bottom:var(--space-page)}
  h1,h2,h3,p{margin:0}
  h1{font-size:clamp(1.3rem,5vw,1.85rem)}
  h2{font-size:1.15rem}
  button,select,input[type=search]{min-height:44px;font:inherit;color:inherit}
  input[type=search],:global(:root body) .filters select{font-size:var(--font-size-input)}
  button{min-width:44px}
  button,select,.search{background:var(--card);border:1px solid var(--border2);border-radius:var(--radius-control)}
  button,select{padding:var(--radius-sm);cursor:pointer}
  button:disabled{opacity:.55;cursor:default}
  button[aria-pressed=true] {
    background:linear-gradient(150deg,var(--vegan-green),var(--vegan-green-deep));
    color:var(--vegan-on-green);
    border-color:var(--vegan-green);
    box-shadow:var(--glass-button-shadow);
    font-weight:700;
  }
  nav,.days{display:grid;gap:.25rem}
  nav {
    position:sticky;
    top:var(--vegan-header-height);
    z-index:2;
    grid-template-columns:minmax(44px,1fr) minmax(44px,1.65fr) minmax(44px,1fr);
    margin-bottom:var(--space-page);
    border-radius:var(--radius-card);
    padding:.25rem;
  }
  nav button,.days button{min-width:44px;padding-inline:.25rem;font-size:.85rem}
  nav button{white-space:normal;overflow-wrap:anywhere}
  nav button:not([aria-pressed=true]){background:transparent;border-color:transparent}
  .week-calendar{display:grid;gap:var(--radius-sm);text-align:center}
  .week-calendar .picker{justify-self:center}
  .meal-region-options{display:grid;grid-template-columns:repeat(4,minmax(44px,1fr));gap:.25rem;margin-top:var(--radius-sm)}
  .meal-region-options button{padding-inline:.25rem}
  .days{grid-template-columns:repeat(auto-fit,minmax(44px,1fr))}
  .days button{display:grid;place-content:center;gap:.15rem}
  .days button:not([aria-pressed=true]){background:var(--dialog-glass-background)}
  .days button strong{font-size:1.1rem}
  .meal-tools{justify-content:space-between;flex-wrap:wrap;margin-bottom:var(--radius-sm)}
  .nutrition-note{display:flex;align-items:flex-start;gap:var(--radius-sm);padding:var(--radius-sm) calc(var(--radius-sm) * 1.5);margin-bottom:var(--radius-sm);border:1px solid var(--dialog-glass-border);border-radius:var(--radius-control);background:var(--dialog-glass-background);-webkit-backdrop-filter:var(--dialog-glass-filter);backdrop-filter:var(--dialog-glass-filter);box-shadow:var(--glass-button-shadow);color:var(--text2);font-size:.825rem;line-height:1.45}
  .nutrition-note :global(.nutrition-note-icon){flex:none;margin-top:.15rem;color:var(--green-ok)}
  .picker{border:1px solid var(--border2);border-radius:var(--radius-control);background:var(--dialog-glass-background);box-shadow:var(--glass-button-shadow)}
  .picker button{border:0;background:transparent}
  .card{padding:var(--radius-card);margin-bottom:var(--radius-sm);background:var(--card);border:1px solid var(--border);border-radius:var(--radius-card)}
  .vegan .card,.glass {
    background:var(--dialog-glass-background);
    border:1px solid var(--dialog-glass-border);
    -webkit-backdrop-filter:var(--dialog-glass-filter);
    backdrop-filter:var(--dialog-glass-filter);
    box-shadow:var(--glass-button-shadow);
  }
  .week-calendar.card{padding-inline:var(--radius-sm)}
  .meal-disclosure{padding-block:var(--radius-sm)}
  .meal-disclosure summary{display:flex;align-items:center;justify-content:space-between;gap:var(--radius-sm);min-height:44px;cursor:pointer;list-style:none}
  .meal-disclosure summary::-webkit-details-marker{display:none}
  .meal-disclosure[open] summary > :global(svg){transform:rotate(180deg)}
  .meal {
    margin-block-start:var(--radius-sm);
    overflow:hidden;
    border:1px solid var(--dialog-glass-border);
    border-radius:var(--radius-control);
    background:var(--dialog-glass-background);
  }
  .meal h3,.meal-disclosure h2{display:flex;align-items:center;gap:var(--radius-sm)}
  .meal h3 {
    padding:var(--radius-sm);
    font-size:1rem;
    background:color-mix(in srgb,var(--gold) 25%,var(--card));
  }
  .meal .dish{padding-inline:var(--radius-sm);background:transparent}
  .dish-view{display:inline-flex;align-items:center;gap:var(--radius-sm);flex-shrink:0;padding:calc(var(--radius-sm) / 2) var(--radius-sm);border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--gold-light);font-weight:700;white-space:nowrap}
  .row{min-height:44px;justify-content:space-between;border-bottom:1px solid var(--border);padding-block:var(--radius-sm)}
  .row:last-child{border-bottom:0}
  .row span{min-width:0;overflow-wrap:anywhere}
  .row span:last-child{text-align:end}
  .dish{width:100%;text-align:start;padding-inline:0;border-radius:0;border-inline:0;border-top:0}
  .dish span:last-child{text-align:start}
  small{display:block;color:var(--muted)}
  .check{justify-content:flex-start;cursor:pointer}
  .check input{accent-color:var(--vegan-green);width:1.25rem;height:1.25rem;flex:none}
  .check span:last-child{margin-inline-start:auto}
  .filters{display:grid;gap:var(--radius-sm);margin-bottom:var(--radius-sm)}
  .search{padding-inline:var(--radius-sm)}
  .search:focus-within{border-color:var(--gold)}
  input[type=search]{border:0;background:transparent;width:100%;min-width:0}
  .search input:focus{outline:none}
  .message{color:var(--danger-text);margin-bottom:var(--radius-sm)}
  .recipe-screen[open]{position:fixed;inset:0;display:block;box-sizing:border-box;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;overflow:auto;overscroll-behavior:contain;border:0;border-radius:0;background:var(--bg);color:var(--text)}
  .recipe-header{position:sticky;top:0;z-index:1;padding-top:var(--app-safe-top,env(safe-area-inset-top,0px));background:var(--dialog-surface-background,var(--card));border-bottom:1px solid var(--dialog-surface-border,var(--border))}
  .recipe-header-inner,.recipe-content{box-sizing:border-box;width:100%;max-width:52rem;margin-inline:auto;padding-inline:max(var(--space-page),env(safe-area-inset-left)) max(var(--space-page),env(safe-area-inset-right))}
  .recipe-header-inner{display:flex;align-items:center;gap:var(--radius-sm);padding-block:var(--radius-sm)}
  .recipe-header h2{min-width:0;overflow-wrap:anywhere}
  .recipe-back{display:grid;place-items:center;flex:none}
  .recipe-content{padding-top:var(--space-page);padding-bottom:calc(var(--space-page) + env(safe-area-inset-bottom))}
  .recipe-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:var(--radius-sm);margin-block-end:var(--radius-sm)}
  .recipe-toolbar>span{color:var(--text2);white-space:nowrap}
  .recipe-toolbar .picker{flex:none;max-width:100%}
  .recipe-toolbar .picker strong{white-space:nowrap}
  .font-picker{gap:0}
  .font-picker button{font-weight:700}
  .font-picker button + button{border-inline-start:1px solid var(--border2);border-start-start-radius:0;border-end-start-radius:0}
  .recipe-content .card{font-family:var(--font-reader);font-size:var(--recipe-font-size)}
  .recipe-content ol{text-align:justify;line-height:1.65;overflow-wrap:anywhere}
  .recipe-content li + li{margin-top:var(--radius-sm)}
</style>
