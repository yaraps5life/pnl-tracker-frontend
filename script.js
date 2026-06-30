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

async function apiGet(path) {
  const res = await fetch(API_URL + path, { headers: getAuthHeader() });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_URL + path, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json();
}

async function apiPatch(path, body) {
  const res = await fetch(API_URL + path, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}`);
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(API_URL + path, {
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

  ctx.strokeStyle = lastPositive ? '#3DDC97' : '#E5534B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * rect.width;
    const y = rect.height - ((v - min) / range) * rect.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

async function loadDashboard() {
  try {
    const data = await apiGet('/stats/summary');
    const { stats, recent_trades } = data;

    const pnlEl = document.getElementById('dash-pnl');
    pnlEl.textContent = stats.total_trades ? fmtR(stats.total_r) : '—';
    pnlEl.className = `pnl-value mono ${pnlClass(stats.total_r)}`;

    document.getElementById('dash-winrate').textContent = stats.total_trades ? `${stats.winrate}%` : '—';
    document.getElementById('dash-pf').textContent = stats.total_trades ? stats.profit_factor : '—';
    document.getElementById('dash-count').textContent = stats.total_trades || '0';

    drawEquityCurve(document.getElementById('dash-equity-chart'), stats.r_curve);

    const hasTrades = stats.total_trades > 0;
    document.getElementById('dash-recent-section').classList.toggle('hidden', !hasTrades);
    document.getElementById('dash-empty-state').classList.toggle('hidden', hasTrades);

    if (hasTrades) {
      document.getElementById('dash-recent-list').innerHTML = recent_trades.map(renderTradeRow).join('');
      attachTradeRowHandlers('dash-recent-list');
    }
  } catch (e) {
    console.error('Не удалось загрузить дашборд', e);
  }
}

document.getElementById('dash-connect-btn').addEventListener('click', () => showScreen('exchange'));
document.getElementById('dash-manual-btn').addEventListener('click', () => showScreen('add-trade'));
document.getElementById('dash-history-btn').addEventListener('click', () => showScreen('journal'));
document.getElementById('dash-see-all-btn').addEventListener('click', () => showScreen('journal'));
document.getElementById('dash-fab-btn').addEventListener('click', () => showScreen('add-trade'));

// ---------- Рендер строки сделки (общий для дашборда и журнала) ----------

function renderTradeRow(t) {
  const isLong = t.direction === 'long';
  const sourceLabel = t.source === 'auto' ? 'авто' : 'ручная';
  return `
    <div class="trade-row" data-trade-id="${t.id}">
      <div class="trade-left">
        <div class="trade-icon ${isLong ? 'long' : 'short'}">${isLong ? '↗' : '↘'}</div>
        <div>
          <div class="trade-symbol">${t.symbol}</div>
          <div class="trade-meta">${t.direction} · ${sourceLabel}</div>
        </div>
      </div>
      <div class="trade-right">
        <div class="trade-pnl ${pnlClass(t.result_r)}">${fmtR(t.result_r)}</div>
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

function renderJournalTable() {
  const tableBody = document.getElementById('journal-table-body');
  const tableWrap = document.getElementById('journal-table-wrap');
  const emptyEl = document.getElementById('journal-empty-state');

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
      <td class="cell-r">${fmtR(t.result_r)}</td>
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
}

async function resetAddTradeForm() {
  document.getElementById('add-trade-title').textContent = 'Новая сделка';
  document.getElementById('add-submit-btn').textContent = 'Добавить сделку';

  // Дата по умолчанию — сегодня (локальная дата в формате YYYY-MM-DD для input[type=date])
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('add-trade-date').value = `${yyyy}-${mm}-${dd}`;

  document.getElementById('add-result-r').value = '';
  document.getElementById('add-note').value = '';

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
  const selectValue = document.getElementById('add-symbol-select').value;
  const newSymbolRaw = document.getElementById('add-symbol-new-input').value.trim();
  const isNewSymbol = selectValue === '__new__';
  const symbol = (isNewSymbol ? newSymbolRaw : selectValue).toUpperCase();
  const resultRRaw = document.getElementById('add-result-r').value;
  const note = document.getElementById('add-note').value.trim();

  if (!symbol) {
    alert('Укажи актив');
    return;
  }
  if (!tradeDate) {
    alert('Укажи дату сделки');
    return;
  }

  // R вводится как положительное число — знак берём из выбранного результата,
  // а не из самого числа: убыток всегда уходит в минус, без убытка — всегда 0.
  let resultR = resultRRaw ? Math.abs(parseFloat(resultRRaw)) : null;
  if (resultR !== null) {
    if (addTradeOutcome === 'loss') resultR = -resultR;
    else if (addTradeOutcome === 'breakeven') resultR = 0;
    // 'win' или не выбрано — оставляем положительным как есть
  }

  const payload = {
    asset: symbol,
    symbol: symbol,
    direction: addTradeDirection,
    result_r: resultR,
    outcome: addTradeOutcome,
    trade_date: `${tradeDate}T12:00:00`,
    note: note || null,
    tags: addTradeTags,
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

// ---------- Подключение биржи ----------
// Примечание: эндпоинтов /exchange/* пока нет на бэкенде — это заглушка интерфейса,
// которую нужно подключить, когда будет готова синхронизация с Binance API.

document.getElementById('exchange-back-btn').addEventListener('click', () => showScreen('settings'));
document.getElementById('settings-exchange-row').addEventListener('click', () => showScreen('exchange'));

document.getElementById('exchange-connect-btn').addEventListener('click', () => {
  alert('Синхронизация с Binance ещё не подключена на бэкенде — это следующий шаг разработки.');
});

// ---------- Настройки ----------

function loadSettings() {
  const user = tg?.initDataUnsafe?.user;
  if (user) {
    document.getElementById('settings-name').textContent = user.first_name || 'Пользователь';
    document.getElementById('settings-handle').textContent = user.username ? `@${user.username}` : '';
    document.getElementById('settings-avatar').textContent = (user.first_name || '?')[0].toUpperCase();
  }
}

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

// ---------- Запуск ----------

renderOnboarding();
