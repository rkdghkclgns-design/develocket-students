@echo off
chcp 65001 >nul
title 디벨로켓 수강생 관리
echo.
echo  ============================================
echo   디벨로켓 수강생 관리 - 로컬 서버 시작
echo  ============================================
echo.
echo  서버 주소: http://localhost:8765/
echo  종료하려면 Ctrl+C 또는 이 창을 닫으세요.
echo.

cd /d "%~dp0"
start "" "http://localhost:8765/디벨로켓 수강생 관리.html"
python -m http.server 8765
