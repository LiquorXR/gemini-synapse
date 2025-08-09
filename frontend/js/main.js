import { CONSTANTS, appState, elements, showError, clickOutsideToClose, showModal } from './core.js';
import { setupTabs, setupSwipeNavigation, initializeActiveTab, setupThemeToggle } from './layout.js';
import { fetchAndRenderTrendChart } from './charts.js';
import { handleAddAccessKey, fetchApiConfig, setupApiConfigFormListener, setupSchedulerForm } from './settings.js';
import { fetchData, fetchErrorLogs, clearAllErrorLogs, bindErrorLogsPagination } from './dashboard.js';
import { logout, checkAuth, handleAuth } from './auth.js';
import { updateFloatingBar, setupInputButtonStates, handleSelectAll } from './ui.js';
import { handleKeyAction, handleValidateAllList, handleFloatingBarAction, handlePaginationClick, renderPaginatedKeys, registerRefreshCallback } from './keys.js';

document.addEventListener('DOMContentLoaded', () => {
  // Register cross-module refresh callback for batch operations
  registerRefreshCallback(() => {
    fetchData();
    updateFloatingBar();
  });

  // Events
  elements.authForm.addEventListener('submit', handleAuth);
  elements.addKeyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawKeys = elements.newKeyInput.value.trim();
    if (!rawKeys) return;
    const initialKeys = rawKeys.split(/[\n,]+/).map((k) => k.trim()).filter(Boolean);
    if (initialKeys.length === 0) {
      showError('请输入有效的密钥。');
      return;
    }
    const uniqueKeys = [...new Set(initialKeys)];
    const duplicateCount = initialKeys.length - uniqueKeys.length;
    if (duplicateCount > 0) {
      showModal({ title: '提示', body: `已自动过滤 ${duplicateCount} 个重复输入的密钥。`, confirmText: '好的' });
    }
    if (uniqueKeys.length === 0) {
      elements.newKeyInput.value = '';
      return;
    }
    const submitButton = elements.addKeyForm.querySelector('button[type="submit"]');
    showModal({
      title: '确认添加',
      body: `确定要添加 ${uniqueKeys.length} 个密钥吗？`,
      confirmText: '添加',
      cancelText: '取消',
      onConfirm: async () => {
        submitButton.setAttribute('aria-busy', 'true');
        try {
          const response = await fetch('/admin/keys/batch-add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys: uniqueKeys }),
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.detail || `添加密钥失败 (状态: ${response.status})`);
          }
          const result = await response.json();
          showModal({ title: '操作成功', body: `成功添加了 ${result.added_count || 0} 个密钥。`, confirmText: '好的' });
          elements.newKeyInput.value = '';
          fetchData();
        } catch (err) {
          showModal({ title: '操作失败', body: '添加密钥时发生错误，请检查密钥格式或稍后重试。', confirmText: '关闭' });
        } finally {
          submitButton.setAttribute('aria-busy', 'false');
          elements.newKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      },
    });
  });

  document.getElementById('batch-delete-keys-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    const rawKeys = elements.newKeyInput.value.trim();
    if (!rawKeys) {
      showError('请输入要删除的密钥。');
      return;
    }
    const keysToDelete = [...new Set(rawKeys.split(/[\n,]+/).map((k) => k.trim()).filter(Boolean))];
    if (keysToDelete.length === 0) {
      showError('请输入有效的密钥。');
      return;
    }
    showModal({
      title: '确认删除',
      body: `确定要删除输入的 ${keysToDelete.length} 个密钥吗？此操作不可逆。`,
      confirmText: '删除',
      cancelText: '取消',
      onConfirm: async () => {
        const deleteButton = document.getElementById('batch-delete-keys-btn');
        deleteButton.setAttribute('aria-busy', 'true');
        try {
          const response = await fetch('/admin/keys/batch-delete-by-value', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys: keysToDelete }),
          });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `删除密钥失败 (状态: ${response.status})`);
          }
          const result = await response.json();
          const message = result.deleted_count > 0 ? `成功删除了 ${result.deleted_count} 个密钥。` : '没有找到匹配的密钥可删除。';
          showModal({ title: '操作成功', body: message, confirmText: '好的' });
          elements.newKeyInput.value = '';
          fetchData();
        } catch (_) {
          showModal({ title: '操作失败', body: '删除密钥时发生错误，请稍后重试。', confirmText: '关闭' });
        } finally {
          deleteButton.setAttribute('aria-busy', 'false');
          elements.newKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      },
    });
  });

  elements.addAccessKeyForm.addEventListener('submit', handleAddAccessKey);

  elements.adminKeyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newKey = elements.adminKeyInputConfig.value.trim();
    if (!newKey) {
      showError('请输入新的管理员密钥。');
      return;
    }
    const submitButton = elements.adminKeyForm.querySelector('button[type="submit"]');
    showModal({
      title: '确认更新',
      body: '确定要更新管理员密钥吗？您需要使用新密钥重新登录。',
      confirmText: '更新',
      cancelText: '取消',
      onConfirm: async () => {
        submitButton.setAttribute('aria-busy', 'true');
        try {
          const response = await fetch('/admin/config/admin_key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: newKey }),
          });
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || '更新管理员密钥失败');
          }
          elements.adminKeyInputConfig.value = '';
          await logout();
        } catch (err) {
          showError(err.message);
        } finally {
          submitButton.setAttribute('aria-busy', 'false');
          elements.adminKeyInputConfig.dispatchEvent(new Event('input', { bubbles: true }));
        }
      },
    });
  });

  elements.validKeysTbody.addEventListener('click', handleKeyAction);
  elements.invalidKeysTbody.addEventListener('click', handleKeyAction);

  document.getElementById('main-content').addEventListener('change', (e) => {
    if (e.target.matches('input[type="checkbox"]')) updateFloatingBar();
    if (e.target.matches('.page-size-selector')) {
      const listType = e.target.dataset.list;
      appState.pagination[listType].pageSize = parseInt(e.target.value);
      appState.pagination[listType].currentPage = 1;
      renderPaginatedKeys(listType);
      const selectAllCheckbox = document.querySelector(`input[data-action="${CONSTANTS.ACTIONS.SELECT_ALL}"][data-list="${listType}"]`);
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      updateFloatingBar();
    }
  });
  elements.floatingBar.addEventListener('click', handleFloatingBarAction);
  document.getElementById('main-content').addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action="validate-all-list"]');
    if (!button) return;
    const listType = button.dataset.list;
    if (!listType) return;
    await handleValidateAllList(listType);
  });
  document.querySelectorAll(`input[data-action="${CONSTANTS.ACTIONS.SELECT_ALL}"]`).forEach((cb) => cb.addEventListener('change', handleSelectAll));
  document.getElementById('valid-keys-pagination').addEventListener('click', handlePaginationClick);
  document.getElementById('invalid-keys-pagination').addEventListener('click', handlePaginationClick);
  bindErrorLogsPagination();
  document.getElementById('clear-logs-btn').addEventListener('click', clearAllErrorLogs);

  // Tabs and gestures
  setupTabs();
  setupSwipeNavigation();

  // Modal outside click handling
  clickOutsideToClose(elements.detailsModal);

  // Chart range selector
  document.querySelector('.chart-time-range-selector').addEventListener('click', async (e) => {
    if (e.target.tagName !== 'A') return;
    e.preventDefault();
    const links = document.querySelectorAll('.chart-time-range-selector a');
    links.forEach((link) => link.classList.remove('active'));
    e.target.classList.add('active');
    const range = e.target.dataset.range;
    await fetchAndRenderTrendChart(range);
  });

  // Setup helpers
  setupInputButtonStates();
  setupApiConfigFormListener();
  setupThemeToggle();

  // Auth and initial data
  checkAuth();
});


