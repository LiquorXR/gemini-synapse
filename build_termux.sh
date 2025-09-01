#!/bin/bash
# ==============================================================================
# Gemini Synapse - Termux PyInstaller Builder
# ==============================================================================

set -e

echo "--- [1/4] 更新 Termux 软件包并安装依赖 ---"
# 使用 Termux 的包管理器 pkg
pkg update -y
pkg install -y rustc python python-pip

echo "--- [2/4] 安装 Python 依赖库 ---"
pip install -r requirements.txt

echo "--- [3/4] 安装 PyInstaller ---"
pip install pyinstaller

echo "--- [4/4] 开始使用 PyInstaller 打包 (Termux) ---"
echo "这个过程可能需要几分钟，请耐心等待..."

pyinstaller --name synapse_termux \
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
echo "可执行文件位于: dist/synapse_termux"
echo "您可以将 dist/synapse_termux 文件复制到其他兼容的 aarch64 Linux 环境中运行。"
echo "如果无法运行，请先给予文件执行权限: chmod +x dist/synapse_termux"
echo "直接运行: ./dist/synapse_termux"