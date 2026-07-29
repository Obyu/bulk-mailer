// Application State
let recipients = [];
let smtpConfig = {};
let currentPreviewIndex = 0;
let uploadedAttachment = null;
let serverOnline = false; // Flag to check if backend server is available
let customCertBgBase64 = null; // Base64 data for custom certificate templates

// Sending campaign state
let isSending = false;
let isPaused = false;
let currentSendIndex = 0;
let successCount = 0;
let failedCount = 0;
let sendTimeoutId = null;

// Default Template Presets
const PRESETS = {
  mnc: {
    subject: "Selamat! Pendaftaran Terverifikasi",
    body: `Kami dengan senang hati menginformasikan bahwa pendaftaran Anda pada program {{program}} telah berhasil diverifikasi.

Sebagai bentuk apresiasi atas partisipasi awal Anda, kami melampirkan Sertifikat Partisipasi dalam format PDF pada email ini. Silakan unduh dan simpan sertifikat tersebut sebagai bukti keikutsertaan Anda.

Untuk memperoleh informasi terbaru mengenai tahapan seleksi, pengumuman, serta berbagai informasi penting lainnya, silakan bergabung ke WhatsApp Group Resmi {{program}} melalui tautan berikut:`
  },
  simple: {
    subject: "Pengumuman Penting: {{program}}",
    body: `Terima kasih telah melakukan pendaftaran pada program {{program}}.

Email ini dikirimkan otomatis untuk mengonfirmasi bahwa data Anda telah masuk ke dalam sistem kami dengan alamat email: {{email}}.

Informasi selanjutnya akan dikirimkan secara berkala. Pastikan untuk selalu mengecek folder inbox atau spam Anda.`
  }
};

// Document Elements
const elements = {
  themeToggle: document.getElementById('theme-toggle'),
  serverStatus: document.getElementById('server-status'),
  
  // SMTP Form
  smtpForm: document.getElementById('smtp-form'),
  smtpHost: document.getElementById('smtp-host'),
  smtpPort: document.getElementById('smtp-port'),
  smtpSecure: document.getElementById('smtp-secure'),
  smtpUser: document.getElementById('smtp-user'),
  smtpPass: document.getElementById('smtp-pass'),
  toggleSmtpPass: document.getElementById('toggle-smtp-pass'),
  smtpFromName: document.getElementById('smtp-from-name'),
  btnSaveSmtp: document.getElementById('btn-save-smtp'),
  btnTestSmtp: document.getElementById('btn-test-smtp'),
  smtpTestMessage: document.getElementById('smtp-test-message'),
  
  // Recipients Tab
  csvFile: document.getElementById('csv-file'),
  btnClearRecipients: document.getElementById('btn-clear-recipients'),
  quickNama: document.getElementById('quick-nama'),
  quickEmail: document.getElementById('quick-email'),
  btnQuickAdd: document.getElementById('btn-quick-add'),
  recipientListBody: document.getElementById('recipient-list-body'),
  tableEmptyState: document.getElementById('table-empty-state'),
  bulkPasteText: document.getElementById('bulk-paste-text'),
  btnImportPaste: document.getElementById('btn-import-paste'),
  
  // Template Tab
  emailSubject: document.getElementById('email-subject'),
  emailProgram: document.getElementById('email-program'),
  emailHeaderTitle: document.getElementById('email-header-title'),
  attachmentFileInput: document.getElementById('attachment-file-input'),
  uploadStatusText: document.getElementById('upload-status-text'),
  btnRemoveAttachment: document.getElementById('btn-remove-attachment'),
  emailBody: document.getElementById('email-body'),
  emailSignature: document.getElementById('email-signature'),
  dropzone: document.getElementById('dropzone'),
  
  // Presets
  btnPresetMnc: document.getElementById('btn-preset-mnc'),
  btnPresetSimple: document.getElementById('btn-preset-simple'),
  variableBadges: document.querySelectorAll('.var-badge'),
  
  // Tabs navigation
  tabLinks: document.querySelectorAll('.tab-link'),
  tabContents: document.querySelectorAll('.tab-content'),
  
  // Preview
  prevPreview: document.getElementById('prev-preview'),
  nextPreview: document.getElementById('next-preview'),
  previewIndex: document.getElementById('preview-index'),
  previewEnvFrom: document.getElementById('preview-env-from'),
  previewEnvTo: document.getElementById('preview-env-to'),
  previewEnvSubject: document.getElementById('preview-env-subject'),
  emailRenderFrame: document.getElementById('email-render-frame'),
  
  // Sending Panel
  sendDelay: document.getElementById('send-delay'),
  statTotal: document.getElementById('stat-total'),
  statSuccess: document.getElementById('stat-success'),
  statFailed: document.getElementById('stat-failed'),
  statRemaining: document.getElementById('stat-remaining'),
  progressBar: document.getElementById('progress-bar'),
  progressText: document.getElementById('progress-text'),
  autoCert: document.getElementById('auto-cert'),
  waLink: document.getElementById('wa-link'),
  certBgInput: document.getElementById('cert-bg-input'),
  certNameY: document.getElementById('cert-name-y'),
  certNameYVal: document.getElementById('cert-name-y-val'),
  certNameSize: document.getElementById('cert-name-size'),
  certNameSizeVal: document.getElementById('cert-name-size-val'),
  certNameColor: document.getElementById('cert-name-color'),
  certSettingsPanel: document.getElementById('cert-settings-panel'),
  btnPreviewCert: document.getElementById('btn-preview-cert'),
  certModal: document.getElementById('cert-modal'),
  btnCloseCertModal: document.getElementById('btn-close-cert-modal'),
  certPreviewCanvas: document.getElementById('cert-preview-canvas'),
  btnStartSending: document.getElementById('btn-start-sending'),
  btnPauseSending: document.getElementById('btn-pause-sending'),
  btnStopSending: document.getElementById('btn-stop-sending'),
  btnClearLogs: document.getElementById('btn-clear-logs'),
  consoleLogs: document.getElementById('console-logs')
};

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
  checkServerConnection();
  loadSmtpFromStorage();
  loadPreset('mnc');
  setupEventListeners();
  updateSendingStats();
});

