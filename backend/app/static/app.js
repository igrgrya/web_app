/* Funds Lab — приложение лабораторной работы №3.
 * Клиент UI: дергает API (Q1–Q5), рендерит таблицы и графики Chart.js.
 * Сортировка и фильтры выполняются НА СЕРВЕРЕ — каждый клик это новый SQL-запрос. */

"use strict";

const fmtNum = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const fmtPrice = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_RU = { stock: "Акция", etf: "ETF", fund: "Фонд", bond: "Облигация" };

/* Числовые колонки: при первом клике сортируются по убыванию (как в лабе №2). */
const NUMERIC_SORT = new Set(["price", "change", "volume"]);

const state = {
  sort: "ticker",
  direction: "asc",
  priceChart: null,
  sectorsChart: null,
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

async function api(path, params = {}) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== null && value !== undefined) url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

/* ---------------- Q1: каталог + Q2: поиск ---------------- */

const catalogBody = document.querySelector("#catalog tbody");
const catalogStatus = document.getElementById("catalog-status");
const fExchange = document.getElementById("f-exchange");
const fSector = document.getElementById("f-sector");
const fType = document.getElementById("f-type");
const fQuery = document.getElementById("f-query");
const searchMode = { active: false };

function rowHtml(item) {
  const change = item.change_percent;
  const changeCell = change === null ? "" :
    `<td class="num ${change >= 0 ? "cell-up" : "cell-down"}">${change >= 0 ? "+" : ""}${fmtNum.format(change)}</td>`;
  return `<tr class="clickable" data-id="${item.id}">
    <td><strong>${esc(item.ticker)}</strong></td>
    <td>${esc(item.name)}</td>
    <td>${TYPE_RU[item.type] ?? esc(item.type)}</td>
    <td>${esc(item.exchange ?? "—")}</td>
    <td>${esc(item.sector ?? "—")}</td>
    <td class="num">${item.price === null ? "—" : fmtPrice.format(item.price)} ${esc(item.currency ?? "")}</td>
    ${changeCell}
    <td class="num">${item.volume === null ? "—" : fmtNum.format(item.volume)}</td>
    <td><button class="btn-chart" data-id="${item.id}" data-ticker="${esc(item.ticker)}">График</button></td>
  </tr>`;
}

function renderCatalog(items, statusText) {
  catalogBody.innerHTML = items.map(rowHtml).join("");
  if (statusText) catalogStatus.textContent = statusText;
}

function fillFilterOnce(items) {
  if (fExchange.options.length > 1) return; // заполняется только один раз
  const exchanges = [...new Set(items.map((i) => i.exchange).filter(Boolean))].sort();
  const sectors = [...new Set(items.map((i) => i.sector).filter(Boolean))].sort();
  for (const code of exchanges) fExchange.add(new Option(code, code));
  for (const name of sectors) fSector.add(new Option(name, name));
}

function catalogParams() {
  return {
    exchange: fExchange.value,
    sector: fSector.value,
    instrument_type: fType.value,
    sort: state.sort,
    direction: state.direction,
  };
}

async function loadCatalog() {
  try {
    const items = await api("/api/instruments", catalogParams());
    searchMode.active = false;
    renderCatalog(items, `Каталог: ${items.length} инструментов. Сортировка: ${state.sort} ${state.direction === "asc" ? "▲" : "▼"} (SQL выполняется на сервере).`);
    highlightSortedColumn();
    fillFilterOnce(items);
  } catch (err) {
    catalogStatus.textContent = `Ошибка: ${err.message}`;
  }
}

async function runSearch() {
  const q = fQuery.value.trim();
  if (!q) { loadCatalog(); return; }
  try {
    const items = await api("/api/search", { q });
    searchMode.active = true;
    renderCatalog(items, `Поиск «${q}» (Q2, ILIKE на сервере): найдено ${items.length}.`);
  } catch (err) {
    catalogStatus.textContent = `Ошибка: ${err.message}`;
  }
}

function highlightSortedColumn() {
  document.querySelectorAll("#catalog thead th").forEach((th) => {
    const active = th.dataset.sort === state.sort;
    th.classList.toggle("sorted", active);
    th.removeAttribute("aria-sort");
    if (active) {
      th.setAttribute("aria-sort", state.direction === "asc" ? "ascending" : "descending");
      th.textContent = th.textContent.replace(/ [▲▼]$/, "") + (state.direction === "asc" ? " ▲" : " ▼");
    } else {
      th.textContent = th.textContent.replace(/ [▲▼]$/, "");
    }
  });
}

document.querySelector("#catalog thead").addEventListener("click", (event) => {
  const th = event.target.closest("th[data-sort]");
  if (!th) return;
  const key = th.dataset.sort;
  if (state.sort === key) {
    state.direction = state.direction === "asc" ? "desc" : "asc";
  } else {
    state.sort = key;
    state.direction = NUMERIC_SORT.has(key) ? "desc" : "asc";
  }
  searchMode.active ? runSearch() : loadCatalog();
});

for (const control of [fExchange, fSector, fType]) {
  control.addEventListener("change", () => (searchMode.active ? runSearch() : loadCatalog()));
}

let searchTimer = null;
fQuery.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 300);
});

document.getElementById("btn-reset").addEventListener("click", () => {
  fExchange.value = "";
  fSector.value = "";
  fType.value = "";
  fQuery.value = "";
  state.sort = "ticker";
  state.direction = "asc";
  loadCatalog();
});

catalogBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (row) openPriceChart(Number(row.dataset.id));
});

/* ---------------- Q3: агрегаты по секторам ---------------- */

