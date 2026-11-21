import { db } from './db.js';
import { importRecipe, makeThumb, fileToThumb } from './importer.js';

const DEFAULT_CATEGORIES = [
  { id: 'antipasti', name: 'Antipasti', emoji: '🫒' },
  { id: 'primi', name: 'Primi', emoji: '🍝' },
  { id: 'secondi', name: 'Secondi', emoji: '🍗' },
  { id: 'contorni', name: 'Contorni', emoji: '🥗' },
  { id: 'lievitati', name: 'Pizze, pane e lievitati', emoji: '🍕' },
  { id: 'dolci', name: 'Dolci', emoji: '🍰' },
  { id: 'salse', name: 'Salse e condimenti', emoji: '🫙' },
  { id: 'altro', name: 'Altro', emoji: '🍽️' },
];
const GUESS = [
  [/antipast|aperitiv|finger|stuzzich/i, 'antipasti'],
  [/dolc|dessert|tort[ae]|biscott|crostat|cioccolat|gelat|budin|tiramis|muffin|cake/i, 'dolci'],
  [/pizz|pane|panin|lievitat|focacc|brioche|piadin|grissin/i, 'lievitati'],
  [/primi|pasta|spaghett|risott|gnocch|lasagn|zupp|minestr|vellutat|tagliatell|ravioli|tortellin/i, 'primi'],
  [/contorn|verdur|insalat|patat/i, 'contorni'],
  [/secondi|carne|pesce|pollo|manzo|maiale|vitello|polpett|arrost|frittat|uova/i, 'secondi'],
  [/salse|sugo|sughi|condiment|pesto|ragù|marmellat|confettur|crema/i, 'salse'],
];

const state = { recipes: [], categories: [], settings: {}, filter: 'all', query: '' };
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const catById = (id) => state.categories.find((c) => c.id === id) || state.categories.find((c) => c.id === 'altro') || state.categories[0];

/* ---------------- Avvio ---------------- */

async function init() {
  state.categories = (await db.getKV('categories')) || DEFAULT_CATEGORIES;
  state.settings = (await db.getKV('settings')) || {};
  state.recipes = await db.all();
  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

  window.addEventListener('hashchange', route);
  $('#back').onclick = () => (history.length > 1 ? history.back() : go('#/'));
  $('#fab').onclick = () => openAdd();
  setupAddDialog();
  route();
  handleShare();
}

function go(hash) { location.hash = hash; }

