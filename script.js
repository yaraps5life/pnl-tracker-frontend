/* ============================================
   PnL Tracker — логика приложения
   ============================================ */

// Адрес твоего бэкенда на Railway. Поменяй на реальный URL после деплоя.
const API_URL = 'https://tracker-pnl-production.up.railway.app';

// ---------- Telegram Mini App init ----------

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// ---------- Тема (тёмная/светлая/авто) ----------

const THEME_STORAGE_KEY = 'pnl_theme_mode'; // 'auto' | 'light' | 'dark'

function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  // авто — сначала смотрим тему хоста (Telegram), иначе системную тему ОС
  if (tg?.colorScheme === 'light' || tg?.colorScheme === 'dark') return tg.colorScheme;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function getThemeMode() {
  return localStorage.getItem(THEME_STORAGE_KEY) || 'auto';
}

function applyTheme(mode) {
  document.documentElement.dataset.theme = resolveTheme(mode);
  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === mode);
  });
}

function setThemeMode(mode) {
  localStorage.setItem(THEME_STORAGE_KEY, mode);
  applyTheme(mode);
}

applyTheme(getThemeMode());

document.querySelectorAll('.theme-btn').forEach((btn) => {
  btn.addEventListener('click', () => setThemeMode(btn.dataset.theme));
});

// В авто-режиме реагируем на смену темы в самом Telegram, пока апп открыт
tg?.onEvent?.('themeChanged', () => {
  if (getThemeMode() === 'auto') applyTheme('auto');
});

// initData передаётся как есть на бэкенд — он сам её проверит (HMAC-SHA256)
function getAuthHeader() {
  const initData = tg?.initData || '';
  return { 'Authorization': `tma ${initData}` };
}

// Таймаут для fetch — если бэкенд не отвечает 10 сек, бросаем ошибку
function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

async function apiGet(path) {
  const res = await fetchWithTimeout(API_URL + path, { headers: getAuthHeader() });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetchWithTimeout(API_URL + path, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `POST ${path} → ${res.status}`;
    try { const j = await res.json(); detail = j.detail || detail; } catch(e) {}
    throw new Error(detail);
  }
  return res.json();
}

async function apiPatch(path, body) {
  const res = await fetchWithTimeout(API_URL + path, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}`);
  return res.json();
}

async function apiDelete(path) {
  const res = await fetchWithTimeout(API_URL + path, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
  return res.json();
}

// ---------- Форматирование ----------

function fmtUsd(value) {
  if (value === null || value === undefined) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)} $`;
}

function fmtBalance(value) {
  // Баланс показываем без принудительного "+" — это просто сумма денег, не изменение
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(2)} $`;
}

function fmtPct(value) {
  if (value === null || value === undefined) return '';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function fmtR(value) {
  if (value === null || value === undefined) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}R`;
}

function pnlClass(value) {
  if (value === null || value === undefined) return 'neutral';
  return value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
}

function outcomeClass(outcome) {
  if (outcome === 'win') return 'positive';
  if (outcome === 'loss') return 'negative';
  return 'neutral';
}

function outcomeLabel(outcome) {
  if (outcome === 'win') return 'прибыль';
  if (outcome === 'loss') return 'убыток';
  if (outcome === 'breakeven') return 'безубыток';
  return '—';
}

// ---------- Модальное окно подтверждения (вместо браузерного confirm()) ----------

function showConfirmModal({ title, text, confirmLabel = 'Удалить' }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-modal-overlay');
    const titleEl = document.getElementById('confirm-modal-title');
    const textEl = document.getElementById('confirm-modal-text');
    const confirmBtn = document.getElementById('confirm-modal-confirm');
    const cancelBtn = document.getElementById('confirm-modal-cancel');

    titleEl.textContent = title;
    textEl.textContent = text;
    confirmBtn.textContent = confirmLabel;
    overlay.classList.remove('hidden');

    const cleanup = (result) => {
      overlay.classList.add('hidden');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlayClick);
      resolve(result);
    };
    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onOverlayClick = (e) => { if (e.target === overlay) cleanup(false); };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlayClick);
  });
}

// ---------- Навигация между экранами ----------

const SCREENS = [
  'onboarding', 'dashboard', 'journal', 'trade-detail',
  'add-trade', 'analytics', 'exchange', 'settings',
];

function showScreen(name) {
  SCREENS.forEach((s) => {
    document.getElementById(`screen-${s}`).classList.toggle('active', s === name);
  });

  const tabBar = document.getElementById('tab-bar');
  const tabScreens = ['dashboard', 'journal', 'analytics', 'settings'];
  tabBar.classList.toggle('hidden', !tabScreens.includes(name));

  if (tabScreens.includes(name)) {
    document.querySelectorAll('.tab-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.screen === name);
    });
  }

  // Перезагружаем данные при входе на экран
  if (name === 'dashboard') loadDashboard();
  if (name === 'journal') loadJournal();
  if (name === 'analytics') loadAnalytics();
  if (name === 'settings') loadSettings();
  if (name === 'add-trade' && !editingTradeId) resetAddTradeForm();
}

document.querySelectorAll('.tab-item').forEach((item) => {
  item.addEventListener('click', () => showScreen(item.dataset.screen));
});

// ---------- Онбординг ----------

const ONBOARDING_SLIDES = [
  {
    icon: '📈', iconBg: 'var(--accent-bg)', iconColor: 'var(--accent)',
    title: 'Дневник сделок без рутины',
    text: 'Сделки с Binance подтягиваются сами. Ты добавляешь только заметки и теги.',
  },
  {
    icon: '🎯', iconBg: 'var(--success-bg)', iconColor: 'var(--success)',
    title: 'Видишь, что реально работает',
    text: 'PnL по сетапам и тегам. Не угадывай — проверяй цифрами.',
  },
  {
    icon: '🔌', iconBg: 'var(--warning-bg)', iconColor: 'var(--warning)',
    title: 'Подключи Binance',
    text: 'Нужен только read-only API-ключ. Доступа к выводу средств нет и не запрашивается.',
    isLast: true,
  },
];

let onboardingIndex = 0;

function renderOnboarding() {
  const container = document.getElementById('onboarding-slides');
  const slide = ONBOARDING_SLIDES[onboardingIndex];

  const dots = ONBOARDING_SLIDES.map((_, i) =>
    `<div class="dot ${i === onboardingIndex ? 'active' : ''}"></div>`
  ).join('');

  const actions = slide.isLast
    ? `<button class="btn btn-primary btn-block" id="ob-connect-btn">Подключить Binance</button>
       <button class="btn btn-ghost btn-block" id="ob-manual-btn">Добавлять сделки вручную</button>`
    : `<button class="btn btn-primary btn-block" id="ob-next-btn">Далее</button>`;

  container.innerHTML = `
    <div class="onboarding-slide">
      <div class="onboarding-content">
        <div class="onboarding-icon" style="background:${slide.iconBg}; color:${slide.iconColor};">${slide.icon}</div>
        <div class="onboarding-title">${slide.title}</div>
        <div class="onboarding-text">${slide.text}</div>
      </div>
      <div class="onboarding-dots">${dots}</div>
      <div class="onboarding-actions">${actions}</div>
    </div>
  `;

  if (slide.isLast) {
    document.getElementById('ob-connect-btn').addEventListener('click', () => showScreen('exchange'));
    document.getElementById('ob-manual-btn').addEventListener('click', () => showScreen('dashboard'));
  } else {
    document.getElementById('ob-next-btn').addEventListener('click', () => {
      onboardingIndex++;
      renderOnboarding();
    });
  }
}