async function loadSectors() {
  const rows = await api("/api/sectors/summary");
  document.querySelector("#sectors-table tbody").innerHTML = rows.map((r) => `
    <tr>
      <td>${esc(r.sector)}</td>
      <td class="num">${r.instruments_count}</td>
      <td class="num">${r.avg_price === null ? "—" : fmtPrice.format(r.avg_price)}</td>
      <td class="num">${r.total_volume === null ? "—" : fmtNum.format(r.total_volume)}</td>
    </tr>`).join("");

  state.sectorsChart?.destroy();
  state.sectorsChart = new Chart(document.getElementById("sectors-chart"), {
    type: "bar",
    data: {
      labels: rows.map((r) => r.sector),
      datasets: [{
        label: "Инструментов в секторе",
        data: rows.map((r) => r.instruments_count),
        backgroundColor: "rgba(37, 99, 235, 0.75)",
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => {
              const r = rows[ctx.dataIndex];
              const avg = r.avg_price === null ? "—" : fmtPrice.format(r.avg_price);
              return [`Средняя цена: ${avg}`, `Суммарный объём: ${fmtNum.format(r.total_volume ?? 0)}`];
            },
          },
        },
      },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

/* ---------------- Q4: лидеры дня ---------------- */

function moversRow(item) {
  const change = item.change_percent ?? 0;
  return `<tr class="clickable" data-id="${item.id}">
    <td><strong>${esc(item.ticker)}</strong></td>
    <td>${esc(item.name)}</td>
    <td class="num">${fmtPrice.format(item.price ?? 0)} ${esc(item.currency ?? "")}</td>
    <td class="num ${change >= 0 ? "cell-up" : "cell-down"}">${change >= 0 ? "+" : ""}${fmtNum.format(change)}</td>
  </tr>`;
}

async function loadMovers() {
  const data = await api("/api/top-movers", { limit: 5 });
  document.querySelector("#gainers tbody").innerHTML = data.gainers.map(moversRow).join("");
  document.querySelector("#losers tbody").innerHTML = data.losers.map(moversRow).join("");
}

/* ---------------- Q5: карточка + график цены ---------------- */

const chartInstrument = document.getElementById("chart-instrument");
const chartDays = document.getElementById("chart-days");
const instrumentCard = document.getElementById("instrument-card");

async function fillInstrumentPicker() {
  const items = await api("/api/instruments", { sort: "ticker" });
  chartInstrument.innerHTML = items.map((i) =>
    `<option value="${i.id}">${esc(i.ticker)} — ${esc(i.name)}</option>`).join("");
}

async function openPriceChart(id) {
  chartInstrument.value = String(id);
  await renderPriceChart();
  document.getElementById("chart-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function renderPriceChart() {
  const id = Number(chartInstrument.value);
  if (!id) return;
  try {
    const [card, series] = await Promise.all([
      api(`/api/instruments/${id}`),
      api(`/api/instruments/${id}/prices`, { days: chartDays.value }),
    ]);

    state.priceChart?.destroy();
    const prices = series.map((p) => p.price);
    const trendUp = prices.length > 1 && prices[prices.length - 1] >= prices[0];
    state.priceChart = new Chart(document.getElementById("price-chart"), {
      type: "line",
      data: {
        labels: series.map((p) => new Date(p.date).toLocaleDateString("ru-RU")),
        datasets: [{
          label: `${card.ticker}, ${card.currency}`,
          data: prices,
          borderColor: trendUp ? "#16a34a" : "#dc2626",
          backgroundColor: trendUp ? "rgba(22, 163, 74, 0.08)" : "rgba(220, 38, 38, 0.08)",
          fill: true,
          tension: 0.25,
          pointRadius: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: "top" } },
        scales: { y: { ticks: { callback: (v) => fmtNum.format(v) } } },
      },
    });

    const change = card.change_percent;
    instrumentCard.innerHTML = `
      <h4>${esc(card.ticker)} — ${esc(card.name)}</h4>
      <p>${esc(card.description ?? "")}</p>
      <p class="muted">
        ${TYPE_RU[card.type] ?? esc(card.type)} · ${esc(card.exchange ?? "—")} · сектор «${esc(card.sector ?? "—")}»<br>
        В листинге с ${card.listed_date ? esc(new Date(card.listed_date).toLocaleDateString("ru-RU")) : "—"}<br>
        Цена: ${card.price === null ? "—" : fmtPrice.format(card.price)} ${esc(card.currency)}
        ${change === null || change === undefined ? "" :
          ` <span class="${change >= 0 ? "cell-up" : "cell-down"}">(${change >= 0 ? "+" : ""}${fmtNum.format(change)}%)</span>`}
        · объём ${card.volume === null ? "—" : fmtNum.format(card.volume)}
      </p>`;
  } catch (err) {
    instrumentCard.textContent = `Ошибка: ${err.message}`;
  }
}

chartInstrument.addEventListener("change", renderPriceChart);
chartDays.addEventListener("change", renderPriceChart);

document.querySelector("#gainers").addEventListener("click", (e) => {
  const row = e.target.closest("tr[data-id]");
  if (row) openPriceChart(Number(row.dataset.id));
});
document.querySelector("#losers").addEventListener("click", (e) => {
  const row = e.target.closest("tr[data-id]");
  if (row) openPriceChart(Number(row.dataset.id));
});

/* ---------------- запуск ---------------- */

loadCatalog();
loadSectors().catch((err) => console.error("Q3:", err));
loadMovers().catch((err) => console.error("Q4:", err));
fillInstrumentPicker().catch((err) => console.error("Q5:", err));