function route() {
  releaseWakeLock();
  const [, page, id] = location.hash.replace(/^#\/?/, '#/').split('/');
  window.scrollTo(0, 0);
  if (page === 'r' && id) return renderDetail(id);
  if (page === 'edit') return renderEdit(id);
  if (page === 'settings') return renderSettings();
  renderHome();
}

function setBar({ title = 'Ricettario', back = false, actions = '', fab = false }) {
  $('#bar-title').textContent = title;
  $('#back').hidden = !back;
  $('#bar-actions').innerHTML = actions;
  $('#fab').hidden = !fab;
}

/* ---------------- Home ---------------- */

function renderHome() {
  setBar({
    fab: true,
    actions: `<button class="icon-btn" id="settings-btn" aria-label="Impostazioni"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>`,
  });
  $('#settings-btn').onclick = () => go('#/settings');

  if (!state.recipes.length) {
    view.innerHTML = `
      <div class="empty">
        <div class="empty-art">📖</div>
        <h2>Il ricettario è vuoto</h2>
        <p>Tocca <b>+</b> e incolla il link di una ricetta: ingredienti e procedimento vengono copiati qui.</p>
        <p class="hint">Dopo aver installato l'app puoi anche usare <b>Condividi → Ricettario</b> direttamente dal browser.</p>
      </div>`;
    return;
  }

  const counts = {};
  state.recipes.forEach((r) => (counts[r.category] = (counts[r.category] || 0) + 1));
  const usedCats = state.categories.filter((c) => counts[c.id]);
  const orphan = state.recipes.some((r) => !state.categories.find((c) => c.id === r.category));
  if (state.filter !== 'all' && !counts[state.filter]) state.filter = 'all';

  view.innerHTML = `
    <div class="search">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input type="search" id="q" placeholder="Cerca ricetta o ingrediente" value="${esc(state.query)}" autocomplete="off">
    </div>
    <nav class="chips" id="chips">
      <button class="chip ${state.filter === 'all' ? 'on' : ''}" data-cat="all">Tutte <span>${state.recipes.length}</span></button>
      ${usedCats.map((c) => `<button class="chip ${state.filter === c.id ? 'on' : ''}" data-cat="${c.id}">${c.emoji} ${esc(c.name)} <span>${counts[c.id]}</span></button>`).join('')}
    </nav>
    <div id="list"></div>`;

  $('#q').oninput = (e) => { state.query = e.target.value; renderList(); };
  $('#chips').onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    state.filter = b.dataset.cat;
    $('#chips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
    renderList();
  };
  renderList(orphan);
  $('#chips .chip.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function renderList() {
  const q = norm(state.query.trim());
  let list = state.recipes.filter((r) => state.filter === 'all' || r.category === state.filter);
  if (q) list = list.filter((r) => norm(r.title + ' ' + r.ingredients.join(' ')).includes(q));
  list.sort((a, b) => a.title.localeCompare(b.title, 'it'));

  const el = $('#list');
  if (!list.length) { el.innerHTML = `<p class="none">Nessuna ricetta trovata.</p>`; return; }

  if (state.filter !== 'all' || q) { el.innerHTML = `<div class="grid">${list.map(card).join('')}</div>`; return; }

  const groups = new Map();
  for (const r of list) {
    const c = catById(r.category);
    if (!groups.has(c.id)) groups.set(c.id, []);
    groups.get(c.id).push(r);
  }
  el.innerHTML = state.categories
    .filter((c) => groups.has(c.id))
    .map((c) => `<section class="group"><h2>${c.emoji} ${esc(c.name)}</h2><div class="grid">${groups.get(c.id).map(card).join('')}</div></section>`)
    .join('');
}

function card(r) {
  const c = catById(r.category);
  const img = r.thumb || r.image;
  const t = r.totalTime || (r.prepTime || 0) + (r.cookTime || 0);
  return `<a class="card" href="#/r/${r.id}">
    <div class="thumb" data-emoji="${c.emoji}">${img ? `<img src="${esc(img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>
    <div class="card-body"><h3>${esc(r.title)}</h3>${t ? `<p>${fmtTime(t)}</p>` : ''}</div>
  </a>`;
}

/* ---------------- Dettaglio ---------------- */

async function renderDetail(id) {
  const r = state.recipes.find((x) => x.id === id);
  if (!r) return go('#/');
  const c = catById(r.category);
  setBar({
    back: true, title: '',
    actions: `<button class="icon-btn" id="edit-btn" aria-label="Modifica"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/></svg></button>`,
  });
  $('#edit-btn').onclick = () => go('#/edit/' + id);

  let servings = r.servings || null;
  const img = r.thumb || r.image;
  const times = [['Preparazione', r.prepTime], ['Cottura', r.cookTime], ['Totale', r.totalTime]].filter((x) => x[1]);
  const checked = new Set();

  view.innerHTML = `
    <article class="detail">
      ${img ? `<div class="hero"><img src="${esc(r.image || r.thumb)}" alt="" onerror="this.src='${esc(r.thumb || '')}'"></div>` : ''}
      <div class="detail-head">
        <span class="tag">${c.emoji} ${esc(c.name)}</span>
        <h1>${esc(r.title)}</h1>
        ${times.length ? `<p class="times">${times.map(([k, v]) => `<span>${k} <b>${fmtTime(v)}</b></span>`).join('')}</p>` : ''}
      </div>

      <section class="block">
        <div class="block-head">
          <h2>Ingredienti</h2>
          ${servings ? `<div class="stepper" aria-label="Porzioni">
            <button id="s-minus" aria-label="Meno">−</button>
            <span id="s-val"></span>
            <button id="s-plus" aria-label="Più">+</button>
          </div>` : r.yieldText ? `<span class="muted">${esc(r.yieldText)}</span>` : ''}
        </div>
        <ul class="ingredients" id="ing"></ul>
      </section>

      <section class="block">
        <h2>Procedimento</h2>
        <ol class="steps" id="steps">${stepsHtml(r.steps)}</ol>
      </section>

      ${r.notes ? `<section class="block"><h2>Note</h2><p class="notes">${esc(r.notes).replace(/\n/g, '<br>')}</p></section>` : ''}

      ${r.sourceUrl ? `<a class="source" href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">Ricetta originale su ${esc(r.sourceName || 'sito')} ↗</a>` : ''}
    </article>`;

  const drawIng = () => {
    const f = servings && r.servings ? servings / r.servings : 1;
    $('#ing').innerHTML = r.ingredients.map((x, i) => x.startsWith('## ')
      ? `<li class="sub">${esc(x.slice(3))}</li>`
      : `<li class="${checked.has(i) ? 'done' : ''}" data-i="${i}"><span class="box"></span><span>${esc(scaleLine(x, f))}</span></li>`).join('');
    if (servings) $('#s-val').textContent = `${servings} ${servings === 1 ? 'porzione' : 'porzioni'}`;
  };
  drawIng();
  $('#ing').onclick = (e) => {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    const i = +li.dataset.i;
    checked.has(i) ? checked.delete(i) : checked.add(i);
    li.classList.toggle('done');
  };
  if (servings) {
    $('#s-minus').onclick = () => { if (servings > 1) { servings--; drawIng(); } };
    $('#s-plus').onclick = () => { servings++; drawIng(); };
  }
  $('#steps').onclick = (e) => e.target.closest('li.step')?.classList.toggle('done');

  requestWakeLock();
  r.lastOpened = Date.now();
  db.put(r);
}

function stepsHtml(steps) {
  return steps.map((s) => s.startsWith('## ')
    ? `<li class="sub">${esc(s.slice(3))}</li>`
    : `<li class="step">${esc(s)}</li>`).join('');
}

// Lo schermo resta acceso mentre si cucina.
let wakeLock = null;
async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* non supportato */ }
}
function releaseWakeLock() { wakeLock?.release?.(); wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && location.hash.startsWith('#/r/')) requestWakeLock();
});

/* ---------------- Porzioni ---------------- */

const UNIT = String.raw`(?:kg|g|gr|grammi|mg|ml|cl|dl|l|lt|litr[oi]|cucchiai[on]?[oi]?|cucchiain[oi]|tazz[ae]|tazzin[ae]|bicchier[ei]|pizzic[oh]i?|spicch[io]|fett[ae]|fettin[ae]|foglie?|rametti?|bustin[ae]|vasett[oi]|scatolett[ae]|confezion[ei]|uova|uovo|tuorl[oi]|albume?i?|cups?|tbsp|tsp|oz|lb)\b`;
const NUM = String.raw`(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|½|¼|¾|⅓|⅔)`;
const RE_UNIT = new RegExp(NUM + String.raw`(\s*-\s*` + NUM + String.raw`)?(?=\s*` + UNIT + ')', 'gi');
const RE_START = new RegExp('^' + NUM + String.raw`(?=\s)`);
const RE_END = new RegExp(String.raw`(\s)` + NUM + String.raw`(\s*\)?\s*)$`);
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

function toNum(s) {
  if (FRAC[s]) return FRAC[s];
  if (s.includes('/')) { const [a, b] = s.split('/').map(Number); return a / b; }
  return parseFloat(s.replace(',', '.'));
}
function fmtNum(n) {
  if (n >= 100) return String(Math.round(n / 5) * 5);
  if (n >= 10) return String(Math.round(n));
  const q = Math.round(n * 4) / 4;
  return String(q || Math.round(n * 10) / 10).replace('.', ',');
}
export function scaleLine(line, f) {
  if (f === 1) return line;
  const sc = (s) => fmtNum(toNum(s) * f);
  let done = false;
  let out = line.replace(RE_UNIT, (m, a, rng, b) => { done = true; return sc(a) + (rng ? '-' + sc(b) : ''); });
  if (!done && RE_START.test(out)) { out = out.replace(RE_START, (m, a) => sc(a)); done = true; }
  if (!done) out = out.replace(RE_END, (m, sp, a, tail) => sp + sc(a) + tail);
  return out;
}

function fmtTime(min) {
  if (!min) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ' ' + m + ' min' : ''}` : `${m} min`;
}

/* ---------------- Modifica ---------------- */

function renderEdit(id) {
  const existing = id && id !== 'new' ? state.recipes.find((x) => x.id === id) : null;
  const draft = existing ? structuredClone(existing) : (state.draft || { ingredients: [], steps: [], category: 'altro' });
  state.draft = null;
  setBar({ back: true, title: existing ? 'Modifica' : 'Nuova ricetta' });

  view.innerHTML = `
    <form class="edit" id="edit">
      <div class="photo">
        <div class="thumb big" data-emoji="${catById(draft.category).emoji}" id="ph">${draft.thumb || draft.image ? `<img src="${esc(draft.thumb || draft.image)}" alt="">` : ''}</div>
        <div class="photo-actions">
          <label class="btn ghost">Cambia foto<input type="file" accept="image/*" id="ph-file" hidden></label>
          <button type="button" class="btn ghost" id="ph-del">Rimuovi</button>
        </div>
      </div>
      <label class="field"><span>Titolo</span><input name="title" required value="${esc(draft.title)}"></label>
      <label class="field"><span>Categoria</span><select name="category">${catOptions(draft.category)}</select></label>
      <div class="row3">
        <label class="field"><span>Porzioni</span><input name="servings" type="number" min="1" inputmode="numeric" value="${draft.servings ?? ''}"></label>
        <label class="field"><span>Prep. (min)</span><input name="prepTime" type="number" min="0" inputmode="numeric" value="${draft.prepTime ?? ''}"></label>
        <label class="field"><span>Cottura (min)</span><input name="cookTime" type="number" min="0" inputmode="numeric" value="${draft.cookTime ?? ''}"></label>
      </div>
      <label class="field"><span>Ingredienti <small>uno per riga · "## Titolo" per un gruppo</small></span>
        <textarea name="ingredients" rows="8">${esc(draft.ingredients.join('\n'))}</textarea></label>
      <label class="field"><span>Procedimento <small>un passaggio per riga</small></span>
        <textarea name="steps" rows="12">${esc(draft.steps.join('\n'))}</textarea></label>
      <label class="field"><span>Note personali</span><textarea name="notes" rows="3">${esc(draft.notes || '')}</textarea></label>
      <label class="field"><span>Link originale</span><input name="sourceUrl" type="url" value="${esc(draft.sourceUrl || '')}"></label>
      <div class="actions">
        ${existing ? `<button type="button" class="btn danger" id="del">Elimina</button>` : ''}
        <span class="spacer"></span>
        <button type="submit" class="btn primary">Salva</button>
      </div>
    </form>`;

  const form = $('#edit');
  const setPhoto = (thumb) => {
    draft.thumb = thumb; draft.image = '';
    $('#ph').innerHTML = thumb ? `<img src="${thumb}" alt="">` : '';
  };
  $('#ph-file').onchange = async (e) => { const f = e.target.files[0]; if (f) setPhoto(await fileToThumb(f)); };
  $('#ph-del').onclick = () => setPhoto('');
  form.category.onchange = () => ($('#ph').dataset.emoji = catById(form.category.value).emoji);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
    const num = (v) => (v ? +v : null);
    const r = {
      ...draft,
      id: draft.id || uid(),
      title: form.title.value.trim(),
      category: form.category.value,
      servings: num(form.servings.value),
      prepTime: num(form.prepTime.value),
      cookTime: num(form.cookTime.value),
      ingredients: lines(form.ingredients.value),
      steps: lines(form.steps.value),
      notes: form.notes.value.trim(),
      sourceUrl: form.sourceUrl.value.trim(),
      createdAt: draft.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    if (r.prepTime || r.cookTime) r.totalTime = (r.prepTime || 0) + (r.cookTime || 0) || r.totalTime;
    if (r.sourceUrl && !r.sourceName) try { r.sourceName = new URL(r.sourceUrl).hostname.replace(/^www\./, ''); } catch {}
    await saveRecipe(r);
    toast('Ricetta salvata');
    location.replace('#/r/' + r.id);
  };

  $('#del')?.addEventListener('click', async () => {
    if (!confirm(`Eliminare "${existing.title}"?`)) return;
    await db.del(existing.id);
    state.recipes = state.recipes.filter((x) => x.id !== existing.id);
    toast('Ricetta eliminata');
    location.replace('#/');
  });
}

async function saveRecipe(r) {
  await db.put(r);
  const i = state.recipes.findIndex((x) => x.id === r.id);
  i >= 0 ? (state.recipes[i] = r) : state.recipes.push(r);
}

function catOptions(sel, withAuto) {
  return (withAuto ? `<option value="auto">Automatica (in base al sito)</option>` : '') +
    state.categories.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.emoji} ${esc(c.name)}</option>`).join('');
}

/* ---------------- Importazione ---------------- */

function setupAddDialog() {
  const dlg = $('#add-dialog');
  $('#add-cancel').onclick = () => dlg.close();
  $('#paste-btn').onclick = async () => {
    try {
      const t = await navigator.clipboard.readText();
      const u = extractUrl(t);
      if (u) $('#add-url').value = u; else msg('Negli appunti non c\'è un link.', true);
    } catch { msg('Tieni premuto nel campo e scegli "Incolla".', true); }
  };
  $('#manual-btn').onclick = () => {
    const cat = $('#add-cat').value;
    state.draft = { ingredients: [], steps: [], category: cat === 'auto' ? 'altro' : cat, sourceUrl: $('#add-url').value.trim() };
    dlg.close();
    go('#/edit/new');
  };
  $('#add-form').onsubmit = async (e) => {
    e.preventDefault();
    const url = extractUrl($('#add-url').value);
    if (!url) return msg('Inserisci un link valido (https://…).', true);
    await doImport(url, $('#add-cat').value);
  };
}

function openAdd(url = '') {
  $('#add-cat').innerHTML = catOptions(null, true);
  $('#add-url').value = url;
  msg('');
  busy(false);
  $('#add-dialog').showModal();
  if (!url) setTimeout(() => $('#add-url').focus(), 50);
}

function msg(text, isErr = false, details) {
  const m = $('#add-msg');
  m.className = 'msg' + (isErr ? ' err' : '');
  m.innerHTML = esc(text) + (details ? `<details><summary>Dettagli</summary><small>${details.map(esc).join('<br>')}</small></details>` : '');
}
function busy(on) {
  $('#add-go').disabled = on;
  $('#add-go').textContent = on ? 'Leggo…' : 'Importa';
  $('#add-form').classList.toggle('busy', on);
}

async function doImport(url, cat) {
  const dup = state.recipes.find((r) => r.sourceUrl === url);
  if (dup && !confirm(`"${dup.title}" è già nel ricettario. Importarla di nuovo?`)) {
    $('#add-dialog').close(); return go('#/r/' + dup.id);
  }
  busy(true);
  msg('Leggo la ricetta dal sito…');
  try {
    const data = await importRecipe(url, state.settings.proxy);
    msg('Salvo l\'anteprima…');
    const thumb = await makeThumb(data.image);
    const category = cat === 'auto' ? guessCategory(data) : cat;
    const r = { ...data, id: uid(), category, thumb, createdAt: Date.now(), updatedAt: Date.now() };
    await saveRecipe(r);
    $('#add-dialog').close();
    toast(`"${r.title}" aggiunta in ${catById(category).name}`);
    go('#/r/' + r.id);
  } catch (e) {
    msg(e.message + ' Puoi riprovare o scriverla a mano.', true, e.details);
  } finally { busy(false); }
}

function guessCategory(d) {
  for (const src of [d.siteCategory, d.title]) {
    if (!src) continue;
    for (const [re, id] of GUESS) if (re.test(src) && state.categories.find((c) => c.id === id)) return id;
  }
  return state.categories.find((c) => c.id === 'altro')?.id || state.categories[0].id;
}

function extractUrl(t) { return String(t || '').match(/https?:\/\/[^\s<>"']+/)?.[0] || ''; }

// "Condividi → Ricettario" da Chrome su Android apre l'app con ?url=…&text=…
function handleShare() {
  const p = new URLSearchParams(location.search);
  if (!p.has('url') && !p.has('text') && !p.has('title')) return;
  const url = extractUrl(p.get('url')) || extractUrl(p.get('text')) || extractUrl(p.get('title'));
  history.replaceState(null, '', location.pathname + location.hash);
  if (!url) return toast('Nel contenuto condiviso non c\'è un link.');
  openAdd(url);
  doImport(url, 'auto');
}

/* ---------------- Impostazioni ---------------- */

function renderSettings() {
  setBar({ back: true, title: 'Impostazioni' });
  const n = (id) => state.recipes.filter((r) => r.category === id).length;
  view.innerHTML = `
    <div class="settings">
      <section class="block">
        <h2>Categorie</h2>
        <ul class="cats" id="cats">
          ${state.categories.map((c, i) => `<li data-id="${c.id}">
            <input class="emoji" value="${esc(c.emoji)}" maxlength="4" aria-label="Icona">
            <input class="name" value="${esc(c.name)}" aria-label="Nome">
            <span class="muted">${n(c.id)}</span>
            <button class="icon-btn sm" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Su"><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>
            <button class="icon-btn sm" data-act="del" aria-label="Elimina"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
          </li>`).join('')}
        </ul>
        <button class="btn ghost" id="cat-add">+ Nuova categoria</button>
      </section>

      <section class="block">
        <h2>Backup</h2>
        <p class="muted">Le ricette sono salvate solo su questo dispositivo. Esporta un backup ogni tanto (o per spostarle su un altro telefono).</p>
        <div class="row">
          <button class="btn ghost" id="export">Esporta (${state.recipes.length})</button>
          <label class="btn ghost">Importa backup<input type="file" accept="application/json,.json" id="import" hidden></label>
        </div>
      </section>

      <section class="block">
        <h2>Lettura dei siti</h2>
        <p class="muted">Facoltativo. Indirizzo del tuo "ponte" personale (Cloudflare Worker, vedi README). Se vuoto si usano servizi pubblici gratuiti.</p>
        <input id="proxy" type="url" placeholder="https://ricettario.tuonome.workers.dev" value="${esc(state.settings.proxy || '')}">
      </section>
    </div>`;

  const saveCats = async () => { await db.setKV('categories', state.categories); };
  $('#cats').addEventListener('change', async (e) => {
    const li = e.target.closest('li'); const c = state.categories.find((x) => x.id === li.dataset.id);
    if (e.target.classList.contains('name')) c.name = e.target.value.trim() || c.name;
    if (e.target.classList.contains('emoji')) c.emoji = e.target.value.trim() || '🍽️';
    await saveCats();
  });
  $('#cats').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.closest('li').dataset.id;
    const i = state.categories.findIndex((x) => x.id === id);
    if (b.dataset.act === 'up' && i > 0) {
      [state.categories[i - 1], state.categories[i]] = [state.categories[i], state.categories[i - 1]];
    } else if (b.dataset.act === 'del') {
      if (state.categories.length === 1) return toast('Serve almeno una categoria.');
      const others = state.categories.filter((x) => x.id !== id);
      const dest = others.find((x) => x.id === 'altro') || others[others.length - 1];
      const cnt = n(id);
      if (!confirm(cnt ? `Eliminare la categoria? Le ${cnt} ricette passano in "${dest.name}".` : 'Eliminare la categoria?')) return;
      for (const r of state.recipes.filter((x) => x.category === id)) { r.category = dest.id; await db.put(r); }
      state.categories = others;
    } else return;
    await saveCats();
    renderSettings();
  });
  $('#cat-add').onclick = async () => {
    const name = prompt('Nome della categoria');
    if (!name?.trim()) return;
    state.categories.push({ id: uid(), name: name.trim(), emoji: '🍽️' });
    await saveCats();
    renderSettings();
  };

  $('#export').onclick = () => {
    const data = { app: 'ricettario', version: 1, exportedAt: new Date().toISOString(), categories: state.categories, recipes: state.recipes };
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })),
      download: `ricettario-${new Date().toISOString().slice(0, 10)}.json`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#import').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.recipes)) throw new Error();
      for (const c of data.categories || []) if (!state.categories.find((x) => x.id === c.id)) state.categories.push(c);
      for (const r of data.recipes) await saveRecipe(r);
      await saveCats();
      toast(`${data.recipes.length} ricette importate`);
      renderSettings();
    } catch { toast('File di backup non valido.'); }
  };
  $('#proxy').onchange = async (e) => {
    state.settings.proxy = e.target.value.trim();
    await db.setKV('settings', state.settings);
    toast('Salvato');
  };
}

/* ---------------- Varie ---------------- */

let toastT;
function toast(t) {
  const el = $('#toast');
  el.textContent = t; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600);
}

init();
