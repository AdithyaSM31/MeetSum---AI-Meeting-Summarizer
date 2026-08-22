/* ═══════════════════════════════════════════════════════════════════════════
   Meeting Summarizer — SPA Application
   ═══════════════════════════════════════════════════════════════════════════ */

const API_BASE = '/api/meetings';

// ─── Router ──────────────────────────────────────────────────────────────────
class Router {
  constructor() {
    this.routes = {};
    window.addEventListener('hashchange', () => this.resolve());
  }

  on(path, handler) {
    this.routes[path] = handler;
    return this;
  }

  resolve() {
    const hash = window.location.hash || '#/';
    const [path, param] = this.parsePath(hash);
    const handler = this.routes[path];
    if (handler) {
      handler(param);
    } else {
      this.routes['#/']?.();
    }
    this.updateNav(hash);
  }

  parsePath(hash) {
    // Match: #/meeting/:id
    const meetingMatch = hash.match(/^#\/meeting\/(.+)$/);
    if (meetingMatch) return ['#/meeting/:id', meetingMatch[1]];
    return [hash, null];
  }

  updateNav(hash) {
    document.querySelectorAll('.nav-link').forEach((link) => {
      const href = link.getAttribute('href');
      link.classList.toggle('active', hash.startsWith(href) && href !== '#/' || hash === href);
    });
  }
}

// ─── API Client ──────────────────────────────────────────────────────────────
const api = {
  async listMeetings() {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error('Failed to fetch meetings');
    return res.json();
  },

  async getMeeting(id) {
    const res = await fetch(`${API_BASE}/${id}`);
    if (!res.ok) throw new Error('Meeting not found');
    return res.json();
  },

  async uploadAudio(file) {
    const formData = new FormData();
    formData.append('audio', file);
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Upload failed');
    }
    return res.json();
  },

  async deleteMeeting(id) {
    const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    return res.json();
  },
};

// ─── Utility Functions ───────────────────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const icons = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─── Polling Manager ─────────────────────────────────────────────────────────
let pollInterval = null;

