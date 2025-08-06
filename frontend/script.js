function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabSlider = document.querySelector('.tab-slider');
    const viewContainer = document.getElementById('view-container');
    const tabOrder = Array.from(tabBtns).map(btn => btn.dataset.view);

    function updateSlider(activeTab) {
        if (!tabSlider || !activeTab) return;
        tabSlider.style.width = `${activeTab.offsetWidth}px`;
        tabSlider.style.transform = `translateX(${activeTab.offsetLeft}px)`;
    }

    function switchView(viewName) {
        const viewIndex = tabOrder.indexOf(viewName);
        if (viewIndex === -1) return;
        const offset = viewIndex * -100;
        viewContainer.style.transform = `translateX(${offset}%)`;
    }

    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const viewName = btn.dataset.view;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            updateSlider(btn);
            switchView(viewName);
            setTimeout(() => {
                window.scrollTo(0, 0);
            }, 300); // 延迟以匹配视图切换动画
            window.location.hash = viewName;
        });
    });

    // Recalculate slider on resize
    window.addEventListener('resize', () => {
        const activeTab = document.querySelector('.tab-btn.active');
        updateSlider(activeTab);
    });
}

function initializeActiveTab() {
    const viewName = window.location.hash.substring(1);
    let targetTab = viewName ? document.querySelector(`.tab-btn[data-view="${viewName}"]`) : document.querySelector('.tab-btn.active');

    if (!targetTab) {
        targetTab = document.querySelector('.tab-btn'); // Default to first tab
    }

    if (targetTab) {
        // Use requestAnimationFrame to ensure the click happens after the layout is painted
        requestAnimationFrame(() => {
            targetTab.click();
        });
    }
}

function setupSwipeNavigation() {
    const main = document.body;
    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0;
    let touchEndY = 0;
    let isInsideScrollable = false;
    let isInsideChart = false;

    main.addEventListener('touchstart', function(event) {
        touchStartX = event.changedTouches[0].screenX;
        touchStartY = event.changedTouches[0].screenY;
        
        let target = event.target;
        isInsideScrollable = false;
        isInsideChart = !!target.closest('#api-trend-card');

        while (target && target !== document.body) {
            const style = window.getComputedStyle(target);
            if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
                isInsideScrollable = true;
                break;
            }
            target = target.parentElement;
        }
    }, { passive: true });

    main.addEventListener('touchend', function(event) {
        touchEndX = event.changedTouches[0].screenX;
        touchEndY = event.changedTouches[0].screenY;
        handleSwipeGesture();
    }, { passive: true });

    function handleSwipeGesture() {
        if (isInsideScrollable || isInsideChart) return; // Do not switch view if swipe is inside a scrollable area or the chart

        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;

        // Only trigger horizontal swipe if it's more horizontal than vertical and exceeds a threshold
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
            const tabBtns = document.querySelectorAll('.tab-btn');
            const activeTab = document.querySelector('.tab-btn.active');
            const tabOrder = Array.from(tabBtns).map(btn => btn.dataset.view);
            const activeTabIndex = tabOrder.indexOf(activeTab.dataset.view);
            
            if (deltaX < 0) {
                // Swipe Left
                if (activeTabIndex < tabBtns.length - 1) {
                    const nextIndex = activeTabIndex + 1;
                    tabBtns[nextIndex].click();
                }
            } else {
                // Swipe Right
                if (activeTabIndex > 0) {
                    const prevIndex = activeTabIndex - 1;
                    tabBtns[prevIndex].click();
                }
            }
        }
    }
}