// Theme Management
function initializeTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const icon = elements.themeToggle.querySelector('i');
  if (theme === 'dark') {
    icon.className = 'fa-solid fa-sun';
  } else {
    icon.className = 'fa-solid fa-moon';
  }
}

let API_BASE_URL = ''; // Auto-detected backend server endpoint
let BACKEND_MODE = 'offline'; // 'php', 'node', or 'offline'

// Server Connection Verification
async function checkServerConnection() {
  // 1. Try PHP Backend (ideal for Hostinger / cPanel / Shared Hosting)
  try {
    const phpRes = await fetch('api.php?action=ping');
    if (phpRes.ok) {
      const phpData = await phpRes.json();
      if (phpData && phpData.success === true) {
        BACKEND_MODE = 'php';
        serverOnline = true;
        elements.serverStatus.className = 'badge status-badge online';
        elements.serverStatus.style.backgroundColor = '';
        elements.serverStatus.style.color = '';
        elements.serverStatus.innerHTML = '<span class="dot"></span> Server Connected (Hostinger PHP Mode)';
        logToConsole('Terhubung ke PHP Backend Server (Hostinger). Pengiriman SMTP native aktif.', 'success');
        return;
      }
    }
  } catch (e) {
    // PHP backend not available
  }

  // 2. Try Node.js Express Backend
  const candidateUrls = ['', 'http://localhost:3000', 'http://127.0.0.1:3000'];
  for (const baseUrl of candidateUrls) {
    try {
      const response = await fetch(`${baseUrl}/api/clean-attachments`, { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        if (data && data.success === true) {
          API_BASE_URL = baseUrl;
          BACKEND_MODE = 'node';
          serverOnline = true;
          elements.serverStatus.className = 'badge status-badge online';
          elements.serverStatus.style.backgroundColor = '';
          elements.serverStatus.style.color = '';
          elements.serverStatus.innerHTML = '<span class="dot"></span> Server Connected (Nodemailer Mode)';
          logToConsole(`Terhubung ke Express Server backend (${baseUrl || 'local'}). Pengiriman via Nodemailer aktif.`, 'success');
          return;
        }
      }
    } catch (e) {
      // try next candidate
    }
  }

  // 3. Fallback to Browser Mode (SMTPJS Direct)
  BACKEND_MODE = 'offline';
  serverOnline = false;
  elements.serverStatus.className = 'badge status-badge offline';
  elements.serverStatus.style.backgroundColor = 'var(--warning-light)';
  elements.serverStatus.style.color = '#92400e';
  elements.serverStatus.innerHTML = '<span class="dot" style="background-color: var(--warning)"></span> Browser Mode (SMTPJS Direct)';
  logToConsole('Backend Server offline. Berjalan dalam Browser Mode (Pengiriman langsung menggunakan SMTPJS).', 'warn');
}

// Local Storage for SMTP
function loadSmtpFromStorage() {
  const saved = localStorage.getItem('smtp_config');
  if (saved) {
    try {
      smtpConfig = JSON.parse(saved);
      elements.smtpHost.value = smtpConfig.host || 'smtp.gmail.com';
      elements.smtpPort.value = smtpConfig.port || '587';
      elements.smtpSecure.checked = smtpConfig.secure === true;
      elements.smtpUser.value = smtpConfig.user || '';
      elements.smtpPass.value = smtpConfig.pass || '';
      elements.smtpFromName.value = smtpConfig.fromName || 'MNC University';
      updatePreviewEnvelope();
    } catch (e) {
      console.error('Error parsing saved SMTP settings', e);
    }
  }
}

function saveSmtpToStorage() {
  smtpConfig = {
    host: elements.smtpHost.value.trim(),
    port: elements.smtpPort.value.trim(),
    secure: elements.smtpSecure.checked,
    user: elements.smtpUser.value.trim(),
    pass: elements.smtpPass.value.trim(),
    fromName: elements.smtpFromName.value.trim()
  };
  localStorage.setItem('smtp_config', JSON.stringify(smtpConfig));
  updatePreviewEnvelope();
  showSmtpMessage('Konfigurasi SMTP disimpan ke browser.', 'success');
}

function updatePreviewEnvelope() {
  const fromName = elements.smtpFromName.value || 'MNC University';
  const fromUser = elements.smtpUser.value || 'pengirim@domain.com';
  elements.previewEnvFrom.textContent = `${fromName} <${fromUser}>`;
}

function showSmtpMessage(msg, type) {
  elements.smtpTestMessage.innerHTML = type === 'success' 
    ? `<i class="fa-solid fa-circle-check" style="margin-right:6px"></i>${msg}` 
    : `<i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>${msg}`;
  elements.smtpTestMessage.className = `status-msg ${type}`;
  setTimeout(() => {
    elements.smtpTestMessage.className = 'status-msg hide';
  }, 7000);
}

// SMTP Test Connection
async function testSmtpConnection() {
  const host = elements.smtpHost.value.trim();
  const port = elements.smtpPort.value.trim();
  const secure = elements.smtpSecure.checked;
  const user = elements.smtpUser.value.trim();
  const pass = elements.smtpPass.value.trim();

  if (!host || !port || !user || !pass) {
    showSmtpMessage('Lengkapi formulir SMTP terlebih dahulu (Host, Port, Email, & Password).', 'error');
    return;
  }

  saveSmtpToStorage();

  elements.btnTestSmtp.disabled = true;
  elements.btnTestSmtp.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menghubungkan...';
  logToConsole(`Mengetes koneksi SMTP (${host}:${port})...`, 'info');

  try {
    let verifyUrl = 'api.php?action=verify';
    if (BACKEND_MODE === 'node') {
      verifyUrl = `${API_BASE_URL || 'http://localhost:3000'}/api/verify-smtp`;
    }

    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, secure, user, pass })
    });

    if (!response.ok) {
      throw new Error(`HTTP Status ${response.status}`);
    }

    const result = await response.json();
    serverOnline = true;
    elements.serverStatus.className = 'badge status-badge online';
    elements.serverStatus.style.backgroundColor = '';
    elements.serverStatus.style.color = '';
    elements.serverStatus.innerHTML = `<span class="dot"></span> Server Connected (${BACKEND_MODE === 'php' ? 'Hostinger PHP' : 'Nodemailer'} Mode)`;

    if (result.success) {
      showSmtpMessage(result.message, 'success');
      logToConsole(`Koneksi SMTP Terverifikasi! ${result.message}`, 'success');
    } else {
      showSmtpMessage(result.error || 'Koneksi SMTP gagal.', 'error');
      logToConsole(`Koneksi SMTP gagal: ${result.error}`, 'error');
    }
  } catch (error) {
    serverOnline = false;
    elements.serverStatus.className = 'badge status-badge offline';
    elements.serverStatus.style.backgroundColor = 'var(--warning-light)';
    elements.serverStatus.style.color = '#92400e';
    elements.serverStatus.innerHTML = '<span class="dot" style="background-color: var(--warning)"></span> Browser Mode (SMTPJS Direct)';
    
    showSmtpMessage('Konfigurasi tersimpan di browser! Siap digunakan dalam Browser Mode (SMTPJS).', 'success');
    logToConsole('Express/PHP server offline. Menggunakan Browser Mode (SMTPJS).', 'warn');
  } finally {
    elements.btnTestSmtp.disabled = false;
    elements.btnTestSmtp.innerHTML = '<i class="fa-solid fa-wifi"></i> Tes Koneksi';
  }
}