// ---------- Дашборд ----------

function drawEquityCurve(canvas, values) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!values || values.length < 2) {
    ctx.strokeStyle = '#262C36';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, rect.height / 2);
    ctx.lineTo(rect.width, rect.height / 2);
    ctx.stroke();
    return;
  }

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const lastPositive = values[values.length - 1] >= 0;
  const lineColor  = lastPositive ? '#3DDC97' : '#E5534B';
  const fillColorA = lastPositive ? 'rgba(61,220,151,0.25)' : 'rgba(229,83,75,0.25)';
  const fillColorB = lastPositive ? 'rgba(61,220,151,0)'    : 'rgba(229,83,75,0)';

  // Строим путь линии
  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * rect.width,
    y: rect.height - ((v - min) / range) * rect.height,
  }));

  // Градиентная заливка под кривой
  const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
  gradient.addColorStop(0, fillColorA);
  gradient.addColorStop(1, fillColorB);

  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, rect.height);
  ctx.lineTo(points[0].x, rect.height);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Линия поверх заливки
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();
}

// Обновляет большое число PnL на дашборде и заголовок карточки согласно pnlMode
function updateDashPnlDisplay() {
  const r = window._dashTotalR;
  const pnlEl = document.getElementById('dash-pnl');
  const label = document.getElementById('dash-pnl-label');

  if (r === null || r === undefined) {
    pnlEl.textContent = '—';
    pnlEl.className = 'pnl-value mono neutral';
    label.textContent = 'Суммарный R';
  } else {
    pnlEl.textContent = fmtPnl(r);
    pnlEl.className = `pnl-value mono ${pnlClass(r)}`;
    label.textContent = pnlMode === 'usd' ? 'Суммарный PnL' : pnlMode === 'pct' ? 'Суммарный PnL' : 'Суммарный R';
  }

  // Синхронизируем активную кнопку переключателя
  document.querySelectorAll('#dash-pnl-mode-switch .pnl-mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === pnlMode);
  });
}

document.getElementById('dash-pnl-mode-switch').querySelectorAll('.pnl-mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    setPnlMode(btn.dataset.mode);
    updateDashPnlDisplay();
  });
});

// ---------- Дашборд: состояние фильтра ----------

let dashView = 'all';       // 'all' | 'month' | 'year' | 'winrate'
let dashSubfilter = '';     // значение селектора

async function loadDashboard(params = '') {
  try {
    const data = await apiGet(`/stats/summary${params ? '?' + params : ''}`);
    const { stats, recent_trades } = data;

    document.getElementById('dash-winrate').textContent = stats.total_trades ? `${stats.winrate}%` : '—';
    document.getElementById('dash-pf').textContent = stats.total_trades ? stats.profit_factor : '—';
    document.getElementById('dash-count').textContent = stats.total_trades || '0';

    window._dashTotalR = stats.total_trades ? (stats.total_r ?? null) : null;
    window._dashRCurve = stats.r_curve || [];
    updateDashPnlDisplay();

    drawEquityCurve(document.getElementById('dash-equity-chart'), stats.r_curve);

    // Последние сделки показываем только на вкладке "Всё"
    const showRecent = dashView === 'all' && stats.total_trades > 0;
    document.getElementById('dash-recent-section').classList.toggle('hidden', !showRecent);
    document.getElementById('dash-empty-state').classList.toggle('hidden', stats.total_trades > 0);

    if (showRecent && recent_trades?.length) {
      document.getElementById('dash-recent-list').innerHTML = recent_trades.map(renderTradeRow).join('');
      attachTradeRowHandlers('dash-recent-list');
    }
  } catch (e) {
    console.error('Не удалось загрузить дашборд', e);
  }
}

// Строим query-параметры из текущего фильтра дашборда
function buildDashParams() {
  if (dashView === 'all') return '';
  const p = new URLSearchParams();
  if (dashView === 'month' && dashSubfilter) {
    const [y, m] = dashSubfilter.split('-');
    p.set('year', y); p.set('month', m);
  } else if (dashView === 'year' && dashSubfilter) {
    p.set('year', dashSubfilter);
  } else if (dashView === 'winrate' && dashSubfilter) {
    p.set('result', dashSubfilter);
  }
  return p.toString();
}

// Заполняем субфильтр-селектор в зависимости от выбранной вкладки
async function buildDashSubfilter() {
  const sel = document.getElementById('dash-subfilter');

  if (dashView === 'month') {
    // Берём месяцы из уже загруженных данных журнала — без доп. запроса
    try {
      const data = await apiGet('/trades');
      const months = [...new Set((data.trades || []).map(t => {
        const d = t.trade_date || t.created_at || '';
        const m = d.match(/(\d{4})[.\-\/T](\d{2})/);
        return m ? `${m[1]}-${m[2]}` : null;
      }).filter(Boolean))].sort().reverse();

      const names = ['Январь','Февраль','Март','Апрель','Май','Июнь',
        'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
      sel.innerHTML = months.map(k => {
        const [y, mo] = k.split('-');
        return `<option value="${k}">${names[parseInt(mo)-1]} ${y}</option>`;
      }).join('') || '<option value="">Нет данных</option>';
      dashSubfilter = months[0] || '';
      sel.value = dashSubfilter;
    } catch(e) {}

  } else if (dashView === 'year') {
    try {
      const data = await apiGet('/trades');
      const years = [...new Set((data.trades || []).map(t => {
        const d = t.trade_date || t.created_at || '';
        const m = d.match(/(\d{4})/);
        return m ? m[1] : null;
      }).filter(Boolean))].sort().reverse();

      sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('') || '<option value="">Нет данных</option>';
      dashSubfilter = years[0] || '';
      sel.value = dashSubfilter;
    } catch(e) {}

  } else if (dashView === 'winrate') {
    sel.innerHTML = `
      <option value="win">Прибыль</option>
      <option value="loss">Убыток</option>
      <option value="breakeven">Безубыток</option>`;
    dashSubfilter = 'win';
    sel.value = dashSubfilter;
  }

  sel.classList.toggle('hidden', dashView === 'all');
}

// Табы дашборда
document.querySelectorAll('.dash-tab').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.dash-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    dashView = btn.dataset.view;
    dashSubfilter = '';
    await buildDashSubfilter();
    loadDashboard(buildDashParams());
  });
});

document.getElementById('dash-subfilter').addEventListener('change', e => {
  dashSubfilter = e.target.value;
  loadDashboard(buildDashParams());
});

// ---------- Скриншот-карточка 📸 ----------

