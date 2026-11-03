# Образ публикации лабораторной №3 для Koyeb (подходит и для любого
# Docker-хостинга). Собирается из корня репозитория: Koyeb клонирует ветку
# и выполняет docker build по этому файлу.
FROM python:3.12-slim

WORKDIR /app

# Зависимости копируем отдельно от кода — слой кэшируется, пока
# requirements.txt не меняется.
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend /app/backend

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Koyeb передаёт порт сервиса в переменной PORT (по умолчанию 8000);
# запускаем через sh, чтобы подстановка сработала. amvera.yml использует
# ту же команду с фиксированным портом 8000.
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
