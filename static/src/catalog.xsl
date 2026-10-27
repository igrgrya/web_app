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

  <!-- Русский формат чисел: запятая в дробной части, пробел между разрядами. -->
  <xsl:decimal-format name="ru" decimal-separator="," grouping-separator=" "/>

  <!-- Регистронезависимый поиск: translate() по латинице и кириллице (включая Ё/ё). -->
  <xsl:variable name="lowercase">абвгдеёжзийклмнопрстуфхцчшщъыьэюяabcdefghijklmnopqrstuvwxyz</xsl:variable>
  <xsl:variable name="uppercase">АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯABCDEFGHIJKLMNOPQRSTUVWXYZ</xsl:variable>

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
          <th scope="col">Тикер</th>
          <th scope="col">Название</th>
          <th scope="col">Тип</th>
          <th scope="col">Биржа</th>
          <th scope="col">Сектор</th>
          <th scope="col">Цена</th>
          <th scope="col">Изм. за день</th>
          <th scope="col">Объём торгов</th>
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
        <xsl:value-of select="format-number(price, '#,##0.00', 'ru')"/>
        <xsl:choose>
          <xsl:when test="price/@currency = 'USD'"> $</xsl:when>
          <xsl:otherwise> ₽</xsl:otherwise>
        </xsl:choose>
      </td>
      <!-- Изменение за день: знак и окраска, процент — из changePercent. -->
      <td class="catalog-num">
        <xsl:choose>
          <xsl:when test="changePercent &gt; 0">
            <span class="change-up">+<xsl:value-of select="format-number(changePercent, '#,##0.00', 'ru')"/> %</span>
          </xsl:when>
          <xsl:when test="changePercent &lt; 0">
            <span class="change-down"><xsl:value-of select="format-number(changePercent, '#,##0.00', 'ru')"/> %</span>
          </xsl:when>
          <xsl:otherwise>
            <xsl:value-of select="format-number(changePercent, '#,##0.00', 'ru')"/> %
          </xsl:otherwise>
        </xsl:choose>
      </td>
      <!-- Объём торгов: сокращённо, в миллионах или тысячах штук. -->
      <td class="catalog-num">
        <xsl:choose>
          <xsl:when test="volume &gt;= 1000000">
            <xsl:value-of select="format-number(volume div 1000000, '#,##0.0', 'ru')"/> млн
          </xsl:when>
          <xsl:otherwise>
            <xsl:value-of select="format-number(volume div 1000, '#,##0.0', 'ru')"/> тыс.
          </xsl:otherwise>
        </xsl:choose>
      </td>
    </tr>
  </xsl:template>

</xsl:stylesheet>
