@echo off
rem Double-click to start live subtitles. Extra options can be added after %*.
cd /d "%~dp0"
call .venv\Scripts\activate.bat
python -m livesub live %*
if errorlevel 1 pause
