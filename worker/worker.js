// Ponte personale (facoltativo) su Cloudflare Workers, gratuito.
// Scarica la pagina della ricetta per conto dell'app. Usalo se i servizi pubblici
// smettono di funzionare. Istruzioni nel README.
//
// Per sicurezza accetta richieste solo dall'indirizzo della tua app: modifica ALLOWED.
const ALLOWED = ['https://ricettariopersonale.github.io', 'http://localhost:8765'];

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
      'Access-Control-Allow-Headers': '*',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (!ALLOWED.includes(origin)) return new Response('Origine non ammessa', { status: 403, headers: cors });

    const target = new URL(req.url).searchParams.get('url');
    if (!target || !/^https?:\/\//.test(target)) return new Response('Parametro url mancante', { status: 400, headers: cors });

    const r = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36',
        'Accept-Language': 'it-IT,it;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    return new Response(await r.text(), {
      status: r.status,
      headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};