// Preset Loader
function loadPreset(key) {
  if (PRESETS[key]) {
    elements.emailSubject.value = PRESETS[key].subject;
    elements.emailBody.value = PRESETS[key].body;
    updatePresetButtonState(key);
    updatePreview();
  }
}

function updatePresetButtonState(activeKey) {
  elements.btnPresetMnc.className = activeKey === 'mnc' ? 'btn-preset active' : 'btn-preset';
  elements.btnPresetSimple.className = activeKey === 'simple' ? 'btn-preset active' : 'btn-preset';
}

// Event Listeners Setup
function setupEventListeners() {
  // Theme Toggle
  elements.themeToggle.addEventListener('click', toggleTheme);

  // SMTP Settings
  elements.btnSaveSmtp.addEventListener('click', saveSmtpToStorage);
  elements.btnTestSmtp.addEventListener('click', testSmtpConnection);
  elements.toggleSmtpPass.addEventListener('click', () => {
    const type = elements.smtpPass.type === 'password' ? 'text' : 'password';
    elements.smtpPass.type = type;
    const eyeIcon = elements.toggleSmtpPass.querySelector('i');
    eyeIcon.className = type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
  });

  // Tab controls
  elements.tabLinks.forEach(link => {
    link.addEventListener('click', () => {
      elements.tabLinks.forEach(l => l.classList.remove('active'));
      elements.tabContents.forEach(c => c.classList.remove('active'));
      
      link.classList.add('active');
      const tabId = link.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Manual Recipient Add
  elements.btnQuickAdd.addEventListener('click', addRecipientFromQuickInput);
  elements.quickNama.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') elements.quickEmail.focus();
  });
  elements.quickEmail.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addRecipientFromQuickInput();
  });

  // Import text / Excel paste
  elements.btnImportPaste.addEventListener('click', importPasteText);

  // Clear recipients
  elements.btnClearRecipients.addEventListener('click', () => {
    if (confirm('Apakah Anda yakin ingin menghapus semua data penerima?')) {
      recipients = [];
      currentPreviewIndex = 0;
      renderRecipientTable();
      updatePreview();
      updateSendingStats();
      logToConsole('Daftar penerima dibersihkan.', 'warn');
    }
  });

  // CSV file import
  elements.csvFile.addEventListener('change', handleCsvUpload);

  // Email template changes
  elements.emailSubject.addEventListener('input', updatePreview);
  elements.emailBody.addEventListener('input', updatePreview);
  elements.waLink.addEventListener('input', updatePreview);
  elements.emailProgram.addEventListener('input', updatePreview);
  elements.emailHeaderTitle.addEventListener('input', updatePreview);
  elements.emailSignature.addEventListener('input', updatePreview);

  // Variable buttons
  elements.variableBadges.forEach(badge => {
    badge.addEventListener('click', () => {
      const variable = badge.getAttribute('data-var');
      insertTextAtCursor(elements.emailBody, variable);
      updatePreview();
    });
  });

  // Preset buttons
  elements.btnPresetMnc.addEventListener('click', () => loadPreset('mnc'));
  elements.btnPresetSimple.addEventListener('click', () => loadPreset('simple'));

  // Preview Carousel Navigation
  elements.prevPreview.addEventListener('click', () => {
    if (currentPreviewIndex > 0) {
      currentPreviewIndex--;
      updatePreview();
    }
  });

  elements.nextPreview.addEventListener('click', () => {
    if (currentPreviewIndex < recipients.length - 1) {
      currentPreviewIndex++;
      updatePreview();
    }
  });

  // File Upload Drag and Drop Events
  const dropzone = elements.dropzone;
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handleAttachmentUpload(e.dataTransfer.files[0]);
    }
  });

  elements.attachmentFileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      handleAttachmentUpload(e.target.files[0]);
    }
  });

  elements.btnRemoveAttachment.addEventListener('click', removeAttachment);

  // Auto Certificate toggle listener
  elements.autoCert.addEventListener('change', (e) => {
    if (e.target.checked) {
      if (uploadedAttachment) {
        if (confirm('Mengaktifkan sertifikat otomatis akan menghapus lampiran manual saat ini. Lanjutkan?')) {
          removeAttachment();
        } else {
          e.target.checked = false;
          return;
        }
      }
      elements.dropzone.style.opacity = '0.4';
      elements.dropzone.style.pointerEvents = 'none';
      elements.uploadStatusText.innerHTML = '<i class="fa-solid fa-graduation-cap" style="color: var(--primary)"></i> Sertifikat Otomatis Aktif';
      elements.certSettingsPanel.classList.remove('hide');
    } else {
      elements.dropzone.style.opacity = '1';
      elements.dropzone.style.pointerEvents = 'auto';
      elements.uploadStatusText.innerHTML = 'Pilih atau Seret File PDF di Sini';
      elements.certSettingsPanel.classList.add('hide');
    }
  });

  // Custom Certificate template background upload
  elements.certBgInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        customCertBgBase64 = evt.target.result;
        logToConsole(`Template background sertifikat kustom diunggah: ${file.name}`, 'success');
      };
      reader.readAsDataURL(file);
    }
  });

  // Slider controls update values labels
  elements.certNameY.addEventListener('input', (e) => {
    elements.certNameYVal.textContent = e.target.value + 'px';
  });

  elements.certNameSize.addEventListener('input', (e) => {
    elements.certNameSizeVal.textContent = e.target.value + 'px';
  });

  // Modal controls
  elements.btnPreviewCert.addEventListener('click', () => {
    const canvas = elements.certPreviewCanvas;
    let nameToPreview = 'Siti mutia hanum';
    let programToPreview = elements.emailProgram.value || 'Young Manager Excellent Scholarship';
    
    // Use active recipient info if loaded
    if (recipients.length > 0) {
      nameToPreview = recipients[currentPreviewIndex] ? recipients[currentPreviewIndex].nama : recipients[0].nama;
      programToPreview = (recipients[currentPreviewIndex] && recipients[currentPreviewIndex].program) ? recipients[currentPreviewIndex].program : programToPreview;
    }
    
    logToConsole('Menyusun pratinjau sertifikat...', 'info');
    drawCertificateOnCanvas(canvas, nameToPreview, programToPreview, () => {
      elements.certModal.classList.remove('hide');
      logToConsole('Pratinjau sertifikat ditampilkan.', 'success');
    });
  });

  elements.btnCloseCertModal.addEventListener('click', () => {
    elements.certModal.classList.add('hide');
  });

  elements.certModal.addEventListener('click', (e) => {
    if (e.target === elements.certModal) {
      elements.certModal.classList.add('hide');
    }
  });

  // Bulk sending buttons
  elements.btnStartSending.addEventListener('click', startSendingCampaign);
  elements.btnPauseSending.addEventListener('click', pauseSendingCampaign);
  elements.btnStopSending.addEventListener('click', resetSendingCampaign);
  elements.btnClearLogs.addEventListener('click', () => {
    elements.consoleLogs.innerHTML = '';
  });
}

