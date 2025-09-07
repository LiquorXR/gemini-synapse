@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion
title Gemini Synapse

REM ======== 环境依赖检测 ========
echo 正在检测环境依赖...

REM --- 检查 uvicorn ---
where uvicorn >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 uvicorn 命令。请确保 Python 和 uvicorn 已正确安装并已添加到系统 PATH 环境变量中。
    pause
    exit /b 1
)

REM --- 检查 Python 依赖 ---
for /f "delims=" %%p in (requirements.txt) do (
    pip show %%p >nul 2>nul
    if !errorlevel! neq 0 (
        echo [错误] Python 依赖 '%%p' 未安装。
        echo 请在项目根目录下运行以下命令安装所有依赖:
        echo pip install -r requirements.txt
        pause
        exit /b 1
    )
)
echo 环境依赖检测通过。

REM ======== 从注册表获取 Edge 路径 ========
set "EDGE_PATH="
for /f "skip=2 tokens=2,*" %%a in (
    'reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" /ve 2^>nul'
) do (
    set "EDGE_PATH=%%b"
)

if not defined EDGE_PATH (
    echo [错误] 未找到 Microsoft Edge 路径，请检查是否已安装。
    pause
    exit /b 1
)

REM ======== 配置 PWA 应用参数 ========
SET "PWA_PROFILE_PATH=%TEMP%\GeminiSynapseProfile"
SET "PWA_CMD="%EDGE_PATH%" --user-data-dir="%PWA_PROFILE_PATH%" --app=http://127.0.0.1:8008/ --window-size=460,910 --user-agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1""

REM ======== 启动 Uvicorn 服务器 ========
start "Gemini Synapse" /B uvicorn api.index:app --host 0.0.0.0 --port 8008

REM ======== 等待服务器启动 ========
echo 正在启动服务器...
timeout /t 5 /nobreak > nul

REM ======== 启动 PWA 应用 ========
start "Gemini Synapse PWA" %PWA_CMD%

exit /b 0
