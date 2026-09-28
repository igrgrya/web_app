# Размещение сайта Funds Lab

Статический сайт лабораторной работы №1 лежит в папке `site/` и не требует
ни базы данных, ни PHP — это обычные HTML/CSS/JavaScript-файлы. Их можно
запустить двумя способами.

## Вариант 1. Локально: XAMPP / Apache (как требует методичка)

1. Установи **XAMPP** с https://www.apachefriends.org/ (версия для Windows).
2. Установи **XAMPP** в `C:\xampp` (по умолчанию).
3. Скопируй папку `site` в `C:\xampp\htdocs\` и переименуй её в `funds_lab`.
   Итоговый путь: `C:\xampp\htdocs\funds_lab\index.html`.
4. Запусти «XAMPP Control Panel» и нажми **Start** напротив модуля **Apache**.
5. Открой в браузере http://localhost/funds_lab/ — сайт должен открыться.

Если порт 80 занят (часто это Skype/IIS), закрой занявшую его программу или
поменяй порт Apache в `httpd.conf` (`Listen 8080`) и открывай
http://localhost:8080/funds_lab/.

## Вариант 2. Публично: GitHub Pages

Готовый workflow `.github/workflows/pages.yml` публикует папку `site/` на
GitHub Pages. Подробная инструкция по включению — в `MANUAL_STEPS.md`.

После включения сайт будет доступен по адресу:

```
https://igrgrya.github.io/web_app/
```

## Обновление содержимого

Все страницы генерируются скриптом из общих данных:

```
node static/build.mjs
```

После правок в `frontend/src/data/seed.js` (или в шаблонах `static/build.mjs`)
достаточно перезапустить генератор — он пересоберёт папку `site/`.

## Проверка валидности

```
node static/validate.mjs
```

Скрипт прогоняет все страницы через W3C Nu Validator.