// Helper to insert variable tags at current cursor
function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  textarea.value = val.substring(0, start) + text + val.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
}

// Add recipient manually
function addRecipientFromQuickInput() {
  const nama = elements.quickNama.value.trim();
  const email = elements.quickEmail.value.trim();

  if (!nama || !email) {
    alert('Nama dan Email harus diisi.');
    return;
  }

  if (!validateEmail(email)) {
    alert('Format email tidak valid.');
    return;
  }

  const id = Date.now();
  recipients.push({
    id,
    nama,
    email,
    program: elements.emailProgram.value || ''
  });

  elements.quickNama.value = '';
  elements.quickEmail.value = '';
  elements.quickNama.focus();

  renderRecipientTable();
  if (recipients.length === 1) {
    currentPreviewIndex = 0;
  }
  updatePreview();
  updateSendingStats();
  logToConsole(`Penerima ditambahkan: ${nama} (${email})`, 'info');
}

// Email Validator
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Render Table
function renderRecipientTable() {
  const body = elements.recipientListBody;
  body.innerHTML = '';

  if (recipients.length === 0) {
    elements.tableEmptyState.classList.remove('hide');
    return;
  }

  elements.tableEmptyState.classList.add('hide');

  recipients.forEach((item, index) => {
    const tr = document.createElement('tr');
    if (index === currentPreviewIndex) {
      tr.className = 'active';
    }

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td class="cell-editable" data-id="${item.id}" data-field="nama" contenteditable="true">${item.nama}</td>
      <td class="cell-editable" data-id="${item.id}" data-field="email" contenteditable="true">${item.email}</td>
      <td class="cell-editable" data-id="${item.id}" data-field="program" contenteditable="true">${item.program}</td>
      <td style="text-align: center;">
        <button class="btn-remove-row" data-id="${item.id}">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    `;

    // Make table fields directly editable and sync back to array
    tr.querySelectorAll('.cell-editable').forEach(cell => {
      cell.addEventListener('blur', (e) => {
        const id = parseInt(e.target.getAttribute('data-id'));
        const field = e.target.getAttribute('data-field');
        const value = e.target.textContent.trim();
        
        const rec = recipients.find(r => r.id === id);
        if (rec) {
          rec[field] = value;
          updatePreview();
        }
      });
    });

    // Selection highlight for preview
    tr.addEventListener('click', (e) => {
      if (!e.target.closest('.btn-remove-row') && !e.target.hasAttribute('contenteditable')) {
        currentPreviewIndex = index;
        renderRecipientTable();
        updatePreview();
      }
    });

    // Remove row event
    tr.querySelector('.btn-remove-row').addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(e.target.closest('.btn-remove-row').getAttribute('data-id'));
      recipients = recipients.filter(r => r.id !== id);
      
      if (currentPreviewIndex >= recipients.length) {
        currentPreviewIndex = Math.max(0, recipients.length - 1);
      }
      
      renderRecipientTable();
      updatePreview();
      updateSendingStats();
    });

    body.appendChild(tr);
  });
}

// Bulk Import paste text
function importPasteText() {
  const text = elements.bulkPasteText.value.trim();
  if (!text) {
    alert('Silakan tempel teks penerima terlebih dahulu.');
    return;
  }

  const lines = text.split('\n');
  let addedCount = 0;

  lines.forEach(line => {
    if (!line.trim()) return;
    // split by comma, tab, or semicolon
    let parts = line.split(/[,\t;]/);
    if (parts.length >= 2) {
      const nama = parts[0].trim();
      const email = parts[1].trim();
      const program = parts[2] ? parts[2].trim() : '';

      if (validateEmail(email)) {
        recipients.push({
          id: Date.now() + Math.random(),
          nama,
          email,
          program
        });
        addedCount++;
      }
    }
  });

  elements.bulkPasteText.value = '';
  renderRecipientTable();
  if (addedCount > 0 && recipients.length === addedCount) {
    currentPreviewIndex = 0;
  }
  updatePreview();
  updateSendingStats();
  logToConsole(`Berhasil mengimpor ${addedCount} penerima dari teks.`, 'success');
}

// CSV file drag & upload handler
function handleCsvUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  logToConsole(`Membaca file CSV: ${file.name}...`, 'info');

  const reader = new FileReader();
  reader.onload = function(evt) {
    const text = evt.target.result;
    // Split by newlines (supporting both Windows \r\n and Unix \n)
    const lines = text.split(/\r?\n/);
    let addedCount = 0;

    // Detect delimiter (comma or semicolon)
    let delimiter = ',';
    if (lines.length > 0) {
      const firstLine = lines[0];
      const commaCount = (firstLine.match(/,/g) || []).length;
      const semiCount = (firstLine.match(/;/g) || []).length;
      if (semiCount > commaCount) {
        delimiter = ';';
        logToConsole('Mendeteksi delimiter Semicolon (;).', 'info');
      } else {
        logToConsole('Mendeteksi delimiter Comma (,).', 'info');
      }
    }

    lines.forEach((line, index) => {
      if (!line.trim()) return;
      
      // Split on detected delimiter
      const parts = line.split(delimiter);
      if (parts.length >= 2) {
        // Strip quotes around strings
        const nama = parts[0].replace(/^["']|["']$/g, '').trim();
        const email = parts[1].replace(/^["']|["']$/g, '').trim();
        const program = parts[2] ? parts[2].replace(/^["']|["']$/g, '').trim() : '';

        // Validate email format and skip header row
        if (validateEmail(email)) {
          recipients.push({
            id: Date.now() + Math.random() + index,
            nama,
            email,
            program
          });
          addedCount++;
        }
      }
    });

    renderRecipientTable();
    if (addedCount > 0 && recipients.length === addedCount) {
      currentPreviewIndex = 0;
    }
    updatePreview();
    updateSendingStats();
    
    if (addedCount > 0) {
      logToConsole(`Berhasil mengimpor ${addedCount} penerima dari CSV.`, 'success');
    } else {
      logToConsole('Gagal mengimpor data. Pastikan format CSV benar: Kolom 1 = Nama, Kolom 2 = Email.', 'error');
      alert('Format CSV tidak sesuai.\nPastikan kolom 1 adalah Nama dan kolom 2 adalah Email.');
    }
  };
  
  reader.readAsText(file);
  // reset file input
  elements.csvFile.value = '';
}

// Attachment File Upload to Server
async function handleAttachmentUpload(file) {
  if (!file) return;
  
  elements.uploadStatusText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memproses ${file.name}...`;
  elements.btnRemoveAttachment.classList.add('hide');

  // We read the file as base64 on client-side for SMTPJS fallback first
  const reader = new FileReader();
  reader.onload = async function(e) {
    const base64Data = e.target.result;
    
    // Store file name and base64 data on client side
    uploadedAttachment = {
      filename: file.name,
      originalname: file.name,
      data: base64Data
    };
    
    elements.uploadStatusText.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--success)"></i> ${file.name} (${formatBytes(file.size)})`;
    elements.btnRemoveAttachment.classList.remove('hide');
    logToConsole(`File lampiran diproses lokal: ${file.name}`, 'success');
    
    // If backend server is online, upload it to the server as well
    if (serverOnline) {
      elements.uploadStatusText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengunggah ke server...`;
      const formData = new FormData();
      formData.append('attachment', file);
      
      try {
        const response = await fetch(`${API_BASE_URL}/api/upload-attachment`, {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        if (result.success) {
          // Merge server file details but keep client side base64 data too
          uploadedAttachment = {
            ...uploadedAttachment,
            filename: result.file.filename,
            path: result.file.path
          };
          elements.uploadStatusText.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--success)"></i> ${file.name} (${formatBytes(file.size)})`;
          logToConsole(`File lampiran berhasil disinkronisasi ke server.`, 'success');
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        logToConsole(`Gagal sinkronisasi lampiran ke server, fallback ke browser memory: ${error.message || error}`, 'warn');
        elements.uploadStatusText.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--warning)"></i> ${file.name} (Lokal)`;
      }
    }
  };
  
  reader.onerror = function() {
    elements.uploadStatusText.innerHTML = '<span style="color: var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Gagal membaca file.</span>';
    logToConsole(`Gagal membaca file lampiran.`, 'error');
  };
  
  reader.readAsDataURL(file);
}

