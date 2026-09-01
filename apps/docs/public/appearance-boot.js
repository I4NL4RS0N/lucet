// Before first paint, on all three pages: the STORED appearance wins; the
// data-accent on the loading <script> tag is only that page's resting
// fallback — violet on the site, monochrome in the labs, where primitives
// are judged without accent seduction. One copy on purpose: a shell can
// differ in its fallback, never in which attributes get written, so the
// pages cannot drift the way hand-synced inline copies would.
;(function () {
  var a
  try { a = JSON.parse(localStorage.getItem('lucet-docs-appearance') || '{}') } catch (e) { a = {} }
  var root = document.documentElement
  var accent = (document.currentScript && document.currentScript.getAttribute('data-accent')) || 'violet'
  root.setAttribute('data-theme', a.theme || 'dark')
  root.setAttribute('data-accent', a.accent || accent)
  root.setAttribute('data-neutral', a.neutral || 'accent')
  // Material axis (renamed 2026-09-01): legacy stored values map across.
  var expr = a.expression === 'expressive' ? 'glass' : a.expression === 'system' ? 'paper' : a.expression
  if (expr === 'glass') root.setAttribute('data-expression', expr)
  if (a.radius && a.radius !== 'default') root.setAttribute('data-radius', a.radius)
  root.setAttribute('data-scale', a.scale || '100')
  root.setAttribute('data-typeface', a.typeface || 'inter')

  // The browser chrome follows the page ground. The mapping lives HERE,
  // once; the runtime theme toggle calls this same function, so the boot
  // colour and the toggle colour cannot drift. Pages without the meta
  // (the labs) skip it harmlessly.
  var THEME_BG = { dark: '#111013', light: '#ffffff' }
  window.lucetThemeColor = function (theme) {
    var meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) return
    var resolved =
      theme === 'dark' || theme === 'light'
        ? theme
        : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
    meta.setAttribute('content', THEME_BG[resolved])
  }
  window.lucetThemeColor(a.theme || 'dark')
})()
