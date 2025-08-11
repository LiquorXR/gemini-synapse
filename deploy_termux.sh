#!/bin/bash

# ==============================================================================
# Gemini Synapse - Termux
# ==============================================================================

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

# --- 环境检测函数 ---
check_environment() {
  echo -e "\n${BLUE}执行环境检测...${NC}"
  local all_ok=true

  # 检查核心工具
  for tool in python git rustc; do
    if command -v $tool &>/dev/null; then
      echo -e "${GREEN}✓ ${tool} 已安装${NC}"
    else
      echo -e "${RED}✗ ${tool} 未安装${NC}"
      all_ok=false
    fi
  done

  # 检查项目仓库
  if [ -d "gemini-synapse" ]; then
    echo -e "${GREEN}✓ 项目目录 'gemini-synapse' 已存在${NC}"
  else
    echo -e "${RED}✗ 项目目录 'gemini-synapse' 未找到${NC}"
    all_ok=false
  fi

  # 检查 Python 依赖 (基于标记文件)
  if [ -f "gemini-synapse/.deps_installed" ]; then
    echo -e "${GREEN}✓ Python 依赖已安装${NC}"
  else
    echo -e "${YELLOW}⚠ Python 依赖未标记为已安装 (或首次运行)${NC}"
    # 这不算是致命错误，因为可以从菜单修复
  fi

  if [ "$1" != "silent" ]; then
      echo -e "\n${BLUE}检测完成。${NC}"
  fi

  $all_ok
}

# --- 核心功能函数 ---
update_termux_packages() {
  echo -e "\n${BLUE}正在更新 Termux 软件包...${NC}"
  pkg update -y && pkg upgrade -y
}

install_system_dependencies() {
  echo -e "\n${BLUE}正在安装系统依赖 (python, git, rust)...${NC}"
  pkg install -y python git rust
}

clone_project_repo() {
  echo -e "\n${BLUE}正在克隆项目仓库...${NC}"
  if [ -d "gemini-synapse" ]; then
    echo -e "${YELLOW}目录 'gemini-synapse' 已存在，跳过克隆。${NC}"
  else
    git clone https://github.com/LiquorXR/gemini-synapse.git
  fi
}

install_python_dependencies() {
  if [ ! -d "gemini-synapse" ]; then
    echo -e "${RED}错误: 项目目录 'gemini-synapse' 不存在，无法安装依赖。${NC}"
    return 1
  fi
  echo -e "\n${BLUE}正在安装 Python 依赖库...${NC}"
  if [ -f "gemini-synapse/requirements.txt" ]; then
    pip install -r gemini-synapse/requirements.txt
    touch gemini-synapse/.deps_installed # 创建标记文件
    echo -e "${GREEN}Python 依赖安装完成。${NC}"
  else
    echo -e "${RED}错误: 未找到 gemini-synapse/requirements.txt 文件！${NC}"
    return 1
  fi
}

configure_environment() {
  if [ ! -d "gemini-synapse" ]; then
    echo -e "${RED}错误: 项目目录 'gemini-synapse' 不存在，无法配置环境。${NC}"
    return 1
  fi
  echo -e "\n${BLUE}正在配置环境变量...${NC}"
  if [ -f "gemini-synapse/.env" ]; then
    echo -e "${YELLOW}.env 文件已存在，跳过创建。${NC}"
  else
    echo "正在从 .env.example 创建 .env 文件..."
    cp "gemini-synapse/.env.example" "gemini-synapse/.env"
    echo -e "${GREEN}.env 文件已成功创建。${NC}"
    echo -e "${YELLOW}脚本将使用默认环境变量值启动。如有需要，请稍后手动编辑 .env 文件。${NC}"
  fi
}

run_initial_setup() {
    echo -e "\n${BLUE}--- 开始执行完整环境配置 ---${NC}"
    update_termux_packages
    install_system_dependencies
    clone_project_repo
    install_python_dependencies
    configure_environment
    echo -e "\n${GREEN}${BOLD}--- 环境配置完成 ---${NC}"
    echo -e "现在您可以从主菜单启动服务了。"
}

update_service() {
  if [ ! -d "gemini-synapse" ]; then
    echo -e "${RED}错误: 'gemini-synapse' 目录未找到。请先完成初始配置。${NC}"
    return 1
  fi
  echo -e "\n${BLUE}正在同步上游项目的更新...${NC}"
  cd gemini-synapse
  
  echo -e "\n${BLUE}正在使用 'git pull' 拉取最新代码...${NC}"
  git pull

  echo -e "\n${BLUE}正在根据 'requirements.txt' 更新 Python 依赖...${NC}"
  if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
    touch .deps_installed # 更新标记文件
  else
    echo -e "${YELLOW}警告: 未找到 requirements.txt 文件，跳过依赖更新。${NC}"
  fi

  cd ..
  echo -e "\n${GREEN}同步完成！${NC}"
  echo -e "${YELLOW}如果应用当前正在运行，请手动重启以应用更新。${NC}"
}

start_service() {
  if [ ! -f "gemini-synapse/.env" ]; then
      echo -e "${RED}错误: .env 配置文件不存在！${NC}"
      echo -e "${YELLOW}请先完成初始环境配置，或从菜单中选择更新服务。${NC}"
      return 1
  fi

  # --- 新增：端口设置 ---
  local port
  read -p "请输入要使用的端口号 (留空则默认为 8000): " port
  # 如果用户未输入，则使用默认端口 8000
  if [ -z "$port" ]; then
    port=8000
  fi
  
  echo -e "\n${GREEN}===================================================${NC}"
  echo -e "${GREEN}${BOLD}启动应用程序...${NC}"
  echo -e "${GREEN}===================================================${NC}"
  
  cd gemini-synapse
  
  echo -e "您可以通过以下地址访问服务:"
  echo -e "  - ${BOLD}API 代理地址:${NC} http://127.0.0.1:${port}"
  echo -e "  - ${BOLD}Web 管理面板:${NC} http://127.0.0.1:${port}"
  echo -e "\n${YELLOW}按 ${BOLD}Ctrl+C${NC} 组合键来停止服务。${NC}\n"

  uvicorn api.index:app --host 0.0.0.0 --port ${port}
  # 服务停止后，返回上一级目录，确保主菜单路径正确
  cd ..
}

# --- 主菜单 ---
show_main_menu() {
  while true; do
    echo -e "\n${BOLD}--- Gemini Synapse 主菜单 ---${NC}"
    echo "1. 环境检测"
    echo "2. 更新服务 (git pull & 安装依赖)"
    echo "3. 启动服务"
    echo "4. 退出"
    read -p "请输入选项 [1-4]: " menu_choice

    case $menu_choice in
      1)
        check_environment
        ;;
      2)
        update_service
        ;;
      3)
        start_service
        ;;
      4)
        echo "正在退出脚本。"
        exit 0
        ;;
      *)
        echo -e "${RED}无效选项，请输入 1-4 之间的数字。${NC}"
        ;;
    esac
  done
}


# --- 脚本执行入口 ---
main() {
  setup_colors

  # 检查是否为首次运行或环境不完整
  if ! check_environment silent; then
    echo -e "${YELLOW}系统环境未完整配置或首次运行。${NC}"
    read -p "是否执行初始化配置流程? (Y/n): " confirm
    if [[ "$confirm" == "y" || "$confirm" == "Y" || "$confirm" == "" ]]; then
      run_initial_setup
    else
      echo -e "${RED}用户取消，脚本退出。${NC}"
      exit 1
    fi
  fi
  
  # 进入主菜单
  show_main_menu
}

main "$@"