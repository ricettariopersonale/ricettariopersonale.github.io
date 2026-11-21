// Scarica la pagina della ricetta. Il browser non può leggere direttamente pagine di altri
// siti (CORS), quindi passa da un "ponte": prima quello personale (se configurato nelle
// impostazioni, vedi worker/), poi alcuni servizi pubblici gratuiti.
import { parseRecipe } from './parser.js';

const PUBLIC_PROXIES = [
  { name: 'jina', url: (u) => `https://r.jina.ai/${u}`, headers: { 'X-Return-Format': 'html', 'X-No-Cache': 'true' } },
  { name: 'allorigins', url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { name: 'codetabs', url: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
];

async function fetchText(url, headers, ms = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

export async function importRecipe(pageUrl, customProxy) {
  const proxies = [];
  if (customProxy) proxies.push({ name: 'personale', url: (u) => customProxy.replace(/\/?$/, '/') + '?url=' + encodeURIComponent(u) });
  proxies.push(...PUBLIC_PROXIES);

  const errors = [];
  for (const p of proxies) {
    try {
      const html = await fetchText(p.url(pageUrl), p.headers);
      if (html.length < 500) throw new Error('pagina vuota');
      const r = parseRecipe(html, pageUrl);
      if (r) return r;
      errors.push(`${p.name}: ricetta non trovata nella pagina`);
    } catch (e) {
      errors.push(`${p.name}: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    }
  }
  const err = new Error('Non sono riuscito a leggere la ricetta da questo link.');
  err.details = errors;
  throw err;
}

// Miniatura piccola (circa 20-40 KB) salvata insieme alla ricetta, così la home funziona offline.
// wsrv.nl è un servizio gratuito di ridimensionamento immagini con CORS aperto.
export async function makeThumb(imageUrl) {
  if (!imageUrl) return '';
  try {
    const src = `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&w=480&h=360&fit=cover&output=webp&q=70`;
    const r = await fetch(src);
    if (!r.ok) throw new Error();
    const blob = await r.blob();
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
  } catch { return ''; }
}

// Converte un file immagine scelto dall'utente in una miniatura.
export async function fileToThumb(file) {
  const bmp = await createImageBitmap(file);
  const W = 480, H = 360;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const s = Math.max(W / bmp.width, H / bmp.height);
  const w = bmp.width * s, h = bmp.height * s;
  c.getContext('2d').drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
  return c.toDataURL('image/webp', 0.75);
}
