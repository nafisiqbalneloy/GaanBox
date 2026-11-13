// Runs in <head> before first paint so the saved theme is applied without a flash.
// Kept as an external file because the Content-Security-Policy blocks inline scripts.
try {
  var saved = localStorage.getItem('gaanbox-theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch (e) { /* storage unavailable */ }
