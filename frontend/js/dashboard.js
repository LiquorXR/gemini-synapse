import { appState, elements, showError, formatTimestamp } from './core.js';
import { renderAccessKeys } from './settings.js';
import { renderPaginatedKeys } from './keys.js';
import { setupSchedulerForm } from './settings.js';
import { fetchAndRenderTrendChart } from './charts.js';

export function updateDashboardStats(stats) {
 document.getElementById('total-keys').textContent = stats.key_stats.total_keys;
 document.getElementById('valid-keys').textContent = stats.key_stats.valid_keys;
 document.getElementById('invalid-keys').textContent = stats.key_stats.invalid_keys;
 document.getElementById('calls-1m').textContent = stats.call_stats.last_minute;
 document.getElementById('calls-1h').textContent = stats.call_stats.last_hour;
 document.getElementById('calls-24h').textContent = stats.call_stats.last_24_hours;
 document.getElementById('key-total-count').textContent = `总计: ${stats.key_stats.total_keys}`;
 document.getElementById('api-total-count').textContent = `本月: ${stats.call_stats.this_month}`;
}
export async function fetchData() {
  try {
    const response = await fetch('/admin/dashboard-data');
    if (response.status === 401) {
      appState.isLoggedIn = false;
      return { ok: false, status: 401 };
    }
    if (!response.ok) throw new Error(`获取仪表盘数据失败 (状态: ${response.status})`);
    const data = await response.json();

    updateDashboardStats(data.stats);

    appState.allKeys = data.keys;
    renderPaginatedKeys('valid');
    renderPaginatedKeys('invalid');

    renderAccessKeys(data.access_keys);

    const errorData = data.error_logs;
    const errorTbody = document.getElementById('error-logs-tbody');
    appState.pagination.error_logs.currentPage = errorData.current_page;
    if (errorData.logs.length === 0) {
      errorTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">暂无错误日志</td></tr>';
    } else {
      errorTbody.innerHTML = '';
      errorData.logs.forEach((log) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${log.key_partial}</td>
          <td>${log.model_name || 'N/A'}</td>
          <td>${log.identification_code !== null ? log.identification_code : 'N/A'}</td>
          <td>${formatTimestamp(log.timestamp)}</td>`;
        errorTbody.appendChild(row);
      });
    }
    renderErrorLogsPagination(errorData.total_pages);

    const { api_config } = data;
    const apiForm = document.getElementById('api-config-form');
    if (api_config.api_base_url) apiForm.api_base_url.value = api_config.api_base_url;
    if (api_config.max_failure_count) apiForm.max_failure_count.value = api_config.max_failure_count;
    if (api_config.max_retry_count) apiForm.max_retry_count.value = api_config.max_retry_count;
    appState.initialApiConfig = {
      api_base_url: apiForm.api_base_url.value,
      max_failure_count: apiForm.max_failure_count.value,
      max_retry_count: apiForm.max_retry_count.value,
    };
    apiForm.querySelector('button[type="submit"]').disabled = true;

    setupSchedulerForm(data.scheduler_config);

    elements.adminKeyInputConfig.placeholder = data.config_keys.is_admin_key_set
      ? '输入新的管理员密钥'
      : '请设置一个管理员密钥';

    fetchAndRenderTrendChart();
    return { ok: true };
  } catch (err) {
    showError(err.message);
    return { ok: false, error: err };
  }
}

// Error logs (merged from errorLogs.js)
export async function fetchErrorLogs(page = 1) {
  const tbody = document.getElementById('error-logs-tbody');
  const pageSize = appState.pagination.error_logs.pageSize;
  try {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;" aria-busy="true">加载中...</td></tr>`;
    const response = await fetch(`/admin/error-logs?page=${page}&size=${pageSize}`);
    if (!response.ok) throw new Error('获取错误日志失败');
    const data = await response.json();
    appState.pagination.error_logs.currentPage = data.current_page;
    if (data.logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">暂无错误日志</td></tr>';
    } else {
      tbody.innerHTML = '';
      data.logs.forEach((log) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${log.key_partial}</td>
          <td>${log.model_name || 'N/A'}</td>
          <td>${log.identification_code !== null ? log.identification_code : 'N/A'}</td>
          <td>${formatTimestamp(log.timestamp)}</td>`;
        tbody.appendChild(row);
      });
    }
    renderErrorLogsPagination(data.total_pages);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="color: var(--pico-color-red-500); text-align: center;">${err.message}</td></tr>`;
  }
}

export function renderErrorLogsPagination(totalPages) {
  const container = document.getElementById('error-logs-pagination');
  const currentPage = appState.pagination.error_logs.currentPage;
  container.innerHTML = '';
  if (totalPages <= 1) return;
  let buttons = '';
  if (currentPage > 1) buttons += `<button data-page="${currentPage - 1}">上一页</button>`;
  buttons += `<span>第 ${currentPage} / ${totalPages} 页</span>`;
  if (currentPage < totalPages) buttons += `<button data-page="${currentPage + 1}">下一页</button>`;
  container.innerHTML = buttons;
}

export function bindErrorLogsPagination() {
  document.getElementById('error-logs-pagination').addEventListener('click', (e) => {
    const target = e.target.closest('button');
    if (target && target.dataset.page) fetchErrorLogs(parseInt(target.dataset.page));
  });
}

export async function clearAllErrorLogs() {
  const modal = elements.genericModal;
  const modalTitle = modal.querySelector('#generic-modal-title');
  const modalBody = modal.querySelector('#generic-modal-body');
  const modalFooter = modal.querySelector('#generic-modal-footer');
  modalTitle.textContent = '确认清除';
  modalBody.textContent = '确定要清除所有错误日志吗？此操作不可逆。';
  modalFooter.innerHTML = '';
  const cancelButton = document.createElement('button');
  cancelButton.className = 'secondary';
  cancelButton.textContent = '取消';
  cancelButton.onclick = () => modal.close();
  const confirmButton = document.createElement('button');
  confirmButton.textContent = '清除';
  confirmButton.onclick = async () => {
    try {
      const response = await fetch('/admin/error-logs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
      if (!response.ok) throw new Error(`清除日志失败 (状态: ${response.status})`);
      fetchErrorLogs();
    } catch (err) {
      showError(err.message);
    } finally {
      modal.close();
    }
  };
  modalFooter.appendChild(cancelButton);
  modalFooter.appendChild(confirmButton);
  modal.showModal();
}


