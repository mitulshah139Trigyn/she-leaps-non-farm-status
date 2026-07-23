/* ============================================================
   Project Status System - Core Script & Module
   ============================================================ */

// Configuration Constants
const ALLOWED_EMAILS = [
  'mitul.shah@trigyn.com',
  'ekta.pardeshi@trigyn.com',
  'akanksha.waghmare@trigyn.com',
  'pralhad.gadlegave@digitalindia.gov.in'
];

const ADMIN_EMAIL = 'mitul.shah@trigyn.com';
const SUPABASE_URL  = "https://iueammxhintxldvzlpae.supabase.co";
const SUPABASE_ANON = "sb_publishable_JN2EyormTMMyV8un2m8ZCg_yNVQEAbE";

// Global App State
let db = null;
let currentUser = null;
let allRecords = [];
let filteredRecords = [];
let sortColumn = 'ID';
let sortDirection = 'desc';
let currentPage = 1;
let rowsPerPage = 10;
let activeTaskId = null;
let syncInterval = null;
let currentView = 'table'; // 'table' or 'kanban'
let currentTheme = 'light';
let kanbanActiveProject = 'All';

let uniqueProjects = [], uniqueModules = [], uniqueTypes = [], uniqueMembers = [];

// ============================================================
// Theme Management (Light / Dark Mode)
// ============================================================
function initTheme() {
  const saved = localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(saved);
}

function setTheme(theme) {
  currentTheme = theme;
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('theme', theme);
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.innerHTML = theme === 'dark' 
      ? '<i class="fa-solid fa-sun" style="color:#f59e0b"></i> Light Mode' 
      : '<i class="fa-solid fa-moon"></i> Dark Mode';
  }
}

function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// ============================================================
// Toast Notification System
// ============================================================
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: 'fa-solid fa-circle-check',
    error: 'fa-solid fa-circle-xmark',
    warning: 'fa-solid fa-triangle-exclamation',
    info: 'fa-solid fa-circle-info'
  };

  const titles = {
    success: 'Success',
    error: 'Error',
    warning: 'Notice',
    info: 'Information'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="${icons[type] || icons.info} toast-icon"></i>
    <div class="toast-content">
      <div class="toast-title">${titles[type] || 'Notice'}</div>
      <div>${message}</div>
    </div>
    <button class="toast-close">&times;</button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  const removeToast = () => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    }, 300);
  };

  closeBtn.addEventListener('click', removeToast);
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  if (duration > 0) {
    setTimeout(removeToast, duration);
  }
}

// ============================================================
// Debounce Utility
// ============================================================
function debounce(func, wait = 250) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============================================================
// Auth Helpers
// ============================================================
function getCurrentUserEmail() {
  return (currentUser && currentUser.email) ? currentUser.email : (localStorage.getItem('currentUserEmail') || '');
}

function isEmailAllowed(email) {
  return ALLOWED_EMAILS.includes((email||'').toLowerCase().trim());
}

function isAdmin(email) {
  const clean = (email || '').toLowerCase().trim();
  return clean === 'mitul.shah@trigyn.com' || clean === ADMIN_EMAIL.toLowerCase();
}

function showLoginScreen() {
  showLoading(false);
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.classList.remove('hidden');
}

function hideLoginScreen() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function setLoginMsg(text, type) {
  const el = document.getElementById('loginMsg');
  if (!el) return;
  el.className = 'login-msg ' + (type || '');
  el.innerText = text;
}

async function handleLogin() {
  const emailEl = document.getElementById('loginEmail');
  const passEl = document.getElementById('loginPassword');
  const submitBtn = document.getElementById('loginSubmitBtn');
  if (!emailEl || !passEl) return;

  const email = emailEl.value.trim();
  const password = passEl.value;

  if (!email || !password) {
    setLoginMsg('Please enter both email and password.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...';
  setLoginMsg('Verifying credentials...', '');

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      setLoginMsg(error.message || 'Invalid email or password.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
      return;
    }

    if (data.session && data.user) {
      localStorage.setItem('app_logged_in_user', JSON.stringify({ email: data.user.email, id: data.user.id }));
      setLoginMsg('Login successful!', 'success');
      showToast('Signed in successfully', 'success');
      setTimeout(() => {
        loadDashboard(data.user);
      }, 300);
    }
  } catch (err) {
    console.error('Login error:', err);
    setLoginMsg(err.message || 'An unexpected error occurred.', 'error');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
  }
}

async function handleLogout() {
  showLoading(true);
  setLoading('Signing out...');
  localStorage.removeItem('app_logged_in_user');
  if (syncInterval) clearInterval(syncInterval);
  if (db) {
    await db.auth.signOut();
  }
  currentUser = null;
  const userGroup = document.getElementById('userProfileGroup');
  if (userGroup) userGroup.classList.add('hidden');
  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.reset();
  const submitBtn = document.getElementById('loginSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
  }
  setLoginMsg('', '');
  showToast('Logged out successfully', 'info');
  showLoginScreen();
}

async function loadDashboard(user) {
  currentUser = user;
  hideLoginScreen();

  const emailDisp = document.getElementById('userEmailDisplay');
  const userGroup = document.getElementById('userProfileGroup');
  if (emailDisp) emailDisp.innerText = user.email;
  if (userGroup) userGroup.classList.remove('hidden');

  const adminBtn = document.getElementById('adminDashboardBtn');
  if (adminBtn) {
    if (isAdmin(user.email)) {
      adminBtn.classList.remove('hidden');
      adminBtn.style.display = 'inline-flex';
    }
  }

  showLoading(true);
  setLoading('Loading records...');
  setupEventListeners();
  const ok = await initSupabase();
  if (ok) {
    initFilters();
    applyFilters();
    updateStats();
    updateEmployeeStats();
  }
  showLoading(false);
  if (!syncInterval) {
    syncInterval = setInterval(() => refreshData(true), 15000);
  }
}

// ============================================================
// Date Helpers & Formatting
// ============================================================
function formatDbDate(d) {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parts[2].padStart(2,'0')} ${months[parseInt(parts[1],10)-1]} ${parts[0]}`;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function displayDateToISO(s) {
  if (!s) return null;
  const p = s.trim().split(' ');
  if (p.length !== 3) return null;
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const m = months.indexOf(p[1].toLowerCase());
  if (m === -1) return null;
  return `${p[2]}-${String(m+1).padStart(2,'0')}-${p[0].padStart(2,'0')}`;
}

function dateToExcelSerial(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const epoch = new Date(1900,0,1);
  const ms = new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime() - epoch.getTime();
  return Math.round(ms/(86400*1000)) + 2;
}

// ============================================================
// Data Model Mapping
// ============================================================
function mapRow(t) {
  return {
    ID: t.id,
    Title: t.title || '',
    Description: t.description || '',
    Type: t.type || 'Task',
    Project: t.project || '',
    Module: t.module || '',
    Priority: t.priority || 'Low',
    Status: t.status || 'New',
    AssignedTo: t.assigned_to || '',
    ReportedBy: t.reported_by || '',
    CreatedDateISO: t.created_date || null,
    CreatedDateRaw: t.created_date ? dateToExcelSerial(t.created_date) : null,
    CreatedDate: formatDbDate(t.created_date),
    StartDate: formatDbDate(t.start_date),
    ResolvedDateISO: t.resolved_date || null,
    ResolvedDate: formatDbDate(t.resolved_date),
    Duration: t.duration !== null && t.duration !== undefined ? Number(t.duration) : null,
    InformTo: t.inform_to || '',
    Comments: t.comments || ''
  };
}

function isClosedOlderThan7Days(r) {
  if ((r.Status || '').toLowerCase() !== 'closed') return false;
  const dateStr = r.ResolvedDateISO || r.CreatedDateISO;
  if (!dateStr) return false;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;
  const resolvedDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const today = new Date();
  today.setHours(0,0,0,0);
  resolvedDate.setHours(0,0,0,0);
  const diffTime = today.getTime() - resolvedDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 7;
}

// ============================================================
// Supabase Data Fetching
// ============================================================
async function initSupabase() {
  try {
    const { data, error } = await db.from('tasks').select('*').order('id', { ascending: false });
    if (error) throw error;
    allRecords = (data || []).map(mapRow);
    setBadge('success', '<i class="fa-solid fa-circle-check"></i> Connected');
    return true;
  } catch (err) {
    console.error('Supabase fetch error:', err);
    setBadge('danger', '<i class="fa-solid fa-triangle-exclamation"></i> Connection Failed');
    showToast('Failed to connect to database', 'error');
    return false;
  }
}

async function refreshData(silent = true) {
  if (!db) return;
  try {
    const { data, error } = await db.from('tasks').select('*').order('id', { ascending: false });
    if (error) throw error;
    allRecords = (data || []).map(mapRow);
    applyFilters();
    updateStats();
    updateEmployeeStats();
    if (!silent) showToast('Data refreshed', 'info');
  } catch(err) { console.error('Refresh error:', err); }
}

// ============================================================
// Dashboard Stats Helpers
// ============================================================
function getTodayDisplay() {
  const t = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(t.getDate()).padStart(2,'0')} ${months[t.getMonth()]} ${t.getFullYear()}`;
}