function startPolling(meetingId, callback) {
  stopPolling();
  pollInterval = setInterval(async () => {
    try {
      const meeting = await api.getMeeting(meetingId);
      callback(meeting);
      if (meeting.status === 'completed' || meeting.status === 'failed') {
        stopPolling();
      }
    } catch (e) {
      console.error('Poll error:', e);
    }
  }, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ─── Page Renderers ──────────────────────────────────────────────────────────

// ── Dashboard Page ───────────────────────────────────────────────────────────
async function renderDashboard() {
  const main = document.getElementById('app-main');
  main.innerHTML = `
    <div class="page-enter">
      <div class="dashboard-header">
        <h1>Your Meetings</h1>
        <div class="dashboard-stats" id="dashboard-stats"></div>
      </div>
      <div id="meetings-container">
        <div class="meetings-grid">
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
        </div>
      </div>
    </div>
  `;

  try {
    const meetings = await api.listMeetings();
    const statsEl = document.getElementById('dashboard-stats');
    const completedCount = meetings.filter((m) => m.status === 'completed').length;
    const processingCount = meetings.filter((m) => ['processing', 'transcribing', 'summarizing'].includes(m.status)).length;

    statsEl.innerHTML = `
      <div class="stat-item">
        <span class="stat-value">${meetings.length}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${completedCount}</span>
        <span class="stat-label">Completed</span>
      </div>
      ${processingCount > 0 ? `
        <div class="stat-item">
          <span class="stat-value">${processingCount}</span>
          <span class="stat-label">Processing</span>
        </div>
      ` : ''}
    `;

    renderMeetingsList(meetings);

    // Poll for any in-progress meetings
    const inProgress = meetings.filter((m) =>
      ['processing', 'transcribing', 'summarizing'].includes(m.status)
    );
    if (inProgress.length > 0) {
      startDashboardPolling();
    }
  } catch (error) {
    document.getElementById('meetings-container').innerHTML = `
      <div class="error-state">
        <h3>Failed to load meetings</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function renderMeetingsList(meetings) {
  const container = document.getElementById('meetings-container');

  if (meetings.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <h2>No meetings yet</h2>
        <p>Upload your first meeting audio to get started</p>
        <a href="#/upload" class="empty-state-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Upload Audio
        </a>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="meetings-grid">
      ${meetings.map((m, i) => `
        <div class="meeting-card" data-id="${m.id}" style="animation-delay: ${i * 0.06}s" onclick="navigateToMeeting('${m.id}')">
          <button class="card-delete-btn" onclick="event.stopPropagation(); deleteMeeting('${m.id}')" title="Delete meeting" aria-label="Delete meeting">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          <div class="meeting-card-header">
            <span class="meeting-card-title">${escapeHtml(m.original_name)}</span>
            <span class="status-badge ${m.status}">
              <span class="status-dot"></span>
              ${m.status}
            </span>
          </div>
          <p class="meeting-card-summary">
            ${m.status === 'completed' && m.summary
              ? escapeHtml(m.summary)
              : m.status === 'failed'
                ? 'Processing failed. Click to see details.'
                : 'Processing in progress...'}
          </p>
          <div class="meeting-card-meta">
            <span class="meeting-card-date">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${formatDate(m.created_at)}
            </span>
            <span class="meeting-card-size">
              ${formatFileSize(m.file_size)}
            </span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function startDashboardPolling() {
  stopPolling();
  pollInterval = setInterval(async () => {
    try {
      const meetings = await api.listMeetings();
      renderMeetingsList(meetings);

      const inProgress = meetings.filter((m) =>
        ['processing', 'transcribing', 'summarizing'].includes(m.status)
      );
      if (inProgress.length === 0) {
        stopPolling();
      }
    } catch (e) {
      console.error('Dashboard poll error:', e);
    }
  }, 3000);
}

// ── Upload Page ──────────────────────────────────────────────────────────────
function renderUpload() {
  stopPolling();
  const main = document.getElementById('app-main');
  main.innerHTML = `
    <div class="upload-page page-enter">
      <h1>Upload Meeting Audio</h1>
      <p class="upload-subtitle">Drop your audio file or click to browse. We'll transcribe it and generate a summary with action items.</p>

      <div class="dropzone" id="dropzone">
        <div class="dropzone-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <p class="dropzone-text">Drag & drop your audio file here</p>
        <p class="dropzone-hint">or <span>click to browse</span> · MP3, WAV, M4A, WebM · Max 200 MB</p>
      </div>
      <input type="file" class="file-input" id="file-input" accept=".mp3,.wav,.m4a,.mp4,.webm,.ogg,.flac,.mpeg,.mpga">

      <div class="file-selected" id="file-selected">
        <div class="file-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <div class="file-info">
          <div class="file-name" id="file-name"></div>
          <div class="file-size" id="file-size-display"></div>
        </div>
        <button class="file-remove" id="file-remove" aria-label="Remove file">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <button class="upload-btn" id="upload-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Upload & Process
      </button>

      <div class="upload-progress" id="upload-progress">
        <div class="progress-bar-track">
          <div class="progress-bar-fill" id="progress-bar" style="width: 0%"></div>
        </div>
        <div class="progress-status">
          <span class="status-label">
            <span class="spinner"></span>
            <span id="progress-text">Uploading...</span>
          </span>
          <span id="progress-percent">0%</span>
        </div>
      </div>
    </div>
  `;

  setupUploadHandlers();
}

function setupUploadHandlers() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const fileSelected = document.getElementById('file-selected');
  const uploadBtn = document.getElementById('upload-btn');
  const fileRemove = document.getElementById('file-remove');

  let selectedFile = null;

  // Click to browse
  dropzone.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) selectFile(e.target.files[0]);
  });

  // Drag & Drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
  });

  // Remove file
  fileRemove.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    fileSelected.classList.remove('visible');
    uploadBtn.classList.remove('visible');
  });

  // Upload button
  uploadBtn.addEventListener('click', () => handleUpload());

  function selectFile(file) {
    // Validate file size
    if (file.size > 200 * 1024 * 1024) {
      showToast('File is too large. Maximum size is 200 MB.', 'error');
      return;
    }

    selectedFile = file;
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-size-display').textContent = formatFileSize(file.size);
    fileSelected.classList.add('visible');
    uploadBtn.classList.add('visible');
  }

  async function handleUpload() {
    if (!selectedFile) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Processing...';
    const progress = document.getElementById('upload-progress');
    progress.classList.add('visible');

    // Simulate upload progress
    let pct = 0;
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressPercent = document.getElementById('progress-percent');

    const progressInterval = setInterval(() => {
      pct = Math.min(pct + Math.random() * 15, 90);
      progressBar.style.width = pct + '%';
      progressPercent.textContent = Math.round(pct) + '%';
    }, 300);

    try {
      progressText.textContent = 'Uploading audio...';
      const result = await api.uploadAudio(selectedFile);

      clearInterval(progressInterval);
      progressBar.style.width = '100%';
      progressPercent.textContent = '100%';
      progressText.textContent = 'Upload complete! Processing...';

      showToast('Audio uploaded! Transcription in progress...');

      // Navigate to the meeting detail after a moment
      setTimeout(() => {
        window.location.hash = `#/meeting/${result.id}`;
      }, 1200);

    } catch (error) {
      clearInterval(progressInterval);
      progressBar.style.width = '0%';
      progress.classList.remove('visible');
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload & Process';
      showToast(error.message, 'error');
    }
  }
}

