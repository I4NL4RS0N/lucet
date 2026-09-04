/*
 * The share card (og.png).
 *
 *   node scripts/make-og.mjs apps/docs/public/og.png
 *
 * 1200x630 at 2x. It SHOWS the product rather than describing it: a real
 * moment from the Konfabulator, rendered by the library's own stylesheets,
 * with the library's own class names and the runtime's own words. The
 * marketing column is four things — the mark, one sentence, one line of
 * fact, the domain — because a card read at 320px in a feed can carry a
 * picture or a paragraph, and the picture is the argument.
 *
 * The moment is the fallback-model scenario, and it is the thesis in one
 * frame: the app has quietly dropped to a cheaper model, and it says so,
 * with the way back attached. Every string in the panel is quoted from the
 * runtime — the turn on show from `degradedModel` in
 * packages/core/src/scenarios/index.ts, the answer fading off the top from
 * OPENER_EVENTS in apps/docs/src/opener.ts — and every class name from
 * packages/react/src/components. A component that moves out from under
 * this card is findable by grep rather than by eye.
 *
 * Re-run it when the tokens move, the components change, or the pitch does.
 * A card that drifts from the product is worse than none.
 *
 * Dark, and Glass rather than Paper: the card is read at thumbnail size,
 * where the raised material's edge survives the scale and Paper's value
 * step does not.
 *
 * Replacing this file does not refresh what Slack, X and LinkedIn already
 * cached; their own debuggers do.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const ROOT = process.cwd()

/* Both stylesheets, inlined: the card is composed of real components, so it
   needs the real component CSS, not a redrawing of it. */
const S = `${ROOT}/packages/core/styles`
const entry = readFileSync(`${S}/index.css`, 'utf8')
const tokens = [...entry.matchAll(/@import '\.\/([^']+)'/g)]
  .map((m) => readFileSync(`${S}/${m[1]}`, 'utf8')).join('\n')
const components = readFileSync(`${ROOT}/packages/react/styles/index.css`, 'utf8')
const mark = readFileSync(`${ROOT}/apps/docs/public/favicon.svg`, 'utf8').replace(/<\?xml.*?\?>/, '')

/* StateIcon's own attributes and Lucide's own 24px grid — the glyph is the
   component's, drawn at the size a host would ask for. */
const icon = (paths, size) =>
  `<svg class="lucet-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"` +
  ` stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

/* triangle-alert, StateIcon's `degraded`. */
const DEGRADED = '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'

const html = `<!doctype html><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
${tokens}
${components}

/* THE COMPONENTS ARE NOT ENLARGED, THE ROOT IS. Every spacing and type
   token is rem-derived, so a root a point up renders the same design one
   step larger — what a reader with a slightly bigger browser font already
   sees. A transform would have been a drawing of the components at 1.06x,
   which is the thing this file exists not to do. The marketing column is
   set in px and is unaffected. */
html { font-size: 17px; }

*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{
  background:var(--lucet-background);
  color:var(--lucet-foreground);
  font-family:var(--lucet-font-sans);
  /* One row, fixed: without it the grid row auto-sizes to the panel's
     content and the whole card grows past 630. */
  display:grid;grid-template-columns:1fr 704px;grid-template-rows:630px;
}

/* Nothing moves in a screenshot. Held at their settled state so two runs of
   this script produce the same file. */
*,*::before,*::after{animation:none!important;transition:none!important}

/* ---- the left column: four things ---- */
.left{padding:56px 26px 56px 58px;display:flex;flex-direction:column}
.mid{flex:1;display:flex;flex-direction:column;justify-content:center;padding-block:8px}
.brand{display:flex;align-items:center;gap:13px}
.brand svg{width:40px;height:40px;border-radius:11px;display:block}
.brand b{font:600 27px/1 'Instrument Sans',Inter,sans-serif;letter-spacing:-0.018em}
h1{
  font:600 50px/1.08 'Instrument Sans',Inter,sans-serif;
  letter-spacing:-0.034em;max-width:16ch;margin:0;
}
.sub{margin-top:20px;font-size:19px;line-height:1.45;color:var(--lucet-subtle-foreground)}
.foot{font-size:16px;font-weight:500;color:var(--lucet-muted-foreground)}

/* ---- the panel: the whole app, floated on the ground. Its frame is not
   cropped, because the one thing the card has to survive is being shrunk:
   a clipped composer or a half-visible bubble reads as a broken screenshot
   at 320px, where a complete small window still reads as an interface. ---- */
