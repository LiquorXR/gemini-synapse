import { elements, CONSTANTS } from './core.js';

export function updateFloatingBar() {
  const selectedCount = document.querySelectorAll('#main-content input[type="checkbox"][data-id]:checked').length;
  if (selectedCount > 0) {
    elements.selectionCountEl.textContent = selectedCount;
    elements.floatingBar.style.display = 'flex';
  } else {
    elements.floatingBar.style.display = 'none';
  }
}

export function setupInputButtonStates() {
  const configs = [
    {
      input: document.getElementById('new-key-input'),
      buttons: [
        document.querySelector('#add-key-form button[type="submit"]'),
        document.getElementById('batch-delete-keys-btn'),
      ],
    },
    {
      input: document.getElementById('new-access-key-input'),
      buttons: [document.querySelector('#add-access-key-form button[type="submit"]')],
    },
    {
      input: document.getElementById('admin-key-input-config'),
      buttons: [document.querySelector('#admin-key-form button[type="submit"]')],
    },
  ];

  configs.forEach(({ input, buttons }) => {
    if (input && buttons.every((b) => b)) {
      const updateState = () => {
        const isDisabled = input.value.trim() === '';
        buttons.forEach((button) => (button.disabled = isDisabled));
      };
      input.addEventListener('input', updateState);
      updateState();
    }
  });
}

export function handleSelectAll(e) {
  const target = e.target;
  const listType = target.dataset.list;
  if (!listType) return;
  const tbody =
    listType === CONSTANTS.LIST_TYPES.VALID
      ? elements.validKeysTbody
      : elements.invalidKeysTbody;
  const checkboxes = tbody.querySelectorAll('input[type="checkbox"][data-id]');
  checkboxes.forEach((cb) => {
    cb.checked = target.checked;
  });
  updateFloatingBar();
}


