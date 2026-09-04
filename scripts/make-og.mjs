/*
 * The share card (og.png), built from the library's OWN tokens and the site's
 * own faces — not a drawing of them. Re-run it when the tokens move or the
 * pitch changes; a card that drifts from the product is worse than none.
 *
 *   node scripts/make-og.mjs apps/docs/public/og.png
 *
 * 1200x630 at 2x. Dark, and Glass rather than Paper: the card is read at
 * thumbnail size in a feed, where the raised material's edge survives the
 * scale and Paper's value step does not. The rail is the site's real state
 * list, in the site's real words — it is the pitch, and it is the one part
 * that stays legible when a client renders the card at 320px.
 *
 * Replacing this file does not refresh what Slack, X and LinkedIn already
 * cached; their own debuggers do.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const ROOT = process.cwd()
const S = `${ROOT}/packages/core/styles`
const entry = readFileSync(`${S}/index.css`, 'utf8')
const tokens = [...entry.matchAll(/@import '\.\/([^']+)'/g)]
  .map((m) => readFileSync(`${S}/${m[1]}`, 'utf8')).join('\n')
const mark = readFileSync(`${ROOT}/apps/docs/public/favicon.svg`, 'utf8').replace(/<\?xml.*?\?>/, '')

const RAIL = [
  ['Boundaries', ['Refusal', 'Low confidence']],
  ['Failures', ['Stream interrupted', 'Rate limited']],
  ['Service', ['Fallback model used', 'Provider outage']],
  ['Cost', ['Budget caution', 'Budget spent']],
  ['Freshness', ['Stale result']],
  ['Sources', ['Cited response']],
]

const html = `<!doctype html><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@500;600&family=Inter:wght@400;450;500;600&display=swap" rel="stylesheet">
<style>
${tokens}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{
  background:var(--lucet-background);
  color:var(--lucet-foreground);
  font-family:Inter,ui-sans-serif,system-ui,sans-serif;
  display:grid;grid-template-columns:1fr 392px;
  align-items:stretch;
}
.left{padding:64px 40px 64px 64px;display:flex;flex-direction:column}
/* Brand at the top, meta at the foot, and the argument optically centred
   between them: the panel holds the full height on the right, so a
   top-weighted left column left the middle of the card empty. */
.mid{flex:1;display:flex;flex-direction:column;justify-content:center;padding-block:8px}
.brand{display:flex;align-items:center;gap:13px}
.brand svg{width:40px;height:40px;border-radius:11px;display:block}
.brand b{font:600 27px/1 'Instrument Sans',Inter,sans-serif;letter-spacing:-0.018em}
h1{
  font:600 51px/1.08 'Instrument Sans',Inter,sans-serif;
  letter-spacing:-0.033em;max-width:11.5ch;margin:0;
}
h1 em{font-style:normal;color:var(--lucet-muted-foreground)}
.sub{margin-top:21px;font-size:19.5px;line-height:1.45;color:var(--lucet-subtle-foreground);max-width:33ch}
.cmd{margin-top:28px;display:inline-block;padding:9px 13px;border-radius:9px;
  background:var(--lucet-subtle);box-shadow:var(--lucet-hairline);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;color:var(--lucet-foreground)}

.foot{display:flex;align-items:center;gap:14px;font-size:15px;color:var(--lucet-muted-foreground)}
.foot b{color:var(--lucet-foreground);font-weight:500}
.dot{width:3px;height:3px;border-radius:50%;background:currentColor;opacity:.55}
/* The rail: the site's own panel grammar, bleeding off the bottom edge so
   the list reads as longer than the card. */
.rail{
  margin:64px 44px 0 0;padding:26px 26px 0 26px;
  background:var(--lucet-card);
  box-shadow:var(--lucet-hairline-raised);
  border-radius:18px 18px 0 0;
  overflow:hidden;
  -webkit-mask-image:linear-gradient(to bottom,#000 78%,transparent 100%);
          mask-image:linear-gradient(to bottom,#000 78%,transparent 100%);
}
.grp{font:600 11px/1 Inter,sans-serif;letter-spacing:.085em;text-transform:uppercase;color:var(--lucet-muted-foreground);margin:22px 0 11px}
.grp:first-child{margin-top:0}
.row{display:flex;align-items:center;gap:10px;font-size:16.5px;line-height:1.5;color:var(--lucet-foreground);padding:3px 0}
.row svg{width:15px;height:15px;flex:none;color:var(--lucet-muted-foreground)}
</style>
<div class="left">
  <div class="brand">${mark}<b>Lucet</b></div>
  <div class="mid">
    <h1>Every state a real AI feature hits.</h1>
    <p class="sub">Open-source AI interface components — with a written rationale for every state.</p>
    <div><span class="cmd">npm install lucet-core lucet-react</span></div>
  </div>
  <div class="foot"><b>lucet.design</b><span class="dot"></span><span>React · MIT</span></div>
</div>
<div class="rail">
${RAIL.map(([g, rows]) => `<div class="grp">${g}</div>` + rows.map((r) => `<div class="row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M10.2 8.6l5.2 3.4-5.2 3.4z" fill="currentColor" stroke="none"/></svg>${r}</div>`).join('')).join('')}
</div>`

const out = process.argv[2]
if (!out) { console.error('usage: node scripts/make-og.mjs <out.png>'); process.exit(2) }
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 })
await p.setContent(html, { waitUntil: 'networkidle' })
await p.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'dark')
  /* Glass, because the card is seen at thumbnail size: the raised material
     gives the rail an edge that survives the scale, where Paper's step is a
     value difference that does not. Both are the library's own. */
  document.documentElement.setAttribute('data-expression', 'glass')
})
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(600)
await p.screenshot({ path: out })
await b.close()
console.log('card written:', out)
