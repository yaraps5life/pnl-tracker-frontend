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

    console.log('r_curve:', stats.r_curve);
    drawEquityCurve(document.getElementById('dash-equity-chart'), stats.r_curve);

    // Последние сделки показываем только на вкладке "Всё"
    const showRecent = dashView === 'all' && stats.total_trades > 0;
    document.getElementById('dash-recent-section').classList.toggle('hidden', !showRecent);
    document.getElementById('dash-empty-state').classList.toggle('hidden', stats.total_trades > 0);

    if (showRecent && recent_trades?.length) {
      document.getElementById('dash-recent-list').innerHTML = recent_trades.map(renderTradeRow).join('');
      attachTradeRowHandlers('dash-recent-list');
      fixCoinIcons('dash-recent-list');
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
// Кнопка Аналитика
document.getElementById('dash-go-analytics-btn')?.addEventListener('click', () => showScreen('analytics'));
// Кнопка История
document.getElementById('dash-go-journal-btn')?.addEventListener('click', () => showScreen('journal'));

// Глаз — скрыть/показать баланс
let dashHidden = false;
document.getElementById('dash-hide-btn')?.addEventListener('click', () => {
  dashHidden = !dashHidden;
  const pnlEl = document.getElementById('dash-pnl');
  const icon = document.getElementById('dash-eye-icon');
  if (dashHidden) {
    pnlEl.dataset.realValue = pnlEl.textContent;
    pnlEl.textContent = '••••••';
    icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  } else {
    if (pnlEl.dataset.realValue) pnlEl.textContent = pnlEl.dataset.realValue;
    icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  }
});

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

function coinIconUrl(symbol) {
  // Извлекаем тикер: BTCUSDT -> btc, ETHUSDT -> eth, NCCOGOLD2USD -> xau
  let ticker = symbol.toLowerCase()
    .replace('usdt', '').replace('usd', '').replace('-swap', '')
    .replace('2', '').replace(/[^a-z]/g, '');
  // Маппинг нестандартных тикеров BingX
  const map = { 'nccogold': 'xau', 'ncfxeur': 'eur', 'gold': 'xau', 'xauusd': 'xau' };
  ticker = map[ticker] || ticker;
  return `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${ticker}.png`;
}

function renderTradeRow(t) {
  const isLong = t.direction === 'long';
  const date = (t.trade_date || t.created_at || '—').split('T')[0].split(' ')[0];
  const entry = t.entry_price ? ` · ${t.entry_price}` : '';
  const pnlText = fmtPnlForTrade(t.result_r, t.pnl_usd, t.pnl_pct);
  return `
    <div class="trade-row" data-trade-id="${t.id}">
      <div class="trade-left">
        <div class="trade-icon ${isLong ? 'long' : 'short'}"
             style="background-image:url('${coinIconUrl(t.symbol)}');background-size:22px;background-repeat:no-repeat;background-position:center;"
             data-fallback="${isLong ? '↗' : '↘'}">
        </div>
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

function fixCoinIcons(containerId) {
  document.getElementById(containerId).querySelectorAll('.trade-icon[data-fallback]').forEach(el => {
    const url = el.style.backgroundImage.replace(/url\(['"]?(.*?)['"]?\)/, '$1');
    if (!url) { el.textContent = el.dataset.fallback; el.style.backgroundImage = ''; return; }
    const img = new Image();
    img.onload = () => {}; // OK
    img.onerror = () => {
      el.textContent = el.dataset.fallback;
      el.style.backgroundImage = '';
    };
    img.src = url;
  });
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
      // Парсим дату в timestamp для корректного числового сравнения
      va = new Date(a.trade_date || a.created_at || 0).getTime();
      vb = new Date(b.trade_date || b.created_at || 0).getTime();
    } else if (journalSortColumn === 'result') {
      const rank = { win: 2, breakeven: 1, loss: 0 };
      va = rank[a.outcome] ?? -1;
      vb = rank[b.outcome] ?? -1;
    } else if (journalSortColumn === 'result_r') {
      // Для R используем pnl_usd как запасной вариант
      va = a.result_r ?? a.pnl_usd ?? 0;
      vb = b.result_r ?? b.pnl_usd ?? 0;
    } else {
      va = a[journalSortColumn] ?? '';
      vb = b[journalSortColumn] ?? '';
    }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return journalSortDir === 'asc' ? -1 : 1;
    if (va > vb) return journalSortDir === 'asc' ? 1 : -1;
    // Вторичный ключ: при равных значениях всегда сортируем по id desc (новые сверху)
    return b.id - a.id;
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

    // Загружаем сохранённые вложения
    clearAttachments('detail');
    try {
      const attachments = await apiGet(`/trades/${tradeId}/attachments`);
      const container = document.getElementById('detail-attachments');
      attachments.forEach(att => {
        noteAttachments['detail'].push({ dataUrl: att.data, name: att.filename, id: att.id });
      });
      renderAttachmentsFromServer(container, 'detail', tradeId);
    } catch (e) { /* игнорируем */ }

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
  clearAttachments('add');

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
      const newTrade = await apiPost('/trades', { ...payload, source: 'manual' });
      // Сохраняем вложения если есть
      if (noteAttachments['add'].length > 0 && newTrade?.trade?.id) {
        await Promise.all(noteAttachments['add'].map(att =>
          apiPost(`/trades/${newTrade.trade.id}/attachments`, {
            filename: att.name,
            mime_type: att.mime || 'image/jpeg',
            data: att.dataUrl,
          }).catch(() => {})
        ));
      }
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

document.getElementById('exchange-connect-btn')?.addEventListener('click', async () => {
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

document.getElementById('exchange-sync-btn')?.addEventListener('click', async () => {
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

document.getElementById('exchange-disconnect-btn')?.addEventListener('click', async () => {
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

document.getElementById('share-generate-btn')?.addEventListener('click', async () => {
  try {
    const data = await apiPost('/share/generate', {});
    applyShareUI(data.token);
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) {
    alert('Не удалось создать ссылку');
  }
});

document.getElementById('share-revoke-btn')?.addEventListener('click', async () => {
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

document.getElementById('share-copy-btn')?.addEventListener('click', () => {
  const val = document.getElementById('share-link-input').value;
  navigator.clipboard?.writeText(val).then(() => {
    const btn = document.getElementById('share-copy-btn');
    btn.textContent = '✓';
    setTimeout(() => { btn.textContent = '⎘'; }, 1500);
  });
});

document.getElementById('settings-delete-row')?.addEventListener('click', async () => {
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

// ---------- Голосовой ввод + вложения заметки ----------

// Хранилище вложений: { 'add' | 'detail' } -> [{ dataUrl, name }]
const noteAttachments = { add: [], detail: [] };

const MIC_SVG = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3M8 22h8"/></svg>`;
const STOP_SVG = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;

function setupMicButton(btnId, textareaId) {
  const btn = document.getElementById(btnId);
  const textarea = document.getElementById(textareaId);
  if (!btn || !textarea) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    btn.style.opacity = '0.3';
    btn.disabled = true;
    btn.title = 'Голосовой ввод не поддерживается';
    return;
  }

  let recognition = null;
  let isRecording = false;

  function startRecording() {
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = false;      // одна фраза за раз — стабильнее в Telegram WebView
    recognition.interimResults = false;  // только финальный текст, без промежуточных

    recognition.onstart = () => {
      isRecording = true;
      btn.classList.add('recording');
      btn.innerHTML = STOP_SVG;
      tg?.HapticFeedback?.impactOccurred('light');
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join(' ')
        .trim();
      if (transcript) {
        const cur = textarea.value;
        textarea.value = cur ? cur + ' ' + transcript : transcript;
        textarea.dispatchEvent(new Event('input'));
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        alert('Нет доступа к микрофону. Разреши доступ в настройках.');
      }
      // no-speech — просто ничего не сказали, не показываем ошибку
      stopRecording();
    };

    recognition.onend = () => {
      // continuous=false: запись завершилась сама после паузы — просто останавливаем
      stopRecording();
    };

    try {
      recognition.start();
    } catch(e) {
      stopRecording();
    }
  }

  function stopRecording() {
    isRecording = false;
    btn.classList.remove('recording');
    btn.innerHTML = MIC_SVG;
    tg?.HapticFeedback?.impactOccurred('light');
    if (recognition) {
      try { recognition.stop(); } catch(e) {}
      recognition = null;
    }
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });
}

