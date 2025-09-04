#!/bin/bash
# ==============================================================================
# Gemini Synapse - Termux (Binary Deployment)
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

# --- 全局变量 ---
APP_DIR="synapse_app"
BINARY_NAME="synapse_termux"
BINARY_PATH="${APP_DIR}/${BINARY_NAME}"

# --- 核心功能函数 ---
download_binary() {
  echo -e "\n${BLUE}正在下载最新的可执行文件到 '${APP_DIR}'...${NC}"
  mkdir -p "${APP_DIR}" # 确保目录存在
  local download_url="https://github.com/LiquorXR/gemini-synapse/releases/download/app/synapse_termux"
  
  # 使用 curl 下载文件
  if command -v curl &>/dev/null; then
    curl -L -o "${BINARY_PATH}" "$download_url"
  # 如果 curl 不可用，尝试使用 wget
  elif command -v wget &>/dev/null; then
    wget -O "${BINARY_PATH}" "$download_url"
  else
    echo -e "${RED}错误: curl 和 wget 都未安装。无法下载文件。${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}下载完成。${NC}"
  echo -e "${BLUE}正在授予执行权限...${NC}"
  chmod +x "${BINARY_PATH}"
  echo -e "${GREEN}权限授予完成。${NC}"
}

start_service() {
  if [ ! -f "${BINARY_PATH}" ]; then
      echo -e "${RED}错误: 未找到 '${BINARY_PATH}' 可执行文件。${NC}"
      read -p "是否立即下载? (Y/n): " confirm < /dev/tty
      if [[ "$confirm" == "y" || "$confirm" == "Y" || "$confirm" == "" ]]; then
          download_binary
      else
          echo -e "${YELLOW}用户取消操作，返回主菜单。${NC}"
          return 1
      fi
  fi

  # --- 端口设置 ---
  local port
  read -p "请输入启动的端口号 (默认为 8008): " port < /dev/tty
  # 如果用户未输入，则使用默认端口 8008
  if [ -z "$port" ]; then
    port=8008
  fi
  
  echo -e "\n${GREEN}===================================================${NC}"
  echo -e "${GREEN}${BOLD}启动应用程序...${NC}"
  echo -e "${GREEN}===================================================${NC}"
  
  echo -e "您可以通过以下地址访问服务:"
  echo -e "  - ${BOLD}API 代理地址:${NC} http://127.0.0.1:${port}"
  echo -e "  - ${BOLD}Web 管理面板:${NC} http://127.0.0.1:${port}"
  echo -e "\n${YELLOW}按 ${BOLD}Ctrl+C${NC} 组合键来停止服务。${NC}\n"

  # 切换到应用目录并执行，以确保它能找到 .env 和 data.db
  (cd "${APP_DIR}" && PORT="${port}" ./"${BINARY_NAME}")
}

# --- 主菜单 ---
show_main_menu() {
  while true; do
    clear # 清屏以获得更好的视觉效果
    echo -e "${GREEN}   ██████╗  ███████╗ ███╗   ███╗ ██╗ ███╗   ██╗ ██╗${NC}"
    echo -e "${GREEN}  ██╔════╝  ██╔════╝ ████╗ ████║ ██║ ████╗  ██║ ██║${NC}"
    echo -e "${GREEN}  ██║  ███╗ █████╗   ██╔████╔██║ ██║ ██╔██╗ ██║ ██║${NC}"
    echo -e "${GREEN}  ██║   ██║ ██╔══╝   ██║╚██╔╝██║ ██║ ██║╚██╗██║ ██║${NC}"
    echo -e "${GREEN}  ╚██████╔╝ ███████╗ ██║ ╚═╝ ██║ ██║ ██║ ╚████║ ██║${NC}"
    echo -e "${GREEN}   ╚═════╝  ╚══════╝ ╚═╝     ╚═╝ ╚═╝ ╚═╝  ╚═══╝ ╚═╝${NC}"
    echo -e "${GREEN}  ███████╗██╗   ██╗███╗   ██╗ █████╗ ███████╗ ███████╗███████╗${NC}"
    echo -e "${GREEN}  ██╔════╝╚██╗ ██╔╝████╗  ██║██╔══██╗██╔═══██╗██╔════╝██╔════╝${NC}"
    echo -e "${GREEN}  ███████╗ ╚████╔╝ ██╔██╗ ██║███████║███████╔╝███████╗█████╗  ${NC}"
    echo -e "${GREEN}  ╚════██║  ╚██╔╝  ██║╚██╗██║██╔══██║██╔════╝ ╚════██║██╔══╝  ${NC}"
    echo -e "${GREEN}  ███████║   ██║   ██║ ╚████║██║  ██║██║      ███████║███████╗${NC}"
    echo -e "${GREEN}  ╚══════╝   ╚═╝   ╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝      ╚══════╝╚══════╝${NC}"
    echo -e "${BLUE}=========================================================${NC}"
    echo -e "              ${BOLD}executable file for Termux${NC}"
    echo -e "${BLUE}=========================================================${NC}"
    echo -e "  ${BOLD}[1]${NC} ${GREEN}启动服务${NC}  --- 启动 Gemini Synapse 服务"
    echo -e "  ${BOLD}[2]${NC} ${BLUE}更新应用${NC}  --- 下载最新的可执行文件"
    echo -e "  ${BOLD}[3]${NC} ${YELLOW}退出脚本${NC}  --- 关闭脚本"
    echo -e "${BLUE}=========================================================${NC}"
    read -p "请输入选项 [1-3]: " menu_choice < /dev/tty

    case $menu_choice in
      1)
        start_service || true
        echo -e "\n${YELLOW}服务已停止。${NC}"
        read -p "按任意键返回主菜单..." -n 1 -s < /dev/tty
        ;;
      2)
        download_binary || true
        read -p $'\n'"按任意键返回主菜单..." -n 1 -s < /dev/tty
        ;;
      3)
        echo "正在退出脚本。"
        exit 0
        ;;
      *)
        echo -e "${RED}无效选项，请输入 1-3 之间的数字。${NC}"
        sleep 2
        ;;
    esac
  done
}


# --- 脚本执行入口 ---
main() {
  setup_colors

  # 确保应用目录存在
  mkdir -p "${APP_DIR}"

  # 检查可执行文件是否存在
  if [ ! -f "${BINARY_PATH}" ]; then
    echo -e "${YELLOW}未找到 '${BINARY_PATH}' 可执行文件。${NC}"
    read -p "是否立即下载? (Y/n): " confirm
    if [[ "$confirm" == "y" || "$confirm" == "Y" || "$confirm" == "" ]]; then
      download_binary
    else
      echo -e "${RED}用户取消，脚本退出。${NC}"
      exit 1
    fi
  fi
  
  # 进入主菜单
  show_main_menu
}

main "$@"