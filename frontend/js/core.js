// Constants
export const CONSTANTS = {
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
    INVALID: 'invalid',
  },
};

// Global state
export const appState = {
  debug: false,
  isLoggedIn: false,
  allKeys: [],
  configKeys: {},
  initialApiConfig: {},
  pagination: {
    valid: { currentPage: 1, pageSize: 10 },
    invalid: { currentPage: 1, pageSize: 10 },
    error_logs: { currentPage: 1, pageSize: 50 },
  },
  apiTrendChart: null,
  lastTrendData: null,
};

// DOM elements
export const elements = {
  loginView: document.getElementById('login-view'),
  mainContent: document.getElementById('main-content'),
  authForm: document.getElementById('auth-form'),
  adminKeyInput: document.getElementById('admin-key-input'),
  addKeyForm: document.getElementById('add-key-form'),
  newKeyInput: document.getElementById('new-key-input'),
  addAccessKeyForm: document.getElementById('add-access-key-form'),
  newAccessKeyInput: document.getElementById('new-access-key-input'),
  accessKeysList: document.getElementById('access-keys-list'),
  adminKeyForm: document.getElementById('admin-key-form'),
  adminKeyInputConfig: document.getElementById('admin-key-input-config'),
  validKeysTbody: document.getElementById('valid-keys-tbody'),
  invalidKeysTbody: document.getElementById('invalid-keys-tbody'),
  errorMessage: document.getElementById('error-message'),
  floatingBar: document.getElementById('floating-bar'),
  selectionCountEl: document.querySelector('#floating-bar strong'),
  detailsModal: document.getElementById('details-modal'),
  modalKeyPartial: document.getElementById('modal-key-partial'),
  modalContent: document.getElementById('modal-content'),
  validationModal: document.getElementById('validation-modal'),
  genericModal: document.getElementById('generic-modal'),
};

export const log = (...args) => appState.debug && console.log('[Debug]', ...args);

// Utils

export function showModal({ title, body, confirmText, cancelText, onConfirm, onCancel }) {
  const genericModal = elements.genericModal;
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

export function showError(message) {
  showModal({ title: '提示', body: message, confirmText: '关闭' });
}

export function formatTimestamp(timestamp) {
  const date = new Date(timestamp.replace(' ', 'T') + 'Z');
  return date
    .toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(/\//g, '-');
}

export function clickOutsideToClose(dialogElement) {
  dialogElement.addEventListener('click', (event) => {
    if (event.target === dialogElement) {
      dialogElement.close();
    }
  });
  const close = dialogElement.querySelector('.close');
  if (close) {
    close.addEventListener('click', (event) => {
      event.preventDefault();
      dialogElement.close();
    });
  }
}


