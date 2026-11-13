// Light/dark theme toggle. Honors a saved choice, else the system preference.
(function () {
  var KEY = 'gaanbox-theme';
  var root = document.documentElement;
  var btn = document.getElementById('theme-toggle');
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function current() {
    return root.dataset.theme || (mq && mq.matches ? 'light' : 'dark');
  }

  function render() {
    var theme = current();
    var next = theme === 'light' ? 'dark' : 'light';
    btn.textContent = theme === 'light' ? '🌙' : '☀️';
    btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    btn.title = 'Switch to ' + next + ' theme';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f7fc' : '#0b1220');
  }

  btn.addEventListener('click', function () {
    var next = current() === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch (e) { /* storage unavailable */ }
    render();
  });

  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function () { if (!root.dataset.theme) render(); });
  }
  render();
})();
