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

/* Человекочитаемый текст ошибки API. detail — строка у наших HTTPException,
   но массив объектов у ошибок валидации FastAPI (422): берём первое сообщение,
   чтобы вместо него не показать «[object Object]». */
function apiErrorMessage(status, body) {
  const detail = body && body.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    const field = Array.isArray(first.loc)
      ? first.loc.filter((part) => part !== "query" && part !== "body").join(".")
      : "";
    return `Некорректный запрос${field ? ` (${field})` : ""}: ${first.msg ?? `HTTP ${status}`}`;
  }
  return `HTTP ${status}`;
}

async function api(path, params = {}) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== null && value !== undefined) url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(response.status, body));
  }
  return response.json();
}

/* ---------------- Q1: каталог + Q2: поиск ---------------- */

const catalogBody = document.querySelector("#catalog tbody");
const catalogStatus = document.getElementById("catalog-status");
const dataNote = document.getElementById("data-note");
const fExchange = document.getElementById("f-exchange");
const fSector = document.getElementById("f-sector");
const fType = document.getElementById("f-type");
const fQuery = document.getElementById("f-query");
let catalogRequest = 0;

/* Плашка «Учебные данные на …» — дата свежего снимка цен из ответа каталога:
   история синтетическая, и пользователю важно видеть границу набора. */
function setDataNote(items) {
  const iso = items.find((item) => item.as_of_date)?.as_of_date;
  if (!iso) return;
  dataNote.hidden = false;
  dataNote.textContent = `Учебные данные на ${new Date(iso).toLocaleDateString("ru-RU")}`;
}

function rowHtml(item) {
  const change = item.change_percent;
  const changeCell = change === null ? '<td class="num">—</td>' :
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

function renderCatalog(items) {
  catalogBody.innerHTML = items.map(rowHtml).join("");
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
  const request = ++catalogRequest;
  try {
    const items = await api("/api/instruments", catalogParams());
    if (request !== catalogRequest) return;
    renderCatalog(items);
    highlightSortedColumn();
    fillFilterOnce(items);
    setDataNote(items);
    catalogStatus.textContent = ""; // успешная загрузка гасит прошлую ошибку
  } catch (err) {
    if (request !== catalogRequest) return;
    catalogStatus.textContent = `Ошибка: ${err.message}`;
  }
}

async function runSearch() {
  const q = fQuery.value.trim();
  if (!q) { loadCatalog(); return; }
  if (q.length > 100) {
    catalogStatus.textContent = "Ошибка: поисковая строка длиннее 100 символов — сократите запрос.";
    return;
  }
  const request = ++catalogRequest;
  try {
    const items = await api("/api/search", { ...catalogParams(), q, limit: 100 });
    if (request !== catalogRequest) return;
    renderCatalog(items);
    highlightSortedColumn();
    catalogStatus.textContent = "";
  } catch (err) {
    if (request !== catalogRequest) return;
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
  runSearch();
});

for (const control of [fExchange, fSector, fType]) {
  control.addEventListener("change", runSearch);
}

let searchTimer = null;
fQuery.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 300);
});

