import { appState, elements } from './core.js';
import { fetchData, updateDashboardStats } from './dashboard.js';
import { initializeActiveTab } from './layout.js';

export async function logout() {
  try {
    await fetch('/logout', { method: 'POST' });
  } catch (_) {
  } finally {
    appState.isLoggedIn = false;
    checkAuth();
  }
}

export async function checkAuth() {
  try {
    const response = await fetch('/admin/dashboard-data');
    if (response.ok) {
      if (!appState.isLoggedIn) {
        appState.isLoggedIn = true;
        elements.loginView.classList.add('hidden');
        elements.mainContent.style.display = 'block';
        const data = await response.json();
        updateDashboardStats(data.stats);

        appState.allKeys = data.keys;
        await fetchData();
        initializeActiveTab();
      }
    } else {
      throw new Error('Session invalid');
    }
  } catch (_) {
    appState.isLoggedIn = false;
    elements.loginView.classList.remove('hidden');
    elements.mainContent.style.display = 'none';
  } finally {
    document.body.classList.add('loaded');
  }
}

export async function handleAuth(e) {
  e.preventDefault();
  const loginButton = document.getElementById('login-button');
  const loginError = document.getElementById('login-error');
  const inputKey = elements.adminKeyInput.value.trim();
  if (!inputKey) return;
  loginButton.setAttribute('aria-busy', 'true');
  loginError.style.display = 'none';
  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_key: inputKey }),
    });
    const result = await response.json();
    if (response.ok && result.success) {
      elements.adminKeyInput.value = '';
      await checkAuth();
    } else {
      throw new Error(result.error?.message || '管理员密钥无效或服务器错误。');
    }
  } catch (err) {
    loginError.textContent = err.message;
    loginError.style.display = 'block';
  } finally {
    loginButton.setAttribute('aria-busy', 'false');
  }
}


