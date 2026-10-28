<?xml version="1.0" encoding="UTF-8"?>
<!-- =====================================================================
     Funds Lab — XSL-шаблон каталога инструментов (лабораторная работа №2).
     Применяется к site/catalog.xml в браузере через XSLTProcessor
     (XSLT 1.0, без EXSLT). Все параметры задаются со страницы xml.html
     методом setParameter() (см. initCatalog в static/src/app.js).
     ===================================================================== -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">

  <xsl:output method="html"/>

  <!-- Поле сортировки: ticker | name | price | changePercent | volume. -->
  <xsl:param name="sortKey" select="'ticker'"/>
  <!-- Направление: ascending | descending. -->
  <xsl:param name="sortDir" select="'ascending'"/>
  <!-- Фильтры-выборки: пустая строка означает "без фильтра". -->
  <xsl:param name="filterExchange" select="''"/>
  <xsl:param name="filterType" select="''"/>
  <xsl:param name="filterSector" select="''"/>
  <!-- Поиск по подстроке в названии или тикере, без учёта регистра. -->
  <xsl:param name="query" select="''"/>

  <!-- Русский формат чисел (запятая в дробной части, пробел между разрядами):
       число форматируется стандартным паттерном, затем символы ".,"
       заменяются через translate(). Именованный xsl:decimal-format не
       используется намеренно: libxslt (Chromium) трактует разделители в
       самом паттерне по именованному формату, что ломает "#,##0.00". -->
  <xsl:template name="ru-number">
    <xsl:param name="value"/>
    <xsl:param name="pattern"/>
    <xsl:value-of select="translate(format-number($value, $pattern), '.,', ', ')"/>
  </xsl:template>

  <!-- Регистронезависимый поиск: translate() по латинице и кириллице (включая Ё/ё). -->
  <xsl:variable name="lowercase">абвгдеёжзийклмнопрстуфхцчшщъыьэюяabcdefghijklmnopqrstuvwxyz</xsl:variable>
  <xsl:variable name="uppercase">АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯABCDEFGHIJKLMNOPQRSTUVWXYZ</xsl:variable>

  <!-- Заголовок сортируемой колонки: клик обрабатывает app.js
       (см. initCatalog). На активной колонке — стрелка направления
       и aria-sort для скринридеров. -->
  <xsl:template name="head-cell">
    <xsl:param name="key"/>
    <xsl:param name="label"/>
    <th scope="col" class="sortable" data-sort-key="{$key}" title="Сортировать по этому столбцу">
      <xsl:if test="$sortKey = $key">
        <xsl:attribute name="aria-sort">
          <xsl:choose>
            <xsl:when test="$sortDir = 'descending'">descending</xsl:when>
            <xsl:otherwise>ascending</xsl:otherwise>
          </xsl:choose>
        </xsl:attribute>
      </xsl:if>
      <xsl:value-of select="$label"/>
      <xsl:if test="$sortKey = $key">
        <span class="sort-arrow">
          <xsl:choose>
            <xsl:when test="$sortDir = 'descending'">▼</xsl:when>
            <xsl:otherwise>▲</xsl:otherwise>
          </xsl:choose>
        </span>
      </xsl:if>
    </th>
  </xsl:template>

  <xsl:template match="/catalog">
    <xsl:variable name="q" select="translate($query, $uppercase, $lowercase)"/>
    <!-- Выборка: три фильтра плюс поиск по названию или тикеру. -->
    <xsl:variable name="filtered" select="instrument[(string-length($filterExchange) = 0 or exchange = $filterExchange)
      and (string-length($filterType) = 0 or type = $filterType)
      and (string-length($filterSector) = 0 or sector = $filterSector)
      and (string-length($q) = 0 or contains(translate(name, $uppercase, $lowercase), $q) or contains(translate(@ticker, $uppercase, $lowercase), $q))]"/>

    <p class="catalog-counter">Показано <xsl:value-of select="count($filtered)"/> из <xsl:value-of select="count(instrument)"/></p>

    <table class="data-table">
      <caption>Каталог инструментов</caption>
      <thead>
        <tr>
          <xsl:call-template name="head-cell">
            <xsl:with-param name="key" select="'ticker'"/>
            <xsl:with-param name="label" select="'Тикер'"/>
          </xsl:call-template>
          <xsl:call-template name="head-cell">
            <xsl:with-param name="key" select="'name'"/>
            <xsl:with-param name="label" select="'Название'"/>
          </xsl:call-template>
          <xsl:call-template name="head-cell">
            <xsl:with-param name="key" select="'type'"/>
            <xsl:with-param name="label" select="'Тип'"/>
          </xsl:call-template>
          <xsl:call-template name="head-cell">
            <xsl:with-param name="key" select="'exchange'"/>
            <xsl:with-param name="label" select="'Биржа'"/>
          </xsl:call-template>
          <xsl:call-template name="head-cell">
            <xsl:with-param name="key" select="'sector'"/>
            <xsl:with-param name="label" select="'Сектор'"/>
          </xsl:call-template>
          <xsl:call-template name="head-cell">
            <xsl:with-param name="key" select="'price'"/>
            <xsl:with-param name="label" select="'Цена'"/>
          </xsl:call-template>
          <xsl:call-template name="head-cell">
            <xsl:with-param name="key" select="'changePercent'"/>
            <xsl:with-param name="label" select="'Изм. за день'"/>
          </xsl:call-template>
          <xsl:call-template name="head-cell">
            <xsl:with-param name="key" select="'volume'"/>
            <xsl:with-param name="label" select="'Объём торгов'"/>
          </xsl:call-template>
        </tr>
      </thead>
      <tbody>
        <!-- Сортировка по выбранному полю: xsl:sort объявляется первым
             ребёнком xsl:apply-templates, поэтому на каждое поле — своя
             ветка. AVT в order разрешён спецификацией XSLT 1.0. -->
        <xsl:choose>
          <xsl:when test="$sortKey = 'name'">
            <xsl:apply-templates select="$filtered">
              <xsl:sort select="name" data-type="text" order="{$sortDir}" lang="ru"/>
            </xsl:apply-templates>
          </xsl:when>
          <xsl:when test="$sortKey = 'type'">
            <xsl:apply-templates select="$filtered">
              <xsl:sort select="type" data-type="text" order="{$sortDir}"/>
            </xsl:apply-templates>
          </xsl:when>
          <xsl:when test="$sortKey = 'exchange'">
            <xsl:apply-templates select="$filtered">
              <xsl:sort select="exchange" data-type="text" order="{$sortDir}"/>
            </xsl:apply-templates>
          </xsl:when>
          <xsl:when test="$sortKey = 'sector'">
            <xsl:apply-templates select="$filtered">
              <xsl:sort select="sector" data-type="text" order="{$sortDir}" lang="ru"/>
            </xsl:apply-templates>
          </xsl:when>
          <xsl:when test="$sortKey = 'price'">
            <xsl:apply-templates select="$filtered">
              <xsl:sort select="price" data-type="number" order="{$sortDir}"/>
            </xsl:apply-templates>
          </xsl:when>
          <xsl:when test="$sortKey = 'changePercent'">
            <xsl:apply-templates select="$filtered">
              <xsl:sort select="changePercent" data-type="number" order="{$sortDir}"/>
            </xsl:apply-templates>
          </xsl:when>
          <xsl:when test="$sortKey = 'volume'">
            <xsl:apply-templates select="$filtered">
              <xsl:sort select="volume" data-type="number" order="{$sortDir}"/>
            </xsl:apply-templates>
          </xsl:when>
          <xsl:otherwise>
            <xsl:apply-templates select="$filtered">
              <xsl:sort select="@ticker" data-type="text" order="{$sortDir}"/>
            </xsl:apply-templates>
          </xsl:otherwise>
        </xsl:choose>
      </tbody>
    </table>
  </xsl:template>

  <xsl:template match="instrument">
    <tr>
      <td class="catalog-ticker"><xsl:value-of select="@ticker"/></td>
      <td><xsl:value-of select="name"/></td>
      <td>
        <xsl:choose>
          <xsl:when test="type = 'etf'">ETF</xsl:when>
          <xsl:otherwise>акция</xsl:otherwise>
        </xsl:choose>
      </td>
      <td><xsl:value-of select="exchange"/></td>
      <td><xsl:value-of select="sector"/></td>
      <!-- Цена: число в русском формате + знак валюты из атрибута currency. -->
      <td class="catalog-num">
        <xsl:call-template name="ru-number">
          <xsl:with-param name="value" select="price"/>
          <xsl:with-param name="pattern" select="'#,##0.00'"/>
        </xsl:call-template>
        <xsl:choose>
          <xsl:when test="price/@currency = 'USD'"> $</xsl:when>
          <xsl:otherwise> ₽</xsl:otherwise>
        </xsl:choose>
      </td>
      <!-- Изменение за день: знак и окраска, процент — из changePercent. -->
      <td class="catalog-num">
        <xsl:choose>
          <xsl:when test="changePercent &gt; 0">
            <span class="change-up">+<xsl:call-template name="ru-number">
                <xsl:with-param name="value" select="changePercent"/>
                <xsl:with-param name="pattern" select="'#,##0.00'"/>
              </xsl:call-template> %</span>
          </xsl:when>
          <xsl:when test="changePercent &lt; 0">
            <span class="change-down"><xsl:call-template name="ru-number">
                <xsl:with-param name="value" select="changePercent"/>
                <xsl:with-param name="pattern" select="'#,##0.00'"/>
              </xsl:call-template> %</span>
          </xsl:when>
          <xsl:otherwise>
            <xsl:call-template name="ru-number">
              <xsl:with-param name="value" select="changePercent"/>
              <xsl:with-param name="pattern" select="'#,##0.00'"/>
            </xsl:call-template> %
          </xsl:otherwise>
        </xsl:choose>
      </td>
      <!-- Объём торгов: сокращённо, в миллионах или тысячах штук. -->
      <td class="catalog-num">
        <xsl:choose>
          <xsl:when test="volume &gt;= 1000000">
            <xsl:call-template name="ru-number">
              <xsl:with-param name="value" select="volume div 1000000"/>
              <xsl:with-param name="pattern" select="'#,##0.0'"/>
            </xsl:call-template> млн
          </xsl:when>
          <xsl:otherwise>
            <xsl:call-template name="ru-number">
              <xsl:with-param name="value" select="volume div 1000"/>
              <xsl:with-param name="pattern" select="'#,##0.0'"/>
            </xsl:call-template> тыс.
          </xsl:otherwise>
        </xsl:choose>
      </td>
    </tr>
  </xsl:template>

</xsl:stylesheet>