async function removeAttachment() {
  uploadedAttachment = null;
  elements.attachmentFileInput.value = '';
  elements.uploadStatusText.innerHTML = 'Pilih atau Seret File PDF di Sini';
  elements.btnRemoveAttachment.classList.add('hide');
  
  try {
    await fetch(`${API_BASE_URL}/api/clean-attachments`, { method: 'POST' });
    logToConsole('Lampiran dibersihkan.', 'info');
  } catch (e) {
    console.error('Error cleaning file attachments from server', e);
  }
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Live Preview Compiler
function updatePreview() {
  if (recipients.length === 0) {
    elements.prevPreview.disabled = true;
    elements.nextPreview.disabled = true;
    elements.previewIndex.textContent = '0 / 0';
    elements.previewEnvTo.textContent = 'penerima@domain.com';
    elements.previewEnvSubject.textContent = elements.emailSubject.value || '(Tidak ada subjek)';
    
    // Fallback simple frame rendering using plain text compiler
    elements.emailRenderFrame.innerHTML = compileEmailHtml(elements.emailBody.value, {
      nama: 'Nama Penerima',
      email: 'penerima@domain.com'
    });
    return;
  }

  // Bounds check
  if (currentPreviewIndex >= recipients.length) {
    currentPreviewIndex = recipients.length - 1;
  }
  if (currentPreviewIndex < 0) {
    currentPreviewIndex = 0;
  }

  const rec = recipients[currentPreviewIndex];
  
  // Enable/disable navigation buttons
  elements.prevPreview.disabled = currentPreviewIndex === 0;
  elements.nextPreview.disabled = currentPreviewIndex === recipients.length - 1;
  elements.previewIndex.textContent = `${currentPreviewIndex + 1} / ${recipients.length}`;

  // Subject parsing
  const parsedSubject = parseTemplate(elements.emailSubject.value, rec);
  elements.previewEnvTo.textContent = `${rec.nama} <${rec.email}>`;
  elements.previewEnvSubject.textContent = parsedSubject || '(Tidak ada subjek)';

  // Body compilation (Convert plain text to HTML shell with paten logo)
  const parsedBody = compileEmailHtml(elements.emailBody.value, rec);
  elements.emailRenderFrame.innerHTML = parsedBody;

  // Highlights active table row
  const rows = elements.recipientListBody.querySelectorAll('tr');
  rows.forEach((row, idx) => {
    if (idx === currentPreviewIndex) {
      row.classList.add('active');
    } else {
      row.classList.remove('active');
    }
  });
}

// Compile plain text email body to MNC University branded HTML layout
function compileEmailHtml(plainTextBody, data) {
  // Replace nama and email placeholders first
  let bodyText = (plainTextBody || '')
    .replace(/\{\{nama\}\}/g, data.nama || '')
    .replace(/\{\{email\}\}/g, data.email || '');

  // Format program placeholder in bold and blue (MNC Royal Blue)
  const programVal = (elements.emailProgram ? elements.emailProgram.value.trim() : '') || data.program || '';
  const formattedProgram = `<strong style="font-weight: 700; color: #0f3080;">${programVal}</strong>`;
  bodyText = bodyText.replace(/\{\{program\}\}/g, formattedProgram);

  // Split plain text by double newlines into paragraphs
  const paragraphs = bodyText.split('\n\n');
  let paragraphsHtml = '';
  paragraphs.forEach(p => {
    if (p.trim()) {
      const parsedParagraph = p.trim().replace(/\n/g, '<br>');
      paragraphsHtml += `  <div class="mnc-body-text" style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 16px;">${parsedParagraph}</div>\n`;
    }
  });

  // Handle optional WhatsApp button rendering
  const waLink = elements.waLink.value.trim();
  let waButtonHtml = '';
  if (waLink) {
    waButtonHtml = `
  <div style="text-align: center; margin: 30px 0;">
    <a href="${waLink}" class="mnc-cta-btn" style="display: inline-block; background-color: #25d366; color: white !important; text-decoration: none; font-weight: bold; padding: 12px 28px; border-radius: 8px; font-size: 14px; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3); font-family: 'Inter', sans-serif;" target="_blank">
      <i class="fab fa-whatsapp" style="margin-right: 8px;"></i> WhatsApp Group Resmi
    </a>
  </div>`;
  }

  // Compile dynamic header title
  const rawHeaderTitle = elements.emailHeaderTitle ? elements.emailHeaderTitle.value : 'Selamat! Pendaftaran Terverifikasi';
  const parsedHeaderTitle = parseTemplate(rawHeaderTitle, data);

  // Compile dynamic signature block
  const rawSignature = elements.emailSignature ? elements.emailSignature.value : 'Best Regards,\nPanitia {{program}}';
  const parsedSignature = parseTemplate(rawSignature, data);
  const sigLines = parsedSignature.split('\n');
  let sigHtml = '';
  sigLines.forEach((line, index) => {
    if (index === 0) {
      sigHtml += `<strong>${line}</strong><br>`;
    } else {
      sigHtml += `<strong style="color: #0f3080;">${line}</strong><br>`;
    }
  });

  // Return the fully compiled premium HTML shell with locked logo, styling and signature
  return `<div class="mnc-email-wrapper" style="font-family: 'Outfit', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; text-align: left; background-color: #ffffff;">
  <div class="mnc-header" style="padding: 10px 0 12px 0; text-align: left;">
    <img src="logo.png" alt="MNC University Logo" style="height: 45px; display: block; max-width: 100%; object-fit: contain;">
  </div>
  <div style="height: 3px; background-color: #0f3080; width: 100%; margin-bottom: 25px;"></div>
  
  <div class="mnc-title" style="font-size: 22px; font-weight: 700; color: #0f3080; margin-bottom: 20px;">${parsedHeaderTitle}</div>
  
  <div class="mnc-salutation" style="font-size: 15px; margin-bottom: 16px;">Halo <strong style="font-weight: 700; color: #0f3080;">${data.nama || ''}</strong>,</div>
  
  ${paragraphsHtml}
  
  ${waButtonHtml}

  <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 14px; line-height: 1.6; color: #334155; font-family: 'Outfit', Arial, sans-serif;">
    ${sigHtml}
  </div>
 </div>`;
}

function parseTemplate(templateText, data) {
  if (!templateText) return '';
  const programVal = (elements.emailProgram ? elements.emailProgram.value.trim() : '') || data.program || '';
  return templateText
    .replace(/\{\{nama\}\}/g, data.nama || '')
    .replace(/\{\{program\}\}/g, programVal)
    .replace(/\{\{email\}\}/g, data.email || '');
}

// Console Logger
function logToConsole(text, type = 'info') {
  const row = document.createElement('div');
  row.className = `log-row ${type}`;
  const timestamp = new Date().toLocaleTimeString();
  row.textContent = `[${timestamp}] ${text}`;
  elements.consoleLogs.appendChild(row);
  elements.consoleLogs.scrollTop = elements.consoleLogs.scrollHeight;
}

// Stats & Campaign Controller
function updateSendingStats() {
  const total = recipients.length;
  const remaining = Math.max(0, total - (successCount + failedCount));

  elements.statTotal.textContent = total;
  elements.statSuccess.textContent = successCount;
  elements.statFailed.textContent = failedCount;
  elements.statRemaining.textContent = remaining;

  // Update progress bar
  const progressPercent = total > 0 ? Math.round(((successCount + failedCount) / total) * 100) : 0;
  elements.progressBar.style.width = `${progressPercent}%`;
  elements.progressText.textContent = `${progressPercent}%`;

  // Start sending enabled only when recipients loaded and SMTP details exists
  const isSmtpConfigured = smtpConfig.host && smtpConfig.user && smtpConfig.pass;
  elements.btnStartSending.disabled = isSending || total === 0 || !isSmtpConfigured;
  elements.btnStopSending.disabled = !isSending && successCount === 0 && failedCount === 0;
}

// Send Campaign Management
function startSendingCampaign() {
  if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
    alert('Konfigurasi SMTP belum diisi / disimpan.');
    return;
  }
  if (recipients.length === 0) {
    alert('Belum ada data penerima.');
    return;
  }

  isSending = true;
  isPaused = false;
  
  elements.btnStartSending.classList.add('hide');
  elements.btnPauseSending.classList.remove('hide');
  elements.btnStopSending.disabled = false;
  elements.sendDelay.disabled = true;

  logToConsole('Memulai pengiriman massal...', 'info');
  updateSendingStats();
  sendNextMail();
}

