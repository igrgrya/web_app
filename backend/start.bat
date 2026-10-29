@echo off
rem Funds Lab - запуск приложения лабораторной работы N3 (http://127.0.0.1:8000)
cd /d %~dp0
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
