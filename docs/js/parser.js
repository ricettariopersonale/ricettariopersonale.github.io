// Estrae una ricetta da una pagina HTML.
// 1) dati strutturati schema.org/Recipe in JSON-LD (la maggior parte dei siti di ricette)
// 2) microdata (itemprop="recipeIngredient" ...)
// 3) euristica: liste sotto un titolo "Ingredienti" / "Preparazione"

export function parseRecipe(html, pageUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const host = safeHost(pageUrl);
  let r = fromJsonLd(doc, host) || fromMicrodata(doc) || fromHeuristics(doc);
  if (!r) return null;

  const og = (p) => doc.querySelector(`meta[property="${p}"],meta[name="${p}"]`)?.content?.trim();
  r.title = clean(r.title || og('og:title') || doc.title || 'Ricetta');
  r.image = absUrl(r.image || og('og:image') || og('twitter:image'), pageUrl);
  r.ingredients = (r.ingredients || []).map(clean).filter(Boolean);
  r.steps = (r.steps || []).map(clean).filter(Boolean);
  if (host.includes('giallozafferano')) r.steps = r.steps.map(stripPhotoRefs);
  r.sourceUrl = pageUrl;
  r.sourceName = host.replace(/^www\./, '');
  if (!r.ingredients.length && !r.steps.length) return null;
  return r;
}

/* ---------- JSON-LD ---------- */

function fromJsonLd(doc, host) {
  for (const s of doc.querySelectorAll('script[type*="ld+json"]')) {
    let data;
    try { data = JSON.parse(s.textContent.trim()); }
    catch { try { data = JSON.parse(s.textContent.replace(/[\u0000-\u001f]+/g, ' ')); } catch { continue; } }
    const rec = findRecipe(data);
    // salepepe.it scrive le ore al posto dei minuti ("PT15H" = 15 minuti)
    if (rec) return mapSchemaRecipe(rec, host.includes('salepepe'));
  }
  return null;
}

function findRecipe(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipe(n, depth + 1); if (r) return r; }
    return null;
  }
  const t = node['@type'];
  if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return node;
  for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = findRecipe(node[k], depth + 1); if (r) return r;
  }
  return null;
}

function mapSchemaRecipe(n, hoursAreMinutes) {
  const t = (v) => isoMinutes(hoursAreMinutes && typeof v === 'string' ? v.replace(/(\d+)H/i, '$1M') : v);
  return {
    title: text(n.name),
    image: pickImage(n.image),
    ingredients: toList(n.recipeIngredient || n.ingredients),
    steps: flattenInstructions(n.recipeInstructions),
    servings: parseYield(n.recipeYield),
    yieldText: yieldText(n.recipeYield),
    prepTime: t(n.prepTime),
    cookTime: t(n.cookTime),
    totalTime: t(n.totalTime),
    siteCategory: text(Array.isArray(n.recipeCategory) ? n.recipeCategory[0] : n.recipeCategory),
  };
}

function flattenInstructions(ins) {
  if (!ins) return [];
  if (typeof ins === 'string') return splitText(ins);
  if (!Array.isArray(ins)) ins = [ins];
  const out = [];
  for (const it of ins) {
    if (!it) continue;
    if (typeof it === 'string') { out.push(...splitText(it)); continue; }
    const t = it['@type'];
    if (t === 'HowToSection' || it.itemListElement) {
      if (it.name) out.push('## ' + text(it.name));
      out.push(...flattenInstructions(it.itemListElement));
    } else {
      const s = text(it.text || it.description || it.name);
      if (s) out.push(...splitText(s));
    }
  }
  return out;
}

function pickImage(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return pickImage(img[0]);
  return img.url || img.contentUrl || img['@id'] || '';
}

/* ---------- Microdata ---------- */