function drawShareCard(canvas) {
  const W = 800, H = 480;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Фон
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#141920');
  bg.addColorStop(1, '#0D1117');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 24);
  ctx.fill();

  // Тонкая рамка
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 24);
  ctx.stroke();

  const r = window._dashTotalR;
  const isPos = r >= 0;
  const accentColor = isPos ? '#3DDC97' : '#E5534B';

  // Слабый акцент-блик сверху
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 280);
  glow.addColorStop(0, isPos ? 'rgba(61,220,151,0.08)' : 'rgba(229,83,75,0.08)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Лейбл периода
  const periodLabel = getDashPeriodLabel();
  ctx.font = '500 14px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('Журнал трейдера · ' + periodLabel, 40, 52);

  // Большое число PnL
  const pnlText = fmtPnl(r) || '—';
  ctx.font = `700 ${pnlText.length > 7 ? 72 : 88}px Inter, sans-serif`;
  ctx.fillStyle = accentColor;
  ctx.fillText(pnlText, 40, 148);

  // Метрики — винрейт, PF, сделок
  const wr = document.getElementById('dash-winrate').textContent;
  const pf = document.getElementById('dash-pf').textContent;
  const cnt = document.getElementById('dash-count').textContent;
  const metrics = [
    { label: 'Винрейт',      value: wr },
    { label: 'Profit factor', value: pf },
    { label: 'Сделок',       value: cnt },
  ];
  metrics.forEach((m, i) => {
    const x = 40 + i * 160;
    ctx.font = '500 12px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(m.label.toUpperCase(), x, 192);
    ctx.font = '600 22px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    ctx.fillText(m.value, x, 222);
  });

  // Мини-график equity
  drawMiniChart(ctx, 40, 248, W - 80, 140, accentColor, isPos);

  // Нижняя строка — url
  ctx.font = '500 13px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillText('tracker-pnl-production.up.railway.app', 40, H - 24);

  // Точка статуса
  ctx.beginPath();
  ctx.arc(W - 40, H - 30, 5, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.fill();
}

function drawMiniChart(ctx, x, y, w, h, color, isPos) {
  const curve = window._dashRCurve;
  if (!curve || curve.length < 2) {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  const min = Math.min(...curve, 0), max = Math.max(...curve, 0), range = max - min || 1;
  const pts = curve.map((v, i) => ({
    x: x + (i / (curve.length - 1)) * w,
    y: y + h - ((v - min) / range) * h,
  }));

  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, isPos ? 'rgba(61,220,151,0.3)' : 'rgba(229,83,75,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, y + h);
  ctx.lineTo(pts[0].x, y + h);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.setLineDash([]);
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getDashPeriodLabel() {
  if (dashView === 'all') return 'Всё время';
  const sel = document.getElementById('dash-subfilter');
  return sel?.options[sel.selectedIndex]?.text || dashSubfilter || '';
}

function openShareCardModal() {
  const overlay = document.getElementById('share-card-overlay');
  const canvas = document.getElementById('share-canvas');
  drawShareCard(canvas);
  overlay.classList.remove('hidden');
}

function closeShareCardModal() {
  document.getElementById('share-card-overlay').classList.add('hidden');
}

function getShareBlob(cb) {
  document.getElementById('share-canvas').toBlob(cb, 'image/png');
}

document.getElementById('dash-screenshot-btn').addEventListener('click', openShareCardModal);
document.getElementById('share-card-close').addEventListener('click', closeShareCardModal);
document.getElementById('share-card-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeShareCardModal();
});

document.getElementById('share-action-save').addEventListener('click', () => {
  getShareBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pnl-tracker.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  });
});