function getYesterdayDisplay() {
  const t = new Date();
  t.setDate(t.getDate()-1);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(t.getDate()).padStart(2,'0')} ${months[t.getMonth()]} ${t.getFullYear()}`;
}

function buildProjectBreakdownHtml(statusName) {
  const projects = ['AGEY', 'EE', 'Incubator'];
  const recordsMatching = allRecords.filter(r => {
    if (statusName === 'All') return true;
    const st = (r.Status || '').trim().toLowerCase();
    return st === statusName.toLowerCase();
  });

  const projectBadges = projects.map(proj => {
    const count = recordsMatching.filter(r => (r.Project || '').trim().toLowerCase() === proj.toLowerCase()).length;
    return `<span class="project-stat-badge" title="${proj}: ${count} tasks"><span class="proj-name">${proj}:</span> <strong class="proj-num">${count}</strong></span>`;
  }).join('');

  return `<div class="stat-project-breakdown">${projectBadges}</div>`;
}

function updateStats() {
  const statTotal = document.getElementById('statTotal');
  if (!statTotal) return;
  const total = allRecords.length;
  const backlog = allRecords.filter(r => (r.Status || '').toLowerCase() === 'new').length;
  const open = allRecords.filter(r => (r.Status || '').toLowerCase() === 'open').length;
  const prog = allRecords.filter(r => (r.Status || '').toLowerCase() === 'in progress').length;
  const closed = allRecords.filter(r => (r.Status || '').toLowerCase() === 'closed').length;

  statTotal.innerText = total;
  const statBacklog = document.getElementById('statBacklog'); if (statBacklog) statBacklog.innerText = backlog;
  const statOpen = document.getElementById('statOpen'); if (statOpen) statOpen.innerText = open;
  const statProgress = document.getElementById('statProgress'); if (statProgress) statProgress.innerText = prog;
  const statClosed = document.getElementById('statClosed'); if (statClosed) statClosed.innerText = closed;

  // Project breakdown badges
  const setBreakdown = (id, statusName) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = buildProjectBreakdownHtml(statusName);
  };

  setBreakdown('totalProjectBreakdown', 'All');
  setBreakdown('backlogProjectBreakdown', 'New');
  setBreakdown('openProjectBreakdown', 'Open');
  setBreakdown('progressProjectBreakdown', 'In Progress');
  setBreakdown('closedProjectBreakdown', 'Closed');

  const todayStr = getTodayDisplay();
  const yestStr = getYesterdayDisplay();
  const todayComp = document.getElementById('todayCompletedCount');
  if (todayComp) todayComp.innerText = allRecords.filter(r => r.Status==='Closed' && r.ResolvedDate===todayStr).length;
  const yestComp = document.getElementById('yesterdayCompletedCount');
  if (yestComp) yestComp.innerText = allRecords.filter(r => r.Status==='Closed' && r.ResolvedDate===yestStr).length;
}

function filterByEmployeeTaskType(empName, type) {
  const assignEl = document.getElementById('filterAssigned');
  if (assignEl) {
    assignEl.value = empName;
  }

  const statusCheckboxes = document.querySelectorAll('#checkboxStatus input');
  statusCheckboxes.forEach(cb => {
    if (type === 'active') {
      cb.checked = cb.value !== 'Closed';
    } else if (type === 'closed-today') {
      cb.checked = cb.value === 'Closed';
    }
    if (cb.checked) {
      cb.parentElement.classList.add('checked');
    } else {
      cb.parentElement.classList.remove('checked');
    }
  });

  currentPage = 1;
  applyFilters();

  const target = document.getElementById('kanbanView') || document.querySelector('.table-container');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showToast(`Showing ${type === 'active' ? 'active' : 'closed today'} tasks for ${empName}`, 'info');
}

function updateEmployeeStats() {
  const grid = document.getElementById('employeeStatsGrid');
  if (!grid) return;
  const map = {};
  const todayStr = getTodayDisplay();
  allRecords.forEach(r => {
    const emp = (r.AssignedTo||'').trim();
    if (!emp || emp==='-') return;
    if (!map[emp]) map[emp] = { name:emp, total:0, closedToday:0, active:0 };
    map[emp].total++;
    const isClosed = r.Status && r.Status.toLowerCase()==='closed';
    if (isClosed && r.ResolvedDate===todayStr) map[emp].closedToday++;
    if (!isClosed) map[emp].active++;
  });
  const sorted = Object.values(map).sort((a,b) => b.total-a.total);
  grid.innerHTML = '';
  if (!sorted.length) { grid.innerHTML='<div style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:1rem">No employee data</div>'; return; }
  sorted.forEach(emp => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `<div class="stat-icon bg-primary-soft"><i class="fa-solid fa-user-tie"></i></div>
      <div class="stat-content">
        <span class="stat-label">${emp.name}</span>
        <h2 class="stat-value">${emp.total} <span style="font-size:0.85rem;font-weight:500;color:var(--text-muted)">Assigned</span></h2>
        <div class="stat-sub-labels-group">
          <span class="stat-sub-label text-success clickable-emp-sub" data-emp="${escapeHtml(emp.name)}" data-type="closed-today" title="Click to filter closed today tasks for ${escapeHtml(emp.name)}">
            <i class="fa-solid fa-calendar-check"></i> <span>${emp.closedToday}</span> closed today
          </span>
          <span class="stat-sub-label clickable-emp-sub" data-emp="${escapeHtml(emp.name)}" data-type="active" style="color:#f59e0b" title="Click to filter active tasks for ${escapeHtml(emp.name)}">
            <i class="fa-solid fa-hourglass-half"></i> <span>${emp.active}</span> active
          </span>
        </div>
      </div>`;

    card.querySelectorAll('.clickable-emp-sub').forEach(subBtn => {
      subBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const empName = subBtn.dataset.emp;
        const taskType = subBtn.dataset.type;
        filterByEmployeeTaskType(empName, taskType);
      });
    });

    grid.appendChild(card);
  });
}

// ============================================================
// UI Component Helpers
// ============================================================
function setLoading(msg) {
  const el = document.getElementById('loadingMsg');
  if (el) el.innerText = msg || '';
}

function showLoading(show) {
  const el = document.getElementById('loadingOverlay');
  if (!el) return;
  if (show) { el.classList.remove('hidden'); el.style.opacity='1'; }
  else { el.style.opacity='0'; setTimeout(() => el.classList.add('hidden'), 300); }
}

function setBadge(type, html) {
  const b = document.getElementById('connectionSourceBadge');
  if (b) {
    b.className = 'badge badge-' + type;
    b.innerHTML = html;
  }
}

// ============================================================
// Dynamic Filters & Sliders
// ============================================================
function initFilters() {
  uniqueProjects = [...new Set(['EE', 'AGEY', 'Incubator', ...allRecords.map(r => r.Project || '(blank)')])].sort();
  uniqueModules  = [...new Set(allRecords.map(r => r.Module || '(blank)'))].sort();
  uniqueTypes    = [...new Set(allRecords.map(r => r.Type || '(blank)'))].sort();
  uniqueMembers  = ['Mitul', 'Akanksha', 'Ekta', 'Prahlad'];

  buildCheckboxes('checkboxProject', uniqueProjects, 'Project[]');
  buildCheckboxes('checkboxModule', uniqueModules, 'Module[]');
  buildCheckboxes('checkboxType', uniqueTypes, 'Type[]');
  buildCheckboxes('checkboxStatus', ['New','Open','In Progress','Closed'], 'Status[]');

  const sel = document.getElementById('filterAssigned');
  if (sel) {
    sel.innerHTML = '<option value="">All Members</option>';
    uniqueMembers.forEach(m => { const o=document.createElement('option'); o.value=m; o.innerText=m; sel.appendChild(o); });
  }

  // Date slider
  const serials = allRecords.map(r=>r.CreatedDateRaw).filter(d=>typeof d==='number').sort((a,b)=>a-b);
  const sl = document.getElementById('sliderDate');
  if (sl && serials.length) {
    sl.min=serials[0]; sl.max=serials[serials.length-1]; sl.value=serials[0];
    const minLbl = document.getElementById('sliderDateMinLabel');
    const maxLbl = document.getElementById('sliderDateMaxLabel');
    const valLbl = document.getElementById('sliderDateVal');
    if (minLbl) minLbl.innerText=allRecords.find(r=>r.CreatedDateRaw===serials[0])?.CreatedDate||'';
    if (maxLbl) maxLbl.innerText=allRecords.find(r=>r.CreatedDateRaw===serials[serials.length-1])?.CreatedDate||'';
    if (valLbl) valLbl.innerText=allRecords.find(r=>r.CreatedDateRaw===serials[0])?.CreatedDate||'Any';
  }

  // Duration slider
  const durs = allRecords.map(r=>r.Duration).filter(d=>d!==null&&!isNaN(d));
  const maxD = durs.length ? Math.max(...durs) : 10;
  const sd = document.getElementById('sliderDuration');
  if (sd) {
    sd.min=0; sd.max=maxD; sd.value=0;
    const durMaxLbl = document.getElementById('sliderDurationMaxLabel');
    if (durMaxLbl) durMaxLbl.innerText=maxD+' Days';
  }

  // Default: uncheck Closed in Status
  document.querySelectorAll('#checkboxStatus input[type="checkbox"]').forEach(cb => {
    if (cb.value.toLowerCase()==='closed') cb.checked=false;
    else { cb.checked=true; cb.parentElement.classList.add('checked'); }
  });
}

function buildCheckboxes(containerId, values, name) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML='';
  values.forEach(v => {
    const label = document.createElement('label');
    label.className='checkbox-option';
    label.innerHTML=`<input type="checkbox" name="${name}" value="${v}" checked> ${v}`;
    label.querySelector('input').addEventListener('change', () => { currentPage=1; applyFilters(); });
    c.appendChild(label);
  });
}

function getChecked(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map(cb=>cb.value);
}

function applyFilters() {
  const gsEl = document.getElementById('globalSearch');
  const q = (gsEl ? gsEl.value : '').toLowerCase().trim();
  const selProj = getChecked('checkboxProject');
  const selMod  = getChecked('checkboxModule');
  const selType = getChecked('checkboxType');
  const selStat = getChecked('checkboxStatus');
  const prioEl = document.getElementById('filterPriority');
  const prio = prioEl ? prioEl.value : '';
  const assignEl = document.getElementById('filterAssigned');
  const assign = assignEl ? assignEl.value : '';
  const slDate = document.getElementById('sliderDate');
  const minDate = slDate ? Number(slDate.value) : 0;
  const slDur = document.getElementById('sliderDuration');
  const minDur = slDur ? Number(slDur.value) : 0;
  const archEl = document.getElementById('showArchive');
  const showArchive = archEl ? archEl.checked : false;

  filteredRecords = allRecords.filter(r => {
    if (!showArchive && isClosedOlderThan7Days(r)) return false;
    if (q) {
      const blob = [r.ID,r.Title,r.Description,r.Project,r.Module,r.Type,r.Priority,r.Status,r.AssignedTo,r.ReportedBy,r.Comments].join(' ').toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (selProj.length && !selProj.includes(r.Project || '(blank)')) return false;
    if (selMod.length  && !selMod.includes(r.Module || '(blank)'))   return false;
    if (selType.length && !selType.includes(r.Type || '(blank)'))     return false;
    if (selStat.length && !selStat.includes(r.Status || '(blank)'))   return false;
    if (prio && r.Priority!==prio) return false;
    if (assign && r.AssignedTo!==assign) return false;
    if (r.CreatedDateRaw && r.CreatedDateRaw < minDate) return false;
    const dur = r.Duration!==null ? r.Duration : 0;
    if (dur < minDur) return false;
    return true;
  });

  updateStats();
  updateEmployeeStats();
  if (currentView === 'kanban') {
    renderKanban();
  } else {
    renderTable();
  }
}

// ============================================================
// View Switcher & Kanban Board
// ============================================================
function switchView(view) {
  currentView = view;
  const tableWrapper = document.querySelector('.table-wrapper');
  const tableFooter = document.querySelector('.table-footer');
  const kanbanView = document.getElementById('kanbanView');
  const viewTableBtn = document.getElementById('viewToggleTable');
  const viewKanbanBtn = document.getElementById('viewToggleKanban');

  if (view === 'kanban') {
    if (tableWrapper) tableWrapper.classList.add('hidden');
    if (tableFooter) tableFooter.classList.add('hidden');
    if (kanbanView) kanbanView.classList.remove('hidden');
    if (viewTableBtn) viewTableBtn.classList.remove('active');
    if (viewKanbanBtn) viewKanbanBtn.classList.add('active');
    renderKanban();
  } else {
    if (tableWrapper) tableWrapper.classList.remove('hidden');
    if (tableFooter) tableFooter.classList.remove('hidden');
    if (kanbanView) kanbanView.classList.add('hidden');
    if (viewTableBtn) viewTableBtn.classList.add('active');
    if (viewKanbanBtn) viewKanbanBtn.classList.remove('active');
    renderTable();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderKanban() {
  const kanbanView = document.getElementById('kanbanView');
  if (!kanbanView) return;

  const projectTabs = ['All', 'AGEY', 'EE', 'Incubator'];
  const statuses = ['New', 'Open', 'In Progress', 'Closed'];
  const statusIcons = {
    'New': 'fa-regular fa-paper-plane',
    'Open': 'fa-solid fa-circle-play',
    'In Progress': 'fa-solid fa-hourglass-half',
    'Closed': 'fa-solid fa-circle-check'
  };

  // Filter records by active project tab
  const recordsInKanban = filteredRecords.filter(r => {
    if (kanbanActiveProject === 'All') return true;
    return (r.Project || '').trim().toLowerCase() === kanbanActiveProject.toLowerCase();
  });

  // Render Project Tabs
  const tabsHtml = projectTabs.map(proj => {
    const isActive = proj.toLowerCase() === kanbanActiveProject.toLowerCase();
    const count = proj === 'All'
      ? filteredRecords.length
      : filteredRecords.filter(r => (r.Project || '').trim().toLowerCase() === proj.toLowerCase()).length;
    const icon = proj === 'All' ? '<i class="fa-solid fa-layer-group"></i>' : '<i class="fa-solid fa-folder-open"></i>';
    const label = proj === 'All' ? 'All Projects' : proj;

    return `
      <button class="kanban-tab ${isActive ? 'active' : ''}" data-project="${proj}">
        ${icon} ${label} <span class="tab-count">${count}</span>
      </button>
    `;
  }).join('');

  // Render Columns
  const columnsHtml = statuses.map(status => {
    const recordsInStatus = recordsInKanban.filter(r => (r.Status || 'New').toLowerCase() === status.toLowerCase());
    
    const cardsHtml = recordsInStatus.length ? recordsInStatus.map(r => {
      let pc = 'low';
      if ((r.Priority||'').toLowerCase() === 'high') pc = 'high';
      else if ((r.Priority||'').toLowerCase() === 'medium') pc = 'medium';
      
      let tc = 'feature';
      if ((r.Type||'').toLowerCase() === 'bug') tc = 'bug';

      return `
        <div class="kanban-card" draggable="true" data-id="${r.ID}">
          <div class="kanban-card-header">
            <span class="kanban-card-id">#${r.ID}</span>
            <span class="priority-pill ${pc}">${r.Priority || 'Low'}</span>
          </div>
          <div class="kanban-card-title">${escapeHtml(r.Title)}</div>
          <div class="kanban-card-meta">
            <span class="type-pill ${tc}">${r.Type}</span>
            ${r.Project ? `<span class="badge" style="background:rgba(99,102,241,0.08);color:var(--primary);border-color:rgba(99,102,241,0.2);">${escapeHtml(r.Project)}</span>` : ''}
            ${r.Module ? `<span class="badge">${escapeHtml(r.Module)}</span>` : ''}
          </div>
          <div class="kanban-card-footer">
            <div class="kanban-assignee">
              <i class="fa-solid fa-circle-user" style="color:var(--primary)"></i>
              <span>${escapeHtml(r.AssignedTo || 'Unassigned')}</span>
            </div>
            ${r.Duration !== null ? `<span title="Duration"><i class="fa-regular fa-clock"></i> ${r.Duration}d</span>` : ''}
          </div>
        </div>
      `;
    }).join('') : `<div class="kanban-empty">No ${status} items</div>`;

    return `
      <div class="kanban-column" data-status="${status}">
        <div class="kanban-column-header">
          <div class="kanban-column-title">
            <i class="${statusIcons[status] || 'fa-solid fa-list'}" style="color:var(--primary)"></i>
            ${status}
          </div>
          <span class="kanban-column-badge">${recordsInStatus.length}</span>
        </div>
        <div class="kanban-cards-container" data-status="${status}">
          ${cardsHtml}
        </div>
      </div>
    `;
  }).join('');

  kanbanView.innerHTML = `
    <div class="kanban-project-tabs">${tabsHtml}</div>
    <div class="kanban-board">${columnsHtml}</div>
  `;

  // Attach click handlers to project tabs
  const tabBtns = kanbanView.querySelectorAll('.kanban-tab');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      kanbanActiveProject = btn.dataset.project;
      renderKanban();
    });
  });

  setupKanbanDragAndDrop();
}

function setupKanbanDragAndDrop() {
  const cards = document.querySelectorAll('.kanban-card');
  const containers = document.querySelectorAll('.kanban-cards-container');

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.id);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });

    card.addEventListener('click', (e) => {
      const recordId = Number(card.dataset.id);
      const record = allRecords.find(r => r.ID === recordId);
      if (record) showDetail(record);
    });
  });

  containers.forEach(container => {
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      container.classList.add('drag-over');
    });

    container.addEventListener('dragleave', () => {
      container.classList.remove('drag-over');
    });

    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      container.classList.remove('drag-over');
      const taskId = Number(e.dataTransfer.getData('text/plain'));
      const newStatus = container.dataset.status;

      if (!taskId || !newStatus) return;

      const record = allRecords.find(r => r.ID === taskId);
      if (!record || record.Status === newStatus) return;

      const oldStatus = record.Status;
      record.Status = newStatus;

      if (newStatus.toLowerCase() === 'closed') {
        record.ResolvedDateISO = todayISO();
        record.ResolvedDate = formatDbDate(todayISO());
      } else if (newStatus.toLowerCase() === 'in progress' && !record.StartDate) {
        record.StartDate = formatDbDate(todayISO());
      }

      applyFilters();

      try {
        if (!db) throw new Error('Supabase client not initialized');
        const updatePayload = { status: newStatus };
        if (newStatus.toLowerCase() === 'closed') {
          updatePayload.resolved_date = todayISO();
        } else if (newStatus.toLowerCase() === 'in progress' && record.StartDate) {
          updatePayload.start_date = displayDateToISO(record.StartDate);
        }
        const { error } = await db.from('tasks').update(updatePayload).eq('id', taskId);
        if (error) throw error;
        showToast(`Task #${taskId} moved to "${newStatus}"`, 'success');
      } catch (err) {
        console.error('Drag update error:', err);
        record.Status = oldStatus;
        applyFilters();
        showToast(`Failed to update Task #${taskId}: ${err.message}`, 'error');
      }
    });
  });
}