document.addEventListener('DOMContentLoaded', () => {
    const debug = false;
    const log = (...args) => debug && console.log('[Debug]', ...args);
    log('DOM 已加载，应用初始化...');

    const CONSTANTS = {
        ACTIONS: {
            DETAILS: 'details',
            PREV_PAGE: 'prev-page',
            NEXT_PAGE: 'next-page',
            SELECT_ALL: 'select-all',
            BATCH_VALIDATE: 'batch-validate',
            BATCH_RESET: 'batch-reset',
            BATCH_COPY: 'batch-copy',
            BATCH_DELETE: 'batch-delete',
            VALIDATE_ALL_LIST: 'validate-all-list',
        },
        LIST_TYPES: {
            VALID: 'valid',
            INVALID: 'invalid'
        }
    };

    const loginView = document.getElementById('login-view');
    const authSection = document.getElementById('auth-section');
    const mainContent = document.getElementById('main-content');
    const authForm = document.getElementById('auth-form');
    const adminKeyInput = document.getElementById('admin-key-input');
    const addKeyForm = document.getElementById('add-key-form');
    const newKeyInput = document.getElementById('new-key-input');
    const addAccessKeyForm = document.getElementById('add-access-key-form');
    const newAccessKeyInput = document.getElementById('new-access-key-input');
    const accessKeysList = document.getElementById('access-keys-list');
    const adminKeyForm = document.getElementById('admin-key-form');
    const adminKeyInputConfig = document.getElementById('admin-key-input-config');
    const validKeysTbody = document.getElementById('valid-keys-tbody');
    const invalidKeysTbody = document.getElementById('invalid-keys-tbody');
    const validKeysContainer = document.getElementById('valid-keys-container');
    const invalidKeysContainer = document.getElementById('invalid-keys-container');
    const errorMessage = document.getElementById('error-message');
    const floatingBar = document.getElementById('floating-bar');
    const selectionCountEl = floatingBar.querySelector('strong');
    const detailsModal = document.getElementById('details-modal');
    const modalKeyPartial = document.getElementById('modal-key-partial');
    const modalContent = document.getElementById('modal-content');
    const validationModal = document.getElementById('validation-modal');
    const genericModal = document.getElementById('generic-modal');

    let isLoggedIn = false;
    let allKeys = [];
    let configKeys = {};
    let initialApiConfig = {};
    let pagination = {
        valid: { currentPage: 1, pageSize: 10 },
        invalid: { currentPage: 1, pageSize: 10 },
        error_logs: { currentPage: 1, pageSize: 50 },
    };
    let apiTrendChart = null;
    let lastTrendData = null;

    function apiHeaders() { return { 'Content-Type': 'application/json' }; }
    
    function showModal({ title, body, confirmText, cancelText, onConfirm, onCancel }) {
        const modalTitle = genericModal.querySelector('#generic-modal-title');
        const modalBody = genericModal.querySelector('#generic-modal-body');
        const modalFooter = genericModal.querySelector('#generic-modal-footer');

        modalTitle.textContent = title;
        modalBody.textContent = body;
        modalFooter.innerHTML = '';

        if (cancelText) {
            const cancelButton = document.createElement('button');
            cancelButton.className = 'secondary';
            cancelButton.textContent = cancelText;
            cancelButton.onclick = () => {
                genericModal.close();
                if (onCancel) onCancel();
            };
            modalFooter.appendChild(cancelButton);
        }

        if (confirmText) {
            const confirmButton = document.createElement('button');
            confirmButton.textContent = confirmText;
            confirmButton.onclick = () => {
                genericModal.close();
                if (onConfirm) onConfirm();
            };
            modalFooter.appendChild(confirmButton);
        }
        
        genericModal.showModal();
    }

    function showError(message) {
        showModal({
            title: '提示',
            body: message,
            confirmText: '关闭'
        });
    }

    async function fetchStats() {
        log('开始获取统计数据...');
        try {
            const response = await fetch('/admin/stats');
            if (!response.ok) throw new Error('获取统计数据失败');
            const stats = await response.json();
            log('成功获取统计数据:', stats);
            document.getElementById('total-keys').textContent = stats.key_stats.total_keys;
            document.getElementById('valid-keys').textContent = stats.key_stats.valid_keys;
            document.getElementById('invalid-keys').textContent = stats.key_stats.invalid_keys;
            document.getElementById('calls-1m').textContent = stats.call_stats.last_minute;
            document.getElementById('calls-1h').textContent = stats.call_stats.last_hour;
            document.getElementById('calls-24h').textContent = stats.call_stats.last_24_hours;
            document.getElementById('key-total-count').textContent = `总计: ${stats.key_stats.total_keys}`;
            document.getElementById('api-total-count').textContent = `本月: ${stats.call_stats.this_month}`;
        } catch (err) {
            showError(err.message);
            log('获取统计数据时出错:', err);
        }
    }

    function renderAccessKeys(keys) {
        accessKeysList.innerHTML = '';
        if (keys.length === 0) {
            accessKeysList.innerHTML = '<p>暂无访问密钥。</p>';
            return;
        }
        const list = document.createElement('ul');
        list.style.listStyle = 'none';
        list.style.padding = '0';
        list.style.margin = '0';

        keys.forEach(key => {
            const item = document.createElement('li');
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.padding = '0.5rem';
            item.style.border = '1px solid var(--pico-muted-border-color)';
            item.style.borderRadius = 'var(--pico-border-radius)';
            item.style.marginBottom = '0.5rem';
            
            const keySpan = document.createElement('span');
            keySpan.textContent = key;
            keySpan.style.fontFamily = 'monospace';

            const deleteButton = document.createElement('button');
            deleteButton.textContent = '删除';
            deleteButton.className = 'secondary outline';
            deleteButton.style.marginBottom = '0';
            deleteButton.style.padding = '0.25rem 0.5rem';
            deleteButton.style.fontSize = '0.8rem';
            deleteButton.onclick = (e) => handleDeleteAccessKey(key, e.currentTarget);

            item.appendChild(keySpan);
            item.appendChild(deleteButton);
            list.appendChild(item);
        });
        accessKeysList.appendChild(list);
    }

    async function fetchAccessKeys() {
        log('开始获取访问密钥...');
        try {
            const response = await fetch('/admin/access-keys');
            if (!response.ok) throw new Error('获取访问密钥失败');
            const keys = await response.json();
            log('成功获取访问密钥:', keys);
            renderAccessKeys(keys);
        } catch (err) {
            showError(err.message);
            log('获取访问密钥时出错:', err);
            accessKeysList.innerHTML = `<p style="color: var(--pico-color-red-500);">${err.message}</p>`;
        }
    }

    async function fetchKeys() {
        log('开始获取密钥列表...');
        validKeysTbody.innerHTML = '';
        invalidKeysTbody.innerHTML = '';
        try {
            const response = await fetch('/admin/keys');
            if (response.status === 401) {
                log('身份验证失败 (401)，需要重新登录。');
                isLoggedIn = false;
                checkAuth();
                return;
            }
            if (!response.ok) throw new Error(`获取密钥失败 (状态: ${response.status})`);
            allKeys = await response.json();
            log('成功获取密钥列表:', allKeys);
            renderPaginatedKeys(CONSTANTS.LIST_TYPES.VALID);
            renderPaginatedKeys(CONSTANTS.LIST_TYPES.INVALID);
        } catch (err) {
            showError(err.message);
            log('获取密钥列表时出错:', err);
            validKeysTbody.innerHTML = `<tr><td colspan="3" style="color: var(--pico-color-red-500);">${err.message}</td></tr>`;
            invalidKeysTbody.innerHTML = `<tr><td colspan="3" style="color: var(--pico-color-red-500);">${err.message}</td></tr>`;
        } finally {
            updateFloatingBar();
        }
    }

    function renderPaginatedKeys(listType) {
        const tbody = listType === CONSTANTS.LIST_TYPES.VALID ? validKeysTbody : invalidKeysTbody;
        const keys = allKeys.filter(k => k.is_valid === (listType === CONSTANTS.LIST_TYPES.VALID));
        const { currentPage, pageSize } = pagination[listType];
        
        tbody.innerHTML = '';
        
        const totalKeys = keys.length;
        const totalPages = Math.ceil(totalKeys / pageSize);
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const paginatedKeys = keys.slice(start, end);

        // Update list title with total count
        const titleElement = document.getElementById(`${listType}-keys-title`);
        if (titleElement) {
            const titleText = listType === CONSTANTS.LIST_TYPES.VALID ? '有效密钥列表' : '无效密钥列表';
            titleElement.textContent = `${titleText} (${totalKeys})`;
        }

        if (paginatedKeys.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3">暂无${listType === CONSTANTS.LIST_TYPES.VALID ? '有效' : '无效'}密钥</td></tr>`;
        } else {
            paginatedKeys.forEach(key => renderKeyRow(key, tbody));
        }
        
        renderPaginationControls(listType, totalPages);
    }

    function renderPaginationControls(listType, totalPages) {
        const container = document.getElementById(`${listType}-keys-pagination`);
        const { currentPage } = pagination[listType];
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
            </td>
        `;
        tbody.appendChild(row);
    }

    async function handleKeyAction(e) {
        const target = e.target.closest('button');
        if (!target) return;
        const action = target.dataset.action;
        const id = target.dataset.id;
        if (!action || !id) return;
        log(`用户操作: ${action}, ID: ${id}`);
        if (action === CONSTANTS.ACTIONS.DETAILS) {
            await showDetailsModal(id, target.dataset.keyPartial);
        }
    }

    async function showDetailsModal(keyId, keyPartial) {
        const modalLoading = modalContent.querySelector('.modal-loading');
        const modalDataDisplay = modalContent.querySelector('#modal-data-display');

        modalKeyPartial.textContent = keyPartial;
        
        if (modalLoading && modalDataDisplay) {
            modalLoading.style.display = 'flex';
            modalDataDisplay.style.display = 'none';
        }
        
        detailsModal.showModal();

        const fetchPromise = fetch(`/admin/keys/${keyId}/details`);
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 500));

        try {
            const [response] = await Promise.all([fetchPromise, timeoutPromise]);

            if (!response.ok) throw new Error('获取详情失败');
            const details = await response.json();
            log('成功获取密钥详情:', details);
            
            let contentHtml;
            if (details.length === 0) {
                contentHtml = '<p>最近24小时内无调用记录</p>';
            } else {
                let tableHtml = '<table class="details-table"><thead><tr><th>模型名称</th><th>调用次数</th></tr></thead><tbody>';
                details.forEach(d => {
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
            log('获取密钥详情失败:', err);
        } finally {
            if (modalLoading && modalDataDisplay) {
                modalLoading.style.display = 'none';
                modalDataDisplay.style.display = 'block';
            }
        }
    }

    async function handleValidateAllList(listType) {
       const keysToValidate = allKeys.filter(k => k.is_valid === (listType === CONSTANTS.LIST_TYPES.VALID));
       const keyIds = keysToValidate.map(k => k.id);

       if (keyIds.length === 0) {
           showError(`列表中没有需要验证的密钥。`);
           return;
       }

       showModal({
           title: '确认验证',
           body: `验证当前列表中的全部 ${keyIds.length} 个密钥吗？`,
           confirmText: '验证',
           cancelText: '取消',
           onConfirm: async () => {
               validationModal.showModal();
               try {
                   await fetch('/admin/keys/batch-validate/', {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({ key_ids: keyIds })
                   });
                   fetchData(); // Refresh all data
               } catch (err) {
                   showError(err.message);
               } finally {
                   validationModal.close();
               }
           }
       });
   }

    async function handleFloatingBarAction(e) {
        const target = e.target.closest('button');
        if (!target) return;
        const action = target.dataset.action;
        if (!action) return;

        const selectedIds = Array.from(document.querySelectorAll('#main-content input[type="checkbox"][data-id]:checked')).map(cb => parseInt(cb.dataset.id));
        if (selectedIds.length === 0) {
            showError('请至少选择一个密钥。');
            return;
        }

        log(`浮动栏操作: ${action}, IDs: ${selectedIds}`);

        const performAction = async (url, body) => {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) {
                let errorDetail = `批量操作失败 (状态: ${res.status})`;
                try {
                    const errorData = await res.json();
                    if (errorData.detail) errorDetail = errorData.detail;
                } catch (jsonError) { /* Ignore */ }
                throw new Error(errorDetail);
            }
            return res;
        };

        const unselectAll = () => {
            document.querySelectorAll(`input[data-action="${CONSTANTS.ACTIONS.SELECT_ALL}"]`).forEach(cb => cb.checked = false);
            document.querySelectorAll('#main-content input[type="checkbox"][data-id]:checked').forEach(cb => cb.checked = false);
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
                        fetchData();
                        unselectAll();
                    } catch (err) {
                        showModal({ title: '操作失败', body: '删除密钥时发生错误，请稍后重试。', confirmText: '关闭' });
                    }
                }
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
                        fetchData();
                        unselectAll();
                    } catch (err) {
                        showError(err.message);
                    }
                }
            });
        } else if (action === CONSTANTS.ACTIONS.BATCH_VALIDATE) {
            validationModal.showModal();
            try {
                await performAction('/admin/keys/batch-validate/', { key_ids: selectedIds });
                fetchData();
                unselectAll();
            } catch (err) {
                showError(err.message);
            } finally {
                validationModal.close();
            }
        } else if (action === CONSTANTS.ACTIONS.BATCH_COPY) {
            try {
                log('开始请求完整密钥用于复制...');
                const revealResponse = await fetch('/admin/keys/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key_ids: selectedIds }) });
                if (!revealResponse.ok) throw new Error('获取完整密钥失败');
                const revealData = await revealResponse.json();
                log('成功获取完整密钥:', revealData);
                const keysToCopy = Object.values(revealData.revealed_keys).join('\n');
                
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(keysToCopy);
                } else {
                    const textArea = document.createElement("textarea");
                    textArea.value = keysToCopy;
                    textArea.style.position = "absolute";
                    textArea.style.left = "-9999px";
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                }
                showModal({ title: '复制成功', body: `已复制 ${selectedIds.length} 个密钥到剪贴板。`, confirmText: '好的' });
                unselectAll();
            } catch (err) {
                log('复制到剪贴板失败:', err);
                showError('复制失败，请检查浏览器权限或手动复制。');
            }
        }
    }

    function handleSelectAll(e) {
        const target = e.target;
        const listType = target.dataset.list;
        if (!listType) return;
        const tbody = listType === CONSTANTS.LIST_TYPES.VALID ? validKeysTbody : invalidKeysTbody;
        const checkboxes = tbody.querySelectorAll('input[type="checkbox"][data-id]');
        checkboxes.forEach(cb => {
            cb.checked = target.checked;
        });
        log(`全选/全不选: ${listType} 列表, 状态: ${target.checked}`);
        updateFloatingBar();
    }

    function updateFloatingBar() {
        const selectedCount = document.querySelectorAll('#main-content input[type="checkbox"][data-id]:checked').length;
        if (selectedCount > 0) {
            selectionCountEl.textContent = selectedCount;
            floatingBar.style.display = 'flex';
        } else {
            floatingBar.style.display = 'none';
        }
    }
    
    async function handleAddKey(e) {
        e.preventDefault();
        const rawKeys = newKeyInput.value.trim();
        if (!rawKeys) return;

        const initialKeys = rawKeys.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);
        if (initialKeys.length === 0) {
            showError('请输入有效的密钥。');
            return;
        }

        // Filter duplicates from the input
        const uniqueKeys = [...new Set(initialKeys)];
        const duplicateCount = initialKeys.length - uniqueKeys.length;

        if (duplicateCount > 0) {
           showModal({ title: '提示', body: `已自动过滤 ${duplicateCount} 个重复输入的密钥。`, confirmText: '好的' });
        }
        
        if (uniqueKeys.length === 0) {
            newKeyInput.value = '';
            return;
        }

       showModal({
           title: '确认添加',
           body: `确定要添加 ${uniqueKeys.length} 个密钥吗？`,
           confirmText: '添加',
           cancelText: '取消',
           onConfirm: async () => {
                const submitButton = addKeyForm.querySelector('button[type="submit"]');
                submitButton.setAttribute('aria-busy', 'true');
                log(`尝试批量添加 ${uniqueKeys.length} 个密钥...`);
                try {
                    const response = await fetch('/admin/keys/batch-add', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ keys: uniqueKeys })
                    });
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => null);
                        throw new Error(errorData?.detail || `添加密钥失败 (状态: ${response.status})`);
                    }
                    const result = await response.json();
                    showModal({ title: '操作成功', body: `成功添加了 ${result.added_count || 0} 个密钥。`, confirmText: '好的' });
                    log('批量添加请求成功。');
                    newKeyInput.value = '';
                    fetchData();
                } catch (err) {
                    showModal({ title: '操作失败', body: '添加密钥时发生错误，请检查密钥格式或稍后重试。', confirmText: '关闭' });
                    log('批量添加密钥失败:', err);
                } finally {
                    submitButton.setAttribute('aria-busy', 'false');
                    newKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
           }
       });
    }

    async function handleDeleteKeysByValue(e) {
        e.preventDefault();
        const rawKeys = newKeyInput.value.trim();
        if (!rawKeys) {
            showError('请输入要删除的密钥。');
            return;
        }

        const keysToDelete = [...new Set(rawKeys.split(/[\n,]+/).map(k => k.trim()).filter(Boolean))];
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
                log(`尝试批量删除 ${keysToDelete.length} 个密钥...`);
                try {
                    const response = await fetch('/admin/keys/batch-delete-by-value', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ keys: keysToDelete })
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.detail || `删除密钥失败 (状态: ${response.status})`);
                    }
                    const result = await response.json();
                    const message = result.deleted_count > 0 ? `成功删除了 ${result.deleted_count} 个密钥。` : '没有找到匹配的密钥可删除。';
                    showModal({ title: '操作成功', body: message, confirmText: '好的' });
                    log('批量删除请求成功。');
                    newKeyInput.value = '';
                    fetchData();
                } catch (err) {
                    showModal({ title: '操作失败', body: '删除密钥时发生错误，请稍后重试。', confirmText: '关闭' });
                    log('批量删除密钥失败:', err);
                } finally {
                    deleteButton.setAttribute('aria-busy', 'false');
                    newKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
           }
       });
    }

    async function handleAddAccessKey(e) {
        e.preventDefault();
        const newKey = newAccessKeyInput.value.trim();
        if (!newKey) {
            showError('请输入要添加的访问密钥。');
            return;
        }
        log(`尝试添加访问密钥: ${newKey}`);
        const submitButton = e.target.querySelector('button[type="submit"]');
        submitButton.setAttribute('aria-busy', 'true');
        try {
            const response = await fetch('/admin/access-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: newKey })
            });
            if (!response.ok) {
                if (response.status === 409) {
                    log('Attempted to add a duplicate access key, silently ignoring.');
                    newAccessKeyInput.value = ''; // Clear input even on duplicate
                    return;
                }
                const errorData = await response.json();
                throw new Error(errorData.detail || '添加访问密钥失败');
            }
            showModal({ title: '操作成功', body: '访问密钥添加成功。', confirmText: '好的' });
            newAccessKeyInput.value = '';
            await fetchAccessKeys();
        } catch (err) {
           showModal({ title: '操作失败', body: err.message, confirmText: '关闭' });
           log('添加访问密钥失败:', err);
        } finally {
            submitButton.setAttribute('aria-busy', 'false');
            newAccessKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    async function handleDeleteAccessKey(keyToDelete, button) {
       showModal({
           title: '确认删除',
           body: `确定删除访问密钥 "${keyToDelete}" 吗？`,
           confirmText: '删除',
           cancelText: '取消',
           onConfirm: async () => {
               log(`尝试删除访问密钥: ${keyToDelete}`);
               if (button) button.setAttribute('aria-busy', 'true');
               try {
                   const response = await fetch('/admin/access-keys', {
                       method: 'DELETE',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({ key: keyToDelete })
                   });
                   if (!response.ok) {
                       const errorData = await response.json();
                       throw new Error(errorData.detail || '删除访问密钥失败');
                   }
                   showError('访问密钥删除成功。');
                   await fetchAccessKeys();
               } catch (err) {
                   showError(err.message);
                   log('删除访问密钥失败:', err);
               } finally {
                   if (button) button.setAttribute('aria-busy', 'false');
               }
           }
       });
    }

    async function handleAdminKeyForm(e) {
        e.preventDefault();
        const newKey = adminKeyInputConfig.value.trim();
        if (!newKey) {
            showError('请输入新的管理员密钥。');
            return;
        }
       showModal({
           title: '确认更新',
           body: '确定要更新管理员密钥吗？您需要使用新密钥重新登录。',
           confirmText: '更新',
           cancelText: '取消',
           onConfirm: async () => {
                const submitButton = adminKeyForm.querySelector('button[type="submit"]');
                submitButton.setAttribute('aria-busy', 'true');
                try {
                    const response = await fetch('/admin/config/admin_key', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: newKey })
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.detail || '更新管理员密钥失败');
                    }
                    adminKeyInputConfig.value = '';
                    await logout();
                } catch (err) {
                    showError(err.message);
                    log('更新管理员密钥失败:', err);
                } finally {
                    submitButton.setAttribute('aria-busy', 'false');
                    adminKeyInputConfig.dispatchEvent(new Event('input', { bubbles: true }));
                }
           }
       });
    }

    async function handleAuth(e) {
        e.preventDefault();
        const loginButton = document.getElementById('login-button');
        const loginError = document.getElementById('login-error');
        const inputKey = adminKeyInput.value.trim();
        if (!inputKey) return;

        loginButton.setAttribute('aria-busy', 'true');
        loginError.style.display = 'none';
        log('用户提交管理员密钥进行验证...');

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ admin_key: inputKey })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                log('密钥验证成功。');
                adminKeyInput.value = '';
                await checkAuth();
            } else {
                throw new Error(result.error?.message || '管理员密钥无效或服务器错误。');
            }
        } catch (err) {
            log('登录失败:', err);
            loginError.textContent = err.message;
            loginError.style.display = 'block';
        } finally {
            loginButton.setAttribute('aria-busy', 'false');
        }
    }

    async function fetchApiConfig() {
        log('开始获取API配置...');
        try {
            const response = await fetch('/admin/config/api');
            if (!response.ok) throw new Error('获取API配置失败');
            const config = await response.json();
            log('成功获取API配置:', config);
            
            const form = document.getElementById('api-config-form');
            if (config.api_base_url) form.api_base_url.value = config.api_base_url;
            if (config.max_failure_count) form.max_failure_count.value = config.max_failure_count;
            if (config.max_retry_count) form.max_retry_count.value = config.max_retry_count;
            // Store initial config for comparison
            initialApiConfig = {
                api_base_url: form.api_base_url.value,
                max_failure_count: form.max_failure_count.value,
                max_retry_count: form.max_retry_count.value
            };
            // Initially, the button should be disabled
            form.querySelector('button[type="submit"]').disabled = true;
        } catch (err) {
            showError(err.message);
            log('获取API配置时出错:', err);
        }
    }

    async function fetchData() {
        log('开始获取集成的仪表盘数据...');
        try {
            const response = await fetch('/admin/dashboard-data');
            if (response.status === 401) {
                log('身份验证失败 (401)，需要重新登录。');
                isLoggedIn = false;
                checkAuth();
                return;
            }
            if (!response.ok) {
                throw new Error(`获取仪表盘数据失败 (状态: ${response.status})`);
            }
            const data = await response.json();
            log('成功获取仪表盘数据:', data);

            // 1. 更新统计数据
            const { stats } = data;
            document.getElementById('total-keys').textContent = stats.key_stats.total_keys;
            document.getElementById('valid-keys').textContent = stats.key_stats.valid_keys;
            document.getElementById('invalid-keys').textContent = stats.key_stats.invalid_keys;
            document.getElementById('calls-1m').textContent = stats.call_stats.last_minute;
            document.getElementById('calls-1h').textContent = stats.call_stats.last_hour;
            document.getElementById('calls-24h').textContent = stats.call_stats.last_24_hours;
            document.getElementById('key-total-count').textContent = `总计: ${stats.key_stats.total_keys}`;
            document.getElementById('api-total-count').textContent = `本月: ${stats.call_stats.this_month}`;

            // 2. 渲染密钥列表
            allKeys = data.keys;
            renderPaginatedKeys(CONSTANTS.LIST_TYPES.VALID);
            renderPaginatedKeys(CONSTANTS.LIST_TYPES.INVALID);
            updateFloatingBar();

            // 3. 渲染访问密钥
            renderAccessKeys(data.access_keys);

            // 4. 渲染错误日志
            const errorData = data.error_logs;
            const errorTbody = document.getElementById('error-logs-tbody');
            pagination.error_logs.currentPage = errorData.current_page;
            if (errorData.logs.length === 0) {
                errorTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">暂无错误日志</td></tr>';
            } else {
                errorTbody.innerHTML = '';
                errorData.logs.forEach(log => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${log.key_partial}</td>
                        <td>${log.model_name || 'N/A'}</td>
                        <td>${log.identification_code !== null ? log.identification_code : 'N/A'}</td>
                        <td>${formatTimestamp(log.timestamp)}</td>
                    `;
                    errorTbody.appendChild(row);
                });
            }
            renderErrorLogsPagination(errorData.total_pages);

            // 5. 设置 API 配置表单
            const { api_config } = data;
            const apiForm = document.getElementById('api-config-form');
            if (api_config.api_base_url) apiForm.api_base_url.value = api_config.api_base_url;
            if (api_config.max_failure_count) apiForm.max_failure_count.value = api_config.max_failure_count;
            if (api_config.max_retry_count) apiForm.max_retry_count.value = api_config.max_retry_count;
            initialApiConfig = {
                api_base_url: apiForm.api_base_url.value,
                max_failure_count: apiForm.max_failure_count.value,
                max_retry_count: apiForm.max_retry_count.value
            };
            apiForm.querySelector('button[type="submit"]').disabled = true;

            // 6. 设置定时任务表单
            setupSchedulerForm(data.scheduler_config);

            // 7. 设置管理员密钥输入框提示
            const { config_keys } = data;
            adminKeyInputConfig.placeholder = config_keys.is_admin_key_set ? "输入新的管理员密钥" : "请设置一个管理员密钥";

            // 8. 渲染图表
            fetchAndRenderTrendChart();

        } catch (err) {
            showError(err.message);
            log('获取仪表盘数据时出错:', err);
        }
    }

    async function fetchAndRenderTrendChart(range = '1d') {
        try {
            const response = await fetch(`/admin/stats/trend?range=${range}`);
            if (!response.ok) throw new Error('获取趋势数据失败');
            const trendData = await response.json();
            lastTrendData = trendData;
            renderApiTrendChart(trendData);
        } catch (err) {
            showError(err.message);
            console.error("Failed to load trend chart:", err);
            const chartCanvas = document.getElementById('api-trend-chart');
            if (chartCanvas) {
                const ctx = chartCanvas.getContext('2d');
                ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
                ctx.font = "14px 'Inter', sans-serif";
                ctx.fillStyle = 'grey';
                ctx.textAlign = 'center';
                ctx.fillText('无法加载图表数据', chartCanvas.width / 2, chartCanvas.height / 2);
            }
        }
    }

    function renderApiTrendChart(trendData) {
        if (!trendData || !trendData.datasets || trendData.datasets.length === 0) {
            const chartCanvas = document.getElementById('api-trend-chart');
            if (chartCanvas) {
                const ctx = chartCanvas.getContext('2d');
                ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
                ctx.font = "14px 'Inter', sans-serif";
                ctx.fillStyle = 'grey';
                ctx.textAlign = 'center';
                ctx.fillText('暂无调用数据', chartCanvas.width / 2, chartCanvas.height / 2);
            }
            return;
        }

        const ctx = document.getElementById('api-trend-chart').getContext('2d');
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const labelColor = isDarkMode ? '#9ca3af' : '#6b7280';
        const legendColor = isDarkMode ? '#d1d5db' : '#374151';

        const colors = [
            '#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6', '#d946ef',
            '#ec4899', '#6366f1', '#06b6d4', '#f59e0b', '#84cc16', '#22c55e'
        ];

        const datasets = trendData.datasets.map((dataset, index) => {
            const color = colors[index % colors.length];
            return {
                label: dataset.label,
                data: dataset.data,
                borderColor: color,
                backgroundColor: `${color}1a`, // Add alpha for fill
                pointBackgroundColor: color,
                pointBorderColor: color,
                pointRadius: 2,
                borderWidth: 2,
                fill: true,
                tension: 0.3
            };
        });

        const chartConfig = {
            type: 'line',
            data: {
                labels: trendData.labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            color: legendColor,
                            boxWidth: 12,
                            font: { size: 10 }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                        titleColor: isDarkMode ? '#f9fafb' : '#111827',
                        bodyColor: isDarkMode ? '#d1d5db' : '#374151',
                        borderColor: gridColor,
                        borderWidth: 1,
                    }
                },
                scales: {
                    x: {
                        ticks: { color: labelColor, font: { size: 10 } },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: labelColor, font: { size: 10 }, precision: 0 },
                        grid: { color: gridColor, borderDash: [2, 4] }
                    }
                }
            }
        };

        if (apiTrendChart) {
            apiTrendChart.destroy();
        }
        apiTrendChart = new Chart(ctx, chartConfig);
    }

    async function clearAllErrorLogs() {
        showModal({
            title: '确认清除',
            body: '确定要清除所有错误日志吗？此操作不可逆。',
            confirmText: '清除',
            cancelText: '取消',
            onConfirm: async () => {
                log('尝试清除所有错误日志...');
                try {
                    const response = await fetch('/admin/error-logs', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    if (!response.ok) {
                        throw new Error(`清除日志失败 (状态: ${response.status})`);
                    }
                    log('成功清除所有错误日志。');
                    fetchErrorLogs(); // Refresh the logs view
                } catch (err) {
                    showError(err.message);
                    log('清除日志失败:', err);
                }
            }
        });
    }

    async function fetchErrorLogs(page = 1) {
        const tbody = document.getElementById('error-logs-tbody');
        const paginationContainer = document.getElementById('error-logs-pagination');
        const pageSize = pagination.error_logs.pageSize;

        try {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;" aria-busy="true">加载中...</td></tr>`;
            const response = await fetch(`/admin/error-logs?page=${page}&size=${pageSize}`);
            if (!response.ok) throw new Error('获取错误日志失败');
            
            const data = await response.json();
            pagination.error_logs.currentPage = data.current_page;
            
            if (data.logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">暂无错误日志</td></tr>';
            } else {
                tbody.innerHTML = '';
                data.logs.forEach(log => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${log.key_partial}</td>
                        <td>${log.model_name || 'N/A'}</td>
                        <td>${log.identification_code !== null ? log.identification_code : 'N/A'}</td>
                        <td>${formatTimestamp(log.timestamp)}</td>
                    `;
                    tbody.appendChild(row);
                });
            }
            renderErrorLogsPagination(data.total_pages);
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="4" style="color: var(--pico-color-red-500); text-align: center;">${err.message}</td></tr>`;
        }
    }

    function renderErrorLogsPagination(totalPages) {
        const container = document.getElementById('error-logs-pagination');
        const currentPage = pagination.error_logs.currentPage;
        container.innerHTML = '';

        if (totalPages <= 1) return;

        let buttons = '';
        if (currentPage > 1) {
            buttons += `<button data-page="${currentPage - 1}">上一页</button>`;
        }
        buttons += `<span>第 ${currentPage} / ${totalPages} 页</span>`;
        if (currentPage < totalPages) {
            buttons += `<button data-page="${currentPage + 1}">下一页</button>`;
        }
        container.innerHTML = buttons;
    }

    function formatTimestamp(timestamp) {
        // The timestamp from SQLite is a string like 'YYYY-MM-DD HH:MM:SS'.
        // The 'new Date()' constructor treats this format as local time by default.
        // To ensure it's parsed as UTC, we must reformat it to the ISO 8601 standard
        // by replacing the space with 'T' and appending 'Z'.
        const date = new Date(timestamp.replace(' ', 'T') + 'Z');
        return date.toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/\//g, '-');
    }


    async function logout() {
        log('正在登出...');
        try {
            await fetch('/logout', { method: 'POST' });
        } catch (err) {
            log('登出请求失败（可能网络问题），但仍继续前端登出流程。', err);
        } finally {
            isLoggedIn = false;
            checkAuth();
        }
    }

    async function checkAuth() {
        log('检查身份验证状态...');
        try {
            // 通过调用一个受保护的端点来检查 Cookie 是否有效
            const response = await fetch('/admin/dashboard-data'); // 使用新端点进行认证检查
            if (response.ok) {
                if (!isLoggedIn) {
                    log('后端验证成功，用户已登录。');
                    isLoggedIn = true;
                    loginView.classList.add('hidden');
                    mainContent.style.display = 'block'; // 确保主内容显示
                    
                    // 既然已经获取了数据，直接使用它，而不是再次调用 fetchData
                    const data = await response.json();
                    log('通过认证检查成功获取仪表盘数据:', data);
                    
                    // 调用处理函数
                    const { stats, keys, access_keys, error_logs, api_config, scheduler_config, config_keys, trend_data } = data;
                    
                    // 更新统计
                    document.getElementById('total-keys').textContent = stats.key_stats.total_keys;
                    document.getElementById('valid-keys').textContent = stats.key_stats.valid_keys;
                    document.getElementById('invalid-keys').textContent = stats.key_stats.invalid_keys;
                    document.getElementById('calls-1m').textContent = stats.call_stats.last_minute;
                    document.getElementById('calls-1h').textContent = stats.call_stats.last_hour;
                    document.getElementById('calls-24h').textContent = stats.call_stats.last_24_hours;
                    document.getElementById('key-total-count').textContent = `总计: ${stats.key_stats.total_keys}`;
                    document.getElementById('api-total-count').textContent = `本月: ${stats.call_stats.this_month}`;
                    
                    // 渲染密钥
                    allKeys = keys;
                    renderPaginatedKeys(CONSTANTS.LIST_TYPES.VALID);
                    renderPaginatedKeys(CONSTANTS.LIST_TYPES.INVALID);
                    updateFloatingBar();
                    
                    // 渲染访问密钥
                    renderAccessKeys(access_keys);
                    
                    // 渲染错误日志
                    const errorTbody = document.getElementById('error-logs-tbody');
                    pagination.error_logs.currentPage = error_logs.current_page;
                    if (error_logs.logs.length === 0) {
                        errorTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">暂无错误日志</td></tr>';
                    } else {
                        errorTbody.innerHTML = '';
                        error_logs.logs.forEach(log => {
                            const row = document.createElement('tr');
                            row.innerHTML = `
                                <td>${log.key_partial}</td>
                                <td>${log.model_name || 'N/A'}</td>
                                <td>${log.identification_code !== null ? log.identification_code : 'N/A'}</td>
                                <td>${formatTimestamp(log.timestamp)}</td>
                            `;
                            errorTbody.appendChild(row);
                        });
                    }
                    renderErrorLogsPagination(error_logs.total_pages);
                    
                    // 设置API配置
                    const apiForm = document.getElementById('api-config-form');
                    if (api_config.api_base_url) apiForm.api_base_url.value = api_config.api_base_url;
                    if (api_config.max_failure_count) apiForm.max_failure_count.value = api_config.max_failure_count;
                    if (api_config.max_retry_count) apiForm.max_retry_count.value = api_config.max_retry_count;
                    initialApiConfig = {
                        api_base_url: apiForm.api_base_url.value,
                        max_failure_count: apiForm.max_failure_count.value,
                        max_retry_count: apiForm.max_retry_count.value
                    };
                    apiForm.querySelector('button[type="submit"]').disabled = true;
                    
                    // 设置定时任务
                    setupSchedulerForm(scheduler_config);
                    
                    // 设置管理员密钥提示
                    adminKeyInputConfig.placeholder = config_keys.is_admin_key_set ? "输入新的管理员密钥" : "请设置一个管理员密钥";
                    
                    // 渲染图表
                    fetchAndRenderTrendChart();

                    initializeActiveTab();
                }
            } else {
                throw new Error('Session invalid');
            }
        } catch (error) {
            if (isLoggedIn) {
                log('会话已失效或网络错误，强制登出。', error);
            }
            isLoggedIn = false;
            loginView.classList.remove('hidden');
            mainContent.style.display = 'none'; // 确保主内容隐藏
        } finally {
            // 无论认证成功与否，都移除加载动画
            document.body.classList.add('loaded');
        }
    }
    
    function setupInputButtonStates() {
       const configs = [
           {
               input: document.getElementById('new-key-input'),
               buttons: [
                   document.querySelector('#add-key-form button[type="submit"]'),
                   document.getElementById('batch-delete-keys-btn')
               ]
           },
           {
               input: document.getElementById('new-access-key-input'),
               buttons: [document.querySelector('#add-access-key-form button[type="submit"]')]
           },
           {
               input: document.getElementById('admin-key-input-config'),
               buttons: [document.querySelector('#admin-key-form button[type="submit"]')]
           }
       ];

       configs.forEach(({ input, buttons }) => {
           if (input && buttons.every(b => b)) {
               const updateState = () => {
                   const isDisabled = input.value.trim() === '';
                   buttons.forEach(button => button.disabled = isDisabled);
               };
               input.addEventListener('input', updateState);
               updateState(); // Set initial state
           }
       });
   }


    // Event Listeners
    authForm.addEventListener('submit', handleAuth);
    addKeyForm.addEventListener('submit', handleAddKey);
    addAccessKeyForm.addEventListener('submit', handleAddAccessKey);
    document.getElementById('batch-delete-keys-btn').addEventListener('click', handleDeleteKeysByValue);
    adminKeyForm.addEventListener('submit', handleAdminKeyForm);
    document.getElementById('api-config-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.setAttribute('aria-busy', 'true');
        
        try {
            const response = await fetch('/admin/config/api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_base_url: form.api_base_url.value,
                    max_failure_count: parseInt(form.max_failure_count.value),
                    max_retry_count: parseInt(form.max_retry_count.value)
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || '保存配置失败');
            }
            
            showModal({ title: '操作成功', body: 'API配置已保存', confirmText: '好的' });
            await fetchApiConfig(); // Refresh config and disable button
        } catch (err) {
            showError(err.message);
            // Re-enable button on error so user can retry
            submitButton.disabled = false;
        } finally {
            submitButton.setAttribute('aria-busy', 'false');
        }
    });
    
    validKeysTbody.addEventListener('click', handleKeyAction);
    invalidKeysTbody.addEventListener('click', handleKeyAction);
    document.getElementById('main-content').addEventListener('change', (e) => {
        if (e.target.matches('input[type="checkbox"]')) {
            updateFloatingBar();
        }
        if (e.target.matches('.page-size-selector')) {
            const listType = e.target.dataset.list;
            pagination[listType].pageSize = parseInt(e.target.value);
            pagination[listType].currentPage = 1;
            renderPaginatedKeys(listType);
            // 取消全选状态并更新浮动栏
            const selectAllCheckbox = document.querySelector(`input[data-action="select-all"][data-list="${listType}"]`);
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = false;
            }
            updateFloatingBar();
        }
    });
    floatingBar.addEventListener('click', handleFloatingBarAction);

   document.getElementById('main-content').addEventListener('click', async (e) => {
       const button = e.target.closest('button[data-action="validate-all-list"]');
       if (!button) return;

       const listType = button.dataset.list;
       if (!listType) return;
       
       await handleValidateAllList(listType);
   });
    document.querySelectorAll(`input[data-action="${CONSTANTS.ACTIONS.SELECT_ALL}"]`).forEach(cb => cb.addEventListener('change', handleSelectAll));

    document.getElementById('valid-keys-pagination').addEventListener('click', handlePaginationClick);
    document.getElementById('invalid-keys-pagination').addEventListener('click', handlePaginationClick);
    document.getElementById('error-logs-pagination').addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (target && target.dataset.page) {
            fetchErrorLogs(parseInt(target.dataset.page));
        }
    });


    document.getElementById('clear-logs-btn').addEventListener('click', clearAllErrorLogs);


    function handlePaginationClick(e) {
        const target = e.target.closest('button');
        if (!target) return;
        const action = target.dataset.action;
        const listType = target.dataset.list;
        if (action === CONSTANTS.ACTIONS.PREV_PAGE) {
            if (pagination[listType].currentPage > 1) {
                pagination[listType].currentPage--;
                renderPaginatedKeys(listType);
            }
        } else if (action === CONSTANTS.ACTIONS.NEXT_PAGE) {
            pagination[listType].currentPage++;
            renderPaginatedKeys(listType);
        }
    }

    // Click outside modal to close
    detailsModal.addEventListener('click', (event) => {
        if (event.target === detailsModal) {
            detailsModal.close();
        }
    });

    detailsModal.querySelector('.close').addEventListener('click', (event) => {
        event.preventDefault();
        detailsModal.close();
    });

    // Initialize Tabs
    setupTabs();
    setupSwipeNavigation();

    function setupApiConfigFormListener() {
        const form = document.getElementById('api-config-form');
        const inputs = form.querySelectorAll('input');
        const submitButton = form.querySelector('button[type="submit"]');

        const checkChanges = () => {
            const isModified = inputs[0].value !== initialApiConfig.api_base_url ||
                               inputs[1].value !== initialApiConfig.max_failure_count ||
                               inputs[2].value !== initialApiConfig.max_retry_count;
            submitButton.disabled = !isModified;
        };

        inputs.forEach(input => {
            input.addEventListener('input', checkChanges);
        });

        // Add blur event listeners to restore default values
        const inputsWithDefaults = [
            { id: 'api-base-url', defaultValue: 'https://generativelanguage.googleapis.com/v1beta' },
            { id: 'max-failure-count', defaultValue: '5' },
            { id: 'max-retry-count', defaultValue: '3' }
        ];

        inputsWithDefaults.forEach(({ id, defaultValue }) => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('blur', () => {
                    if (input.value.trim() === '') {
                        input.value = defaultValue;
                        // Manually trigger an input event to re-check form state
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
            }
        });
    }

    checkAuth();
    setupInputButtonStates();
    setupApiConfigFormListener();
    function setupThemeToggle() {
        const themeToggle = document.getElementById('theme-toggle');
        const themeIcon = document.getElementById('theme-icon');
        const doc = document.documentElement;
        const lightIcon = 'assets/black.svg';
        const darkIcon = 'assets/white.svg';

        function applyTheme(theme) {
            doc.setAttribute('data-theme', theme);
            themeIcon.src = theme === 'dark' ? darkIcon : lightIcon;
            localStorage.setItem('theme', theme);
            if (apiTrendChart && lastTrendData) {
                renderApiTrendChart(lastTrendData);
            }
        }

        themeToggle.addEventListener('click', () => {
            const currentTheme = doc.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(newTheme);
        });

        // Initial theme setup
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        applyTheme(initialTheme);
    }

    setupThemeToggle();

    document.querySelector('.chart-time-range-selector').addEventListener('click', async (e) => {
        if (e.target.tagName !== 'A') return;
        e.preventDefault();

        const links = document.querySelectorAll('.chart-time-range-selector a');
        links.forEach(link => link.classList.remove('active'));
        e.target.classList.add('active');

        const range = e.target.dataset.range;
        await fetchAndRenderTrendChart(range);
    });

    async function setupSchedulerForm(schedulerConfig) {
        const form = document.getElementById('scheduler-form');
        if (!form) return;

        const validationModelSelect = document.getElementById('validation-model');
        const timezoneSelect = document.getElementById('scheduler-timezone');
        const submitButton = form.querySelector('button[type="submit"]');

        if (allKeys.length === 0) {
            Array.from(form.elements).forEach(el => el.disabled = true);
            validationModelSelect.innerHTML = `<option value="" disabled selected>请先添加Gemini Key</option>`;
            return;
        }

        Array.from(form.elements).forEach(el => el.disabled = false);

        // 1. Populate timezones
        const timezones = ["UTC", "Asia/Shanghai"];
        timezoneSelect.innerHTML = '';
        timezones.forEach(tz => {
            const option = document.createElement('option');
            option.value = tz;
            option.textContent = tz;
            timezoneSelect.appendChild(option);
        });

        // 2. Set up lazy loading for models
        let modelsLoaded = false;
        const loadModelsOnClick = async () => {
            if (modelsLoaded) return;
            modelsLoaded = true;
            validationModelSelect.innerHTML = `<option value="" disabled selected>加载中...</option>`;
            try {
                const response = await fetch('/admin/available-models');
                if (!response.ok) throw new Error('获取可用模型列表失败');
                const models = await response.json();
                validationModelSelect.innerHTML = '';
                models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.name;
                    option.textContent = model.displayName;
                    validationModelSelect.appendChild(option);
                });
                if (schedulerConfig && schedulerConfig.validation_model) {
                    validationModelSelect.value = schedulerConfig.validation_model;
                }
                validationModelSelect.dispatchEvent(new Event('input', { bubbles: true }));
            } catch (err) {
                validationModelSelect.innerHTML = `<option value="" disabled selected>${err.message}</option>`;
            }
        };
        validationModelSelect.addEventListener('click', loadModelsOnClick, { once: true });

        // 3. Use the provided scheduler config
        if (schedulerConfig.validation_model) {
            validationModelSelect.innerHTML = `<option value="${schedulerConfig.validation_model}" selected>${schedulerConfig.validation_model_display_name || schedulerConfig.validation_model}</option>`;
        } else {
            validationModelSelect.innerHTML = `<option value="" disabled selected>点击选择模型</option>`;
        }
        
        if (schedulerConfig.validation_interval) form.validation_interval.value = schedulerConfig.validation_interval;
        if (schedulerConfig.scheduler_timezone) form.scheduler_timezone.value = schedulerConfig.scheduler_timezone;
        if (schedulerConfig.error_log_retention_days) form.error_log_retention.value = schedulerConfig.error_log_retention_days;
        if (schedulerConfig.request_log_retention_days) form.request_log_retention.value = schedulerConfig.request_log_retention_days;

        const initialConfig = {
            validation_model: form.validation_model.value,
            validation_interval: form.validation_interval.value,
            scheduler_timezone: form.scheduler_timezone.value,
            error_log_retention_days: form.error_log_retention.value,
            request_log_retention_days: form.request_log_retention.value,
        };
        submitButton.disabled = true;

        form.addEventListener('input', () => {
            const currentConfig = {
                validation_model: form.validation_model.value,
                validation_interval: form.validation_interval.value,
                scheduler_timezone: form.scheduler_timezone.value,
                error_log_retention_days: form.error_log_retention.value,
                request_log_retention_days: form.request_log_retention.value,
            };
            const isChanged = JSON.stringify(initialConfig) !== JSON.stringify(currentConfig);
            submitButton.disabled = !isChanged;
        });

        const inputsWithDefaults = [
            { id: 'validation-interval', defaultValue: '1' },
            { id: 'error-log-retention', defaultValue: '7' },
            { id: 'request-log-retention', defaultValue: '7' }
        ];

        inputsWithDefaults.forEach(({ id, defaultValue }) => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('blur', () => {
                    if (input.value.trim() === '') {
                        input.value = defaultValue;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
            }
        });

        // 4. Handle form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitButton = form.querySelector('button[type="submit"]');
            submitButton.setAttribute('aria-busy', 'true');
            try {
                const payload = {
                    validation_model: form.validation_model.value,
                    validation_interval: parseInt(form.validation_interval.value),
                    scheduler_timezone: form.scheduler_timezone.value,
                    error_log_retention_days: parseInt(form.error_log_retention.value),
                    request_log_retention_days: parseInt(form.request_log_retention.value),
                };
                const response = await fetch('/admin/scheduler/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || '保存配置失败');
                }
                showModal({ title: '操作成功', body: '定时任务配置已保存并应用。', confirmText: '好的' });
                const newConfigResponse = await fetch('/admin/scheduler/config');
                if (newConfigResponse.ok) {
                    const newConfig = await newConfigResponse.json();
                    await setupSchedulerForm(newConfig);
                } else {
                    showError('无法重新加载定时任务配置，请刷新页面。');
                }
            } catch (err) {
                showError(err.message);
                submitButton.disabled = false; // Re-enable on error
            } finally {
                submitButton.setAttribute('aria-busy', 'false');
            }
        });
    }
});