document.getElementById('share-action-telegram').addEventListener('click', () => {
  getShareBlob(blob => {
    const file = new File([blob], 'pnl-tracker.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file] }).catch(() => {});
    } else {
      // Фолбэк — просто скачать
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'pnl-tracker.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }
  });
});

document.getElementById('share-action-more').addEventListener('click', () => {
  getShareBlob(blob => {
    const file = new File([blob], 'pnl-tracker.png', { type: 'image/png' });
    if (navigator.share) {
      navigator.share({ files: [file], title: 'Мои результаты' }).catch(() => {});
    }
  });
});

document.getElementById('dash-connect-btn').addEventListener('click', () => showScreen('exchange'));
document.getElementById('dash-manual-btn').addEventListener('click', () => showScreen('add-trade'));
document.getElementById('dash-history-btn')?.addEventListener('click', () => showScreen('journal'));

// Кнопка переключения темы в шапке дашборда — циклически меняет авто→светлая→тёмная
document.getElementById('dash-theme-btn').addEventListener('click', () => {
  const modes = ['auto', 'light', 'dark'];
  const cur = getThemeMode();
  const next = modes[(modes.indexOf(cur) + 1) % modes.length];
  setThemeMode(next);
  // Подсвечиваем кнопку когда тема не авто
  document.getElementById('dash-theme-btn').classList.toggle('active', next !== 'auto');
});
document.getElementById('dash-see-all-btn').addEventListener('click', () => showScreen('journal'));
document.getElementById('dash-fab-btn').addEventListener('click', () => showScreen('add-trade'));

// ---------- Рендер строки сделки (общий для дашборда и журнала) ----------

function renderTradeRow(t) {
  const isLong = t.direction === 'long';
  const date = (t.trade_date || t.created_at || '—').split('T')[0].split(' ')[0];
  const entry = t.entry_price ? ` · ${t.entry_price}` : '';
  const pnlText = fmtPnlForTrade(t.result_r, t.pnl_usd, t.pnl_pct);
  return `
    <div class="trade-row" data-trade-id="${t.id}">
      <div class="trade-left">
        <div class="trade-icon ${isLong ? 'long' : 'short'}">${isLong ? '↗' : '↘'}</div>
        <div>
          <div class="trade-symbol">${t.symbol}</div>
          <div class="trade-meta">${date}${entry}</div>
        </div>
      </div>
      <div class="trade-right">
        <div class="trade-pnl ${pnlClass(t.result_r)}"
          data-result-r="${t.result_r ?? ''}"
          data-pnl-usd="${t.pnl_usd ?? ''}"
          data-pnl-pct="${t.pnl_pct ?? ''}">${pnlText}</div>
        <div class="trade-r ${outcomeClass(t.outcome)}">${outcomeLabel(t.outcome)}</div>
      </div>
    </div>
  `;
}

function attachTradeRowHandlers(containerId) {
  document.getElementById(containerId).querySelectorAll('.trade-row').forEach((row) => {
    row.addEventListener('click', () => openTradeDetail(row.dataset.tradeId));
  });
}

// ---------- Журнал сделок ----------

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

let journalView = 'all';          // all | month | year | winrate | symbol
let journalSubfilter = '';        // значение второго селектора (месяц/год/тикер/результат)
let journalSortColumn = 'trade_date';
let journalSortDir = 'desc';      // 'asc' | 'desc'
let journalRowsCache = [];        // последние загруженные строки — пересортировываем без нового запроса

// Режим отображения PnL: 'r' | 'usd' | 'pct'
// Хранится в localStorage, чтобы не сбрасывался при переключении экранов
let pnlMode = localStorage.getItem('pnl_display_mode') || 'r';

// Риск на сделку в долларах — берётся из настроек (localStorage)
function getRiskUsd() {
  return parseFloat(localStorage.getItem('pnl_risk_usd') || '0') || 0;
}

function getDeposit() {
  return parseFloat(localStorage.getItem('pnl_deposit') || '0') || 0;
}

// Переводит риск любого типа в доллары (для расчёта PnL $)
function riskToUsd(amount, type) {
  if (!amount) return 0;
  if (type === 'usd') return amount;
  if (type === 'pct') {
    const dep = getDeposit();
    return dep ? (amount / 100) * dep : 0;
  }
  // type === 'r' — 1R в $ берём из глобального риска
  return amount * getRiskUsd();
}

// Форматирует PnL для конкретной сделки
// Берёт зафиксированные значения напрямую — настройки не влияют
function fmtPnlForTrade(resultR, pnlUsd, pnlPct) {
  if (pnlMode === 'usd') {
    if (pnlUsd !== null && pnlUsd !== undefined && pnlUsd !== '') {
      const v = parseFloat(pnlUsd);
      return (v > 0 ? '+' : '') + v.toFixed(2) + '$';
    }
    // Если $ не зафиксирован — пробуем посчитать из R и глобального риска
    if (resultR !== null && resultR !== undefined) {
      const riskUsd = getRiskUsd();
      if (riskUsd) {
        const v = resultR * riskUsd;
        return (v > 0 ? '+' : '') + v.toFixed(2) + '$';
      }
    }
    return fmtR(resultR);
  }
  if (pnlMode === 'pct') {
    if (pnlPct !== null && pnlPct !== undefined && pnlPct !== '') {
      const v = parseFloat(pnlPct);
      return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
    }
    // Фолбэк на глобальный риск %
    if (resultR !== null && resultR !== undefined) {
      const riskPct = parseFloat(localStorage.getItem('pnl_risk_pct') || '0') || 0;
      if (riskPct) {
        const v = resultR * riskPct;
        return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
      }
    }
    return fmtR(resultR);
  }
  return fmtR(resultR);
}

// Форматирует PnL без контекста конкретной сделки (для сводки, дашборда)
function fmtPnl(resultR) {
  return fmtPnlForTrade(resultR, null, null);
}

function setPnlMode(mode) {
  pnlMode = mode;
  localStorage.setItem('pnl_display_mode', mode);
  document.querySelectorAll('.pnl-mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  // Обновляем уже отрисованные строки сделок на дашборде
  document.querySelectorAll('.trade-pnl[data-result-r]').forEach((el) => {
    const r = el.dataset.resultR === '' ? null : parseFloat(el.dataset.resultR);
    const usd = el.dataset.pnlUsd === '' ? null : parseFloat(el.dataset.pnlUsd);
    const pct = el.dataset.pnlPct === '' ? null : parseFloat(el.dataset.pnlPct);
    el.textContent = fmtPnlForTrade(r, usd, pct);
    el.className = `trade-pnl ${pnlClass(r)}`;
  });
  renderJournalTable();
  updateDashPnlDisplay();
}

document.querySelectorAll('.pnl-mode-btn').forEach((b) => {
  b.addEventListener('click', () => setPnlMode(b.dataset.mode));
});

async function loadJournal() {
  const tableBody = document.getElementById('journal-table-body');
  const tableWrap = document.getElementById('journal-table-wrap');
  const emptyEl = document.getElementById('journal-empty-state');

  try {
    const params = new URLSearchParams();

    if (journalView === 'month' && journalSubfilter) {
      const [year, month] = journalSubfilter.split('-');
      params.set('year', year);
      params.set('month', month);
    } else if (journalView === 'year' && journalSubfilter) {
      params.set('year', journalSubfilter);
    } else if (journalView === 'winrate' && journalSubfilter) {
      params.set('result', journalSubfilter); // 'win' или 'loss'
    } else if (journalView === 'symbol' && journalSubfilter) {
      params.set('symbol', journalSubfilter);
    }

    const data = await apiGet(`/trades?${params.toString()}`);
    journalRowsCache = data.trades;

    renderJournalTable();
  } catch (e) {
    console.error('Не удалось загрузить журнал', e);
  }
}

// Сводка над таблицей: кол-во сделок, винрейт и суммарный R по текущему
// отфильтрованному срезу (период/тикер/результат — что выбрано во вкладке)
function renderJournalSummary() {
  const rows = journalRowsCache;
  const countEl = document.getElementById('journal-summary-count');
  const winrateEl = document.getElementById('journal-summary-winrate');
  const rrEl = document.getElementById('journal-summary-rr');

  const total = rows.length;
  countEl.textContent = `${total} ${tradesWord(total)}`;

  // Винрейт считаем только по закрытым исходом сделкам (win/loss);
  // безубыток не засчитывается ни в выигрыши, ни в проигрыши
  const decided = rows.filter((t) => t.outcome === 'win' || t.outcome === 'loss');
  const wins = decided.filter((t) => t.outcome === 'win').length;
  winrateEl.textContent = decided.length
    ? `винрейт ${Math.round((wins / decided.length) * 100)}%`
    : 'винрейт —';

  const totalR = rows.reduce((sum, t) => sum + (t.result_r || 0), 0);
  rrEl.textContent = total ? fmtPnl(totalR) : 'R —';
  rrEl.className = `mono ${total ? pnlClass(totalR) : ''}`;
}

function tradesWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'сделка';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'сделки';
  return 'сделок';
}

function renderJournalTable() {
  const tableBody = document.getElementById('journal-table-body');
  const tableWrap = document.getElementById('journal-table-wrap');
  const emptyEl = document.getElementById('journal-empty-state');

  renderJournalSummary();

  let rows = [...journalRowsCache];

  // Сортировка — по выбранной колонке и направлению
  rows.sort((a, b) => {
    let va, vb;
    if (journalSortColumn === 'trade_date') {
      va = a.trade_date || a.created_at || '';
      vb = b.trade_date || b.created_at || '';
    } else if (journalSortColumn === 'result') {
      const rank = { win: 2, breakeven: 1, loss: 0 };
      va = rank[a.outcome] ?? -1;
      vb = rank[b.outcome] ?? -1;
    } else {
      va = a[journalSortColumn] ?? '';
      vb = b[journalSortColumn] ?? '';
    }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return journalSortDir === 'asc' ? -1 : 1;
    if (va > vb) return journalSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (rows.length === 0) {
    tableWrap.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    return;
  }
  tableWrap.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  tableBody.innerHTML = rows.map(renderTableRow).join('');

  tableBody.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => openTradeDetail(row.dataset.tradeId));
  });

  // Обновляем визуальные стрелки сортировки в заголовках
  document.querySelectorAll('#journal-table thead th').forEach((th) => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.sort === journalSortColumn) {
      th.classList.add(journalSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
  });
}

function renderTableRow(t) {
  const isLong = t.direction === 'long';
  const dateStr = (t.trade_date || t.created_at || '—').split(' ')[0];

  const resultClassMap = { win: 'win', loss: 'loss', breakeven: 'neutral' };
  const resultClass = resultClassMap[t.outcome] || 'neutral';
  const resultLabel = outcomeLabel(t.outcome);

  return `
    <tr data-trade-id="${t.id}">
      <td class="cell-date">${dateStr}</td>
      <td class="cell-symbol">${t.symbol}</td>
      <td><span class="cell-direction ${isLong ? 'long' : 'short'}">${isLong ? 'лонг' : 'шорт'}</span></td>
      <td class="cell-r">${fmtPnlForTrade(t.result_r, t.pnl_usd, t.pnl_pct)}</td>
      <td><span class="cell-result ${resultClass}"><span class="result-dot"></span>${resultLabel}</span></td>
    </tr>
  `;
}

// Клик по заголовку таблицы — сортировка
document.querySelectorAll('#journal-table thead th').forEach((th) => {
  th.addEventListener('click', () => {
    const col = th.dataset.sort;
    if (journalSortColumn === col) {
      journalSortDir = journalSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      journalSortColumn = col;
      journalSortDir = 'desc';
    }
    renderJournalTable();
  });
});

// Переключение вкладок-срезов
document.querySelectorAll('#journal-tabs .tab-chip').forEach((tab) => {
  tab.addEventListener('click', async () => {
    document.querySelectorAll('#journal-tabs .tab-chip').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    journalView = tab.dataset.view;
    journalSubfilter = '';
    await renderJournalSubfilter();
    loadJournal();
  });
});