function setupAttachButton(btnId, inputId, containerId, scope) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  const container = document.getElementById(containerId);
  if (!btn || !input || !container) return;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    input.click();
  });

  input.addEventListener('change', () => {
    const files = Array.from(input.files);
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        const att = { dataUrl, name: file.name, mime: file.type };

        // Если detail scope и есть открытая сделка — сразу сохраняем на сервер
        if (scope === 'detail' && currentTradeId) {
          try {
            const resp = await apiPost(`/trades/${currentTradeId}/attachments`, {
              filename: file.name,
              mime_type: file.type,
              data: dataUrl,
            });
            att.id = resp.id;
          } catch (e) {
            console.error('Не удалось сохранить вложение', e);
          }
        }

        noteAttachments[scope].push(att);
        renderAttachments(container, scope, scope === 'detail' ? currentTradeId : null);
        // Показываем секцию скриншотов при первом добавлении
        if (scope === 'detail') {
          const section = document.getElementById('detail-screenshots-section');
          if (section) section.style.display = '';
        }
        tg?.HapticFeedback?.impactOccurred('light');
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  });
}

function renderAttachments(container, scope, tradeId = null) {
  container.innerHTML = '';
  noteAttachments[scope].forEach((att, idx) => {
    const item = document.createElement('div');
    item.className = 'note-attachment-item';

    const img = document.createElement('img');
    img.src = att.dataUrl;
    img.alt = att.name;
    img.addEventListener('click', () => openLightbox(att.dataUrl));

    const removeBtn = document.createElement('button');
    removeBtn.className = 'note-attachment-remove';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (att.id && tradeId) {
        try { await apiDelete(`/trades/${tradeId}/attachments/${att.id}`); }
        catch (e) { console.error(e); }
      }
      noteAttachments[scope].splice(idx, 1);
      renderAttachments(container, scope, tradeId);
    });

    item.appendChild(img);
    item.appendChild(removeBtn);
    container.appendChild(item);
  });

  // Показываем/прячем секцию скриншотов в detail
  if (scope === 'detail') {
    const section = document.getElementById('detail-screenshots-section');
    if (section) {
      section.style.display = noteAttachments[scope].length > 0 ? '' : 'none';
    }
  }
}

// Рендер вложений загруженных с сервера (уже имеют id)
function renderAttachmentsFromServer(container, scope, tradeId) {
  renderAttachments(container, scope, tradeId);
}

function openLightbox(src) {
  const lb = document.getElementById('attachment-lightbox');
  const img = document.getElementById('attachment-lightbox-img');
  img.src = src;
  lb.classList.add('open');
}

document.getElementById('attachment-lightbox')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.remove('open');
  }
});
document.getElementById('attachment-lightbox-close')?.addEventListener('click', () => {
  document.getElementById('attachment-lightbox').classList.remove('open');
});

// Сброс вложений при открытии форм
function clearAttachments(scope) {
  noteAttachments[scope] = [];
  const containerId = scope === 'add' ? 'add-attachments' : 'detail-attachments';
  const container = document.getElementById(containerId);
  if (container) container.innerHTML = '';
}