.app{
  min-height:0;
  margin:54px 54px 54px 0;
  padding:24px 24px 22px;
  display:flex;flex-direction:column;gap:20px;
  background:var(--lucet-card);
  box-shadow:var(--lucet-material-raised);
  border-radius:20px;
}
/* A thread sits at its newest end, so the content is anchored to the
   bottom and the conversation runs off the TOP of the frame — the tail of
   the previous answer fading out under the edge, the way the site's own
   scroll fade leaves it. Anchoring the other way left a hole between the
   answer and the composer that no real thread has. */
.pane{
  flex:1;min-height:0;overflow:hidden;
  display:flex;flex-direction:column;justify-content:flex-end;
  -webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 30%);
          mask-image:linear-gradient(to bottom,transparent 0,#000 30%);
}
.pane .lucet-thread{gap:var(--lucet-space-6)}
.pane .lucet-thread__pair+.lucet-thread__pair{padding-block-start:var(--lucet-space-6)}
/* Textareas get a resize grip in Chromium that the real app's field does not
   show at rest; nothing here is resizable. */
.lucet-prompt__field{resize:none}
</style>

<div class="left">
  <div class="brand">${mark}<b>Lucet</b></div>
  <div class="mid">
    <h1>The happy path is the easy half.</h1>
    <p class="sub">Open-source AI interface components.</p>
  </div>
  <div class="foot">lucet.design</div>
</div>

<div class="app">
  <div class="pane">
    <div class="lucet-thread">
      <div class="lucet-thread__pair">
        <div class="lucet-thread__turn" data-role="assistant">
          <div class="lucet-thread__doc"><div class="lucet-md"><p class="lucet-md__p">Two of the three. The carrier review picked up a revised delivery table on Friday — the procurement dates moved out by a week. The internal note added a paragraph on scope late Monday. The Q3 revision has not changed since it was filed; if you want, I can re-check all three against their sources before you circulate anything.</p></div></div>
        </div>
      </div>
      <div class="lucet-thread__pair">
        <div class="lucet-thread__turn" data-role="user" data-self="true">
          <div class="lucet-thread__prompt"><p class="lucet-thread__text">Draft the summary section.</p></div>
        </div>
        <div class="lucet-thread__turn" data-role="assistant">
          <div class="lucet-thread__doc">
            <div class="lucet-notice" data-state="degraded" data-tone="info" role="status">
              ${icon(DEGRADED, 21)}
              <p class="lucet-notice__body"><strong class="lucet-notice__label">Using Fast instead of Auto.</strong><span class="lucet-notice__text">Auto is temporarily unavailable — review numerical details before using this result.</span></p>
              <div class="lucet-notice__actions"><button type="button" class="lucet-button" data-variant="ghost">Retry on Auto</button></div>
            </div>
            <div class="lucet-md"><p class="lucet-md__p">Here is a draft of the summary section. The two figures it quotes — the total and the delivery date — are carried over from the notes as written.</p></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <form class="lucet-prompt">
    <textarea class="lucet-prompt__field" rows="1" placeholder="Ask anything"></textarea>
    <div class="lucet-prompt__bar">
      <button type="button" class="lucet-prompt__tool" aria-label="Attach a file"><svg viewBox="0 0 24 24" aria-hidden><path d="M21 12.5l-8.2 8.2a5.5 5.5 0 0 1-7.8-7.8L13.5 4.4a3.67 3.67 0 0 1 5.2 5.2L10.5 17.8a1.83 1.83 0 0 1-2.6-2.6l7.8-7.8"/></svg></button>
      <span class="lucet-prompt__actions"><button type="submit" class="lucet-button" data-variant="primary" data-icon="true" aria-label="Send"><svg viewBox="0 0 24 24" aria-hidden><path d="M12 19V5M6 11l6-6 6 6"/></svg></button></span>
    </div>
  </form>
</div>`

const out = process.argv[2]
if (!out) { console.error('usage: node scripts/make-og.mjs <out.png>'); process.exit(2) }
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 })
await p.setContent(html, { waitUntil: 'networkidle' })
await p.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'dark')
  document.documentElement.setAttribute('data-expression', 'glass')
  document.documentElement.setAttribute('data-typeface', 'inter')
})
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(600)
await p.screenshot({ path: out })
await b.close()
console.log('card written:', out)