async function renderJournalSubfilter() {
  const wrap = document.getElementById('journal-subfilter');
  const select = document.getElementById('journal-subfilter-select');

  if (journalView === 'all') {
    wrap.classList.add('hidden');
    return;
  }

  wrap.classList.remove('hidden');

  if (journalView === 'winrate') {
    select.innerHTML = `
      <option value="">Все сделки</option>
      <option value="win">Только прибыльные</option>
      <option value="loss">Только убыточные</option>
      <option value="breakeven">Только безубыточные</option>
    `;
  } else if (journalView === 'year') {
    try {
      const data = await apiGet('/trades/years');
      select.innerHTML = data.years.map((y) => `<option value="${y}">${y}</option>`).join('');
      journalSubfilter = data.years[0] ? String(data.years[0]) : '';
    } catch (e) {
      console.error('Не удалось загрузить список годов', e);
    }
  } else if (journalView === 'month') {
    try {
      const data = await apiGet('/trades/years');
      const options = [];
      data.years.forEach((y) => {
        for (let m = 12; m >= 1; m--) {
          options.push(`<option value="${y}-${m}">${MONTH_NAMES[m - 1]} ${y}</option>`);
        }
      });
      select.innerHTML = options.join('');
      if (data.years[0]) {
        const now = new Date();
        journalSubfilter = `${data.years[0]}-${now.getMonth() + 1}`;
        select.value = journalSubfilter;
      }
    } catch (e) {
      console.error('Не удалось загрузить список месяцев', e);
    }
  } else if (journalView === 'symbol') {
    try {
      const data = await apiGet('/trades/symbols');
      select.innerHTML = data.symbols.map((s) => `<option value="${s}">${s}</option>`).join('');
      journalSubfilter = data.symbols[0] || '';
    } catch (e) {
      console.error('Не удалось загрузить список тикеров', e);
    }
  }
}

document.getElementById('journal-subfilter-select').addEventListener('change', (e) => {
  journalSubfilter = e.target.value;
  loadJournal();
});

document.getElementById('journal-add-btn').addEventListener('click', () => showScreen('add-trade'));

// ---------- Деталь сделки ----------

let currentTradeId = null;
let currentTrade = null;
let availableTags = [];

async function openTradeDetail(tradeId) {
  currentTradeId = tradeId;
  showScreen('trade-detail');

  try {
    const t = await apiGet(`/trades/${tradeId}`);
    currentTrade = t;
    const tagsData = await apiGet('/tags');
    availableTags = tagsData.tags;

    document.getElementById('detail-symbol').textContent = t.symbol;

    const badge = document.getElementById('detail-source-badge');
    badge.textContent = t.source === 'auto' ? 'авто' : 'ручная';
    badge.className = `source-badge ${t.source}`;

    const pnlEl = document.getElementById('detail-pnl');
    pnlEl.textContent = fmtR(t.result_r);
    pnlEl.className = `pnl-value mono ${pnlClass(t.result_r)}`;

    document.getElementById('detail-pnl-sub').textContent =
      `${t.direction} · ${outcomeLabel(t.outcome)}${t.trade_date ? ' · ' + t.trade_date : ''}`;

    document.getElementById('detail-entry').textContent = t.entry_price ?? '—';
    document.getElementById('detail-exit').textContent = t.exit_price ?? '—';
    document.getElementById('detail-size').textContent = t.size ?? '—';
    document.getElementById('detail-leverage').textContent = t.leverage ? `${t.leverage}x` : '—';

    renderDetailTags(t.tags || []);
    document.getElementById('detail-note').value = t.note || '';

    await updateFavoriteStar(t.symbol);
  } catch (e) {
    console.error('Не удалось загрузить сделку', e);
  }
}

async function updateFavoriteStar(symbol) {
  const starBtn = document.getElementById('detail-favorite-btn');
  try {
    const data = await apiGet('/favorites');
    const isFavorite = data.symbols.includes(symbol);
    starBtn.textContent = isFavorite ? '★' : '☆';
    starBtn.dataset.symbol = symbol;
    starBtn.dataset.isFavorite = isFavorite ? 'true' : 'false';
  } catch (e) {
    console.error('Не удалось загрузить избранное', e);
  }
}

document.getElementById('detail-edit-btn').addEventListener('click', () => {
  if (currentTrade) openEditTrade(currentTrade);
});

document.getElementById('detail-favorite-btn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const symbol = btn.dataset.symbol;
  const isFavorite = btn.dataset.isFavorite === 'true';

  try {
    if (isFavorite) {
      await apiDelete(`/favorites/${encodeURIComponent(symbol)}`);
    } else {
      await apiPost(`/favorites/${encodeURIComponent(symbol)}`, {});
    }
    tg?.HapticFeedback?.notificationOccurred('success');
    await updateFavoriteStar(symbol);
  } catch (e) {
    console.error('Не удалось обновить избранное', e);
  }
});

function renderDetailTags(activeTags) {
  const allTags = [...new Set([...availableTags, ...activeTags])];
  const container = document.getElementById('detail-tags');

  container.innerHTML = allTags.map((tag) => `
    <span class="tag-pill ${activeTags.includes(tag) ? 'active' : ''}" data-tag="${tag}">${tag}</span>
  `).join('') + `<span class="tag-pill add-tag" id="detail-add-tag">+ тег</span>`;

  container.querySelectorAll('.tag-pill[data-tag]').forEach((pill) => {
    pill.addEventListener('click', async () => {
      const tag = pill.dataset.tag;
      const isActive = pill.classList.contains('active');
      const newTags = isActive
        ? activeTags.filter((t) => t !== tag)
        : [...activeTags, tag];
      await apiPatch(`/trades/${currentTradeId}`, { tags: newTags });
      activeTags = newTags;
      renderDetailTags(activeTags);
    });
  });

  document.getElementById('detail-add-tag').addEventListener('click', () => {
    showAddTagInput(activeTags);
  });
}

function showAddTagInput(activeTags) {
  const container = document.getElementById('detail-tags');
  const addBtn = document.getElementById('detail-add-tag');

  // Заменяем кнопку "+ тег" на инлайн-инпут прямо на её месте —
  // без prompt()/confirm(), которые Telegram Mini App может блокировать
  const wrapper = document.createElement('span');
  wrapper.className = 'tag-input-wrapper';
  wrapper.innerHTML = `<input type="text" id="new-tag-input" class="tag-input" placeholder="Название тега" />`;
  addBtn.replaceWith(wrapper);

  const input = document.getElementById('new-tag-input');
  input.focus();

  const commit = async () => {
    const value = input.value.trim();
    if (value) {
      const newTags = [...activeTags, value];
      await apiPatch(`/trades/${currentTradeId}`, { tags: newTags });
      activeTags = newTags;
    }
    renderDetailTags(activeTags);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') renderDetailTags(activeTags);
  });
  input.addEventListener('blur', commit);
}

document.getElementById('detail-back-btn').addEventListener('click', () => showScreen('journal'));

document.getElementById('detail-save-note-btn').addEventListener('click', async () => {
  const note = document.getElementById('detail-note').value;
  try {
    await apiPatch(`/trades/${currentTradeId}`, { note });
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) {
    console.error('Не удалось сохранить заметку', e);
  }
});

document.getElementById('detail-delete-btn').addEventListener('click', async () => {
  const confirmed = await showConfirmModal({
    title: 'Удалить сделку?',
    text: 'Это действие нельзя отменить.',
    confirmLabel: 'Удалить',
  });
  if (!confirmed) return;

  try {
    await apiDelete(`/trades/${currentTradeId}`);
    showScreen('journal');
  } catch (e) {
    console.error('Не удалось удалить сделку', e);
  }
});

// ---------- Добавить сделку ----------

let addTradeDirection = 'long';
let addTradeOutcome = null; // 'win' | 'loss' | 'breakeven' | null
let addTradeTags = [];      // выбранные теги сетапа/сессии
let addRRType = 'r'; // 'r' | 'usd' | 'pct' — тип ввода поля Result R