document.getElementById("btn-reset").addEventListener("click", () => {
  clearTimeout(searchTimer);
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
      <td>${esc(r.currency ?? "—")}</td>
      <td class="num">${r.instruments_count}</td>
      <td class="num">${r.avg_price === null ? "—" : fmtPrice.format(r.avg_price)}</td>
      <td class="num">${r.total_volume === null ? "—" : fmtNum.format(r.total_volume)}</td>
    </tr>`).join("");

  state.sectorsChart?.destroy();
  state.sectorsChart = new Chart(document.getElementById("sectors-chart"), {
    type: "bar",
    data: {
      labels: rows.map((r) => `${r.sector} (${r.currency ?? "—"})`),
      datasets: [{
        label: "Инструментов в секторе и валюте",
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
              return [`Средняя цена: ${avg} ${r.currency ?? ""}`, `Суммарный объём: ${fmtNum.format(r.total_volume ?? 0)}`];
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

let chartRequest = 0;

async function renderPriceChart() {
  const id = Number(chartInstrument.value);
  if (!id) return;
  const request = ++chartRequest; // медленный ответ прошлого инструмента не должен перерисовать график
  try {
    const [card, series] = await Promise.all([
      api(`/api/instruments/${id}`),
      api(`/api/instruments/${id}/prices`, { days: chartDays.value }),
    ]);
    if (request !== chartRequest) return;

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
    if (request !== chartRequest) return;
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

/* ---------------- Меню шапки: на телефоне раскрывается кнопкой ---------------- */

const navToggle = document.getElementById("nav-toggle");
const navMainEl = document.querySelector(".nav-main");
if (navToggle && navMainEl && !navMainEl.dataset.navToggleBound) {
  /* Флаг нужен на /db.html целого сайта: там этот скрипт грузится вместе
     с общим сайтом app.js, и меню должно раскрываться ровно один раз. */
  navMainEl.dataset.navToggleBound = "1";
  navToggle.addEventListener("click", () => {
    const open = navMainEl.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
}

/* ---------------- Информеры в шапке (как на сайте) ---------------- */

/* Запрос JSON с таймаутом: не даём виджету «висеть», если сервис
   недоступен (например, заблокирован провайдером). */
async function fetchJSON(url, timeoutMs) {
  const options = {};
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  if (controller) options.signal = controller.signal;
  try {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* Подбор иконки по коду погоды WMO (open-meteo). */
function weatherIcon(code) {
  if (code >= 95) return "⛈";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "🌧";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "❄";
  if (code <= 1) return "☀";
  if (code === 2) return "🌤";
  if (code <= 48) return "☁";
  return "🌡";
}

async function initWeather() {
  const box = document.getElementById("weather-widget");
  if (!box) return;
  /* Основной источник — open-meteo, запасной — wttr.in. */
  try {
    const data = await fetchJSON("https://api.open-meteo.com/v1/forecast?latitude=55.0968&longitude=36.6103&current=temperature_2m,wind_speed_10m,weather_code&timezone=Europe/Moscow", 8000);
    const current = data && data.current;
    if (!current) throw new Error("no data");
    box.innerHTML = `<span>${weatherIcon(current.weather_code)}</span> Обнинск: <strong>${current.temperature_2m} °C</strong>, ветер ${current.wind_speed_10m} м/с`;
  } catch (err) {
    const data = await fetchJSON("https://wttr.in/Obninsk?format=j1", 8000).catch(() => null);
    const current = data && data.current_condition && data.current_condition[0];
    if (!current) {
      box.textContent = "Не удалось загрузить погоду.";
      return;
    }
    box.innerHTML = `<span>☁</span> Обнинск: <strong>${current.temp_C} °C</strong>, ветер ${current.windspeedKmph} км/ч`;
  }
}

async function initCurrency() {
  const box = document.getElementById("currency-widget");
  if (!box) return;
  /* Основной источник — курс ЦБ РФ (доступен из России), запасной — open.er-api.com. */
  const rubPerUnit = (valute, code) => {
    const value = valute[code];
    return value && typeof value.Value === "number" ? value.Value / (value.Nominal || 1) : null;
  };
  /* Стрелка изменения курса к предыдущему дню. */
  const rateArrow = (valute, code) => {
    const value = valute[code];
    if (!value || typeof value.Value !== "number") return "";
    const diff = value.Value - (value.Previous || value.Value);
    if (diff > 0) return '<span class="rate-up">▲</span>';
    if (diff < 0) return '<span class="rate-down">▼</span>';
    return "";
  };
  try {
    const data = await fetchJSON("https://www.cbr-xml-daily.ru/daily_json.js", 8000);
    const valute = data && data.Valute;
    if (!valute) throw new Error("no data");
    const usd = rubPerUnit(valute, "USD");
    const eur = rubPerUnit(valute, "EUR");
    const cny = rubPerUnit(valute, "CNY");
    if (usd === null) throw new Error("no data");
    const date = data.Date ? new Date(data.Date).toLocaleDateString("ru-RU") : "";
    box.innerHTML = `ЦБ РФ${date ? ` на ${date}` : ""}: ` +
      `1 USD — <strong>${usd.toFixed(2)} ₽</strong>${rateArrow(valute, "USD")}, ` +
      `1 EUR — <strong>${eur === null ? "—" : eur.toFixed(2) + " ₽"}</strong>${rateArrow(valute, "EUR")}, ` +
      `1 CNY — <strong>${cny === null ? "—" : cny.toFixed(2) + " ₽"}</strong>${rateArrow(valute, "CNY")}`;
  } catch (err) {
    const data = await fetchJSON("https://open.er-api.com/v6/latest/USD", 8000).catch(() => null);
    const rates = data && data.rates;
    if (!rates || typeof rates.RUB !== "number") {
      box.textContent = "Не удалось загрузить курсы валют.";
      return;
    }
    box.innerHTML = `1 USD — <strong>${rates.RUB.toFixed(2)} ₽</strong>, ` +
      `1 EUR — <strong>${(rates.RUB / rates.EUR).toFixed(2)} ₽</strong>, ` +
      `1 CNY — <strong>${(rates.RUB / rates.CNY).toFixed(2)} ₽</strong>`;
  }
}

/* ---------------- запуск ---------------- */

loadCatalog();
loadSectors().catch((err) => console.error("Q3:", err));
loadMovers().catch((err) => console.error("Q4:", err));
fillInstrumentPicker().catch((err) => console.error("Q5:", err));
initWeather();
initCurrency();