// ============================================================
// Table Rendering & Pagination
// ============================================================
function renderTable() {
  filteredRecords.sort((a,b) => {
    let va = a[sortColumn], vb = b[sortColumn];
    if (sortColumn==='CreatedDate') { va=a.CreatedDateRaw||0; vb=b.CreatedDateRaw||0; }
    if (sortColumn==='Duration') { va=a.Duration||0; vb=b.Duration||0; }
    if (typeof va==='string') va=va.toLowerCase();
    if (typeof vb==='string') vb=vb.toLowerCase();
    if (va<vb) return sortDirection==='asc'?-1:1;
    if (va>vb) return sortDirection==='asc'?1:-1;
    return 0;
  });

  const total = filteredRecords.length;
  const totalPages = Math.ceil(total/rowsPerPage)||1;
  if (currentPage>totalPages) currentPage=totalPages;
  if (currentPage<1) currentPage=1;
  const start = (currentPage-1)*rowsPerPage;
  const end = Math.min(start+rowsPerPage, total);
  const page = filteredRecords.slice(start,end);

  const count = document.getElementById('recordCount');
  if (count) {
    count.innerText = total===0 ? 'No records' : `Showing ${start+1}–${end} of ${total} (${allRecords.length} total)`;
  }

  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  tbody.innerHTML='';
  const empty = document.getElementById('emptyState');
  const pag = document.querySelector('.table-pagination');
  if (!total) {
    if (empty) empty.classList.remove('hidden');
    if (pag) pag.classList.add('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  if (pag) pag.classList.remove('hidden');

  page.forEach((r, idx) => {
    const tr = document.createElement('tr');
    let sc='open';
    if (r.Status.toLowerCase()==='in progress') sc='in-progress';
    else if (r.Status.toLowerCase()==='closed') sc='closed';
    else if (r.Status.toLowerCase()==='new') sc='new';
    let pc='low';
    if (r.Priority.toLowerCase()==='high') pc='high';
    else if (r.Priority.toLowerCase()==='medium') pc='medium';
    let tc='feature';
    if (r.Type.toLowerCase()==='bug') tc='bug';

    tr.innerHTML=`<td><span style="color:var(--text-muted);font-size:0.85rem">${start+idx+1}</span></td>
      <td><strong>#${r.ID}</strong></td>
      <td title="${r.Title}"><strong>${r.Title}</strong></td>
      <td><span class="type-pill ${tc}">${r.Type}</span></td>
      <td>${r.Project||'-'}</td>
      <td>${r.Module||'-'}</td>
      <td><span class="priority-pill ${pc}">${r.Priority||'Low'}</span></td>
      <td><span class="status-pill ${sc}"><i class="fa-solid fa-circle" style="font-size:0.5rem"></i> ${r.Status||'New'}</span></td>
      <td>${r.AssignedTo||'-'}</td>
      <td>${r.CreatedDate||'-'}</td>
      <td>${r.Duration!==null ? r.Duration+' Days' : '-'}</td>
      <td style="text-align: center;">
        <button class="btn btn-secondary edit-row-btn" style="padding: 0.25rem 0.5rem; font-size: 0.72rem; background: var(--primary-light); border-color: var(--primary); color: var(--primary);"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
      </td>`;
    tr.addEventListener('click', () => showDetail(r));
    const editBtn = tr.querySelector('.edit-row-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openCreateModal(r);
      });
    }
    tbody.appendChild(tr);
  });

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const pag = document.getElementById('paginationButtons');
  if (!pag) return;
  pag.innerHTML='';
  const mk = (html, page, disabled=false, active=false) => {
    const b=document.createElement('button');
    b.className='page-btn'+(active?' active':'');
    b.innerHTML=html; b.disabled=disabled;
    if (!disabled) b.addEventListener('click', () => { currentPage=page; renderTable(); });
    return b;
  };
  pag.appendChild(mk('<i class="fa-solid fa-angles-left"></i>', 1, currentPage===1));
  pag.appendChild(mk('<i class="fa-solid fa-angle-left"></i>', currentPage-1, currentPage===1));
  let s=Math.max(1,currentPage-2), e=Math.min(totalPages,s+4);
  if (e-s<4) s=Math.max(1,e-4);
  if (s>1) { pag.appendChild(mk('1',1)); if(s>2){const sp=document.createElement('span');sp.className='page-ellipsis';sp.innerText='...';pag.appendChild(sp);} }
  for(let i=s;i<=e;i++) pag.appendChild(mk(String(i),i,false,i===currentPage));
  if (e<totalPages) { if(e<totalPages-1){const sp=document.createElement('span');sp.className='page-ellipsis';sp.innerText='...';pag.appendChild(sp);} pag.appendChild(mk(String(totalPages),totalPages)); }
  pag.appendChild(mk('<i class="fa-solid fa-angle-right"></i>', currentPage+1, currentPage===totalPages));
  pag.appendChild(mk('<i class="fa-solid fa-angles-right"></i>', totalPages, currentPage===totalPages));
}

