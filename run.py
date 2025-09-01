import uvicorn
import os
import sys
from dotenv import load_dotenv

# --- 处理打包后的路径问题 ---
# 当程序被 PyInstaller 打包后，它的资源文件（如 .env, frontend/）会被放在一个临时目录中。
# 这个函数帮助我们在开发环境和打包后的环境中都能正确找到文件。
def resource_path(relative_path):
    """ 获取资源的绝对路径，兼容开发环境和 PyInstaller 打包环境 """
    try:
        # PyInstaller 创建一个临时文件夹，并把路径存储在 _MEIPASS 中
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)

if __name__ == '__main__':
    # --- 加载环境变量 ---
    # 我们需要告诉脚本去哪里找 .env 文件。
    # resource_path('.') 会指向打包后的根目录或当前目录。
    dotenv_path = os.path.join(resource_path('.'), '.env')
    
    # 如果打包后的 .env 文件存在，则加载它
    if os.path.exists(dotenv_path):
        load_dotenv(dotenv_path=dotenv_path)
    else:
        # 作为备选，如果是在开发环境中运行，则加载当前目录的 .env
        load_dotenv()

    # --- 读取配置 ---
    # 从环境变量中获取 HOST 和 PORT，并提供默认值
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8008))

    print(f"--- Gemini Synapse ---")
    print(f"服务正在启动，请在浏览器中访问: http://127.0.0.1:{port}")
    print(f"服务将监听在: {host}:{port}")
    print("按 Ctrl+C 停止服务。")
    
    # --- 启动 Uvicorn 服务 ---
    # "api.index:app" 指的是 api/index.py 文件中的 app 实例
    # reload=False 在生产/打包环境中是必须的
    uvicorn.run("api.index:app", host=host, port=port, reload=False)