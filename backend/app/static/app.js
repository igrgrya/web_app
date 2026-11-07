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

/* POST/PUT/DELETE с JSON-телом (ввод данных — правка к лаб. №4); текст ошибки
   разбирается так же, как у GET: строка detail или массив 422 от FastAPI.
   Уведомление read-only (503) приходит строкой detail и показывается как есть. */
async function apiSend(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const key = adminKey();
  if (key) headers["X-Admin-Key"] = key; // запись защищена ключом сервера (ревью, п.1): без него 401
  const response = await fetch(new URL(path, window.location.origin), {
    method,
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(response.status, payload));
  }
  return response.json();
}

/* Ключ записи хранится в localStorage браузера и подставляется в заголовок
   X-Admin-Key всех операций ввода (поле «Ключ записи» в разделе ввода). */
function adminKey() {
  try { return localStorage.getItem("fundsAdminKey") || ""; } catch { return ""; }
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
    <td class="row-actions"><button class="btn-chart" data-id="${item.id}" data-ticker="${esc(item.ticker)}">График</button>
    <button class="btn-mini btn-edit" data-id="${item.id}" title="Изменить инструмент">✏</button>
    <button class="btn-mini btn-delete" data-id="${item.id}" title="Удалить инструмент">🗑</button></td>
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
  /* Те же справочники нужны форме ввода инструмента (i-exchange / i-sector). */
  for (const code of exchanges) iExchange.add(new Option(code, code));
  for (const name of sectors) iSector.add(new Option(name, name));
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
  /* Кнопки CRUD перехватываем раньше открытия графика: клик по строке —
     график, клик по ✏/🗑 — правка или удаление инструмента. */
  if (event.target.closest(".btn-edit")) {
    startInstrumentEdit(Number(event.target.closest("[data-id]").dataset.id));
    return;
  }
  if (event.target.closest(".btn-delete")) {
    deleteInstrument(Number(event.target.closest("[data-id]").dataset.id));
    return;
  }
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
const pInstrument = document.getElementById("p-instrument");

/* Пикеры инструмента: график (Q5) и форма ввода котировок (правка к лаб. №4)
   заполняются одним запросом каталога; выбор пользователя сохраняется. */
async function fillInstrumentPickers() {
  const items = await api("/api/instruments", { sort: "ticker" });
  const html = items.map((i) =>
    `<option value="${i.id}">${esc(i.ticker)} — ${esc(i.name)}</option>`).join("");
  const keepChart = chartInstrument.value;
  chartInstrument.innerHTML = html;
  if (keepChart) chartInstrument.value = keepChart;
  const keepPrice = pInstrument.value;
  pInstrument.innerHTML = html;
  if (keepPrice && [...pInstrument.options].some((o) => o.value === keepPrice)) {
    pInstrument.value = keepPrice;
  }
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

/* Панель графика без выбранного инструмента (удалён из БД или ещё не выбран):
   холст и карточка сбрасываются, чтобы не показывать устаревшие данные. */
function clearChartPanel() {
  state.priceChart?.destroy();
  state.priceChart = null;
  instrumentCard.innerHTML = "Выберите инструмент в таблице или списке выше.";
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

/* ---------------- Ввод данных: CRUD (правка к лаб. №4) ---------------- */

const instrumentForm = document.getElementById("instrument-form");
const instrumentFormTitle = document.getElementById("instrument-form-title");
const iTicker = document.getElementById("i-ticker");
const iName = document.getElementById("i-name");
const iType = document.getElementById("i-type");
const iExchange = document.getElementById("i-exchange");
const iSector = document.getElementById("i-sector");
const iCurrency = document.getElementById("i-currency");
const iListed = document.getElementById("i-listed");
const iDescription = document.getElementById("i-description");
const btnInstrumentSubmit = document.getElementById("btn-instrument-submit");
const btnInstrumentCancel = document.getElementById("btn-instrument-cancel");
const instrumentStatus = document.getElementById("instrument-status");

const priceForm = document.getElementById("price-form");
const pDate = document.getElementById("p-date");
const pPrice = document.getElementById("p-price");
const pChange = document.getElementById("p-change");
const pVolume = document.getElementById("p-volume");
const btnPriceSubmit = document.getElementById("btn-price-submit");
const btnPriceCancel = document.getElementById("btn-price-cancel");
const priceStatus = document.getElementById("price-status");
const snapshotsBody = document.querySelector("#snapshots tbody");
const snapshotsStatus = document.getElementById("snapshots-status");

const writePermissionNote = document.getElementById("write-permission-note");
const dbInfoCard = document.getElementById("dbinfo-card");

let editingInstrumentId = null;   // id инструмента в режиме правки
let editingSnapshot = null;       // пара «инструмент + дата» снимка в режиме правки
let snapshotEditRequest = 0;      // загрузка снимка: устаревший ответ не заполняет форму
let instrumentEditRequest = 0;    // загрузка карточки правки: аналогично

/* Строка статуса: ok — зелёная, err — красная, пустая — скрыта (.status:empty). */
function setStatus(el, message, kind) {
  el.textContent = message;
  el.classList.toggle("status-ok", kind === "ok");
  el.classList.toggle("status-err", kind === "err");
}

function ruDate(iso) {
  return new Date(iso).toLocaleDateString("ru-RU");
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Справочники бирж/секторов формы ввода наполняются в fillFilterOnce()
   из первого ответа каталога — те же значения, что у фильтров. */

/* После успешной записи обновляем всё, что зависит от данных, включая
   открытый график и карточку (ревью, пункт 5): правка или удаление цены,
   удаление инструмента не должны оставлять на экране прежние данные. */
async function refreshAfterWrite() {
  loadCatalog();
  loadSectors().catch((err) => console.error("Q3:", err));
  loadMovers().catch((err) => console.error("Q4:", err));
  try {
    await fillInstrumentPickers();
    await loadSnapshots();
    const stillThere = chartInstrument.value &&
      [...chartInstrument.options].some((o) => o.value === chartInstrument.value);
    if (stillThere) {
      renderPriceChart().catch((err) => console.error("Q5 refresh:", err));
    } else {
      clearChartPanel(); // инструмент на графике удалён — панель сбрасывается
    }
    await loadDbInfo();
  } catch (err) {
    console.error("CRUD refresh:", err);
  }
}

/* --- Инструменты: создать / изменить / удалить --- */

function resetInstrumentForm() {
  editingInstrumentId = null;
  instrumentForm.reset();
  instrumentFormTitle.textContent = "Добавить инструмент";
  btnInstrumentSubmit.textContent = "Добавить";
  btnInstrumentCancel.hidden = true;
  /* Статус не трогаем — сообщение об успешной операции должно остаться. */
}

async function startInstrumentEdit(id) {
  const request = ++instrumentEditRequest; // клик по другой строке отменяет предыдущую загрузку
  try {
    const card = await api(`/api/instruments/${id}`);
    if (request !== instrumentEditRequest) return;
    editingInstrumentId = id;
    instrumentFormTitle.textContent = `Изменить инструмент ${card.ticker}`;
    iTicker.value = card.ticker;
    iName.value = card.name;
    iType.value = card.type;
    iExchange.value = card.exchange ?? "";
    iSector.value = card.sector ?? "";
    iCurrency.value = card.currency ?? "RUB";
    iListed.value = card.listed_date ?? "";
    iDescription.value = card.description ?? "";
    btnInstrumentSubmit.textContent = "Сохранить";
    btnInstrumentCancel.hidden = false;
    setStatus(instrumentStatus, `Редактирование ${card.ticker} — заполните поля и нажмите «Сохранить»`, "ok");
    document.getElementById("input-section").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    setStatus(instrumentStatus, `Ошибка: ${err.message}`, "err");
  }
}

async function deleteInstrument(id) {
  try {
    const card = await api(`/api/instruments/${id}`);
    /* Каскадное удаление истории цен заложено в схеме (ON DELETE CASCADE) —
       предупреживаем явно. Инструменты из новостей БД не даст удалить (409). */
    if (!confirm(`Удалить инструмент ${card.ticker} — ${card.name}?\nБудет удалена и вся история его цен.`)) return;
    const result = await apiSend("DELETE", `/api/instruments/${id}`);
    setStatus(instrumentStatus,
      `Удалён ${result.ticker}; вместе с ним удалено снимков цен: ${result.cascade_price_snapshots}`, "ok");
    if (editingInstrumentId === id) resetInstrumentForm();
    await refreshAfterWrite();
  } catch (err) {
    setStatus(instrumentStatus, `Ошибка: ${err.message}`, "err");
  }
}

instrumentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    ticker: iTicker.value.trim(),
    name: iName.value.trim(),
    instrument_type: iType.value,
    exchange: iExchange.value || null,
    sector: iSector.value || null,
    currency: iCurrency.value.trim() || "RUB",
    listed_date: iListed.value || null,
    description: iDescription.value.trim() || null,
  };
  try {
    if (editingInstrumentId) {
      const saved = await apiSend("PUT", `/api/instruments/${editingInstrumentId}`, payload);
      setStatus(instrumentStatus, `Изменено: ${saved.ticker} — ${saved.name}`, "ok");
      resetInstrumentForm();
    } else {
      const created = await apiSend("POST", "/api/instruments", payload);
      setStatus(instrumentStatus, `Добавлен инструмент ${created.ticker} (id ${created.id}) — он уже в каталоге`, "ok");
      instrumentForm.reset();
    }
    await refreshAfterWrite();
  } catch (err) {
    setStatus(instrumentStatus, `Ошибка: ${err.message}`, "err");
  }
});

btnInstrumentCancel.addEventListener("click", () => {
  resetInstrumentForm();
  setStatus(instrumentStatus, "", "ok"); // отмена гасит сообщение о правке
});

/* --- Котировки: добавить / изменить / удалить снимок --- */

let snapshotsRequest = 0; // свой счётчик гонки: быстрый ответ не должен перерисовать список

async function loadSnapshots() {
  const id = Number(pInstrument.value);
  if (!id) { snapshotsBody.innerHTML = ""; return; }
  const request = ++snapshotsRequest;
  try {
    const series = await api(`/api/instruments/${id}/prices`, { days: 10 });
    if (request !== snapshotsRequest) return;
    snapshotsBody.innerHTML = series.map(snapshotRowHtml).join("");
    setStatus(snapshotsStatus, "", "ok");
  } catch (err) {
    if (request !== snapshotsRequest) return;
    setStatus(snapshotsStatus, `Ошибка: ${err.message}`, "err");
  }
}

function snapshotRowHtml(p) {
  const change = p.change_percent;
  const changeCell = change === null ? '<td class="num">—</td>' :
    `<td class="num ${change >= 0 ? "cell-up" : "cell-down"}">${change >= 0 ? "+" : ""}${fmtNum.format(change)}</td>`;
  return `<tr data-date="${p.date}">
    <td>${esc(ruDate(p.date))}</td>
    <td class="num">${fmtPrice.format(p.price)}</td>
    ${changeCell}
    <td class="num">${p.volume === null ? "—" : fmtNum.format(p.volume)}</td>
    <td class="row-actions">
      <button class="btn-mini btn-snap-edit" data-date="${p.date}" title="Изменить снимок">✏</button>
      <button class="btn-mini btn-snap-delete" data-date="${p.date}" title="Удалить снимок">🗑</button>
    </td>
  </tr>`;
}

function resetPriceForm() {
  editingSnapshot = null;
  snapshotEditRequest++; // идущая загрузка правки больше не заполнит форму
  pDate.disabled = false;
  /* form.reset() сбросил бы и пикер инструмента на первый вариант —
     сохраняем выбор пользователя. Статус не трогаем: сообщение об
     успешной операции должно остаться видимым после сброса полей. */
  const keepInstrument = pInstrument.value;
  priceForm.reset();
  pInstrument.value = keepInstrument;
  pDate.value = todayIso();
  btnPriceSubmit.textContent = "Добавить";
  btnPriceCancel.hidden = true;
}

async function startSnapshotEdit(dateIso) {
  const id = Number(pInstrument.value);
  if (!id) return;
  const request = ++snapshotEditRequest;
  editingSnapshot = null;
  try {
    const series = await api(`/api/instruments/${id}/prices`, { days: 365 });
    /* Ревью (пункт 2): пока грузился снимок, пользователь мог переключить
       инструмент — устаревший ответ не должен включать режим правки, иначе
       его цена ушла бы в выбранный после переключения инструмент. */
    if (request !== snapshotEditRequest) return;
    const found = series.find((p) => p.date === dateIso);
    if (!found) throw new Error("снимок не найден в истории");
    editingSnapshot = { instrumentId: id, date: dateIso }; // правим именно эту пару
    pDate.value = dateIso;
    pDate.disabled = true; // дата — ключ снимка, правим только значения
    pPrice.value = found.price;
    pChange.value = found.change_percent ?? "";
    pVolume.value = found.volume ?? "";
    btnPriceSubmit.textContent = "Сохранить";
    btnPriceCancel.hidden = false;
    setStatus(priceStatus, `Редактирование снимка за ${ruDate(dateIso)} — измените цену и нажмите «Сохранить»`, "ok");
    pPrice.focus();
  } catch (err) {
    if (request !== snapshotEditRequest) return;
    setStatus(priceStatus, `Ошибка: ${err.message}`, "err");
  }
}

snapshotsBody.addEventListener("click", (event) => {
  const editButton = event.target.closest(".btn-snap-edit");
  if (editButton) { startSnapshotEdit(editButton.dataset.date); return; }
  const deleteButton = event.target.closest(".btn-snap-delete");
  if (deleteButton) deleteSnapshot(deleteButton.dataset.date);
});

async function deleteSnapshot(dateIso) {
  const id = Number(pInstrument.value);
  if (!id) return;
  try {
    if (!confirm(`Удалить снимок цены за ${ruDate(dateIso)}?\nТочка исчезнет из истории и графика.`)) return;
    await apiSend("DELETE", `/api/instruments/${id}/prices/${dateIso}`);
    setStatus(priceStatus, `Снимок за ${ruDate(dateIso)} удалён`, "ok");
    if (editingSnapshot?.date === dateIso) resetPriceForm();
    await refreshAfterWrite();
  } catch (err) {
    setStatus(priceStatus, `Ошибка: ${err.message}`, "err");
  }
}

priceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = Number(pInstrument.value);
  if (!id) { setStatus(priceStatus, "Ошибка: выберите инструмент", "err"); return; }
  /* Ревью (пункт 2): правка привязана к паре «инструмент + дата». Если
     инструмент в пикере уже другой — сохранение отклоняется, чужой снимок
     не перезаписывается. PUT идёт по зафиксированной паре, а не по пикеру. */
  if (editingSnapshot && id !== editingSnapshot.instrumentId) {
    setStatus(priceStatus, "Ошибка: инструмент изменился во время правки — выберите снимок заново", "err");
    resetPriceForm();
    return;
  }
  const values = {
    price: Number(pPrice.value),
    change_percent: pChange.value === "" ? null : Number(pChange.value),
    volume: pVolume.value === "" ? null : Number(pVolume.value),
  };
  try {
    if (editingSnapshot) {
      const saved = await apiSend("PUT",
        `/api/instruments/${editingSnapshot.instrumentId}/prices/${editingSnapshot.date}`, values);
      setStatus(priceStatus, `Снимок за ${ruDate(saved.date)} изменён: цена ${fmtPrice.format(saved.price)}`, "ok");
      resetPriceForm();
    } else {
      const created = await apiSend("POST", `/api/instruments/${id}/prices`,
        { as_of_date: pDate.value, ...values });
      setStatus(priceStatus, `Добавлен снимок за ${ruDate(created.date)}: цена ${fmtPrice.format(created.price)}`, "ok");
      resetPriceForm();
    }
    await refreshAfterWrite();
  } catch (err) {
    setStatus(priceStatus, `Ошибка: ${err.message}`, "err");
  }
});

