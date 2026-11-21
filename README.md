# Ricettario

App per il telefono che raccoglie le ricette di uso comune, divise per categoria.
Si incolla il link di una ricetta (o si usa **Condividi → Ricettario** dal browser) e l'app
copia titolo, foto in anteprima, ingredienti con quantità e procedimento. Niente video, pubblicità o testo superfluo.

## Funzioni

- Home con anteprime divise per categoria, filtro per categoria e ricerca (anche per ingrediente).
- Importazione dal link: legge i dati strutturati schema.org/Recipe che quasi tutti i siti di ricette
  pubblicano (GialloZafferano, Cucchiaio d'Argento, Misya, Sale&Pepe, La Cucina Italiana, …).
  Categoria scelta a mano o indovinata in automatico.
- Scheda ricetta: ingredienti da spuntare, porzioni modificabili (le quantità si ricalcolano),
  passaggi numerati da segnare come fatti, schermo sempre acceso mentre è aperta.
- Modifica di ogni campo, note personali, foto propria, ricette scritte a mano.
- Categorie personalizzabili (nome, icona, ordine).
- Funziona offline. Le ricette sono salvate **sul telefono** (IndexedDB): usare *Impostazioni → Esporta*
  per un backup o per passare a un altro telefono.

## Come funziona la lettura dei siti

Un'app web non può scaricare direttamente pagine di altri siti (blocco CORS del browser), quindi passa da un
"ponte": `r.jina.ai` (gratuito, senza account) e, come riserva, altri servizi pubblici. Le anteprime vengono
ridimensionate da `wsrv.nl` e salvate nell'app (~30 KB l'una).

Alcuni siti con protezione anti-bot (es. *Fatto in casa da Benedetta*) bloccano questi servizi:
in quel caso l'app propone di scrivere la ricetta a mano (il link resta salvato).

### Ponte personale (facoltativo)

Se i servizi pubblici smettono di funzionare: crea un account gratuito su Cloudflare →
*Workers & Pages → Create → Worker*, incolla `worker/worker.js` (sostituendo l'indirizzo in `ALLOWED`),
pubblica e copia l'indirizzo `https://….workers.dev` in *Impostazioni → Lettura dei siti*.

## Pubblicazione su GitHub Pages

1. Repository pubblico con questi file.
2. **Settings → Pages**: Source "Deploy from a branch", branch `main`, cartella `/docs`.
3. Dal telefono apri `https://ricettariopersonale.github.io/` con Chrome → menu ⋮ → **Installa app**.
   Da quel momento "Ricettario" compare anche nel menu **Condividi** di Chrome.

Dopo ogni modifica ai file in `docs/` aumentare `VERSION` in `docs/sw.js`.

## Provare in locale

```bash
python3 -m http.server -d docs 8765
```