// Переключатель типа ввода RR
document.querySelectorAll('#add-rr-type-switch .pnl-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    addRRType = btn.dataset.rrtype;
    document.querySelectorAll('#add-rr-type-switch .pnl-mode-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.rrtype === addRRType));
    // Обновляем подсказку
    const hint = document.getElementById('rr-hint');
    if (addRRType === 'r') hint.textContent = 'Вводи как положительное число — знак определяется результатом ниже';
    else if (addRRType === 'usd') hint.textContent = 'Сумма в $ — будет конвертирована в R через риск из настроек';
    else hint.textContent = 'Процент от депозита — будет конвертирован в R через депозит из настроек';
  });
});

// Если editingTradeId не null — форма работает в режиме редактирования
// существующей сделки (PATCH), а не добавления новой (POST)
let editingTradeId = null;

function openEditTrade(trade) {
  editingTradeId = trade.id;
  showScreen('add-trade');
  fillAddTradeForm(trade);
}

async function fillAddTradeForm(trade) {
  await loadFavoriteSymbolsIntoSelect();

  const select = document.getElementById('add-symbol-select');
  const wrapper = document.getElementById('add-symbol-new-wrapper');
  const newInput = document.getElementById('add-symbol-new-input');

  // Если тикер сделки не в избранном — добавляем его как опцию вручную,
  // чтобы форма показала текущее значение, а не первый попавшийся тикер
  const hasOption = Array.from(select.options).some((o) => o.value === trade.symbol);
  if (!hasOption) {
    const opt = document.createElement('option');
    opt.value = trade.symbol;
    opt.textContent = trade.symbol;
    select.insertBefore(opt, select.firstChild);
  }
  select.value = trade.symbol;
  wrapper.classList.add('hidden');
  newInput.value = '';

  document.getElementById('add-trade-date').value = (trade.trade_date || '').slice(0, 10);
  // Время сделки — если в дате его нет (старые записи без времени), оставляем как было: 12:00
  const timePart = (trade.trade_date || '').slice(11, 16);
  document.getElementById('add-trade-time').value = timePart || '12:00';

  addTradeDirection = trade.direction === 'short' ? 'short' : 'long';
  document.getElementById('add-direction-long').classList.toggle('active', addTradeDirection === 'long');
  document.getElementById('add-direction-short').classList.toggle('active', addTradeDirection === 'short');

  addTradeOutcome = trade.outcome || null;
  document.querySelectorAll('.outcome-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.value === addTradeOutcome);
  });

  document.getElementById('add-result-r').value =
    (trade.result_r === null || trade.result_r === undefined) ? '' : Math.abs(trade.result_r);

  document.getElementById('add-note').value = trade.note || '';

  // Полный список тегов сделки сохраняем как есть (включая теги, для которых
  // нет готовой кнопки) — кнопки ниже лишь подсвечивают совпадения и переключают их
  addTradeTags = [...(trade.tags || [])];
  document.querySelectorAll('.multi-tag-btn').forEach((b) => {
    b.classList.toggle('active', addTradeTags.includes(b.dataset.tag));
  });

  document.getElementById('add-trade-title').textContent = 'Редактировать сделку';
  document.getElementById('add-submit-btn').textContent = 'Сохранить изменения';

  document.getElementById('add-entry-price').value = trade.entry_price ?? '';
  document.getElementById('add-exit-price').value = trade.exit_price ?? '';
  document.getElementById('add-size').value = trade.size ?? '';
  document.getElementById('add-leverage').value = trade.leverage ?? '';

  // Если хотя бы одно из полей деталей заполнено — сразу раскрываем блок,
  // чтобы при редактировании не приходилось искать, куда делись данные
  const hasDetails = trade.entry_price != null || trade.exit_price != null
    || trade.size != null || trade.leverage != null;
  setDetailsToggle(hasDetails);
}

function setDetailsToggle(open) {
  const btn = document.getElementById('add-details-toggle');
  const fields = document.getElementById('add-details-fields');
  btn.classList.toggle('open', open);
  fields.classList.toggle('hidden', !open);
}

document.getElementById('add-details-toggle').addEventListener('click', () => {
  const isOpen = document.getElementById('add-details-toggle').classList.contains('open');
  setDetailsToggle(!isOpen);
});

async function resetAddTradeForm() {
  document.getElementById('add-trade-title').textContent = 'Новая сделка';
  document.getElementById('add-submit-btn').textContent = 'Добавить сделку';

  // Дата и время по умолчанию — сейчас, по локальному времени устройства.
  // В Telegram Mini App это и есть время пользователя — приложение открыто
  // на его телефоне, отдельного API часового пояса Telegram не даёт.
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('add-trade-date').value = `${yyyy}-${mm}-${dd}`;
  const hh = String(today.getHours()).padStart(2, '0');
  const min = String(today.getMinutes()).padStart(2, '0');
  document.getElementById('add-trade-time').value = `${hh}:${min}`;

  document.getElementById('add-result-r').value = '';
  document.getElementById('add-note').value = '';

  document.getElementById('add-entry-price').value = '';
  document.getElementById('add-exit-price').value = '';
  document.getElementById('add-size').value = '';
  document.getElementById('add-leverage').value = '';
  addRRType = 'r';
  document.querySelectorAll('#add-rr-type-switch .pnl-mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.rrtype === 'r'));
  document.getElementById('rr-hint').textContent = 'Вводи как положительное число — знак определяется результатом ниже';
  setDetailsToggle(false);

  document.getElementById('add-symbol-new-wrapper').classList.add('hidden');
  document.getElementById('add-symbol-new-input').value = '';

  addTradeDirection = 'long';
  document.getElementById('add-direction-long').classList.add('active');
  document.getElementById('add-direction-short').classList.remove('active');

  addTradeOutcome = null;
  document.querySelectorAll('.outcome-btn').forEach((b) => b.classList.remove('active'));

  addTradeTags = [];
  document.querySelectorAll('.multi-tag-btn').forEach((b) => b.classList.remove('active'));

  await loadFavoriteSymbolsIntoSelect();
}

async function loadFavoriteSymbolsIntoSelect() {
  const select = document.getElementById('add-symbol-select');
  try {
    const data = await apiGet('/favorites');
    select.innerHTML = data.symbols.map((s) => `<option value="${s}">${s}</option>`).join('')
      + `<option value="__new__">+ Добавить новый тикер</option>`;
  } catch (e) {
    console.error('Не удалось загрузить избранные тикеры', e);
    select.innerHTML = `<option value="__new__">+ Добавить новый тикер</option>`;
  }
}

document.getElementById('add-symbol-select').addEventListener('change', (e) => {
  const wrapper = document.getElementById('add-symbol-new-wrapper');
  const input = document.getElementById('add-symbol-new-input');
  if (e.target.value === '__new__') {
    wrapper.classList.remove('hidden');
    input.focus();
  } else {
    wrapper.classList.add('hidden');
    input.value = '';
  }
});

document.getElementById('add-direction-long').addEventListener('click', () => {
  addTradeDirection = 'long';
  document.getElementById('add-direction-long').classList.add('active');
  document.getElementById('add-direction-short').classList.remove('active');
});

document.getElementById('add-direction-short').addEventListener('click', () => {
  addTradeDirection = 'short';
  document.getElementById('add-direction-short').classList.add('active');
  document.getElementById('add-direction-long').classList.remove('active');
});

['win', 'loss', 'breakeven'].forEach((value) => {
  document.getElementById(`add-outcome-${value}`).addEventListener('click', () => {
    const btn = document.getElementById(`add-outcome-${value}`);
    const isActive = btn.classList.contains('active');
    document.querySelectorAll('.outcome-btn').forEach((b) => b.classList.remove('active'));
    if (isActive) {
      addTradeOutcome = null; // повторный клик снимает выбор
    } else {
      addTradeOutcome = value;
      btn.classList.add('active');
    }
  });
});

// Сетап и сессия — мультивыбор (можно выбрать несколько тегов одновременно)
document.querySelectorAll('.multi-tag-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tag = btn.dataset.tag;
    const isActive = btn.classList.contains('active');
    if (isActive) {
      addTradeTags = addTradeTags.filter((t) => t !== tag);
      btn.classList.remove('active');
    } else {
      addTradeTags.push(tag);
      btn.classList.add('active');
    }
  });
});

