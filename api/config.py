import os
from dotenv import load_dotenv

# 从 .env 文件加载环境变量，并强制覆盖任何已存在的系统环境变量
load_dotenv(override=True)

# --- 应用环境 ---
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")

# --- 数据库管理的密钥 ---
# 下面的 ACCESS_KEY 和 ADMIN_KEY 仅用于在数据库首次初始化时植入初始值。
# 在那之后，系统将从数据库读取这些值，.env 文件中的设置将被忽略。
ACCESS_KEY_ENV = os.environ.get("ACCESS_KEY", "")
ACCESS_KEY = [key.strip() for key in ACCESS_KEY_ENV.split(',') if key.strip()]
ADMIN_KEY = os.environ.get("ADMIN_KEY")

# --- 环境变量管理的密钥/配置 ---
# Google API 密钥列表，用于首次初始化数据库
GOOGLE_API_KEYS = os.environ.get('GOOGLE_API_KEYS', '')

# 数据库文件路径
DATABASE_URL = os.environ.get("DATABASE_URL", "data.db")

# Google Gemini API 的基础 URL
GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# 密钥最大失败次数
MAX_FAILURE_COUNT = 5

# 最大重试次数
MAX_RETRY_COUNT = 3

# --- 定时任务设置 ---
# 默认的验证模型
VALIDATION_MODEL = os.environ.get("VALIDATION_MODEL", "gemini-2.5-flash-lite")
# 验证密钥的间隔（小时）
KEY_VALIDATION_INTERVAL_HOURS = int(os.environ.get("KEY_VALIDATION_INTERVAL_HOURS", 1))
# 调度器时区
SCHEDULER_TIMEZONE = os.environ.get("SCHEDULER_TIMEZONE", "Asia/Shanghai")
# 错误日志保留天数
ERROR_LOG_RETENTION_DAYS = int(os.environ.get("ERROR_LOG_RETENTION_DAYS", 15))
# 请求日志保留天数
REQUEST_LOG_RETENTION_DAYS = int(os.environ.get("REQUEST_LOG_RETENTION_DAYS", 30))
