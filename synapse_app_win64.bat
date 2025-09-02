@echo off
chcp 65001 > nul
title Gemini Synapse Launcher

:: ==============================================================================
:: Gemini Synapse - Windows Launcher with Colors
:: ==============================================================================

:: --- 颜色定义 ---
:: 获取一个 ESC 字符
for /f %%a in ('echo prompt $E^| cmd') do (
  set "ESC=%%a"
)
:: 定义颜色代码
set "COLOR_INFO=%ESC%[92m"
set "COLOR_WARN=%ESC%[93m"
set "COLOR_ERROR=%ESC%[91m"
set "COLOR_RESET=%ESC%[0m"

:: --- 全局变量 ---
SET "APP_DIR=synapse_app"
SET "BINARY_NAME=synapse_windows.exe"
SET "BINARY_PATH=%APP_DIR%\%BINARY_NAME%"
SET "DOWNLOAD_URL=https://github.com/LiquorXR/gemini-synapse/releases/download/app/synapse_windows.exe"

:: --- 检查并创建应用目录 ---
if not exist "%APP_DIR%" (
    echo %COLOR_INFO%正在创建应用目录: %APP_DIR%%COLOR_RESET%
    mkdir "%APP_DIR%"
)

:: --- 检查可执行文件是否存在 ---
if not exist "%BINARY_PATH%" (
    echo %COLOR_WARN%未找到可执行文件: "%BINARY_PATH%"%COLOR_RESET%
    set /p "confirm=是否立即下载? (Y/n): "
    if /i "%confirm%" == "Y" (
        goto :download_binary
    ) else if "%confirm%" == "" (
        goto :download_binary
    ) else (
        echo %COLOR_INFO%用户取消操作，脚本退出。%COLOR_RESET%
        pause
        exit /b
    )
)
goto :start_app

:download_binary
echo.
echo %COLOR_INFO%正在从以下地址下载文件:%COLOR_RESET%
echo %DOWNLOAD_URL%
echo.
echo %COLOR_INFO%正在下载...%COLOR_RESET%
curl -L -o "%BINARY_PATH%" "%DOWNLOAD_URL%"
if %errorlevel% neq 0 (
    echo %COLOR_ERROR%下载失败！请检查您的网络连接或 URL 是否正确。%COLOR_RESET%
    pause
    exit /b 1
)
echo %COLOR_INFO%下载完成！%COLOR_RESET%
echo.
goto :start_app

:start_app
echo %COLOR_INFO%准备启动服务...%COLOR_RESET%

:: ======== 从注册表获取 Edge 路径 ========
set "EDGE_PATH="
for /f "skip=2 tokens=2,*" %%a in (
    'reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" /ve 2^>nul'
) do (
    set "EDGE_PATH=%%b"
)

if not defined EDGE_PATH (
    echo %COLOR_ERROR%未找到 Microsoft Edge 路径，PWA 窗口将无法启动。%COLOR_RESET%
)

:: ======== 配置 PWA 应用参数 ========
SET "PWA_PROFILE_PATH=%TEMP%\GeminiSynapseProfile"
SET "PWA_CMD="%EDGE_PATH%" --user-data-dir="%PWA_PROFILE_PATH%" --app=http://127.0.0.1:8008/ --window-size=460,910 --user-agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1""

:: ======== 启动核心服务 ========
echo %COLOR_INFO%正在后台启动核心服务...%COLOR_RESET%
cd /d "%APP_DIR%"
start "Gemini Synapse Core" /B %BINARY_NAME%

:: ======== 等待服务器启动 ========
echo %COLOR_INFO%正在等待服务器响应 (等待 5 秒)...%COLOR_RESET%
timeout /t 5 /nobreak > nul

:: ======== 启动 PWA 应用 ========
if defined EDGE_PATH (
    start "Gemini Synapse PWA" %PWA_CMD%
)

exit /b 0