setupMicButton('detail-mic-btn', 'detail-note');
setupMicButton('add-mic-btn', 'add-note');
setupAttachButton('detail-attach-btn', 'detail-attach-input', 'detail-attachments', 'detail');
setupAttachButton('add-attach-btn', 'add-attach-input', 'add-attachments', 'add');

// Кнопка "+ Добавить скриншот" в секции скриншотов тоже открывает file input
document.getElementById('detail-screenshots-add-btn')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('detail-attach-input')?.click();
});

// ============ Свайп карточек дашборда ============

(function initCardSwiper() {
  const slider = document.getElementById('dash-cards-slider');
  const dots = document.querySelectorAll('.dash-dot');
  if (!slider) return;

  const SLIDES = 2;
  const GAP = 0;
  let current = 0;
  let startX = 0;
  let isDragging = false;
  let dragOffset = 0;

  const GAP_PX = 12;

  function slideWidth() {
    return window.innerWidth + GAP_PX;
  }

  function goTo(idx, animate = true) {
    current = Math.max(0, Math.min(SLIDES - 1, idx));
    if (!animate) slider.style.transition = 'none';
    slider.style.transform = `translateX(-${current * slideWidth()}px)`;
    if (!animate) requestAnimationFrame(() => { slider.style.transition = ''; });
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
    if (current === 1) loadPortfolio();
    if (current === 0) {
      setTimeout(() => {
        const canvas = document.getElementById('dash-equity-chart');
        if (canvas && window._dashRCurve) drawEquityCurve(canvas, window._dashRCurve);
      }, 380);
    }
  }

  // Выравниваем высоту второй карточки по первой
  function equalizeHeight() {
    const slides = slider.querySelectorAll('.dash-card-slide .pnl-card');
    if (slides.length < 2) return;
    slides.forEach(s => s.style.minHeight = '');
    const h = slides[0].offsetHeight;
    if (h > 0) slides[1].style.minHeight = h + 'px';
  }
  setTimeout(equalizeHeight, 400);
  window.addEventListener('resize', equalizeHeight);

  dots.forEach((d) => d.addEventListener('click', () => goTo(+d.dataset.idx)));

  const wrap = slider.parentElement;

  wrap.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isDragging = true;
    dragOffset = 0;
    slider.style.transition = 'none';
  }, { passive: true });

  wrap.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    dragOffset = e.touches[0].clientX - startX;
    const base = current * slideWidth();
    slider.style.transform = `translateX(${-base + dragOffset}px)`;
  }, { passive: true });

  wrap.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    slider.style.transition = '';
    const threshold = slideWidth() * 0.2;
    if (dragOffset < -threshold) goTo(current + 1);
    else if (dragOffset > threshold) goTo(current - 1);
    else goTo(current);
    dragOffset = 0;
  });
})();

// ============ Спотовый портфель ============

let editingAssetId = null;

