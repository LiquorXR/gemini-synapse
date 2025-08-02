#!/bin/bash

# ==============================================================================
# Gemini Synapse - Termux 一键部署脚本
#
# 本脚本旨在自动化在 Termux 环境中安装、配置并运行
# Gemini Synapse 项目的全过程。
# ==============================================================================

# --- 配置 ---
# 如果任何命令执行失败，立即退出脚本
set -e

# --- 用于彩色输出的辅助函数 ---
setup_colors() {
  if [ -t 1 ]; then
    RED=$(printf '\033[0;31m')
    GREEN=$(printf '\033[0;32m')
    YELLOW=$(printf '\033[0;33m')
    BLUE=$(printf '\033[0;34m')
    BOLD=$(printf '\033[1m')
    NC=$(printf '\033[0m') # 无颜色
  else
    RED=""
    GREEN=""
    YELLOW=""
    BLUE=""
    BOLD=""
    NC=""
  fi
}

# --- 主要功能函数 ---
update_termux_packages() {
  echo -e "\n${BLUE}正在更新 Termux 软件包...${NC}"
  pkg update -y && pkg upgrade -y
}

install_system_dependencies() {
  echo -e "\n${BLUE}正在安装系统依赖 (python, git)...${NC}"
  pkg install -y python git rust
}

clone_project_repo() {
  echo -e "\n${BLUE}正在克隆项目仓库...${NC}"
  if [ -d "gemini-synapse" ]; then
    echo -e "${YELLOW}目录 'gemini-synapse' 已存在，跳过克隆。${NC}"
  else
    git clone https://github.com/LiquorXR/gemini-synapse.git
  fi
  cd gemini-synapse
}

install_python_dependencies() {
  echo -e "\n${BLUE}正在安装 Python 依赖库...${NC}"
  if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
  else
    echo -e "${RED}错误: 未找到 requirements.txt 文件！${NC}"
    exit 1
  fi
}

configure_environment() {
  echo -e "\n${BLUE}正在配置环境变量...${NC}"
  if [ -f ".env" ]; then
    echo -e "${YELLOW}.env 文件已存在，跳过交互式配置。${NC}"
    echo -e "${YELLOW}请确保您的 .env 文件配置正确。${NC}"
  else
    echo "从 .env.example 创建 .env 文件..."
    cp .env.example .env

    echo -e "\n${YELLOW}--- 交互式配置 ---${NC}"
    echo "您需要提供一些核心密钥以运行服务。"

    # 提示输入 ADMIN_KEY
    echo -e "\n请输入您的 ${BOLD}管理员密钥 (Admin Key)${NC} (这将是您登录 Web 管理面板的密码):"
    read -p "> " admin_key
    # 使用不同的分隔符以更好地处理密钥中的特殊字符
    sed -i "s|^ADMIN_KEY=.*|ADMIN_KEY=${admin_key}|" .env

    # 提示输入 GOOGLE_API_KEYS
    echo -e "\n请输入您的 ${BOLD}Google Gemini API 密钥${NC}."
    echo "如果您有多个密钥，请使用英文逗号分隔 (例如: key1,key2,key3):"
    read -p "> " google_api_keys
    sed -i "s|^GOOGLE_API_KEYS=.*|GOOGLE_API_KEYS=${google_api_keys}|" .env

    echo -e "\n${GREEN}初始配置已保存至 .env 文件。${NC}"
    echo "后续您可随时手动编辑 .env 文件以进行更详细的设置。"
  fi
}

start_application() {
  echo -e "\n${GREEN}===================================================${NC}"
  echo -e "${GREEN}${BOLD}部署完成！正在启动应用程序...${NC}"
  echo -e "${GREEN}===================================================${NC}"
  echo -e "您可以通过以下地址访问服务:"
  echo -e "  - ${BOLD}API 代理地址:${NC} http://localhost:8000"
  echo -e "  - ${BOLD}Web 管理面板:${NC} http://localhost:8000"
  echo -e "\n${YELLOW}按 ${BOLD}Ctrl+C${NC} 组合键来停止服务。${NC}\n"

  uvicorn api.index:app --host 0.0.0.0 --port 8000
}

# --- 脚本执行入口 ---
main() {
  setup_colors
  update_termux_packages
  install_system_dependencies
  clone_project_repo
  install_python_dependencies
  configure_environment
  start_application
}

main