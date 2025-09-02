#!/bin/bash
# ==============================================================================
# Gemini Synapse - Linux PyInstaller Builder
# ==============================================================================

set -e

echo "--- [1/4] 更新软件包列表并安装依赖 ---"
# 注意：此脚本假定为 Debian/Ubuntu 系统。如果使用其他发行版，请修改为对应的包管理器命令。
sudo apt-get update -y
sudo apt-get install -y rustc python3-pip

echo "--- [2/4] 安装 Python 依赖库 ---"
pip3 install -r requirements.txt

echo "--- [3/4] 安装 PyInstaller ---"
pip3 install pyinstaller

echo "--- [4/4] 开始使用 PyInstaller 打包 ---"
echo "这个过程可能需要几分钟，请耐心等待..."

pyinstaller --name synapse \
            --onefile \
            --add-data "api:api" \
            --add-data "frontend:frontend" \
            --add-data ".env:.env" \
            --add-data ".env.example:.env.example" \
            --hidden-import "fastapi" \
            --hidden-import "httpx" \
            --hidden-import "aiosqlite" \
            --hidden-import "apscheduler" \
            --hidden-import "fastapi.staticfiles" \
            --hidden-import "uvicorn.logging" \
            --hidden-import "uvicorn.loops" \
            --hidden-import "uvicorn.protocols" \
            --hidden-import "tzdata" \
            run.py

echo "--- 打包完成！ ---"
echo "可执行文件位于: dist/synapse"
echo "您可以将 dist/synapse 文件复制到其他兼容的 Linux 环境中直接运行。"
echo "在运行前，您可能需要给予文件执行权限: chmod +x dist/synapse"