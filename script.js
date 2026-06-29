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
    pnlEl.textContent = fmtBalance(stats.current_balance);
    pnlEl.className = `pnl-value mono ${pnlClass(stats.pnl_total)}`;

    const pctEl = document.getElementById('dash-pnl-pct');
    pctEl.textContent = fmtPct(stats.pnl_pct);
    pctEl.className = `pnl-pct mono ${pnlClass(stats.pnl_pct)}`;

    document.getElementById('dash-winrate').textContent = stats.total_trades ? `${stats.winrate}%` : '—';
    document.getElementById('dash-pf').textContent = stats.total_trades ? stats.profit_factor : '—';
    document.getElementById('dash-count').textContent = stats.total_trades || '0';

    drawEquityCurve(document.getElementById('dash-equity-chart'), stats.balance_curve);

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
        <div class="trade-pnl ${pnlClass(t.pnl_usd ?? t.result_r)}">${t.pnl_usd != null ? fmtUsd(t.pnl_usd) : fmtR(t.result_r)}</div>
        <div class="trade-r">${fmtR(t.result_r)}</div>
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

let journalFilters = { result: '', source: '', search: '' };

async function loadJournal() {
  const listEl = document.getElementById('journal-list');
  const emptyEl = document.getElementById('journal-empty-state');

  try {
    const params = new URLSearchParams();
    if (journalFilters.result) params.set('result', journalFilters.result);
    if (journalFilters.source) params.set('source', journalFilters.source);

    const data = await apiGet(`/trades?${params.toString()}`);
    let trades = data.trades;

    if (journalFilters.search) {
      const q = journalFilters.search.toLowerCase();
      trades = trades.filter((t) =>
        t.symbol?.toLowerCase().includes(q) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(q))
      );
    }

    if (trades.length === 0) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    // Группируем по дате
    const groups = {};
    trades.forEach((t) => {
      const dateKey = (t.created_at || '').split(' ')[0] || 'Без даты';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(t);
    });

    listEl.innerHTML = Object.entries(groups).map(([date, items]) => `
      <div class="date-group-label">${date}</div>
      <div class="card" style="padding: 4px 16px;">
        ${items.map(renderTradeRow).join('')}
      </div>
    `).join('');

    attachTradeRowHandlers('journal-list');
  } catch (e) {
    console.error('Не удалось загрузить журнал', e);
  }
}

document.querySelectorAll('[data-filter-result]').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('[data-filter-result]').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    journalFilters.result = chip.dataset.filterResult;
    journalFilters.source = '';
    document.querySelectorAll('[data-filter-source]').forEach((c) => c.classList.remove('active'));
    loadJournal();
  });
});

document.querySelectorAll('[data-filter-source]').forEach((chip) => {
  chip.addEventListener('click', () => {
    const isActive = chip.classList.contains('active');
    document.querySelectorAll('[data-filter-source]').forEach((c) => c.classList.remove('active'));
    journalFilters.source = isActive ? '' : chip.dataset.filterSource;
    chip.classList.toggle('active', !isActive);
    loadJournal();
  });
});

document.getElementById('journal-search').addEventListener('input', (e) => {
  journalFilters.search = e.target.value;
  loadJournal();
});

document.getElementById('journal-add-btn').addEventListener('click', () => showScreen('add-trade'));

// ---------- Деталь сделки ----------

let currentTradeId = null;
let availableTags = [];

async function openTradeDetail(tradeId) {
  currentTradeId = tradeId;
  showScreen('trade-detail');

  try {
    const t = await apiGet(`/trades/${tradeId}`);
    const tagsData = await apiGet('/tags');
    availableTags = tagsData.tags;

    document.getElementById('detail-symbol').textContent = t.symbol;

    const badge = document.getElementById('detail-source-badge');
    badge.textContent = t.source === 'auto' ? 'авто' : 'ручная';
    badge.className = `source-badge ${t.source}`;

    const pnlEl = document.getElementById('detail-pnl');
    pnlEl.textContent = t.pnl_usd != null ? fmtUsd(t.pnl_usd) : fmtR(t.result_r);
    pnlEl.className = `pnl-value mono ${pnlClass(t.pnl_usd ?? t.result_r)}`;

    document.getElementById('detail-pnl-sub').textContent =
      `${t.direction} · ${fmtR(t.result_r)}${t.opened_at ? ' · ' + t.opened_at : ''}`;

    document.getElementById('detail-entry').textContent = t.entry_price ?? '—';
    document.getElementById('detail-exit').textContent = t.exit_price ?? '—';
    document.getElementById('detail-size').textContent = t.size ?? '—';
    document.getElementById('detail-leverage').textContent = t.leverage ? `${t.leverage}x` : '—';

    renderDetailTags(t.tags || []);
    document.getElementById('detail-note').value = t.note || '';
  } catch (e) {
    console.error('Не удалось загрузить сделку', e);
  }
}

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

  document.getElementById('detail-add-tag').addEventListener('click', async () => {
    const tag = prompt('Название тега:');
    if (!tag) return;
    const newTags = [...activeTags, tag];
    await apiPatch(`/trades/${currentTradeId}`, { tags: newTags });
    activeTags = newTags;
    renderDetailTags(activeTags);
  });
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
  if (!confirm('Удалить эту сделку?')) return;
  try {
    await apiDelete(`/trades/${currentTradeId}`);
    showScreen('journal');
  } catch (e) {
    console.error('Не удалось удалить сделку', e);
  }
});