// ============================================================
// Modals & Details View
// ============================================================
function showDetail(r) {
  activeTaskId = r.ID;
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  const typeEl = document.getElementById('modalType');
  if (typeEl) {
    typeEl.innerText = r.Type || 'Task';
    typeEl.className = 'modal-tag';
  }

  setEl('modalTitle', r.Title || 'Untitled Work Item');
  setEl('modalID', '#' + r.ID);
  setEl('modalProject', r.Project || '-');
  setEl('modalModule', r.Module || '-');
  setEl('modalPriority', r.Priority || '-');
  setEl('modalStatus', r.Status || '-');
  setEl('modalAssigned', r.AssignedTo || '-');
  setEl('modalReported', r.ReportedBy || '-');
  setEl('modalCreatedDate', r.CreatedDate || '-');
  setEl('modalStartDate', r.StartDate || '-');
  setEl('modalResolvedDate', r.ResolvedDate || '-');
  setEl('modalDuration', r.Duration !== null && r.Duration !== undefined ? r.Duration + ' Days' : '-');
  setEl('modalInformTo', r.InformTo || '-');
  setEl('modalDescription', r.Description || 'No description provided.');
  setEl('modalComments', r.Comments || 'No comments.');

  const modal = document.getElementById('detailModal');
  if (modal) modal.classList.add('show');
}

