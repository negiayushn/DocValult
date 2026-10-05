// Applies the saved theme before first paint to avoid a light/dark flash. Kept as a file (not inline) so the CSP can forbid inline scripts.
(function () {
  try {
    var t = localStorage.getItem('vault.theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