// ---------- Добавить сделку ----------

document.getElementById('add-back-btn').addEventListener('click', () => showScreen('dashboard'));

document.getElementById('add-submit-btn').addEventListener('click', async () => {
  const tradeDate = document.getElementById('add-trade-date').value; // формат YYYY-MM-DD или пусто
  const symbol = document.getElementById('add-symbol').value.trim();
  const direction = document.getElementById('add-direction').value;
  const resultRRaw = document.getElementById('add-result-r').value;
  const pnlUsdRaw = document.getElementById('add-pnl-usd').value;
  const note = document.getElementById('add-note').value.trim();

  if (!symbol) {
    alert('Укажи актив');
    return;
  }

  try {
    await apiPost('/trades', {
      asset: symbol,
      symbol: symbol,
      direction: direction,
      result_r: resultRRaw ? parseFloat(resultRRaw) : null,
      pnl_usd: pnlUsdRaw ? parseFloat(pnlUsdRaw) : null,
      trade_date: tradeDate ? `${tradeDate}T12:00:00` : null,
      source: 'manual',
      note: note || null,
      tags: [],
    });

    tg?.HapticFeedback?.notificationOccurred('success');
    document.getElementById('add-trade-date').value = '';
    document.getElementById('add-symbol').value = '';
    document.getElementById('add-result-r').value = '';
    document.getElementById('add-pnl-usd').value = '';
    document.getElementById('add-note').value = '';

    showScreen('dashboard');
  } catch (e) {
    console.error('Не удалось добавить сделку', e);
    alert('Не удалось добавить сделку. Проверь соединение с бэкендом.');
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

    const maxAbs = Math.max(...data.by_tag.map((t) => Math.abs(t.pnl_usd)), 1);

    container.innerHTML = data.by_tag.map((t) => {
      const widthPct = Math.round((Math.abs(t.pnl_usd) / maxAbs) * 100);
      const isPositive = t.pnl_usd >= 0;
      return `
        <div class="bar-stat">
          <div class="bar-stat-top">
            <span class="bar-stat-name">${t.tag}</span>
            <span class="mono ${pnlClass(t.pnl_usd)}">${fmtUsd(t.pnl_usd)}</span>
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

async function loadSettings() {
  const user = tg?.initDataUnsafe?.user;
  if (user) {
    document.getElementById('settings-name').textContent = user.first_name || 'Пользователь';
    document.getElementById('settings-handle').textContent = user.username ? `@${user.username}` : '';
    document.getElementById('settings-avatar').textContent = (user.first_name || '?')[0].toUpperCase();
  }

  try {
    const data = await apiGet('/settings');
    document.getElementById('settings-starting-balance').value = data.starting_balance || '';
  } catch (e) {
    console.error('Не удалось загрузить настройки', e);
  }
}

document.getElementById('settings-save-balance-btn').addEventListener('click', async () => {
  const raw = document.getElementById('settings-starting-balance').value;
  const value = parseFloat(raw);
  if (isNaN(value) || value < 0) {
    alert('Укажи корректный стартовый баланс');
    return;
  }
  try {
    await apiPost('/settings', { starting_balance: value });
    tg?.HapticFeedback?.notificationOccurred('success');
  } catch (e) {
    console.error('Не удалось сохранить баланс', e);
    alert('Не удалось сохранить. Проверь соединение с бэкендом.');
  }
});

document.getElementById('settings-delete-row').addEventListener('click', () => {
  alert('Удаление всех данных пока не реализовано на бэкенде.');
});

// ---------- Запуск ----------

renderOnboarding();