// ============================================================
// Form & CRUD Operations
// ============================================================
function formData() {
  return {
    title: document.getElementById('newTitle').value.trim(),
    type: document.getElementById('newType').value,
    project: document.getElementById('newProject').value,
    module: document.getElementById('newModule').value,
    priority: document.getElementById('newPriority').value,
    status: document.getElementById('newStatus').value,
    assigned_to: document.getElementById('newAssigned').value,
    reported_by: document.getElementById('newReported').value.trim(),
    created_date: document.getElementById('newCreatedDate').value||null,
    start_date: document.getElementById('newStartDate').value||null,
    resolved_date: document.getElementById('newResolvedDate').value||null,
    duration: document.getElementById('newDuration').value!=='' ? Number(document.getElementById('newDuration').value) : null,
    inform_to: document.getElementById('newInformTo').value.trim(),
    description: document.getElementById('newDescription').value.trim(),
    comments: document.getElementById('newComments').value.trim()
  };
}

function openCreateModal(record=null) {
  activeTaskId = record ? record.ID : null;
  const form = document.getElementById('createForm');
  if (form) form.reset();

  const tag = document.getElementById('formModalTag');
  const title = document.getElementById('formModalTitle');
  if (tag) tag.innerText = record ? 'Edit Record' : 'New Record';
  if (title) title.innerText = record ? `Edit Work Item #${record.ID}` : 'Add New Work Item';

  const reportedEl = document.getElementById('newReported');
  if (!record) {
    document.getElementById('newCreatedDate').value = todayISO();
    if (reportedEl) {
      reportedEl.value = getCurrentUserEmail();
      reportedEl.readOnly = true;
    }
  } else {
    document.getElementById('newTitle').value = record.Title||'';
    document.getElementById('newType').value = record.Type||'Task';
    document.getElementById('newProject').value = record.Project||'';
    document.getElementById('newModule').value = record.Module||'';
    document.getElementById('newPriority').value = record.Priority||'Low';
    document.getElementById('newStatus').value = record.Status||'New';
    document.getElementById('newAssigned').value = record.AssignedTo||'';
    if (reportedEl) {
      reportedEl.value = record.ReportedBy || getCurrentUserEmail();
      reportedEl.readOnly = true;
    }
    document.getElementById('newCreatedDate').value = record.CreatedDateISO||'';
    document.getElementById('newStartDate').value = displayDateToISO(record.StartDate)||'';
    document.getElementById('newResolvedDate').value = displayDateToISO(record.ResolvedDate)||'';
    document.getElementById('newDuration').value = record.Duration!==null ? record.Duration : '';
    document.getElementById('newInformTo').value = record.InformTo||'';
    document.getElementById('newDescription').value = record.Description||'';
    document.getElementById('newComments').value = record.Comments||'';
  }

  const detailModal = document.getElementById('detailModal');
  const createModal = document.getElementById('createModal');
  if (detailModal) detailModal.classList.remove('show');
  if (createModal) createModal.classList.add('show');
}

