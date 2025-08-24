import { appState, elements, CONSTANTS, showError, showModal } from './core.js';
import { updateFloatingBar } from './ui.js';

let refreshAllCallback = null;
export function registerRefreshCallback(fn) {
  refreshAllCallback = fn;
}

export function renderPaginatedKeys(listType) {
  const tbody = listType === CONSTANTS.LIST_TYPES.VALID ? elements.validKeysTbody : elements.invalidKeysTbody;
  const keys = appState.allKeys.filter((k) => k.is_valid === (listType === CONSTANTS.LIST_TYPES.VALID));
  const { currentPage, pageSize } = appState.pagination[listType];
  tbody.innerHTML = '';
  const totalKeys = keys.length;
  const totalPages = Math.ceil(totalKeys / pageSize) || 1;
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const paginatedKeys = keys.slice(start, end);

  const titleElement = document.getElementById(`${listType}-keys-title`);
  if (titleElement) {
    const titleText = listType === CONSTANTS.LIST_TYPES.VALID ? '有效密钥列表' : '无效密钥列表';
    titleElement.textContent = `${titleText} (${totalKeys})`;
  }

  if (paginatedKeys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3">暂无${listType === CONSTANTS.LIST_TYPES.VALID ? '有效' : '无效'}密钥</td></tr>`;
  } else {
    paginatedKeys.forEach((key) => renderKeyRow(key, tbody));
  }
  renderPaginationControls(listType, totalPages);
}

function renderKeyRow(key, tbody) {
  const row = document.createElement('tr');
  const chipClass = key.failure_count > 0 ? 'failure-chip' : 'failure-chip zero';
  const statusChipClass = key.is_valid ? 'status-chip valid' : 'status-chip invalid';
  const statusText = key.is_valid ? '有效' : '无效';
  row.innerHTML = `
    <td><input type="checkbox" data-id="${key.id}"></td>
    <td><span class="key-partial">${key.key_partial}</span></td>
    <td class="actions">
      <span class="${statusChipClass}">${statusText}</span>
      <span class="${chipClass}">失败: ${key.failure_count}</span>
      <button class="text-button" data-action="${CONSTANTS.ACTIONS.DETAILS}" data-id="${key.id}" data-key-partial="${key.key_partial}">详情</button>
    </td>`;
  tbody.appendChild(row);
}

function renderPaginationControls(listType, totalPages) {
  const container = document.getElementById(`${listType}-keys-pagination`);
  const { currentPage } = appState.pagination[listType];
  container.innerHTML = '';
  if (totalPages <= 1) return;
  let buttons = '';
  if (currentPage > 1) {
    buttons += `<button data-action="${CONSTANTS.ACTIONS.PREV_PAGE}" data-list="${listType}">上一页</button>`;
  }
  buttons += `<span>第 ${currentPage} / ${totalPages} 页</span>`;
  if (currentPage < totalPages) {
    buttons += `<button data-action="${CONSTANTS.ACTIONS.NEXT_PAGE}" data-list="${listType}">下一页</button>`;
  }
  container.innerHTML = buttons;
}

export async function handleKeyAction(e) {
  const target = e.target.closest('button');
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) return;
  if (action === CONSTANTS.ACTIONS.DETAILS) {
    await showDetailsModal(id, target.dataset.keyPartial);
  }
}

export async function showDetailsModal(keyId, keyPartial) {
  const modalLoading = elements.modalContent.querySelector('.modal-loading');
  const modalDataDisplay = elements.modalContent.querySelector('#modal-data-display');
  elements.modalKeyPartial.textContent = keyPartial;
  if (modalLoading && modalDataDisplay) {
    modalLoading.style.display = 'flex';
    modalDataDisplay.style.display = 'none';
  }
  elements.detailsModal.showModal();

  const fetchPromise = fetch(`/admin/keys/${keyId}/details`);
  const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 500));
  try {
    const [response] = await Promise.all([fetchPromise, timeoutPromise]);
    if (!response.ok) throw new Error('获取详情失败');
    const details = await response.json();
    let contentHtml;
    if (details.length === 0) {
      contentHtml = '<p>最近24小时内无调用记录</p>';
    } else {
      let tableHtml = '<table class="details-table"><thead><tr><th>模型名称</th><th>调用次数</th></tr></thead><tbody>';
      details.forEach((d) => {
        tableHtml += `
          <tr>
            <td>${d.model_name}</td>
            <td>${d.total_calls_24h}</td>
          </tr>`;
      });
      tableHtml += '</tbody></table>';
      contentHtml = tableHtml;
    }
    if (modalDataDisplay) {
      modalDataDisplay.innerHTML = contentHtml;
    }
  } catch (err) {
    if (modalDataDisplay) {
      modalDataDisplay.innerHTML = `<p style="color: var(--pico-color-red-500);">${err.message}</p>`;
    }
  } finally {
    if (modalLoading && modalDataDisplay) {
      modalLoading.style.display = 'none';
      modalDataDisplay.style.display = 'block';
    }
  }
}