btnPriceCancel.addEventListener("click", resetPriceForm);
pInstrument.addEventListener("change", () => {
  resetPriceForm();
  setStatus(priceStatus, "", "ok"); // смена инструмента гасит прошлое сообщение
  loadSnapshots();
});

/* ---------------- Сведения о БД (правка к лаб. №4) ---------------- */

function fmtBytes(bytes) {
  if (bytes === null || bytes === undefined) return "—";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let value = bytes, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${fmtNum.format(Math.round(value * 10) / 10)} ${units[unit]}`;
}

function renderDbInfo(info) {
  const rows = info.tables.map((t) => `
    <tr><td>${esc(t.name)}</td>
        <td class="num">${fmtNum.format(t.rows ?? 0)}</td>
        <td class="num">${fmtBytes(t.size_bytes)}</td></tr>`).join("");
  /* Права по операциям (ревью, пункт 6): INSERT без UPDATE/DELETE или без
     секвенции даёт лишь часть CRUD — показываем каждую операцию отдельно. */
  const w = info.write || {};
  const mark = (ok) => (ok ? "✅" : "⛔");
  const privCells = (p) => p
    ? `<td>${mark(p.insert)}</td><td>${mark(p.update)}</td><td>${mark(p.delete)}</td><td>${mark(p.sequence)}</td>`
    : '<td colspan="4" class="num">—</td>';
  const importedInsert = typeof w.imported_news_insert === "boolean"
    ? `<td>${mark(w.imported_news_insert)}</td><td colspan="3" class="num">—</td>`
    : '<td colspan="4" class="num">—</td>';
  const roNote = w.read_only_transaction
    ? '<p class="status status-err">БД работает в режиме read-only (default_transaction_read_only) — запись отклоняется даже при наличии прав.</p>'
    : "";
  dbInfoCard.innerHTML = `
    <div class="split">
      <div>
        <h4>${esc(info.dbms)} ${esc(info.version)}</h4>
        <p class="muted">${esc(info.version_full)}</p>
        <dl class="dbinfo-list">
          <div><dt>База данных</dt><dd>${esc(info.database)}</dd></div>
          <div><dt>Пользователь БД</dt><dd>${esc(info.db_user)}</dd></div>
          <div><dt>Время сервера</dt><dd>${esc(new Date(info.server_time).toLocaleString("ru-RU"))}</dd></div>
        </dl>
      </div>
      <div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Таблица</th><th class="num">Записей</th><th class="num">Размер</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <h4>Права на запись (по операциям)</h4>
        <div class="table-wrap">
          <table class="data dbinfo-privs">
            <thead><tr><th>Таблица</th><th>Добавление</th><th>Изменение</th><th>Удаление</th><th>Секвенция id</th></tr></thead>
            <tbody>
              <tr><td>instruments</td>${privCells(w.instruments)}</tr>
              <tr><td>price_snapshots</td>${privCells(w.price_snapshots)}</tr>
              <tr><td>imported_news (импорт)</td>${importedInsert}</tr>
            </tbody>
          </table>
        </div>
        ${roNote}
      </div>
    </div>`;
}

function updateWritePermissionNote(info) {
  const w = info.write || {};
  const notes = [];
  if (info.can_write) {
    if (info.write_auth_required) {
      notes.push(adminKey()
        ? "Запись защищена ключом сервера (X-Admin-Key): ключ сохранён в этом браузере, операции ввода будут проходить с ним."
        : "Запись защищена ключом сервера: введите FUNDS_ADMIN_KEY в поле «Ключ записи» выше — без него операции ввода вернут 401.");
    } else {
      notes.push("Защита записи выключена: переменная FUNDS_ADMIN_KEY на сервере не задана, "
        + "записывать через API может любой. Задайте ключ на сервере до выдачи прав на публичном "
        + "хостинге — первый шаг в разделе «Права на запись для ввода данных» DEPLOY_ALWAYSDATA.md.");
    }
  } else if (w.read_only_transaction) {
    notes.push("БД работает в режиме read-only (default_transaction_read_only) — операции ввода "
      + "отклоняются даже при наличии прав у пользователя. Настройку проверяет администратор БД.");
  } else {
    const missing = Array.isArray(w.missing) ? w.missing.filter(Boolean).join("; ") : "";
    notes.push("Полный CRUD недоступен: " + (missing || "нет прав на запись") + ". Права выдаются "
      + "по инструкции «Права на запись для ввода данных» в DEPLOY_ALWAYSDATA.md; что именно "
      + "разрешено — видно в таблице прав ниже. Демонстрацию ввода можно выполнить на локальной копии.");
  }
  writePermissionNote.hidden = false;
  writePermissionNote.textContent = notes.join(" ");
}

async function loadDbInfo() {
  try {
    const info = await api("/api/db-info");
    renderDbInfo(info);
    updateWritePermissionNote(info);
  } catch (err) {
    dbInfoCard.textContent = `Ошибка: ${err.message}`;
  }
}

/* Поле «Ключ записи»: значение FUNDS_ADMIN_KEY сервера хранится в localStorage
   и автоматически подставляется в заголовок X-Admin-Key всех операций ввода. */
const adminKeyInput = document.getElementById("admin-key");
const btnKeySave = document.getElementById("btn-key-save");
const keyStatus = document.getElementById("key-status");
if (adminKeyInput && btnKeySave && keyStatus) {
  try { adminKeyInput.value = adminKey(); } catch { /* localStorage недоступен */ }
  btnKeySave.addEventListener("click", () => {
    const value = adminKeyInput.value.trim();
    try { localStorage.setItem("fundsAdminKey", value); } catch { /* приватный режим */ }
    setStatus(keyStatus, value
      ? "Ключ сохранён в этом браузере — он передаётся в заголовке X-Admin-Key."
      : "Ключ очищен: если на сервере задан FUNDS_ADMIN_KEY, операции ввода вернут 401.", "ok");
    loadDbInfo(); // предупреждение над формами перечитывает состояние ключа
  });
}

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
fillInstrumentPickers().then(loadSnapshots).catch((err) => console.error("Q5:", err));
loadDbInfo();
pDate.value = todayIso(); // форма котировок: по умолчанию сегодня
initWeather();
initCurrency();