function fromMicrodata(doc) {
  const ing = [...doc.querySelectorAll('[itemprop="recipeIngredient"],[itemprop="ingredients"]')].map((e) => e.textContent);
  let steps = [...doc.querySelectorAll('[itemprop="recipeInstructions"]')];
  if (!ing.length && !steps.length) return null;
  steps = steps.flatMap((e) => {
    const lis = e.querySelectorAll('li,p');
    return lis.length ? [...lis].map((x) => x.textContent) : splitText(e.textContent);
  });
  const name = doc.querySelector('[itemprop="name"]')?.textContent;
  const img = doc.querySelector('[itemprop="image"]');
  return { title: name, image: img?.getAttribute('src') || img?.getAttribute('content') || '', ingredients: ing, steps };
}

/* ---------- Euristica ---------- */

function fromHeuristics(doc) {
  doc.querySelectorAll('script,style,noscript,nav,footer,header,aside,form,iframe,svg').forEach((e) => e.remove());
  const heads = [...doc.querySelectorAll('h1,h2,h3,h4,strong,b')];
  const near = (re) => {
    const h = heads.find((x) => re.test(x.textContent.trim()) && x.textContent.trim().length < 60);
    if (!h) return [];
    let el = h.closest('h1,h2,h3,h4') || h.parentElement;
    for (let i = 0; i < 6 && el; i++) {
      el = el.nextElementSibling || el.parentElement?.nextElementSibling;
      if (!el) break;
      const items = el.matches('ul,ol') ? el.querySelectorAll('li') : el.querySelectorAll('li');
      if (items.length) return [...items].map((x) => x.textContent);
      const ps = el.matches('p') ? [el] : [...el.querySelectorAll('p')];
      if (ps.length && re !== ING_RE) return ps.map((x) => x.textContent);
    }
    return [];
  };
  const ingredients = near(ING_RE);
  const steps = near(/^(preparazione|procedimento|come (si )?prepara|istruzioni|method|instructions|directions)/i);
  if (!ingredients.length) return null;
  return { title: doc.querySelector('h1')?.textContent, ingredients, steps };
}
const ING_RE = /^ingredienti|^ingredients/i;

/* ---------- Utilità ---------- */

const decoder = typeof document !== 'undefined' ? document.createElement('textarea') : null;
function decodeEntities(s) {
  if (!decoder || !/&[#a-z0-9]+;/i.test(s)) return s;
  decoder.innerHTML = s;
  return decoder.value;
}
function text(v) {
  if (v == null) return '';
  if (typeof v === 'object') v = v.text || v.name || '';
  return clean(String(v));
}
function clean(s) {
  return decodeEntities(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \s]+/g, ' ')
    .trim();
}
function toList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(text);
  return splitText(String(v));
}
function splitText(s) {
  return String(s).replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n').split(/\n+/).map(clean).filter(Boolean);
}
// GialloZafferano inserisce nel testo i numeri delle foto del passo-passo: "tagliatelo a fette 1 e poi..."
function stripPhotoRefs(s) {
  return s
    .replace(/(\p{L})((?:\s\d{1,2})+)\s*(?=[.,;:)]|\s+e\s|\s+ed\s|\s*$)/gu, '$1')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function isoMinutes(v) {
  if (!v || typeof v !== 'string') return null;
  const m = v.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const min = (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0);
  return min || null;
}
function parseYield(y) {
  if (Array.isArray(y)) y = y.find((x) => /\d/.test(String(x))) ?? y[0];
  const m = String(y ?? '').match(/\d+/);
  return m ? +m[0] : null;
}
function yieldText(y) {
  if (Array.isArray(y)) y = y[y.length - 1];
  if (y == null) return '';
  const s = String(y).trim();
  return /^\d+$/.test(s) ? `${s} persone` : s;
}
function safeHost(u) { try { return new URL(u).hostname; } catch { return ''; } }
function absUrl(u, base) { if (!u) return ''; try { return new URL(u, base).href; } catch { return u; } }