function performStreamingValidation(keyIds) {
  const validationModal = elements.validationModal;
  const progressText = validationModal.querySelector('#validation-progress-text');
  const progressBar = validationModal.querySelector('#validation-progress-bar');

  // 重置并显示模态窗
  progressText.textContent = '正在准备验证...';
  progressBar.style.width = '0%';
  validationModal.showModal();

  const url = `/admin/keys/batch-validate-stream?key_ids=${keyIds.join(',')}`;
  const evtSource = new EventSource(url);

  evtSource.onmessage = function(event) {
    const data = JSON.parse(event.data);

    if (data.status === 'done') {
      evtSource.close(); // 立即关闭连接，防止 onerror 触发
      progressText.textContent = data.message;
      progressBar.style.width = '100%';
      setTimeout(() => {
        validationModal.close();
        if (refreshAllCallback) refreshAllCallback();
      }, 1500); // 延迟关闭模态窗，让用户看到完成状态
    } else if (data.status === 'error') {
      showError(`验证失败: ${data.message}`);
      evtSource.close();
      validationModal.close();
    } else {
      // 更新进度
      progressText.textContent = `正在验证... (${data.processed}/${data.total})`;
      progressBar.style.width = `${data.percent}%`;
    }
  };

  evtSource.onerror = function(err) {
    showError('与服务器的连接丢失，验证中断。');
    console.error("EventSource failed:", err);
    evtSource.close();
    validationModal.close();
  };
}

export async function handleValidateAllList(listType) {
  const keysToValidate = appState.allKeys.filter((k) => k.is_valid === (listType === CONSTANTS.LIST_TYPES.VALID));
  const keyIds = keysToValidate.map((k) => k.id);
  if (keyIds.length === 0) {
    showError('列表中没有需要验证的密钥。');
    return;
  }
  showModal({
    title: '确认验证',
    body: `验证当前列表中的全部 ${keyIds.length} 个密钥`,
    confirmText: '验证',
    cancelText: '取消',
    onConfirm: () => {
      performStreamingValidation(keyIds);
    },
  });
}

export async function handleFloatingBarAction(e) {
  const target = e.target.closest('button');
  if (!target) return;
  const action = target.dataset.action;
  if (!action) return;
  const selectedIds = Array.from(document.querySelectorAll('#main-content input[type="checkbox"][data-id]:checked')).map((cb) => parseInt(cb.dataset.id));
  if (selectedIds.length === 0) {
    showError('请至少选择一个密钥。');
    return;
  }
  const performAction = async (url, body) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      let errorDetail = `批量操作失败 (状态: ${res.status})`;
      try {
        const errorData = await res.json();
        if (errorData.detail) errorDetail = errorData.detail;
      } catch (jsonError) {}
      throw new Error(errorDetail);
    }
    return res;
  };

  const unselectAll = () => {
    document.querySelectorAll(`input[data-action="${CONSTANTS.ACTIONS.SELECT_ALL}"]`).forEach((cb) => (cb.checked = false));
    document.querySelectorAll('#main-content input[type="checkbox"][data-id]:checked').forEach((cb) => (cb.checked = false));
    updateFloatingBar();
  };

  if (action === CONSTANTS.ACTIONS.BATCH_DELETE) {
    showModal({
      title: '确认删除',
      body: `确定删除选中的 ${selectedIds.length} 个密钥吗？`,
      confirmText: '删除',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          const response = await performAction('/admin/keys/batch-delete', { key_ids: selectedIds });
          const result = await response.json();
          showModal({ title: '操作成功', body: `成功删除了 ${result.deleted_count || selectedIds.length} 个密钥。`, confirmText: '好的' });
          if (refreshAllCallback) refreshAllCallback();
          unselectAll();
        } catch (err) {
          showModal({ title: '操作失败', body: '删除密钥时发生错误，请稍后重试。', confirmText: '关闭' });
        }
      },
    });
  } else if (action === CONSTANTS.ACTIONS.BATCH_RESET) {
    showModal({
      title: '确认重置',
      body: `确定重置选中的 ${selectedIds.length} 个密钥吗？`,
      confirmText: '重置',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          await performAction('/admin/keys/batch-reset', { key_ids: selectedIds });
          if (refreshAllCallback) refreshAllCallback();
          unselectAll();
        } catch (err) {
          showError(err.message);
        }
      },
    });
  } else if (action === CONSTANTS.ACTIONS.BATCH_VALIDATE) {
    performStreamingValidation(selectedIds);
    unselectAll();
  } else if (action === CONSTANTS.ACTIONS.BATCH_COPY) {
    try {
      const revealResponse = await fetch('/admin/keys/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key_ids: selectedIds }) });
      if (!revealResponse.ok) throw new Error('获取完整密钥失败');
      const revealData = await revealResponse.json();
      const keysToCopy = Object.values(revealData.revealed_keys).join('\n');
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(keysToCopy);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = keysToCopy;
        textArea.style.position = 'absolute';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      showModal({ title: '复制成功', body: `已复制 ${selectedIds.length} 个密钥到剪贴板。`, confirmText: '好的' });
      unselectAll();
    } catch (err) {
      showError('复制失败，请检查浏览器权限或手动复制。');
    }
  }
}

export function handlePaginationClick(e) {
  const target = e.target.closest('button');
  if (!target) return;
  const action = target.dataset.action;
  const listType = target.dataset.list;
  if (action === CONSTANTS.ACTIONS.PREV_PAGE) {
    if (appState.pagination[listType].currentPage > 1) {
      appState.pagination[listType].currentPage--;
      renderPaginatedKeys(listType);
    }
  } else if (action === CONSTANTS.ACTIONS.NEXT_PAGE) {
    appState.pagination[listType].currentPage++;
    renderPaginatedKeys(listType);
  }
}


