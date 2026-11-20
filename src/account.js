import { el } from './helpers.js';
import { showToast } from './toast.js';

/* Account UI: sign up / log in / log out against /api/auth (HttpOnly cookie session). */
/** `onChange(user)` runs after the signed-in user changes (user is null when logged out). */
export function initAccount({ onChange } = {}) {
  const $ = id => document.getElementById(id);
  let user = null;
  let mode = 'login'; // or 'signup'

  async function call(path, options = {}) {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  }

  function renderBar() {
    const bar = $('account-bar');
    if (!bar) return;
    if (user) {
      bar.replaceChildren(
        el('span', { class: 'account-name', text: `👤 ${user.username}` }),
        el('button', { type: 'button', class: 'secondary small', text: 'Log out', onclick: logout }),
      );
    } else {
      bar.replaceChildren(el('button', {
        type: 'button', class: 'secondary small', text: 'Log in / Sign up', onclick: () => open('login'),
      }));
    }
  }

  function setUser(next) {
    user = next;
    renderBar();
    if (onChange) onChange(user);
  }

  function setMode(next) {
    mode = next;
    const signup = mode === 'signup';
    $('auth-title').textContent = signup ? 'Create your account' : 'Welcome back';
    $('auth-submit').textContent = signup ? 'Sign up' : 'Log in';
    $('auth-switch').textContent = signup ? 'I already have an account' : 'Create an account';
    $('auth-password').autocomplete = signup ? 'new-password' : 'current-password';
    $('auth-hint').textContent = signup ? 'Username: 3–24 letters, numbers or underscores. Password: at least 8 characters.' : '';
    $('auth-error').textContent = '';
  }

  function open(startMode) {
    setMode(startMode);
    $('auth-form').reset();
    const dialog = $('auth-dialog');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    $('auth-username').focus();
  }

  function close() {
    const dialog = $('auth-dialog');
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
  }

  async function submit(event) {
    event.preventDefault();
    const username = $('auth-username').value.trim();
    const password = $('auth-password').value;
    if (!username || !password) { $('auth-error').textContent = 'Enter a username and password.'; return; }
    $('auth-submit').disabled = true;
    try {
      const data = await call(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify({ username, password }) });
      close();
      setUser(data.user);
      showToast(mode === 'signup' ? `Welcome to GaanBox, ${data.user.username} 💙` : `Logged in as ${data.user.username}`);
    } catch (err) {
      $('auth-error').textContent = location.protocol === 'file:'
        ? 'Accounts need the GaanBox server. Run "npm start".' : err.message;
    } finally {
      $('auth-submit').disabled = false;
    }
  }

  async function logout() {
    try { await call('/api/auth/logout', { method: 'POST' }); } catch (_) { /* cookie may already be gone */ }
    setUser(null);
    showToast('Logged out.');
  }

  async function restore() {
    if (location.protocol === 'file:') return;
    try { setUser((await call('/api/auth/me')).user); } catch (_) { /* not signed in, or server offline */ }
  }

  $('auth-form').addEventListener('submit', submit);
  $('auth-switch').addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
  $('auth-cancel').addEventListener('click', close);
  renderBar();
  restore();

  return { get user() { return user; } };
}
