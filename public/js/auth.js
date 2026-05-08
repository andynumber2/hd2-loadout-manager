import { api } from './api.js';

const loginForm    = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const errorEl      = document.getElementById('error-msg');
const tabs         = document.querySelectorAll('.auth-tab');

async function checkAuth() {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (res.ok) window.location.href = '/loadouts.html';
}

function switchTab(tab) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  loginForm.style.display    = tab === 'login'    ? 'flex' : 'none';
  registerForm.style.display = tab === 'register' ? 'flex' : 'none';
  errorEl.textContent = '';
}

tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const res  = await api.post('/auth/login', { username, password });
  const data = await res.json();
  if (!res.ok) { errorEl.textContent = data.error; return; }
  window.location.href = '/loadouts.html';
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const res  = await api.post('/auth/register', { username, password });
  const data = await res.json();
  if (!res.ok) { errorEl.textContent = data.error; return; }
  window.location.href = '/loadouts.html';
});

switchTab('login');
checkAuth();
