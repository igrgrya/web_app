/* Funds Lab — интерактив лабораторной работы №4 (обмен данными).
 * Страница rss.html: предпросмотр экспортных форматов, загрузка и разбор
 * внешнего RSS-файла, объединение с новостями БД, импорт в таблицу
 * imported_news. Все запросы — к API того же источника (FastAPI).
 * Подключается ПОСЛЕ общих скриптов сайта; не конфликтует с app.js. */
"use strict";

(function () {
  // Защита от двойной привязки: скрипт может попасть на страницу дважды.
  if (window.__FUNDS_LAB4_INIT__) return;
  window.__FUNDS_LAB4_INIT__ = true;

  function byId(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  function apiErrorMessage(status, body) {
    const detail = body && body.detail;
    if (typeof detail === "string" && detail) return detail;
    return `HTTP ${status}`;
  }

  async function api(path, options) {
    const response = await fetch(path, options);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!response.ok) throw new Error(apiErrorMessage(response.status, body));
    return body;
  }

  function setStatus(element, text, isError) {
    element.textContent = text || "";
    element.classList.toggle("is-error", Boolean(isError));
  }

  function formatDate(iso) {
    if (!iso) return "—";
    return iso.slice(0, 16).replace("T", " ");
  }

  /* Состояние: выбранный источник внешнего фида. */
  const state = { sources: [], defaultSource: "rbc" };

  /* Параметры внешнего фида из формы: явный URL имеет приоритет над каталогом. */
  function sourceQuery() {
    const custom = (byId("lab4-custom-url").value || "").trim();
    if (custom) return "url=" + encodeURIComponent(custom);
    return "source=" + encodeURIComponent(byId("lab4-source").value || state.defaultSource);
  }

  /* ---------- Каталог источников ---------- */

  async function initSources() {
    const select = byId("lab4-source");
    try {
      const data = await api("/api/lab4/sources");
      state.sources = data.sources || [];
      state.defaultSource = data.default || "rbc";
      select.innerHTML = state.sources.map((item) =>
        `<option value="${esc(item.id)}"${item.id === state.defaultSource ? " selected" : ""}>${esc(item.name)}</option>`
      ).join("");
    } catch (error) {
      setStatus(byId("lab4-status"), `Не удалось загрузить каталог источников: ${error.message}`, true);
    }
  }

  /* ---------- Предпросмотр форматов обмена ---------- */

  const FORMAT_PREVIEW_LINES = 18;

  const FORMATS = [
    { id: "csv", label: "CSV (разделитель «;» + список полей)", path: "/api/export/news.csv" },
    { id: "xml", label: "XML — RSS 2.0 из БД", path: "/api/rss" },
    { id: "tagged", label: "ASCII, оконтуренный XML-тегами", path: "/api/export/news.tagged.txt" },
  ];

  async function previewFormat(formatId) {
    const format = FORMATS.find((item) => item.id === formatId);
    if (!format) return;
    const pre = byId("lab4-format-pre");
    setStatus(byId("lab4-status"), `Загружаю ${format.label}…`);
    try {
      const response = await fetch(format.path);
      if (!response.ok) throw new Error(apiErrorMessage(response.status, null));
      const text = await response.text();
      pre.textContent = text.split(/\r?\n/).slice(0, FORMAT_PREVIEW_LINES).join("\n")
        + (text.split(/\r?\n/).length > FORMAT_PREVIEW_LINES ? "\n…" : "");
      setStatus(byId("lab4-status"), `Формат «${format.label}»: показаны первые строки. Полный файл: ${format.path}`);
    } catch (error) {
      pre.textContent = "";
      setStatus(byId("lab4-status"), `Не удалось получить ${format.label}: ${error.message}`, true);
    }
  }

  /* ---------- Внешний RSS: скачать и разобрать ---------- */

  function renderExternalItems(items, container) {
    container.innerHTML = items.map((item) => `
      <li class="card lab4-item">
        <p class="lab4-item-title">${item.link ? `<a href="${esc(item.link)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title)}</p>
        <p class="lab4-item-meta muted">${esc(formatDate(item.published))} · <span class="lab4-badge ${item.source_type === "db" ? "lab4-badge--db" : "lab4-badge--ext"}">${esc(item.source)}</span></p>
        ${item.summary ? `<p>${esc(item.summary)}</p>` : ""}
      </li>`).join("");
  }

  async function fetchExternal() {
    const list = byId("lab4-external-list");
    setStatus(byId("lab4-status"), "Скачиваю и разбираю внешний RSS-файл…");
    try {
      const data = await api(`/api/lab4/external-rss?${sourceQuery()}`);
      renderExternalItems(data.items.slice(0, 10).map((item) => ({ ...item, source: data.title, source_type: "external" })), list);
      setStatus(byId("lab4-status"), `Внешний фид «${data.title}»: разобрано записей — ${data.items_count}.`);
    } catch (error) {
      list.innerHTML = "";
      setStatus(byId("lab4-status"), `Внешний RSS недоступен: ${error.message}`, true);
    }
  }

  /* ---------- Объединение с новостями БД ---------- */

  async function combineNews() {
    const container = byId("lab4-combined-wrap");
    setStatus(byId("lab4-status"), "Объединяю новости БД и внешнего фида…");
    try {
      const data = await api(`/api/lab4/combined-news?${sourceQuery()}&limit=15`);
      const rows = data.items.map((item) => `
        <tr>
          <td>${esc(formatDate(item.published))}</td>
          <td><span class="lab4-badge ${item.source_type === "db" ? "lab4-badge--db" : "lab4-badge--ext"}">${esc(item.source)}</span></td>
          <td>${item.link ? `<a href="${esc(item.link)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title)}</td>
          <td>${esc(item.ticker || "—")}</td>
        </tr>`).join("");
      container.innerHTML = `
        <table class="data-table">
          <caption>Объединенная лента: всего ${data.total} (БД: ${esc(String(data.sources[0].items))}, внешний фид «${esc(data.sources[1].name)}»: ${esc(String(data.sources[1].items))})</caption>
          <thead><tr><th>Дата</th><th>Источник</th><th>Новость</th><th>Инструмент</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      setStatus(byId("lab4-status"), "Объединение выполнено. Готовая страница: /lab4/combined.html");
    } catch (error) {
      container.innerHTML = "";
      setStatus(byId("lab4-status"), `Объединение не удалось: ${error.message}`, true);
    }
  }

  /* Открыть серверную страницу «Объединенные новости» с текущим источником. */
  function openCombinedPage() {
    window.open(`/lab4/combined.html?${sourceQuery()}&limit=30`, "_blank", "noopener");
  }

  /* ---------- Импорт в СУБД ---------- */

  async function importFeed() {
    setStatus(byId("lab4-status"), "Загружаю разобранные записи в таблицу imported_news…");
    try {
      const data = await api(`/api/lab4/import?${sourceQuery()}&limit=10`, { method: "POST" });
      setStatus(byId("lab4-status"),
        `Импорт: получено ${data.fetched}, вставлено ${data.inserted}, дубликатов пропущено ${data.skipped_duplicates}, всего в таблице ${data.total_in_table}.`);
      await loadImported();
    } catch (error) {
      setStatus(byId("lab4-status"), `Импорт не удался: ${error.message}`, true);
    }
  }

  async function loadImported() {
    const container = byId("lab4-imported-wrap");
    try {
      const rows = await api("/api/lab4/imported?limit=10");
      if (!rows.length) {
        container.innerHTML = '<p class="muted">Таблица imported_news пуста — выполните импорт.</p>';
        return;
      }
      container.innerHTML = `
        <table class="data-table">
          <caption>Последние записи imported_news</caption>
          <thead><tr><th>Импортирована</th><th>Источник</th><th>Новость</th></tr></thead>
          <tbody>${rows.map((row) => `
            <tr>
              <td>${esc(formatDate(row.imported_at))}</td>
              <td>${esc(row.source_title)}</td>
              <td>${row.link ? `<a href="${esc(row.link)}" target="_blank" rel="noopener">${esc(row.title)}</a>` : esc(row.title)}</td>
            </tr>`).join("")}</tbody>
        </table>`;
    } catch (error) {
      container.innerHTML = "";
      setStatus(byId("lab4-status"), `Не удалось прочитать импортированные записи: ${error.message}`, true);
    }
  }

  /* ---------- Запуск ---------- */

  function init() {
    if (!byId("lab4-tools")) return; // страница без интерактива л.р. №4

    initSources();

    document.querySelectorAll("[data-lab4-format]").forEach((button) => {
      button.addEventListener("click", () => previewFormat(button.getAttribute("data-lab4-format")));
    });

    byId("lab4-fetch").addEventListener("click", fetchExternal);
    byId("lab4-combine").addEventListener("click", combineNews);
    byId("lab4-open-page").addEventListener("click", openCombinedPage);
    byId("lab4-import").addEventListener("click", importFeed);
    byId("lab4-imported-reload").addEventListener("click", loadImported);

    // Смена источника в каталоге сбрасывает поле произвольного адреса:
    // приоритет url= над source= задан на сервере, в UI не смешиваем.
    byId("lab4-source").addEventListener("change", () => {
      byId("lab4-custom-url").value = "";
    });

    loadImported();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
