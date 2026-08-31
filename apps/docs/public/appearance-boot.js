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
  if (a.expression === 'expressive') root.setAttribute('data-expression', a.expression)
  if (a.radius && a.radius !== 'default') root.setAttribute('data-radius', a.radius)
  root.setAttribute('data-scale', a.scale || '100')
  root.setAttribute('data-typeface', a.typeface || 'inter')
})()
