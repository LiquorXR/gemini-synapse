@echo off
chcp 65001 > nul
title Gemini Synapse

REM ========== 启动 PWA 应用程序 ==========
SET PWA_CMD="C:\Program Files (x86)\Microsoft\Edge\Application\msedge_proxy.exe" --profile-directory="Profile 1" --app-id=mngloiodpbedloingimookgdhhkgcblo --app-url=http://127.0.0.1:8000/ --app-launch-source=4

REM ========== 启动 Uvicorn 服务器 ==========
start "Gemini Synapse" /B uvicorn api.index:app --host 0.0.0.0 --port 8000

REM ========== 等待服务器启动 ==========
echo 正在等待服务器启动...
timeout /t 5 /nobreak > nul

REM ========== 启动 PWA 应用 ==========
start "Gemini Synapse PWA" %PWA_CMD%

REM ========== 脚本执行完毕，自动关闭 ==========
exit