// ── Meeting Detail Page ──────────────────────────────────────────────────────
async function renderMeetingDetail(id) {
  stopPolling();
  const main = document.getElementById('app-main');
  main.innerHTML = `
    <div class="detail-page page-enter">
      <a href="#/" class="detail-back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Dashboard
      </a>
      <div style="display:flex;justify-content:center;padding:60px 0;">
        <div class="spinner" style="width:32px;height:32px;border-width:3px;"></div>
      </div>
    </div>
  `;

  try {
    const meeting = await api.getMeeting(id);
    renderMeetingContent(meeting);

    // Poll if still processing
    if (['processing', 'transcribing', 'summarizing'].includes(meeting.status)) {
      startPolling(id, (updated) => renderMeetingContent(updated));
    }
  } catch (error) {
    main.innerHTML = `
      <div class="detail-page page-enter">
        <a href="#/" class="detail-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Dashboard
        </a>
        <div class="error-state">
          <h3>Meeting Not Found</h3>
          <p>${escapeHtml(error.message)}</p>
        </div>
      </div>
    `;
  }
}

function renderMeetingContent(meeting) {
  const main = document.getElementById('app-main');

  if (['processing', 'transcribing', 'summarizing'].includes(meeting.status)) {
    const statusMessages = {
      processing: 'Preparing your audio file...',
      transcribing: 'Transcribing audio with Whisper AI...',
      summarizing: 'Generating summary and action items...',
    };

    main.innerHTML = `
      <div class="detail-page page-enter">
        <a href="#/" class="detail-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Dashboard
        </a>
        <div class="processing-state">
          <div class="processing-animation">
            <div class="ring"></div>
            <div class="ring"></div>
            <div class="ring"></div>
          </div>
          <h2>${statusMessages[meeting.status] || 'Processing...'}</h2>
          <p>This usually takes 30-60 seconds depending on the audio length.</p>
        </div>
      </div>
    `;
    return;
  }

  if (meeting.status === 'failed') {
    main.innerHTML = `
      <div class="detail-page page-enter">
        <a href="#/" class="detail-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Dashboard
        </a>
        <div class="error-state">
          <h3>Processing Failed</h3>
          <p>${escapeHtml(meeting.error_message || 'An unknown error occurred.')}</p>
        </div>
      </div>
    `;
    return;
  }

  // Completed state
  const actionItems = meeting.action_items || [];
  const keyDecisions = meeting.key_decisions || [];
  const topics = meeting.topics_discussed || [];

  main.innerHTML = `
    <div class="detail-page page-enter">
      <a href="#/" class="detail-back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Dashboard
      </a>

      <div class="detail-header">
        <div class="detail-title-section">
          <h1>${escapeHtml(meeting.original_name)}</h1>
          <div class="detail-meta">
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${formatDate(meeting.created_at)}
            </span>
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              ${formatFileSize(meeting.file_size)}
            </span>
            <span class="status-badge completed" style="margin:0">
              <span class="status-dot"></span>
              Completed
            </span>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs" id="detail-tabs">
        <button class="tab-btn active" data-tab="summary" id="tab-summary-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Summary
        </button>
        <button class="tab-btn" data-tab="actions" id="tab-actions-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Action Items
          ${actionItems.length > 0 ? `<span class="tab-badge">${actionItems.length}</span>` : ''}
        </button>
        <button class="tab-btn" data-tab="transcript" id="tab-transcript-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
          Transcript
        </button>
      </div>

      <!-- Summary Tab -->
      <div class="tab-content active" id="tab-summary">
        ${meeting.summary ? `
          <div class="summary-card">
            <h3>
              <span class="card-icon" style="background:rgba(124,58,237,0.1);color:#7c3aed">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </span>
              Executive Summary
            </h3>
            <p class="summary-text">${escapeHtml(meeting.summary)}</p>
          </div>
        ` : ''}

        ${topics.length > 0 ? `
          <div class="summary-card">
            <h3>
              <span class="card-icon" style="background:rgba(59,130,246,0.1);color:#3b82f6">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </span>
              Topics Discussed
            </h3>
            <div class="topics-list">
              ${topics.map((t) => `<span class="topic-tag">${escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        ${keyDecisions.length > 0 ? `
          <div class="summary-card">
            <h3>
              <span class="card-icon" style="background:rgba(16,185,129,0.1);color:#10b981">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </span>
              Key Decisions
            </h3>
            <ul class="decisions-list">
              ${keyDecisions.map((d) => `
                <li class="decision-item">
                  <span class="decision-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                  ${escapeHtml(d)}
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      </div>

      <!-- Action Items Tab -->
      <div class="tab-content" id="tab-actions">
        ${actionItems.length > 0 ? `
          <div class="action-items-list">
            ${actionItems.map((item) => `
              <div class="action-item">
                <div class="action-item-task">${escapeHtml(item.task)}</div>
                <div class="action-item-details">
                  <span class="action-detail">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <strong>Owner:</strong> ${escapeHtml(item.owner || 'TBD')}
                  </span>
                  <span class="action-detail">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <strong>Deadline:</strong> ${escapeHtml(item.deadline || 'TBD')}
                  </span>
                  ${item.priority ? `
                    <span class="priority-badge priority-${item.priority}">${item.priority}</span>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="empty-state" style="padding:40px">
            <h2>No action items found</h2>
            <p>The AI didn't identify any specific action items from this meeting.</p>
          </div>
        `}
      </div>

      <!-- Transcript Tab -->
      <div class="tab-content" id="tab-transcript">
        <div class="transcript-box">
          <div class="transcript-toolbar">
            <button class="copy-btn" id="copy-transcript-btn" onclick="copyTranscript()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
          </div>
          <div class="transcript-text" id="transcript-text">${escapeHtml(meeting.transcript || 'No transcript available.')}</div>
        </div>
      </div>
    </div>
  `;

  // Setup tab switching
  setupTabs();
}

function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      document.getElementById(`tab-${tab}`).classList.add('active');
    });
  });
}

// ─── Global Functions ────────────────────────────────────────────────────────
window.navigateToMeeting = function (id) {
  window.location.hash = `#/meeting/${id}`;
};

window.deleteMeeting = async function (id) {
  if (!confirm('Are you sure you want to delete this meeting?')) return;
  try {
    await api.deleteMeeting(id);
    showToast('Meeting deleted');
    renderDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

window.copyTranscript = function () {
  const text = document.getElementById('transcript-text')?.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-transcript-btn');
    btn.classList.add('copied');
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Copied!
    `;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy
      `;
    }, 2000);
  });
};

// ─── Initialize App ──────────────────────────────────────────────────────────
const router = new Router();
router
  .on('#/', renderDashboard)
  .on('#/upload', renderUpload)
  .on('#/meeting/:id', renderMeetingDetail);

// Initial route
router.resolve();