document.getElementById('add-back-btn').addEventListener('click', () => {
  if (editingTradeId) {
    const tradeId = editingTradeId;
    editingTradeId = null;
    openTradeDetail(tradeId);
  } else {
    showScreen('dashboard');
  }
});

document.getElementById('add-submit-btn').addEventListener('click', async () => {
  const tradeDate = document.getElementById('add-trade-date').value; // формат YYYY-MM-DD
  const tradeTime = document.getElementById('add-trade-time').value || '12:00'; // формат HH:MM
  const selectValue = document.getElementById('add-symbol-select').value;
  const newSymbolRaw = document.getElementById('add-symbol-new-input').value.trim();
  const isNewSymbol = selectValue === '__new__';
  const symbol = (isNewSymbol ? newSymbolRaw : selectValue).toUpperCase();
  const resultRRaw = document.getElementById('add-result-r').value;
  const note = document.getElementById('add-note').value.trim();

  const entryRaw = document.getElementById('add-entry-price').value;
  const exitRaw = document.getElementById('add-exit-price').value;
  const sizeRaw = document.getElementById('add-size').value;
  const leverageRaw = document.getElementById('add-leverage').value;

  if (!symbol) { alert('Укажи актив'); return; }
  if (!tradeDate) { alert('Укажи дату сделки'); return; }

  // Конвертируем введённое значение — считаем все три и фиксируем навсегда
  let resultR = null, pnlUsd = null, pnlPct = null;
  if (resultRRaw) {
    const raw = Math.abs(parseFloat(resultRRaw));
    const riskUsd = getRiskUsd();
    const dep = getDeposit();

    if (addRRType === 'r') {
      resultR = raw;
      if (riskUsd) pnlUsd = raw * riskUsd;
      if (riskUsd && dep) pnlPct = (pnlUsd / dep) * 100;
    } else if (addRRType === 'usd') {
      pnlUsd = raw;
      if (riskUsd) resultR = raw / riskUsd;
      if (dep) pnlPct = (raw / dep) * 100;
    } else if (addRRType === 'pct') {
      pnlPct = raw;
      if (dep) pnlUsd = (raw / 100) * dep;
      if (dep && riskUsd) resultR = pnlUsd / riskUsd;
    }

    // Применяем знак из результата
    const sign = addTradeOutcome === 'loss' ? -1 : addTradeOutcome === 'breakeven' ? 0 : 1;
    if (resultR !== null) resultR = sign === 0 ? 0 : sign * Math.abs(resultR);
    if (pnlUsd !== null) pnlUsd = sign === 0 ? 0 : sign * Math.abs(pnlUsd);
    if (pnlPct !== null) pnlPct = sign === 0 ? 0 : sign * Math.abs(pnlPct);
  }

  const payload = {
    asset: symbol,
    symbol: symbol,
    direction: addTradeDirection,
    result_r: resultR,
    outcome: addTradeOutcome,
    trade_date: `${tradeDate}T${tradeTime}:00`,
    note: note || null,
    tags: addTradeTags,
    pnl_usd: pnlUsd,
    pnl_pct: pnlPct,
    entry_price: entryRaw ? parseFloat(entryRaw) : null,
    exit_price: exitRaw ? parseFloat(exitRaw) : null,
    size: sizeRaw ? parseFloat(sizeRaw) : null,
    leverage: leverageRaw ? parseFloat(leverageRaw) : null,
  };

  try {
    if (editingTradeId) {
      // Режим редактирования — отправляем изменения существующей сделки,
      // source не трогаем, чтобы не превратить авто-сделку в ручную
      await apiPatch(`/trades/${editingTradeId}`, payload);
      tg?.HapticFeedback?.notificationOccurred('success');
      const tradeId = editingTradeId;
      editingTradeId = null;
      resetAddTradeForm();
      await openTradeDetail(tradeId);
    } else {
      if (isNewSymbol) {
        // Новый тикер сразу попадает в избранное, чтобы в следующий раз
        // не вводить его руками
        await apiPost(`/favorites/${encodeURIComponent(symbol)}`, {});
      }
      await apiPost('/trades', { ...payload, source: 'manual' });
      tg?.HapticFeedback?.notificationOccurred('success');
      resetAddTradeForm();
      showScreen('dashboard');
    }
  } catch (e) {
    console.error(editingTradeId ? 'Не удалось сохранить изменения' : 'Не удалось добавить сделку', e);
    alert(editingTradeId
      ? 'Не удалось сохранить изменения. Проверь соединение с бэкендом.'
      : 'Не удалось добавить сделку. Проверь соединение с бэкендом.');
  }
});

// ---------- Аналитика ----------