async function saveRecord(e) {
  e.preventDefault();
  const data = formData();
  if (!data.title) {
    showToast('Task title is required', 'warning');
    return;
  }

  showLoading(true);
  try {
    let prevAssignee = null;
    const isNew = (activeTaskId === null);

    if (isNew) {
      data.reported_by = getCurrentUserEmail();
      const nextId = Math.max(...allRecords.map(r => Number(r.ID) || 0), 0) + 1;
      data.id = nextId;
      const { error } = await db.from('tasks').insert([data]);
      if (error) throw error;
    } else {
      const oldRec = allRecords.find(r => r.ID === activeTaskId);
      if (oldRec) prevAssignee = oldRec.AssignedTo;
      const { error } = await db.from('tasks').update(data).eq('id', activeTaskId);
      if (error) throw error;
    }

    const modal = document.getElementById('createModal');
    if (modal) modal.classList.remove('show');
    await refreshData(false);

    showToast(isNew ? 'Record created successfully!' : `Task #${activeTaskId} updated!`, 'success');

    triggerEmailNotification(data, prevAssignee);
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

function triggerEmailNotification(task, previousAssignee = null) {
  const assignee = (task.assigned_to || '').trim();
  if (!assignee) return;

  if (previousAssignee && previousAssignee.trim().toLowerCase() === assignee.toLowerCase()) return;

  const emails = {
    'mitul': 'mitul.shah@trigyn.com',
    'ekta': 'ekta.pardeshi@trigyn.com',
    'akanksha': 'akanksha.waghmare@trigyn.com',
    'prahlad': 'pralhad.gadlegave@digitalindia.gov.in'
  };

  const recipientEmail = emails[assignee.toLowerCase()];
  if (!recipientEmail) return;

  const confirmMsg = `Task has been assigned to ${assignee}.\nWould you like to send an email notification to them?`;
  if (!confirm(confirmMsg)) return;

  const appLink = window.location.href.split('?')[0];
  const subject = encodeURIComponent(`[Work Status] Task Assigned: #${task.id} - ${task.title}`);
  
  const bodyText = `Hi ${assignee},

You have been assigned the following task in the Work Status System:

--------------------------------------------------
Task ID: #${task.id}
Title: ${task.title}
Project: ${task.project || '-'}
Module: ${task.module || '-'}
Priority: ${task.priority || 'Low'}
Status: ${task.status || 'New'}
Created By: ${task.reported_by || '-'}
Created Date: ${task.created_date || '-'}

Description:
${task.description || 'No description provided.'}

Comments:
${task.comments || 'No comments.'}
--------------------------------------------------

You can view the record here: ${appLink}

Regards,
Work Status System`;

  const body = encodeURIComponent(bodyText);
  window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
}

async function deleteRecord() {
  if (activeTaskId===null) return;
  const task = allRecords.find(r=>r.ID===activeTaskId);
  if (!task) return;

  const email = prompt("Enter your email to verify delete permission:");
  if (email === null) return;

  const cleanEmail = email.trim().toLowerCase();
  const isUserAdmin = isAdmin(cleanEmail);
  const isOwner = (task.ReportedBy || '').toLowerCase().trim() === cleanEmail;

  if (!isUserAdmin && !isOwner) {
    showToast("Permission Denied: Only the creator of this task or the admin can delete this record.", "error");
    return;
  }

  if (!confirm(`Delete Task #${activeTaskId}? This cannot be undone.`)) return;
  showLoading(true);
  try {
    const { error } = await db.from('tasks').delete().eq('id', activeTaskId);
    if (error) throw error;
    const modal = document.getElementById('createModal');
    if (modal) modal.classList.remove('show');
    activeTaskId=null;
    await refreshData(false);
    showToast('Record deleted successfully', 'success');
  } catch(err) {
    showToast('Delete failed: ' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

function calculateDurationFromDates() {
  const startStr = document.getElementById('newStartDate') ? document.getElementById('newStartDate').value : '';
  const resStr = document.getElementById('newResolvedDate') ? document.getElementById('newResolvedDate').value : '';
  const durationEl = document.getElementById('newDuration');
  if (!durationEl) return;

  if (!startStr || !resStr) {
    const statusVal = (document.getElementById('newStatus') ? document.getElementById('newStatus').value : '').toLowerCase().trim();
    if (statusVal !== 'closed') {
      durationEl.value = '';
    }
    return;
  }

  const start = new Date(startStr);
  const res = new Date(resStr);
  if (!isNaN(start.getTime()) && !isNaN(res.getTime())) {
    const diffMs = res.getTime() - start.getTime();
    const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    durationEl.value = diffDays;
  }
}

// ============================================================
// Event Listeners & Setup
// ============================================================
function setupEventListeners() {
  const newStatusEl = document.getElementById('newStatus');
  const newStartDateEl = document.getElementById('newStartDate');
  const newResolvedDateEl = document.getElementById('newResolvedDate');

  if (newStatusEl) {
    newStatusEl.addEventListener('change', (e) => {
      const val = (e.target.value || '').toLowerCase().trim();
      const resDateEl = document.getElementById('newResolvedDate');
      const startDateEl = document.getElementById('newStartDate');
      if (resDateEl) {
        if (val === 'closed') {
          resDateEl.value = todayISO();
        } else {
          resDateEl.value = '';
        }
      }
      if (startDateEl && val === 'in progress') {
        startDateEl.value = todayISO();
      }
      calculateDurationFromDates();
    });
  }

  if (newStartDateEl) newStartDateEl.addEventListener('change', calculateDurationFromDates);
  if (newResolvedDateEl) newResolvedDateEl.addEventListener('change', calculateDurationFromDates);

  // Debounced Search Input
  const gs = document.getElementById('globalSearch');
  const sc = document.getElementById('searchClear');
  if (gs) {
    const debouncedApplyFilters = debounce(() => {
      currentPage = 1;
      applyFilters();
    }, 250);

    gs.addEventListener('input', () => {
      if (sc) sc.style.display = gs.value ? 'block' : 'none';
      debouncedApplyFilters();
    });
  }

  if (sc && gs) {
    sc.addEventListener('click', () => {
      gs.value = '';
      sc.style.display = 'none';
      currentPage = 1;
      applyFilters();
    });
  }

  // Filter Dropdowns
  ['filterPriority','filterAssigned'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => { currentPage=1; applyFilters(); });
  });

  const archEl = document.getElementById('showArchive');
  if (archEl) archEl.addEventListener('change', () => { currentPage=1; applyFilters(); });

  // Sliders
  const slDate = document.getElementById('sliderDate');
  if (slDate) {
    slDate.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      const match = allRecords.find(r => r.CreatedDateRaw && Math.abs(r.CreatedDateRaw - v) <= 1);
      const valLbl = document.getElementById('sliderDateVal');
      if (valLbl) valLbl.innerText = match ? match.CreatedDate : formatDbDate(null);
      currentPage = 1;
      applyFilters();
    });
  }

  const slDur = document.getElementById('sliderDuration');
  if (slDur) {
    slDur.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      const valLbl = document.getElementById('sliderDurationVal');
      if (valLbl) valLbl.innerText = v + ' ' + (v === 1 ? 'Day' : 'Days');
      currentPage = 1;
      applyFilters();
    });
  }

  // Reset Filters
  const resetBtn = document.getElementById('resetFilters');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (gs) gs.value = '';
      if (sc) sc.style.display = 'none';
      const fp = document.getElementById('filterPriority');
      const fa = document.getElementById('filterAssigned');
      if (fp) fp.value = '';
      if (fa) fa.value = '';
      document.querySelectorAll('#checkboxProject input,#checkboxModule input,#checkboxType input').forEach(cb => {
        cb.checked = false;
        cb.parentElement.classList.remove('checked');
      });
      document.querySelectorAll('#checkboxStatus input').forEach(cb => {
        cb.checked = cb.value.toLowerCase() !== 'closed';
        cb.checked ? cb.parentElement.classList.add('checked') : cb.parentElement.classList.remove('checked');
      });
      const sl = document.getElementById('sliderDate');
      if (sl && sl.min) sl.value = sl.min;
      const sd = document.getElementById('sliderDuration');
      if (sd) sd.value = 0;
      const durVal = document.getElementById('sliderDurationVal');
      if (durVal) durVal.innerText = '0 Days';
      if (archEl) archEl.checked = false;
      currentPage = 1;
      applyFilters();
      showToast('Filters reset to default', 'info');
    });
  }

  // Table Column Sorting
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      sortDirection = sortColumn === col ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc';
      sortColumn = col;
      document.querySelectorAll('th.sortable i').forEach(i => i.className = 'fa-solid fa-sort');
      const icon = th.querySelector('i');
      if (icon) icon.className = 'fa-solid fa-sort-' + (sortDirection === 'asc' ? 'up' : 'down');
      renderTable();
    });
  });

  // Page Size Selection
  const pSize = document.getElementById('pageSizeSelect');
  if (pSize) {
    pSize.addEventListener('change', (e) => {
      rowsPerPage = parseInt(e.target.value, 10);
      currentPage = 1;
      renderTable();
    });
  }

  // Action Buttons
  const createBtn = document.getElementById('createBtn');
  if (createBtn) createBtn.addEventListener('click', () => openCreateModal());

  const createForm = document.getElementById('createForm');
  if (createForm) createForm.addEventListener('submit', saveRecord);

  // Close Modals
  const closeDetail = document.getElementById('closeDetailModal');
  if (closeDetail) closeDetail.addEventListener('click', () => document.getElementById('detailModal').classList.remove('show'));

  document.querySelectorAll('.close-create-modal').forEach(btn => {
    btn.addEventListener('click', () => document.getElementById('createModal').classList.remove('show'));
  });

  const detailModal = document.getElementById('detailModal');
  if (detailModal) {
    detailModal.addEventListener('click', e => {
      if (e.target === detailModal) detailModal.classList.remove('show');
    });
  }

  const createModal = document.getElementById('createModal');
  if (createModal) {
    createModal.addEventListener('click', e => {
      if (e.target === createModal) createModal.classList.remove('show');
    });
  }

  // Edit Button inside Detail Modal
  const editModalBtn = document.getElementById('editModalBtn');
  if (editModalBtn) {
    editModalBtn.addEventListener('click', () => {
      const r = allRecords.find(r => r.ID === activeTaskId);
      if (r) openCreateModal(r);
    });
  }

  // Escape key handler
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (detailModal) detailModal.classList.remove('show');
      if (createModal) createModal.classList.remove('show');
    }
  });

  // Stat card click filtering
  document.querySelectorAll('.stat-card.clickable').forEach(card => {
    card.addEventListener('click', () => {
      const val = card.dataset.statusFilter;
      document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active-filter'));
      card.classList.add('active-filter');
      document.querySelectorAll('#checkboxStatus input').forEach(cb => {
        cb.checked = cb.value === val;
        cb.checked ? cb.parentElement.classList.add('checked') : cb.parentElement.classList.remove('checked');
      });
      currentPage = 1;
      applyFilters();
    });
  });

  // Toggle Filters Sidebar
  const toggleFiltersBtn = document.getElementById('toggleFiltersBtn');
  if (toggleFiltersBtn) {
    toggleFiltersBtn.addEventListener('click', () => {
      const dc = document.querySelector('.dashboard-content');
      if (dc) {
        const hidden = dc.classList.toggle('filters-hidden');
        toggleFiltersBtn.innerHTML = hidden ? '<i class="fa-solid fa-eye"></i> Show Filters' : '<i class="fa-solid fa-eye-slash"></i> Hide Filters';
      }
    });
  }

  // Toggle Employee Stats Summary
  const toggleEmployeeStatsBtn = document.getElementById('toggleEmployeeStatsBtn');
  if (toggleEmployeeStatsBtn) {
    toggleEmployeeStatsBtn.addEventListener('click', () => {
      const grid = document.getElementById('employeeStatsGrid');
      if (grid) {
        const collapsed = grid.classList.toggle('collapsed');
        toggleEmployeeStatsBtn.innerHTML = collapsed ? '<i class="fa-solid fa-chevron-down"></i> Show Summary' : '<i class="fa-solid fa-chevron-up"></i> Hide Summary';
      }
    });
  }

  // Theme Toggle Button
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }

  // View Switcher Buttons
  const viewTableBtn = document.getElementById('viewToggleTable');
  if (viewTableBtn) {
    viewTableBtn.addEventListener('click', () => switchView('table'));
  }

  const viewKanbanBtn = document.getElementById('viewToggleKanban');
  if (viewKanbanBtn) {
    viewKanbanBtn.addEventListener('click', () => switchView('kanban'));
  }

  // Multiselect Dropdowns
  [['btnDropdownProject','dropdownProjectContainer'],['btnDropdownStatus','dropdownStatusContainer'],['btnDropdownModule','dropdownModuleContainer'],['btnDropdownType','dropdownTypeContainer']].forEach(([btnId,ctnId]) => {
    const btn = document.getElementById(btnId);
    const ctn = document.getElementById(ctnId);
    if (btn && ctn) {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        document.querySelectorAll('.multiselect-dropdown').forEach(d => { if (d !== ctn) d.classList.remove('open'); });
        ctn.classList.toggle('open');
      });
    }
  });

  document.addEventListener('click', () => document.querySelectorAll('.multiselect-dropdown').forEach(d => d.classList.remove('open')));
  document.querySelectorAll('.dropdown-menu-checkboxes').forEach(m => m.addEventListener('click', e => e.stopPropagation()));
}

// ============================================================
// Application Bootstrap
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();

  if (window.supabase) {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  } else {
    console.error('Supabase library not loaded');
    showToast('Failed to load database client library', 'error');
    return;
  }

  showLoading(true);
  setLoading('Checking authentication session...');

  try {
    let activeUser = null;
    const { data: { session } } = await db.auth.getSession();
    if (session && session.user) {
      activeUser = session.user;
    } else {
      const savedUserStr = localStorage.getItem('app_logged_in_user');
      if (savedUserStr) {
        try { activeUser = JSON.parse(savedUserStr); } catch (e) {}
      }
    }

    if (activeUser && activeUser.email) {
      hideLoginScreen();
      await loadDashboard(activeUser);
    } else {
      showLoginScreen();
    }
  } catch (err) {
    console.error('Session error:', err);
    const savedUserStr = localStorage.getItem('app_logged_in_user');
    if (savedUserStr) {
      try {
        const fallbackUser = JSON.parse(savedUserStr);
        hideLoginScreen();
        await loadDashboard(fallbackUser);
      } catch (e) {
        showLoginScreen();
      }
    } else {
      showLoginScreen();
    }
  }

  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      localStorage.removeItem('app_logged_in_user');
      showLoginScreen();
    }
  });
});
