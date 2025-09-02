import uvicorn
import os
import sys
from dotenv import load_dotenv

from colorama import init

# --- 默认 .env 文件内容 ---
# 这个字符串包含了首次启动时要写入 .env 文件的默认配置。
# 它被硬编码到程序中，使得程序无需依赖外部的 .env.example 文件。
DEFAULT_ENV_CONTENT = """# --- 应用环境 ---
# 设置为 "production" 以在 HTTPS 环境下启用安全的 Cookie 策略
# 设置为 "development" (或留空) 以在本地 HTTP 环境下进行调试
ENVIRONMENT="development"

# 访问此代理服务所需的密钥，可以设置多个，用英文逗号分隔
ACCESS_KEY="sk-123456"

# 登录Web管理后台所需的密钥
ADMIN_KEY="gemini"

# 您的 Google Gemini API 密钥，以逗号分隔
GOOGLE_API_KEYS="your_gemini_key_1,your_gemini_key_2"

# 数据库文件路径
DATABASE_URL="data.db"
"""

if __name__ == '__main__':
    # --- 初始化 colorama ---
    # 这允许在 Windows 的 cmd.exe 中显示带颜色的输出
    init(autoreset=True)

    # --- 环境变量和配置文件管理 ---
    # 确定应用程序的根目录。在开发模式下，它是项目文件夹；
    # 在打包后（通过 PyInstaller），它是可执行文件所在的文件夹。
    if getattr(sys, 'frozen', False):
        # 如果程序是被打包的
        application_path = os.path.dirname(sys.executable)
    else:
        # 如果是在开发环境中运行
        application_path = os.path.abspath(".")

    # 定义 .env 文件的最终路径
    dotenv_path = os.path.join(application_path, '.env')

    # 检查 .env 文件是否存在于可执行文件旁边
    if not os.path.exists(dotenv_path):
        try:
            # 如果 .env 文件不存在，则使用硬编码的默认内容创建它
            with open(dotenv_path, 'w', encoding='utf-8') as f:
                f.write(DEFAULT_ENV_CONTENT)
        except Exception:
            # 如果创建失败，则静默处理，让后续流程处理缺失的环境变量
            pass

    # 从最终确定的路径加载 .env 文件（无论是已存在的还是新创建的）
    load_dotenv(dotenv_path=dotenv_path)

    # --- 读取配置 ---
    # 从环境变量中获取 HOST 和 PORT，并提供默认值
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8008))

    print(f"--- Gemini Synapse ---")
    print(f"服务启动将监听在: {host}:{port}")
    
    # --- 启动 Uvicorn 服务 ---
    # "api.index:app" 指的是 api/index.py 文件中的 app 实例
    # reload=False 在生产/打包环境中是必须的
    uvicorn.run("api.index:app", host=host, port=port, reload=False)