async function loadPortfolio() {
  try {
    const data = await apiGet('/portfolio');
    const list = document.getElementById('dash-portfolio-list');
    const totalRow = document.getElementById('dash-portfolio-total');

    if (!data.assets.length) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">Нет активов. Нажми «+ монета» чтобы добавить.</div>';
      totalRow.style.display = 'none';
      return;
    }

    // Итого
    totalRow.style.display = 'flex';
    document.getElementById('dash-portfolio-value').textContent = '$' + data.total_value.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const pnlEl = document.getElementById('dash-portfolio-pnl');
    const sign = data.total_pnl >= 0 ? '+' : '';
    pnlEl.textContent = `${sign}$${data.total_pnl.toFixed(2)} (${sign}${data.total_pnl_pct.toFixed(2)}%)`;
    pnlEl.className = 'portfolio-total-pnl ' + (data.total_pnl >= 0 ? 'positive' : 'negative');

    // Список
    list.innerHTML = data.assets.map(a => {
      const sign = a.pnl >= 0 ? '+' : '';
      const pnlClass = a.pnl >= 0 ? 'positive' : 'negative';
      const iconUrl = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${a.symbol.toLowerCase()}.png`;
      return `
        <div class="portfolio-row" data-asset-id="${a.id}">
          <div class="portfolio-row-left">
            <div class="trade-icon" style="background-image:url('${iconUrl}');background-size:22px;background-repeat:no-repeat;background-position:center;" data-fallback="${a.symbol.slice(0,2)}"></div>
            <div>
              <div class="portfolio-symbol">${a.symbol}</div>
              <div class="portfolio-meta">${a.amount} · avg $${a.avg_price.toLocaleString('en', {maximumFractionDigits: 4})}</div>
            </div>
          </div>
          <div class="portfolio-row-right">
            <div class="portfolio-value">$${a.value.toLocaleString('en', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <div class="portfolio-pnl ${pnlClass}">${sign}${a.pnl_pct.toFixed(2)}%</div>
          </div>
          <button class="portfolio-delete-btn" data-asset-id="${a.id}" title="Удалить">✕</button>
        </div>`;
    }).join('');

    // Фикс иконок
    list.querySelectorAll('.trade-icon[data-fallback]').forEach(el => {
      const url = el.style.backgroundImage.replace(/url\(['"]?(.*?)['"]?\)/, '$1');
      const img = new Image();
      img.onerror = () => { el.textContent = el.dataset.fallback; el.style.backgroundImage = ''; };
      img.src = url;
    });

    // Удаление
    list.querySelectorAll('.portfolio-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.assetId;
        await apiDelete(`/portfolio/${id}`);
        loadPortfolio();
      });
    });

  } catch (e) {
    console.error('Не удалось загрузить портфель', e);
  }
}

// Открыть модалку
document.getElementById('dash-portfolio-add-btn')?.addEventListener('click', () => { openAssetPicker(); });

document.getElementById('portfolio-modal-close')?.addEventListener('click', () => {
  document.getElementById('portfolio-modal-overlay').classList.add('hidden');
});

document.getElementById('portfolio-modal-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

document.getElementById('portfolio-modal-submit')?.addEventListener('click', async () => {
  const symbol = document.getElementById('portfolio-symbol-input').value.trim().toUpperCase();
  const amount = parseFloat(document.getElementById('portfolio-amount-input').value);
  const price = parseFloat(document.getElementById('portfolio-price-input').value);

  if (!symbol || !amount || !price) { alert('Заполни все поля'); return; }

  try {
    await apiPost('/portfolio', { symbol, amount, avg_price: price });
    document.getElementById('portfolio-modal-overlay').classList.add('hidden');
    loadPortfolio();
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) {
    alert('Не удалось добавить монету');
  }
});

// Загружаем портфель вместе с дашбордом
const _origLoadDashboard = loadDashboard;
loadDashboard = async function(params = '') {
  await _origLoadDashboard(params);
  loadPortfolio();
  // Загружаем кастомные портфели только один раз
  if (!window._portfoliosLoaded) {
    window._portfoliosLoaded = true;
    loadUserPortfolios();
  }
};

// ============ Шторка Все Портфолио ============

function openPortfoliosSheet() {
  document.getElementById('portfolios-sheet-overlay').classList.remove('hidden');
  // Подгружаем данные портфеля в шторку
  apiGet('/portfolio').then(data => {
    const val = document.getElementById('ps-spot-value');
    const pnl = document.getElementById('ps-spot-pnl');
    if (val) val.textContent = data.total_value ? '$' + data.total_value.toLocaleString('en', {minimumFractionDigits:2, maximumFractionDigits:2}) : '—';
    if (pnl) {
      const sign = data.total_pnl >= 0 ? '+' : '';
      pnl.textContent = data.total_value ? `${sign}${data.total_pnl_pct?.toFixed(2)}%` : '—';
      pnl.className = 'ps-pnl ' + (data.total_pnl >= 0 ? 'positive' : 'negative');
    }
    const sub = document.getElementById('ps-spot-sub');
    if (sub && data.assets?.length) sub.textContent = data.assets.length + ' ' + (data.assets.length === 1 ? 'актив' : 'актива');
  }).catch(() => {});
}

function closePortfoliosSheet() {
  document.getElementById('portfolios-sheet-overlay').classList.add('hidden');
}

document.getElementById('dash-portfolio-title-btn')?.addEventListener('click', openPortfoliosSheet);
document.getElementById('portfolios-sheet-close')?.addEventListener('click', closePortfoliosSheet);
document.getElementById('portfolios-sheet-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closePortfoliosSheet();
});

function switchToSlide(idx) {
  const slider = document.getElementById('dash-cards-slider');
  if (!slider) return;
  const sw = window.innerWidth + 12;
  slider.style.transition = 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)';
  slider.style.transform = `translateX(-${idx * sw}px)`;
  document.querySelectorAll('.dash-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
  if (idx === 1) loadPortfolio();
  if (idx === 0) setTimeout(() => {
    const canvas = document.getElementById('dash-equity-chart');
    if (canvas && window._dashRCurve) drawEquityCurve(canvas, window._dashRCurve);
  }, 380);
}

document.getElementById('ps-trading')?.addEventListener('click', () => {
  closePortfoliosSheet();
  switchToSlide(0);
  document.getElementById('ps-trading-check')?.classList.remove('hidden');
  document.getElementById('ps-spot-check')?.classList.add('hidden');
});

document.getElementById('ps-spot')?.addEventListener('click', () => {
  closePortfoliosSheet();
  switchToSlide(1);
  document.getElementById('ps-spot-check')?.classList.remove('hidden');
  document.getElementById('ps-trading-check')?.classList.add('hidden');
});

// ============ Создание нового портфеля ============

let selectedPortfolioColor = '#00BCD4';

// Открыть шторку нового портфеля
document.getElementById('ps-add-portfolio-btn')?.addEventListener('click', () => {
  closePortfoliosSheet();
  setTimeout(() => {
    document.getElementById('new-portfolio-overlay').classList.remove('hidden');
    document.getElementById('new-portfolio-name').value = '';
    document.getElementById('np-include').checked = true;
    selectedPortfolioColor = '#00BCD4';
    document.querySelectorAll('.np-color').forEach(b => b.classList.toggle('active', b.dataset.color === selectedPortfolioColor));
    document.querySelector('.np-submit-btn').classList.remove('ready');
    setTimeout(() => document.getElementById('new-portfolio-name').focus(), 100);
  }, 200);
});

document.getElementById('new-portfolio-close')?.addEventListener('click', () => {
  document.getElementById('new-portfolio-overlay').classList.add('hidden');
});

document.getElementById('new-portfolio-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

// Выбор цвета
document.querySelectorAll('.np-color').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedPortfolioColor = btn.dataset.color;
    document.querySelectorAll('.np-color').forEach(b => b.classList.toggle('active', b === btn));
    // Активируем кнопку если имя заполнено
    checkNpReady();
  });
});

// Активация кнопки при вводе имени
document.getElementById('new-portfolio-name')?.addEventListener('input', checkNpReady);

function checkNpReady() {
  const name = document.getElementById('new-portfolio-name').value.trim();
  document.getElementById('new-portfolio-submit').classList.toggle('ready', name.length > 0);
}

// Создать портфель
document.getElementById('new-portfolio-submit')?.addEventListener('click', async () => {
  const name = document.getElementById('new-portfolio-name').value.trim();
  if (!name) return;
  const include = document.getElementById('np-include').checked;

  try {
    const p = await apiPost('/portfolios', {
      name, color: selectedPortfolioColor, include_in_summary: include, type: 'custom'
    });
    document.getElementById('new-portfolio-overlay').classList.add('hidden');
    tg?.HapticFeedback?.notificationOccurred('success');
    // Добавляем новый слайд в свайпер
    addPortfolioSlide(p);
  } catch(e) {
    alert('Не удалось создать портфель');
  }
});

// Добавить слайд в свайпер
function addPortfolioSlide(portfolio) {
  const slider = document.getElementById('dash-cards-slider');
  const dotsWrap = document.querySelector('.dash-dots');
  if (!slider || !dotsWrap) return;

  const slide = document.createElement('div');
  slide.className = 'dash-card-slide';
  slide.dataset.portfolioId = portfolio.id;
  slide.innerHTML = `
    <div class="pnl-card">
      <div class="pnl-card-top">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:28px;height:28px;border-radius:50%;background:${portfolio.color};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;">
            ${portfolio.name.slice(0,1).toUpperCase()}
          </div>
          <div class="pnl-card-label">${portfolio.name}</div>
        </div>
        <button class="note-icon-btn" onclick="deletePortfolioSlide(${portfolio.id}, this)" title="Удалить">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
      <div class="pnl-row">
        <span class="pnl-value mono">—</span>
      </div>
      <div style="color:var(--text-muted);font-size:13px;padding:20px 0;text-align:center;">
        Пока нет данных
      </div>
    </div>
  `;
  slider.appendChild(slide);

  // Добавляем точку
  const dot = document.createElement('span');
  dot.className = 'dash-dot';
  const idx = slider.children.length - 1;
  dot.dataset.idx = idx;
  dot.addEventListener('click', () => switchToSlide(idx));
  dotsWrap.appendChild(dot);

  // Переходим на новый слайд
  setTimeout(() => switchToSlide(idx), 100);

  // Обновляем шторку
  addPortfolioToSheet(portfolio);
}

function addPortfolioToSheet(portfolio) {
  const list = document.querySelector('.ps-list');
  if (!list) return;
  const initials = portfolio.name.slice(0,1).toUpperCase();
  const item = document.createElement('div');
  item.className = 'ps-item';
  item.dataset.portfolioId = portfolio.id;
  const idx = document.querySelectorAll('.dash-card-slide').length - 1;
  item.innerHTML = `
    <div class="ps-avatar" style="background:${portfolio.color};">
      <span style="color:#fff;font-size:18px;font-weight:700;">${initials}</span>
    </div>
    <div class="ps-info">
      <div class="ps-name">${portfolio.name}</div>
      <div class="ps-sub">Кастомный портфель</div>
    </div>
    <div class="ps-right"><div class="ps-value">—</div></div>
    <svg class="ps-check hidden" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5B8DEF" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
  `;
  item.addEventListener('click', () => {
    closePortfoliosSheet();
    switchToSlide(idx);
  });
  // Вставляем перед кнопкой добавления
  const addBtn = document.getElementById('ps-add-portfolio-btn');
  list.insertBefore(item, addBtn?.parentElement || null);
}

async function deletePortfolioSlide(portfolioId, btn) {
  if (!confirm('Удалить портфель?')) return;
  try {
    await apiDelete(`/portfolios/${portfolioId}`);
    const slide = btn.closest('.dash-card-slide');
    if (slide) slide.remove();
    // Пересчитываем индексы точек
    const slider = document.getElementById('dash-cards-slider');
    const dotsWrap = document.querySelector('.dash-dots');
    dotsWrap.innerHTML = '';
    Array.from(slider.children).forEach((s, i) => {
      const dot = document.createElement('span');
      dot.className = 'dash-dot' + (i === 0 ? ' active' : '');
      dot.dataset.idx = i;
      dot.addEventListener('click', () => switchToSlide(i));
      dotsWrap.appendChild(dot);
    });
    switchToSlide(0);
  } catch(e) { alert('Не удалось удалить'); }
}

// Загружаем портфели при старте и добавляем слайды
async function loadUserPortfolios() {
  try {
    const portfolios = await apiGet('/portfolios');
    portfolios.forEach(p => addPortfolioSlide(p));
  } catch(e) { /* игнорируем */ }
}

// Вызываем при загрузке дашборда
const __origLoad = loadDashboard;
loadDashboard = async function(params = '') {
  await __origLoad(params);
};

// ============ Экран выбора актива ============

const STATIC_COINS = [
  {symbol:"BTC",name:"Bitcoin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btc.png"},
  {symbol:"ETH",name:"Ethereum",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/eth.png"},
  {symbol:"USDT",name:"Tether",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdt.png"},
  {symbol:"BNB",name:"BNB",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bnb.png"},
  {symbol:"SOL",name:"Solana",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/sol.png"},
  {symbol:"XRP",name:"XRP",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xrp.png"},
  {symbol:"USDC",name:"USD Coin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdc.png"},
  {symbol:"STETH",name:"Lido Staked ETH",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/steth.png"},
  {symbol:"ADA",name:"Cardano",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ada.png"},
  {symbol:"AVAX",name:"Avalanche",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/avax.png"},
  {symbol:"DOGE",name:"Dogecoin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/doge.png"},
  {symbol:"TRX",name:"TRON",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/trx.png"},
  {symbol:"TON",name:"Toncoin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ton.png"},
  {symbol:"LINK",name:"Chainlink",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/link.png"},
  {symbol:"SHIB",name:"Shiba Inu",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/shib.png"},
  {symbol:"DOT",name:"Polkadot",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/dot.png"},
  {symbol:"BCH",name:"Bitcoin Cash",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bch.png"},
  {symbol:"NEAR",name:"NEAR Protocol",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/near.png"},
  {symbol:"LTC",name:"Litecoin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ltc.png"},
  {symbol:"UNI",name:"Uniswap",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/uni.png"},
  {symbol:"APT",name:"Aptos",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/apt.png"},
  {symbol:"PEPE",name:"Pepe",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/pepe.png"},
  {symbol:"ICP",name:"Internet Computer",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/icp.png"},
  {symbol:"FET",name:"Fetch.ai",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/fet.png"},
  {symbol:"XLM",name:"Stellar",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xlm.png"},
  {symbol:"SUI",name:"Sui",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/sui.png"},
  {symbol:"ATOM",name:"Cosmos",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/atom.png"},
  {symbol:"OP",name:"Optimism",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/op.png"},
  {symbol:"ARB",name:"Arbitrum",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/arb.png"},
  {symbol:"RNDR",name:"Render",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/rndr.png"},
  {symbol:"VET",name:"VeChain",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/vet.png"},
  {symbol:"FIL",name:"Filecoin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/fil.png"},
  {symbol:"IMX",name:"Immutable",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/imx.png"},
  {symbol:"INJ",name:"Injective",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/inj.png"},
  {symbol:"HBAR",name:"Hedera",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/hbar.png"},
  {symbol:"ALGO",name:"Algorand",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/algo.png"},
  {symbol:"GRT",name:"The Graph",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/grt.png"},
  {symbol:"SAND",name:"The Sandbox",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/sand.png"},
  {symbol:"MANA",name:"Decentraland",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/mana.png"},
  {symbol:"AAVE",name:"Aave",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/aave.png"},
  {symbol:"MKR",name:"Maker",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/mkr.png"},
  {symbol:"EOS",name:"EOS",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/eos.png"},
  {symbol:"EGLD",name:"MultiversX",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/egld.png"},
  {symbol:"THETA",name:"Theta Network",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/theta.png"},
  {symbol:"XMR",name:"Monero",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xmr.png"},
  {symbol:"FLOW",name:"Flow",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/flow.png"},
  {symbol:"AXS",name:"Axie Infinity",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/axs.png"},
  {symbol:"SNX",name:"Synthetix",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/snx.png"},
  {symbol:"CHZ",name:"Chiliz",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/chz.png"},
  {symbol:"CAKE",name:"PancakeSwap",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/cake.png"},
  {symbol:"KLAY",name:"Klaytn",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/klay.png"},
  {symbol:"RUNE",name:"THORChain",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/rune.png"},
  {symbol:"ENJ",name:"Enjin Coin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/enj.png"},
  {symbol:"CRV",name:"Curve DAO",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/crv.png"},
  {symbol:"LDO",name:"Lido DAO",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ldo.png"},
  {symbol:"GMT",name:"STEPN",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/gmt.png"},
  {symbol:"APE",name:"ApeCoin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ape.png"},
  {symbol:"FTM",name:"Fantom",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ftm.png"},
  {symbol:"WLD",name:"Worldcoin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/wld.png"},
  {symbol:"STX",name:"Stacks",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/stx.png"},
  {symbol:"ROSE",name:"Oasis Network",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/rose.png"},
  {symbol:"CFX",name:"Conflux",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/cfx.png"},
  {symbol:"BLUR",name:"Blur",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/blur.png"},
  {symbol:"FLOKI",name:"Floki",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/floki.png"},
  {symbol:"GALA",name:"Gala",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/gala.png"},
  {symbol:"MINA",name:"Mina Protocol",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/mina.png"},
  {symbol:"ZEC",name:"Zcash",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/zec.png"},
  {symbol:"QNT",name:"Quant",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/qnt.png"},
  {symbol:"XTZ",name:"Tezos",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xtz.png"},
  {symbol:"1INCH",name:"1inch",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/1inch.png"},
  {symbol:"BAT",name:"Basic Attention",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bat.png"},
  {symbol:"COMP",name:"Compound",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/comp.png"},
  {symbol:"ZIL",name:"Zilliqa",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/zil.png"},
  {symbol:"ENS",name:"Ethereum Name Service",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ens.png"},
  {symbol:"DYDX",name:"dYdX",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/dydx.png"},
  {symbol:"KSM",name:"Kusama",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ksm.png"},
  {symbol:"WIF",name:"dogwifhat",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/wif.png"},
  {symbol:"BONK",name:"Bonk",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bonk.png"},
  {symbol:"JUP",name:"Jupiter",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/jup.png"},
  {symbol:"PYTH",name:"Pyth Network",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/pyth.png"},
  {symbol:"JTO",name:"Jito",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/jto.png"},
  {symbol:"TIA",name:"Celestia",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/tia.png"},
  {symbol:"SEI",name:"Sei",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/sei.png"},
  {symbol:"STRK",name:"Starknet",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/strk.png"},
  {symbol:"MANTA",name:"Manta Network",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/manta.png"},
  {symbol:"ALT",name:"AltLayer",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/alt.png"},
  {symbol:"PIXEL",name:"Pixels",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/pixel.png"},
  {symbol:"PORTAL",name:"Portal",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/portal.png"},
  {symbol:"DYM",name:"Dymension",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/dym.png"},
  {symbol:"ZETA",name:"ZetaChain",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/zeta.png"},
  {symbol:"ETHFI",name:"Ether.fi",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ethfi.png"},
  {symbol:"ENA",name:"Ethena",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ena.png"},
  {symbol:"W",name:"Wormhole",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/w.png"},
  {symbol:"BOME",name:"BOOK OF MEME",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bome.png"},
  {symbol:"NOT",name:"Notcoin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/not.png"},
  {symbol:"ZK",name:"ZKsync",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/zk.png"},
  {symbol:"IO",name:"IO.NET",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/io.png"},
  {symbol:"LISTA",name:"Lista DAO",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/lista.png"},
  {symbol:"ZRO",name:"LayerZero",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/zro.png"},
  {symbol:"DOGS",name:"DOGS",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/dogs.png"},
  {symbol:"HMSTR",name:"Hamster Kombat",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/hmstr.png"},
  {symbol:"CATI",name:"Catizen",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/cati.png"},
  {symbol:"EIGEN",name:"EigenLayer",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/eigen.png"},
  {symbol:"SCR",name:"Scroll",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/scr.png"},
  {symbol:"NEIRO",name:"Neiro",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/neiro.png"},
  {symbol:"GRASS",name:"Grass",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/grass.png"},
  {symbol:"LUNC",name:"Terra Classic",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/lunc.png"},
  {symbol:"ONDO",name:"Ondo",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ondo.png"},
  {symbol:"HYPE",name:"Hyperliquid",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/hype.png"},
  {symbol:"USUAL",name:"Usual",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usual.png"},
  {symbol:"PENGU",name:"Pudgy Penguins",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/pengu.png"},
  {symbol:"TRUMP",name:"OFFICIAL TRUMP",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/trump.png"},
  {symbol:"MELANIA",name:"Melania Meme",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/melania.png"},
  {symbol:"AI16Z",name:"ai16z",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ai16z.png"},
  {symbol:"VINE",name:"Vine",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/vine.png"},
  {symbol:"TST",name:"Test",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/tst.png"},
  {symbol:"FARTCOIN",name:"Fartcoin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/fartcoin.png"},
  {symbol:"PNUT",name:"Peanut the Squirrel",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/pnut.png"},
  {symbol:"ACT",name:"Act I : The AI Prophecy",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/act.png"},
  {symbol:"VIRTUAL",name:"Virtuals Protocol",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/virtual.png"},
  {symbol:"AIXBT",name:"aixbt by Virtuals",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/aixbt.png"},
  {symbol:"MOVE",name:"Movement",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/move.png"},
  {symbol:"ME",name:"Magic Eden",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/me.png"},
  {symbol:"UXLINK",name:"UXLINK",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/uxlink.png"},
  {symbol:"KAIA",name:"Kaia",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/kaia.png"},
  {symbol:"CORE",name:"Core",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/core.png"},
  {symbol:"BEAM",name:"Beam",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/beam.png"},
  {symbol:"BB",name:"BounceBit",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bb.png"},
  {symbol:"OMNI",name:"Omni Network",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/omni.png"},
  {symbol:"REZ",name:"Renzo",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/rez.png"},
  {symbol:"SAGA",name:"Saga",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/saga.png"},
  {symbol:"MOCA",name:"Moca Network",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/moca.png"},
  {symbol:"KMNO",name:"Kamino",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/kmno.png"},
  {symbol:"ZKSYNC",name:"zkSync",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/zksync.png"},
  {symbol:"TAO",name:"Bittensor",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/tao.png"},
  {symbol:"WEN",name:"Wen",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/wen.png"},
  {symbol:"SLERF",name:"Slerf",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/slerf.png"},
  {symbol:"BOME",name:"Book of Meme",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bome.png"},
  {symbol:"MEME",name:"Memecoin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/meme.png"},
  {symbol:"TURBO",name:"Turbo",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/turbo.png"},
  {symbol:"MOG",name:"Mog Coin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/mog.png"},
  {symbol:"SPX",name:"SPX6900",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/spx.png"},
  {symbol:"POPCAT",name:"Popcat",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/popcat.png"},
  {symbol:"MEW",name:"cat in a dogs world",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/mew.png"},
  {symbol:"PONKE",name:"Ponke",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ponke.png"},
  {symbol:"BABYDOGE",name:"Baby Doge Coin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/babydoge.png"},
  {symbol:"LADYS",name:"Milady Meme Coin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ladys.png"},
  {symbol:"WOJAK",name:"Wojak",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/wojak.png"},
  {symbol:"MYRO",name:"Myro",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/myro.png"},
  {symbol:"MATIC",name:"Polygon",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/matic.png"},
  {symbol:"CRO",name:"Cronos",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/cro.png"},
  {symbol:"OKB",name:"OKB",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/okb.png"},
  {symbol:"HT",name:"Huobi Token",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ht.png"},
  {symbol:"FTT",name:"FTX Token",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ftt.png"},
  {symbol:"LEO",name:"UNUS SED LEO",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/leo.png"},
  {symbol:"BGB",name:"Bitget Token",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bgb.png"},
  {symbol:"MX",name:"MX Token",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/mx.png"},
  {symbol:"GT",name:"GateToken",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/gt.png"},
  {symbol:"KCS",name:"KuCoin Token",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/kcs.png"},
  {symbol:"NEXO",name:"Nexo",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/nexo.png"},
  {symbol:"CELO",name:"Celo",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/celo.png"},
  {symbol:"IOTA",name:"IOTA",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/iota.png"},
  {symbol:"NEO",name:"Neo",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/neo.png"},
  {symbol:"DASH",name:"Dash",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/dash.png"},
  {symbol:"ETC",name:"Ethereum Classic",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/etc.png"},
  {symbol:"XEM",name:"NEM",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xem.png"},
  {symbol:"ZEN",name:"Horizen",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/zen.png"},
  {symbol:"DCR",name:"Decred",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/dcr.png"},
  {symbol:"DGB",name:"DigiByte",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/dgb.png"},
  {symbol:"LSK",name:"Lisk",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/lsk.png"},
  {symbol:"SC",name:"Siacoin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/sc.png"},
  {symbol:"WAVES",name:"Waves",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/waves.png"},
  {symbol:"ICX",name:"ICON",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/icx.png"},
  {symbol:"ONT",name:"Ontology",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ont.png"},
  {symbol:"RVN",name:"Ravencoin",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/rvn.png"},
  {symbol:"ANKR",name:"Ankr",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ankr.png"},
  {symbol:"CTSI",name:"Cartesi",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ctsi.png"},
  {symbol:"BAND",name:"Band Protocol",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/band.png"},
  {symbol:"OCEAN",name:"Ocean Protocol",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ocean.png"},
  {symbol:"RLC",name:"iExec RLC",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/rlc.png"},
  {symbol:"NMR",name:"Numeraire",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/nmr.png"},
  {symbol:"REP",name:"Augur",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/rep.png"},
  {symbol:"MLN",name:"Enzyme",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/mln.png"},
  {symbol:"ANT",name:"Aragon",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ant.png"},
  {symbol:"BAL",name:"Balancer",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bal.png"},
  {symbol:"PERP",name:"Perpetual Protocol",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/perp.png"},
  {symbol:"SUSHI",name:"SushiSwap",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/sushi.png"},
  {symbol:"YFI",name:"yearn.finance",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/yfi.png"},
  {symbol:"UMA",name:"UMA",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/uma.png"},
  {symbol:"KEEP",name:"Keep Network",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/keep.png"},
  {symbol:"REN",name:"Ren",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ren.png"},
  {symbol:"KNC",name:"Kyber Network Crystal",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/knc.png"},
  {symbol:"ZRX",name:"0x Protocol",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/zrx.png"},
  {symbol:"STORJ",name:"Storj",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/storj.png"},
  {symbol:"SKL",name:"SKALE",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/skl.png"},
  {symbol:"NKN",name:"NKN",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/nkn.png"},
  {symbol:"COTI",name:"COTI",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/coti.png"},
  {symbol:"DENT",name:"Dent",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/dent.png"},
  {symbol:"HOT",name:"Holo",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/hot.png"},
  {symbol:"WIN",name:"WINkLink",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/win.png"},
  {symbol:"BTT",name:"BitTorrent",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btt.png"},
  {symbol:"XVS",name:"Venus",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xvs.png"},
  {symbol:"BAKE",name:"BakeryToken",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bake.png"},
  {symbol:"ALPHA",name:"Alpha Venture DAO",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/alpha.png"},
  {symbol:"FOR",name:"ForTube",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/for.png"},
  {symbol:"BURGER",name:"BurgerCities",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/burger.png"},
  {symbol:"CREAM",name:"Cream Finance",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/cream.png"},
  {symbol:"AUTO",name:"Auto",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/auto.png"},
  {symbol:"HARD",name:"Kava Lend",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/hard.png"},
  {symbol:"SPARTA",name:"Spartan Protocol",icon:"https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/sparta.png"}
];

let _coinsLoaded = false;

function openAssetPicker() {
  document.getElementById('asset-picker-overlay').classList.remove('hidden');
  document.getElementById('asset-search-input').value = '';
  renderAssetList(STATIC_COINS);
}

function renderAssetList(coins) {
  const list = document.getElementById('asset-list');
  if (!coins.length) {
    list.innerHTML = '<div class="asset-loading">Ничего не найдено</div>';
    return;
  }
  const colorPalette = ['#5B8DEF','#F7931A','#00BCD4','#4CAF50','#AB47BC','#E53935','#FF7043','#26C6DA','#7C4DFF','#EC407A'];
  function coinColor(sym) { let h=0; for(let c of sym) h=(h*31+c.charCodeAt(0))&0xFFFFFF; return colorPalette[Math.abs(h)%colorPalette.length]; }

  list.innerHTML = coins.map(c => `
    <div class="asset-item" data-symbol="${c.symbol}" data-name="${c.name}">
      <img class="asset-icon" src="${c.icon}" alt="${c.symbol}"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div class="asset-icon-placeholder" style="display:none;background:${coinColor(c.symbol)};color:#fff;font-weight:700;font-size:13px;">${c.symbol.slice(0,3)}</div>
      <div>
        <span class="asset-name">${c.name}</span>
        <span class="asset-ticker">${c.symbol}</span>
      </div>
      <svg class="asset-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  `).join('');

  list.querySelectorAll('.asset-item').forEach(item => {
    item.addEventListener('click', () => {
      document.getElementById('asset-picker-overlay').classList.add('hidden');
      openAddAssetForm(item.dataset.symbol, item.dataset.name, 0);
    });
  });
}

// Поиск
document.getElementById('asset-search-input')?.addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { renderAssetList(_allCoins); return; }
  const filtered = _allCoins.filter(c =>
    c.name.toLowerCase().startsWith(q) ||
    c.symbol.toLowerCase().startsWith(q) ||
    c.name.toLowerCase().includes(q)
  );
  renderAssetList(filtered);
});

document.getElementById('asset-picker-back')?.addEventListener('click', () => {
  document.getElementById('asset-picker-overlay').classList.add('hidden');
});

document.getElementById('asset-picker-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

// Открыть форму добавления актива с предзаполненными полями
function openAddAssetForm(symbol, name, price) {
  document.getElementById('portfolio-symbol-input').value = symbol;
  document.getElementById('portfolio-amount-input').value = '';
  document.getElementById('portfolio-price-input').value = price || '';
  document.getElementById('portfolio-modal-overlay').classList.remove('hidden');
  // Обновляем заголовок
  const title = document.querySelector('#portfolio-modal .modal-title');
  if (title) title.textContent = `Добавить ${name}`;
  setTimeout(() => document.getElementById('portfolio-amount-input').focus(), 100);
}
