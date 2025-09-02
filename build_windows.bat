@echo off
chcp 65001
REM ==============================================================================
REM Gemini Synapse - Windows PyInstaller Builder
REM ==============================================================================

echo --- [1/3] 正在安装 Python 依赖 ---
pip install -r requirements.txt

echo --- [2/3] 正在安装 PyInstaller ---
pip install pyinstaller

echo --- [3/3] 正在使用 PyInstaller 进行打包 ---
echo 此过程可能需要几分钟，请耐心等待...

pyinstaller --name synapse_windows ^
            --onefile ^
            --add-data "api;api" ^
            --add-data "frontend;frontend" ^
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
echo "可执行文件位于: dist/synapse_windows"
echo "您可以将 dist/synapse_windows 文件复制到其他 windows 环境中运行。"
echo "这是一个独立的 .exe 文件，通常不需要额外的执行权限。"
pause