function pauseSendingCampaign() {
  isPaused = true;
  isSending = false;
  
  elements.btnStartSending.classList.remove('hide');
  elements.btnStartSending.disabled = false;
  elements.btnStartSending.innerHTML = '<i class="fa-solid fa-play"></i> Lanjutkan Pengiriman';
  elements.btnPauseSending.classList.add('hide');
  
  if (sendTimeoutId) {
    clearTimeout(sendTimeoutId);
  }
  
  logToConsole('Pengiriman dijeda oleh pengguna.', 'warn');
  updateSendingStats();
}

function resetSendingCampaign() {
  isSending = false;
  isPaused = false;
  currentSendIndex = 0;
  successCount = 0;
  failedCount = 0;

  if (sendTimeoutId) {
    clearTimeout(sendTimeoutId);
  }

  elements.btnStartSending.classList.remove('hide');
  elements.btnStartSending.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Mulai Pengiriman';
  elements.btnPauseSending.classList.add('hide');
  elements.sendDelay.disabled = false;

  logToConsole('Progress pengiriman di-reset.', 'warn');
  updateSendingStats();
}

async function sendNextMail() {
  if (!isSending || isPaused) return;

  const total = recipients.length;
  const processed = successCount + failedCount;

  if (processed >= total) {
    // Campaign Finished
    isSending = false;
    elements.btnStartSending.classList.remove('hide');
    elements.btnStartSending.innerHTML = '<i class="fa-solid fa-circle-check"></i> Pengiriman Selesai';
    elements.btnStartSending.disabled = true;
    elements.btnPauseSending.classList.add('hide');
    elements.sendDelay.disabled = false;
    
    logToConsole(`Kampanye selesai! Sukses: ${successCount}, Gagal: ${failedCount}`, 'success');
    alert(`Pengiriman selesai!\nBerhasil: ${successCount}\nGagal: ${failedCount}`);
    updateSendingStats();
    return;
  }

  const rec = recipients[processed];
  
  // Highlight preview to current sending
  currentPreviewIndex = processed;
  renderRecipientTable();
  updatePreview();

  logToConsole(`Mengirim ke ${rec.nama} (${rec.email})...`, 'info');

  const parsedSubject = parseTemplate(elements.emailSubject.value, rec);
  const parsedBody = compileEmailHtml(elements.emailBody.value, rec);

  // Dynamic Certificate Generation
  let currentAttachment = uploadedAttachment;
  if (elements.autoCert.checked) {
    try {
      logToConsole(`Membangkitkan sertifikat PDF otomatis untuk ${rec.nama}...`, 'info');
      const pdfBase64 = await generateCertificatePDF(rec.nama, rec.program);
      currentAttachment = {
        filename: `Sertifikat_${rec.nama.replace(/\s+/g, '_')}.pdf`,
        originalname: `Sertifikat_${rec.nama.replace(/\s+/g, '_')}.pdf`,
        data: pdfBase64
      };
      logToConsole(`Sertifikat PDF untuk ${rec.nama} berhasil dibuat.`, 'success');
    } catch (certError) {
      logToConsole(`Gagal membuat sertifikat untuk ${rec.nama}: ${certError.message || certError}. Mengirim tanpa sertifikat otomatis.`, 'warn');
    }
  }

  if (serverOnline) {
    // Mode 1: Send via PHP / Node.js Backend Server
    try {
      let sendUrl = 'api.php?action=send';
      if (BACKEND_MODE === 'node') {
        sendUrl = `${API_BASE_URL}/api/send-email`;
      }

      const response = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpConfig: smtpConfig,
          recipientEmail: rec.email,
          subject: parsedSubject,
          htmlBody: parsedBody,
          attachment: currentAttachment
        })
      });

      const result = await response.json();
      if (result.success) {
        successCount++;
        logToConsole(`Terkirim ke ${rec.nama} (${rec.email})`, 'success');
      } else {
        failedCount++;
        logToConsole(`Gagal mengirim ke ${rec.nama}: ${result.error}`, 'error');
      }
    } catch (error) {
      failedCount++;
      logToConsole(`Gagal mengirim ke ${rec.nama}: API Error / Offline (${error.message || error})`, 'error');
    }
  } else {
    // Mode 2: Send via SMTPJS Client-Side Direct
    try {
      const smtpParams = {
        Host: smtpConfig.host,
        Username: smtpConfig.user,
        Password: smtpConfig.pass,
        To: rec.email,
        From: `${smtpConfig.fromName || 'MNC University'} <${smtpConfig.user}>`,
        Subject: parsedSubject,
        Body: parsedBody
      };

      if (currentAttachment && currentAttachment.data) {
        smtpParams.Attachments = [
          {
            name: currentAttachment.originalname,
            data: currentAttachment.data // Base64 Data URL
          }
        ];
      }

      // Call SMTPJS
      const message = await Email.send(smtpParams);
      if (message === "OK") {
        successCount++;
        logToConsole(`Terkirim ke ${rec.nama} (${rec.email}) via SMTPJS`, 'success');
      } else {
        failedCount++;
        logToConsole(`Gagal mengirim ke ${rec.nama} via SMTPJS: ${message}`, 'error');
      }
    } catch (error) {
      failedCount++;
      logToConsole(`Gagal mengirim ke ${rec.nama} via SMTPJS: ${error.message || error}`, 'error');
    }
  }

  updateSendingStats();

  // Trigger delay for next email
  const delaySec = parseFloat(elements.sendDelay.value) || 2;
  logToConsole(`Menunggu ${delaySec} detik sebelum pengiriman berikutnya...`, 'info');
  
  sendTimeoutId = setTimeout(() => {
    sendNextMail();
  }, delaySec * 1000);
}

