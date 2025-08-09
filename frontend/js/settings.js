import { elements, appState, showError, showModal } from './core.js';

// access keys
export function renderAccessKeys(keys) {
  const accessKeysList = elements.accessKeysList;
  accessKeysList.innerHTML = '';
  if (keys.length === 0) {
    accessKeysList.innerHTML = '<p>暂无访问密钥。</p>';
    return;
  }
  const list = document.createElement('ul');
  list.style.listStyle = 'none';
  list.style.padding = '0';
  list.style.margin = '0';
  keys.forEach((key) => {
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

export async function fetchAccessKeys() {
  try {
    const response = await fetch('/admin/access-keys');
    if (!response.ok) throw new Error('获取访问密钥失败');
    const keys = await response.json();
    renderAccessKeys(keys);
  } catch (err) {
    showError(err.message);
    elements.accessKeysList.innerHTML = `<p style="color: var(--pico-color-red-500);">${err.message}</p>`;
  }
}

export async function handleAddAccessKey(e) {
  e.preventDefault();
  const newKeyInput = elements.newAccessKeyInput;
  const newKey = newKeyInput.value.trim();
  if (!newKey) {
    showError('请输入要添加的访问密钥。');
    return;
  }
  const submitButton = e.target.querySelector('button[type="submit"]');
  submitButton.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/admin/access-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newKey }),
    });
    if (!response.ok) {
      if (response.status === 409) {
        elements.newAccessKeyInput.value = '';
        return;
      }
      const errorData = await response.json();
      throw new Error(errorData.detail || '添加访问密钥失败');
    }
    showModal({ title: '操作成功', body: '访问密钥添加成功。', confirmText: '好的' });
    elements.newAccessKeyInput.value = '';
    await fetchAccessKeys();
  } catch (err) {
    showModal({ title: '操作失败', body: err.message, confirmText: '关闭' });
  } finally {
    submitButton.setAttribute('aria-busy', 'false');
    elements.newAccessKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export async function handleDeleteAccessKey(keyToDelete, button) {
  showModal({
    title: '确认删除',
    body: `确定删除访问密钥 "${keyToDelete}" 吗？`,
    confirmText: '删除',
    cancelText: '取消',
    onConfirm: async () => {
      if (button) button.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch('/admin/access-keys', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: keyToDelete }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || '删除访问密钥失败');
        }
        showError('访问密钥删除成功。');
        await fetchAccessKeys();
      } catch (err) {
        showError(err.message);
      } finally {
        if (button) button.setAttribute('aria-busy', 'false');
      }
    },
  });
}

// api config
export async function fetchApiConfig() {
  try {
    const response = await fetch('/admin/config/api');
    if (!response.ok) throw new Error('获取API配置失败');
    const config = await response.json();
    const form = document.getElementById('api-config-form');
    if (config.api_base_url) form.api_base_url.value = config.api_base_url;
    if (config.max_failure_count) form.max_failure_count.value = config.max_failure_count;
    if (config.max_retry_count) form.max_retry_count.value = config.max_retry_count;
    appState.initialApiConfig = {
      api_base_url: form.api_base_url.value,
      max_failure_count: form.max_failure_count.value,
      max_retry_count: form.max_retry_count.value,
    };
    form.querySelector('button[type="submit"]').disabled = true;
  } catch (err) {
    showError(err.message);
  }
}

export function setupApiConfigFormListener() {
  const form = document.getElementById('api-config-form');
  const inputs = form.querySelectorAll('input');
  const submitButton = form.querySelector('button[type="submit"]');
  const checkChanges = () => {
    const isModified =
      inputs[0].value !== appState.initialApiConfig.api_base_url ||
      inputs[1].value !== appState.initialApiConfig.max_failure_count ||
      inputs[2].value !== appState.initialApiConfig.max_retry_count;
    submitButton.disabled = !isModified;
  };
  inputs.forEach((input) => input.addEventListener('input', checkChanges));
  const inputsWithDefaults = [
    { id: 'api-base-url', defaultValue: 'https://generativelanguage.googleapis.com/v1beta' },
    { id: 'max-failure-count', defaultValue: '5' },
    { id: 'max-retry-count', defaultValue: '3' },
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
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/admin/config/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_base_url: form.api_base_url.value,
          max_failure_count: parseInt(form.max_failure_count.value),
          max_retry_count: parseInt(form.max_retry_count.value),
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '保存配置失败');
      }
      showModal({ title: '操作成功', body: 'API配置已保存', confirmText: '好的' });
      await fetchApiConfig();
    } catch (err) {
      showError(err.message);
      submitButton.disabled = false;
    } finally {
      submitBtn.setAttribute('aria-busy', 'false');
    }
  });
}

// scheduler
export async function setupSchedulerForm(schedulerConfig) {
  const form = document.getElementById('scheduler-form');
  if (!form) return;
  const validationModelSelect = document.getElementById('validation-model');
  const timezoneSelect = document.getElementById('scheduler-timezone');
  const submitButton = form.querySelector('button[type="submit"]');

  if (appState.allKeys.length === 0) {
    Array.from(form.elements).forEach((el) => (el.disabled = true));
    validationModelSelect.innerHTML = `<option value="" disabled selected>请先添加Gemini Key</option>`;
    return;
  }
  Array.from(form.elements).forEach((el) => (el.disabled = false));

  const timezones = ['UTC', 'Asia/Shanghai'];
  timezoneSelect.innerHTML = '';
  timezones.forEach((tz) => {
    const option = document.createElement('option');
    option.value = tz;
    option.textContent = tz;
    timezoneSelect.appendChild(option);
  });

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
      models.forEach((model) => {
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
    { id: 'request-log-retention', defaultValue: '7' },
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.setAttribute('aria-busy', 'true');
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
        body: JSON.stringify(payload),
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
      submitButton.disabled = false;
    } finally {
      submitBtn.setAttribute('aria-busy', 'false');
    }
  });
}


