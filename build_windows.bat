@echo off
chcp 65001
REM ==============================================================================
REM Gemini Synapse - Windows PyInstaller Builder
REM ==============================================================================

echo --- [1/3] Installing Python dependencies ---
pip install -r requirements.txt

echo --- [2/3] Installing PyInstaller ---
pip install pyinstaller

echo --- [3/3] Starting build with PyInstaller ---
echo This process may take a few minutes, please be patient...

pyinstaller --name synapse ^
            --onefile ^
            --add-data "api;api" ^
            --add-data "frontend;frontend" ^
            --add-data ".env;.env" ^
            --add-data ".env.example;.env.example" ^
            --hidden-import "fastapi" ^
            --hidden-import "httpx" ^
            --hidden-import "aiosqlite" ^
            --hidden-import "apscheduler" ^
            --hidden-import "fastapi.staticfiles" ^
            --hidden-import "uvicorn.logging" ^
            --hidden-import "uvicorn.loops" ^
            --hidden-import "uvicorn.protocols" ^
            --hidden-import "tzdata" ^
            run.py

echo "--- 打包完成！ ---"
echo "可执行文件位于: dist/synapse"
echo "您可以将 dist/synapse 文件复制到其他 windows 环境中运行。"
echo "如果无法运行，请先给予文件执行权限: chmod +x dist/synapse"
pause