// Client-Side Canvas Certificate Generator (PDF Landscape Format)
function generateCertificatePDF(nama, program) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    drawCertificateOnCanvas(canvas, nama, program, () => {
      try {
        const canvasDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
          orientation: 'landscape',
          unit: 'px',
          format: [1000, 700]
        });
        doc.addImage(canvasDataUrl, 'JPEG', 0, 0, 1000, 700);
        const pdfBase64 = doc.output('datauristring');
        resolve(pdfBase64);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Universal Drawing Helper
function drawCertificateOnCanvas(canvas, nama, program, callback) {
  const ctx = canvas.getContext('2d');
  canvas.width = 1000;
  canvas.height = 700;

  const finalProgram = program || (elements.emailProgram ? elements.emailProgram.value : '') || '';

  if (customCertBgBase64) {
    // Mode A: Custom template image uploaded
    const bgImg = new Image();
    bgImg.src = customCertBgBase64;
    bgImg.onload = function() {
      // Draw background template image
      ctx.drawImage(bgImg, 0, 0, 1000, 700);
      
      // Get adjustments from UI inputs
      const nameY = parseInt(elements.certNameY.value) || 320;
      const fontSize = parseInt(elements.certNameSize.value) || 32;
      const fontColor = elements.certNameColor.value || '#0f3080';
      
      // Draw name text on top of template
      ctx.textAlign = 'center';
      ctx.fillStyle = fontColor;
      ctx.font = `bold ${fontSize}px Georgia, serif`;
      ctx.fillText(nama, 500, nameY);
      
      if (callback) callback();
    };
    bgImg.onerror = function() {
      logToConsole('Gagal memuat template gambar kustom. Menggunakan template bawaan.', 'warn');
      drawDefaultCertificateOnCanvas(canvas, ctx, nama, finalProgram, callback);
    };
  } else {
    // Mode B: Default MNC University certificate style
    drawDefaultCertificateOnCanvas(canvas, ctx, nama, finalProgram, callback);
  }
}

function drawDefaultCertificateOnCanvas(canvas, ctx, nama, program, callback) {
  // Ivory background
  ctx.fillStyle = '#FAF9F5';
  ctx.fillRect(0, 0, 1000, 700);
  
  // Outer deep blue border
  ctx.strokeStyle = '#0f3080';
  ctx.lineWidth = 15;
  ctx.strokeRect(15, 15, 970, 670);
  
  // Inner gold border
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, 944, 644);
  
  // Corner accents
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(10, 10, 4, 100);
  ctx.fillRect(10, 10, 100, 4);
  
  // Draw logo image
  const logo = new Image();
  logo.src = 'logo.png';
  logo.onload = function() {
    const logoWidth = 240;
    const logoHeight = 80;
    ctx.drawImage(logo, (1000 - logoWidth) / 2, 60, logoWidth, logoHeight);
    
    WriteCertificateText(canvas, ctx, nama, program);
    if (callback) callback();
  };
  logo.onerror = function() {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f3080';
    ctx.font = 'bold 36px Georgia, serif';
    ctx.fillText('MNC UNIVERSITY', 500, 100);
    
    WriteCertificateText(canvas, ctx, nama, program);
    if (callback) callback();
  };
}