async function loadAnalytics() {
  try {
    const data = await apiGet('/stats/by-tag');
    const container = document.getElementById('analytics-by-tag');
    const emptyEl = document.getElementById('analytics-empty-state');

    if (!data.by_tag.length) {
      container.parentElement.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }
    container.parentElement.classList.remove('hidden');
    emptyEl.classList.add('hidden');

    const maxAbs = Math.max(...data.by_tag.map((t) => Math.abs(t.total_r)), 1);

    container.innerHTML = data.by_tag.map((t) => {
      const widthPct = Math.round((Math.abs(t.total_r) / maxAbs) * 100);
      const isPositive = t.total_r >= 0;
      return `
        <div class="bar-stat">
          <div class="bar-stat-top">
            <span class="bar-stat-name">${t.tag} <span class="text-muted">· ${t.count} сделок</span></span>
            <span class="mono ${pnlClass(t.total_r)}">${fmtR(t.total_r)}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill ${isPositive ? 'positive' : 'negative'}" style="width: ${widthPct}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Не удалось загрузить аналитику', e);
  }
}

// ---------- Подключение биржи (BingX) ----------

document.getElementById('exchange-back-btn').addEventListener('click', () => showScreen('settings'));
document.getElementById('settings-exchange-row').addEventListener('click', () => {
  showScreen('exchange');
  loadExchangeStatus();
});

async function loadExchangeStatus() {
  const statusText = document.getElementById('exchange-status-text');
  statusText.textContent = 'Проверка...';
  statusText.className = 'exchange-sub';

  try {
    const data = await apiGet('/exchange/bingx/status');
    const formWrap = document.getElementById('exchange-form-wrap');
    const connWrap = document.getElementById('exchange-connected-wrap');
    const syncWrap = document.getElementById('exchange-sync-wrap');

    if (data.connected) {
      statusText.textContent = 'Подключено ✓';
      statusText.className = 'exchange-sub connected';
      formWrap.classList.add('hidden');
      connWrap.classList.remove('hidden');
      syncWrap.classList.remove('hidden');
      if (data.last_sync) {
        document.getElementById('exchange-last-sync-text').textContent = `Последняя синхронизация: ${data.last_sync}`;
      }
    } else {
      statusText.textContent = 'Не подключено';
      statusText.className = 'exchange-sub disconnected';
      formWrap.classList.remove('hidden');
      connWrap.classList.add('hidden');
      syncWrap.classList.add('hidden');
    }
  } catch (e) {
    statusText.textContent = 'Ошибка загрузки';
  }
}

document.getElementById('exchange-connect-btn').addEventListener('click', async () => {
  const apiKey = document.getElementById('exchange-api-key').value.trim();
  const secretKey = document.getElementById('exchange-secret-key').value.trim();

  if (!apiKey || !secretKey) {
    alert('Введи оба ключа');
    return;
  }

  const btn = document.getElementById('exchange-connect-btn');
  btn.textContent = 'Подключаем...';
  btn.disabled = true;

  try {
    const data = await apiPost('/exchange/bingx/connect', { api_key: apiKey, secret_key: secretKey });
    tg?.HapticFeedback?.notificationOccurred('success');
    document.getElementById('exchange-balance-card').textContent = `Баланс: ${data.balance} ${data.currency}`;
    document.getElementById('exchange-api-key').value = '';
    document.getElementById('exchange-secret-key').value = '';
    await loadExchangeStatus();
  } catch (e) {
    alert(`Ошибка: ${e.message}`);
  } finally {
    btn.textContent = 'Подключить';
    btn.disabled = false;
  }
});

document.getElementById('exchange-sync-btn').addEventListener('click', async () => {
  const btn = document.getElementById('exchange-sync-btn');
  btn.textContent = '⏳ Синхронизация...';
  btn.disabled = true;

  try {
    const riskUsd = getRiskUsd() || null;
    const data = await apiPost('/exchange/bingx/sync', { risk_usd: riskUsd });
    tg?.HapticFeedback?.notificationOccurred('success');
    await loadExchangeStatus();
    await loadDashboard();
    alert(`Готово!\nДобавлено: ${data.added}\nПропущено (дубли/нули): ${data.skipped}\nВсего позиций: ${data.total_fetched}\n${data.debug || ''}`);
  } catch (e) {
    alert(`Ошибка синхронизации: ${e.message}`);
  } finally {
    btn.textContent = '↻ Синхронизировать';
    btn.disabled = false;
  }
});

document.getElementById('exchange-disconnect-btn').addEventListener('click', async () => {
  const confirmed = await showConfirmModal({
    title: 'Отключить BingX?',
    text: 'API ключи будут удалены. Уже импортированные сделки останутся.',
    confirmLabel: 'Отключить',
  });
  if (!confirmed) return;

  try {
    await apiDelete('/exchange/bingx/disconnect');
    await loadExchangeStatus();
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) {
    alert('Ошибка отключения');
  }
});

// ---------- Настройки ----------

function loadSettings() {
  const user = tg?.initDataUnsafe?.user;
  if (user) {
    document.getElementById('settings-name').textContent = user.first_name || 'Пользователь';
    document.getElementById('settings-handle').textContent = user.username ? `@${user.username}` : '';
    document.getElementById('settings-avatar').textContent = (user.first_name || '?')[0].toUpperCase();
  }

  // Загружаем сохранённые значения риска и депозита
  const deposit = localStorage.getItem('pnl_deposit') || '';
  const riskUsd = localStorage.getItem('pnl_risk_usd') || '';
  const riskPct = localStorage.getItem('pnl_risk_pct') || '';
  document.getElementById('settings-deposit').value = deposit;
  document.getElementById('settings-risk-usd').value = riskUsd;
  document.getElementById('settings-risk-pct').value = riskPct;

  document.getElementById('settings-deposit').oninput = (e) => {
    localStorage.setItem('pnl_deposit', e.target.value);
    renderJournalTable();
  };

  document.getElementById('settings-risk-usd').oninput = (e) => {
    localStorage.setItem('pnl_risk_usd', e.target.value);
    renderJournalTable();
  };
  document.getElementById('settings-risk-pct').oninput = (e) => {
    localStorage.setItem('pnl_risk_pct', e.target.value);
    renderJournalTable();
  };

  document.querySelectorAll('.pnl-mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === pnlMode);
  });

  loadShareStatus();
}

// ---------- Шаринг журнала ----------

const SHARE_BASE = 'https://tracker-pnl-production.up.railway.app/s/';

function applyShareUI(token) {
  const linkRow = document.getElementById('share-link-row');
  const generateBtn = document.getElementById('share-generate-btn');
  const revokeBtn = document.getElementById('share-revoke-btn');
  const input = document.getElementById('share-link-input');

  if (token) {
    input.value = SHARE_BASE + token;    linkRow.classList.remove('hidden');
    generateBtn.textContent = '🔗 Обновить ссылку';
    revokeBtn.classList.remove('hidden');
  } else {
    linkRow.classList.add('hidden');
    generateBtn.textContent = '🔗 Создать ссылку';
    revokeBtn.classList.add('hidden');
  }
}

async function loadShareStatus() {
  try {
    const data = await apiGet('/share/status');
    applyShareUI(data.is_active ? data.token : null);
  } catch (e) {
    console.error('Не удалось загрузить статус шаринга', e);
  }
}

document.getElementById('share-generate-btn').addEventListener('click', async () => {
  try {
    const data = await apiPost('/share/generate', {});
    applyShareUI(data.token);
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) {
    alert('Не удалось создать ссылку');
  }
});

document.getElementById('share-revoke-btn').addEventListener('click', async () => {
  const confirmed = await showConfirmModal({
    title: 'Отозвать ссылку?',
    text: 'Текущая ссылка перестанет работать. Потом можно создать новую.',
    confirmLabel: 'Отозвать',
  });
  if (!confirmed) return;
  try {
    await apiDelete('/share');
    applyShareUI(null);
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) {
    alert('Не удалось отозвать ссылку');
  }
});

document.getElementById('share-copy-btn').addEventListener('click', () => {
  const val = document.getElementById('share-link-input').value;
  navigator.clipboard?.writeText(val).then(() => {
    const btn = document.getElementById('share-copy-btn');
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = '⎘'; }, 1500);
  });
});

document.getElementById('settings-delete-row').addEventListener('click', async () => {
  const confirmed = await showConfirmModal({
    title: 'Удалить все данные?',
    text: 'Будут удалены ВСЕ сделки. Это действие нельзя отменить.',
    confirmLabel: 'Удалить всё',
  });
  if (!confirmed) return;

  try {
    await apiDelete('/account/data');
    tg?.HapticFeedback?.notificationOccurred('success');
    showScreen('dashboard');
  } catch (e) {
    console.error('Не удалось удалить данные', e);
    alert('Не удалось удалить данные. Проверь соединение с бэкендом.');
  }
});

// ---------- Запуск — сплэш-экран ----------

(function initSplash() {
  // Показываем сплэш, через 1.2с переходим на дашборд
  const splash = document.getElementById('screen-onboarding');

  // Рисуем логотип P&L TRACKER прямо в HTML онбординга
  splash.innerHTML = `
    <div style="
      display: flex; align-items: center; justify-content: center;
      height: 100vh; background: #fff;
    ">
      <div style="text-align: left; line-height: 1;">
        <div style="
          font-family: 'Inter', sans-serif;
          font-size: 96px;
          font-weight: 800;
          color: #000;
          letter-spacing: -0.04em;
          line-height: 0.9;
        ">P&amp;L</div>
        <div style="
          font-family: 'Inter', sans-serif;
          font-size: 18px;
          font-weight: 700;
          color: #000;
          letter-spacing: 0.18em;
          text-align: right;
          margin-top: 4px;
        ">TRACKER</div>
      </div>
    </div>
  `;

  setTimeout(() => {
    showScreen('dashboard');
  }, 1200);
})();