function WriteCertificateText(canvas, ctx, nama, program) {
  ctx.textAlign = 'center';
  
  // "SERTIFIKAT APRESIASI"
  ctx.fillStyle = '#0f3080';
  ctx.font = 'bold 36px Georgia, serif';
  ctx.fillText('SERTIFIKAT APRESIASI', 500, 200);
  
  // Certificate ID
  ctx.fillStyle = '#64748b';
  ctx.font = '14px Arial, sans-serif';
  const certNo = 'No: MNCU/FLS/' + new Date().getFullYear() + '/' + Math.floor(1000 + Math.random() * 9000);
  ctx.fillText(certNo, 500, 225);
  
  // "Diberikan kepada:"
  ctx.fillStyle = '#475569';
  ctx.font = 'italic 18px Georgia, serif';
  ctx.fillText('Diberikan kepada:', 500, 270);
  
  // Recipient Name (Y position matches slider default)
  const nameY = parseInt(elements.certNameY.value) || 320;
  const fontSize = parseInt(elements.certNameSize.value) || 32;
  const fontColor = elements.certNameColor.value || '#0f3080';

  ctx.fillStyle = fontColor;
  ctx.font = `bold ${fontSize}px Georgia, serif`;
  ctx.fillText(nama, 500, nameY);
  
  // Gold line decoration under name
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(350, nameY + 15, 300, 3);
  
  // Description Paragraph
  ctx.fillStyle = '#334155';
  ctx.font = '16px Arial, sans-serif';
  ctx.fillText('Atas partisipasi aktif sebagai peserta dalam program:', 500, nameY + 65);
  
  // Program Name
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillText(program, 500, nameY + 100);
  
  // Date
  const dateString = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillStyle = '#475569';
  ctx.font = '14px Arial, sans-serif';
  ctx.fillText('Jakarta, ' + dateString, 500, nameY + 145);
  
  // Signatures
  // Left: Rektor MNC University
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('Rektor MNC University', 250, 560);
  ctx.fillStyle = '#64748b';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('( Rektor & Pengurus )', 250, 600);
  
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(170, 585);
  ctx.lineTo(330, 585);
  ctx.stroke();
  
  // Right: Ketua Panitia Beasiswa
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('Ketua Panitia Beasiswa', 750, 560);
  ctx.fillStyle = '#64748b';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('MNCU Future Leader Scholarship', 750, 600);
  
  ctx.beginPath();
  ctx.moveTo(670, 585);
  ctx.lineTo(830, 585);
  ctx.stroke();
}
