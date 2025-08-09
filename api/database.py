import asyncio
import aiosqlite
import logging
from collections import deque
from zoneinfo import ZoneInfo
from api.config import (
    DATABASE_URL, GOOGLE_API_KEYS, ACCESS_KEY, ADMIN_KEY, MAX_FAILURE_COUNT,
    MAX_RETRY_COUNT, GEMINI_API_BASE_URL, VALIDATION_MODEL, KEY_VALIDATION_INTERVAL_HOURS,
    SCHEDULER_TIMEZONE, ERROR_LOG_RETENTION_DAYS, REQUEST_LOG_RETENTION_DAYS
)
from api.exceptions import AllKeysFailedError

class ConfigManager:
    """
    管理存储在数据库中的持久化配置项 (e.g., ACCESS_KEY, ADMIN_KEY).
    这是一个单例模式的实现。
    """
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(ConfigManager, cls).__new__(cls)
        return cls._instance

    def __init__(self, db_url=DATABASE_URL):
        if hasattr(self, '_initialized') and self._initialized:
            return
        self.db_url = db_url
        # 批量更新深度与调度器重启防抖任务
        self._bulk_depth = 0
        self._debounce_task: asyncio.Task | None = None
        self._initialized = True
        logging.info("ConfigManager initialized.")

    def begin_bulk_update(self):
        """开始批量更新：抑制期间的调度器重启。"""
        self._bulk_depth += 1

    async def end_bulk_update(self, restart: bool = False):
        """结束批量更新：需要时仅重启一次调度器。"""
        self._bulk_depth = max(0, self._bulk_depth - 1)
        if restart and self._bulk_depth == 0:
            from api.scheduler import restart_scheduler
            asyncio.create_task(restart_scheduler())

    def _schedule_debounced_restart(self, delay: float = 0.5):
        """在短时间内合并多次重启请求，仅重启一次。"""
        if self._debounce_task and not self._debounce_task.done():
            self._debounce_task.cancel()

        async def _debounced():
            try:
                await asyncio.sleep(delay)
                from api.scheduler import restart_scheduler
                await restart_scheduler()
            except asyncio.CancelledError:
                pass

        self._debounce_task = asyncio.create_task(_debounced())

    async def get_config(self, key: str) -> str | None:
        """从数据库获取一个配置项的值"""
        async with aiosqlite.connect(self.db_url) as db:
            cursor = await db.execute("SELECT value FROM config_settings WHERE key = ?", (key,))
            row = await cursor.fetchone()
            return row[0] if row else None

    async def set_config(self, key: str, value: str):
        """在数据库中设置一个配置项的值，并在必要时重启调度器"""
        async with aiosqlite.connect(self.db_url) as db:
            await db.execute(
                "INSERT INTO config_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value)
            )
            await db.commit()
            logging.info(f"Persisted config for key='{key}'.")

        # 如果更新的是调度器相关的配置，则触发重启
        scheduler_keys = [
            "VALIDATION_MODEL",
            "KEY_VALIDATION_INTERVAL_HOURS",
            "SCHEDULER_TIMEZONE",
            "ERROR_LOG_RETENTION_DAYS",
            "REQUEST_LOG_RETENTION_DAYS"
        ]
        if key in scheduler_keys:
            if self._bulk_depth > 0:
                # 批量更新模式下，不在每次 set 时重启
                return
            logging.info(f"Scheduler-related config '{key}' changed. Debouncing scheduler restart.")
            self._schedule_debounced_restart(delay=0.5)

class KeyManager:
    """
    封装了所有与 API 密钥相关的数据库操作和内存池管理。
    这是一个单例模式的实现，以确保在整个应用中只有一个密钥管理器实例。
    """
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(KeyManager, cls).__new__(cls)
        return cls._instance

    def __init__(self, db_url=DATABASE_URL, initial_keys=GOOGLE_API_KEYS, pool_size=30):
        # 防止重复初始化
        if hasattr(self, '_initialized') and self._initialized:
            return
            
        self.db_url = db_url
        self.initial_keys = initial_keys
        self.pool_size = pool_size
        
        self.key_queue = deque()
        # 在单进程模式下，使用内存锁 (asyncio.Lock) 以获得最佳性能
        self.refill_lock = asyncio.Lock()
        # 添加一个专用的数据库写操作锁，以防止并发写入导致的 "database is locked" 错误
        self.db_write_lock = asyncio.Lock()
        self._initialized = True
        logging.info("KeyManager initialized.")

    async def _refill_key_pool(self):
        """
        从数据库填充密钥池。在一个事务中完成，以保证原子性。
        """
        async with self.db_write_lock:
            async with aiosqlite.connect(self.db_url) as db:
                async with db.execute("BEGIN IMMEDIATE"):
                    cursor = await db.execute("""
                        SELECT id, key FROM api_keys
                        WHERE is_valid = 1
                        ORDER BY last_used ASC, id ASC
                        LIMIT ?
                    """, (self.pool_size,))
                    rows = await cursor.fetchall()

                    if not rows:
                        return

                    key_ids = [row[0] for row in rows]
                    keys = [row[1] for row in rows]

                    placeholders = ','.join('?' for _ in key_ids)
                    await db.execute(f"""
                        UPDATE api_keys
                        SET last_used = CURRENT_TIMESTAMP
                        WHERE id IN ({placeholders})
                    """, tuple(key_ids))
                    await db.commit()

                    for key in keys:
                        self.key_queue.append(key)
                    logging.info(f"Refilled pool with {len(keys)} keys.")

    async def get_key(self) -> str:
        """
        从内存池中获取一个密钥。如果池为空，则触发填充。
        如果数据库中也没有可用密钥，则抛出 AllKeysFailedError。
        """
        if not self.key_queue:
            try:
                # 获取内存锁
                await self.refill_lock.acquire()
                # 再次检查，因为在等待锁的时候可能已经被其他协程填充了
                if not self.key_queue:
                    logging.info("Key pool is empty. Refilling from database...")
                    await self._refill_key_pool()
            finally:
                # 释放内存锁
                self.refill_lock.release()

        if not self.key_queue:
            logging.error("Database contains no valid keys to refill the pool.")
            raise AllKeysFailedError()

        return self.key_queue.popleft()

    async def initialize_from_env(self):
        """只有当数据库为空时，才从环境变量同步初始密钥"""
        async with aiosqlite.connect(self.db_url) as db:
            cursor = await db.execute("SELECT COUNT(*) FROM api_keys")
            count = await cursor.fetchone()
            if count[0] == 0:
                logging.info("Database is empty. Seeding GOOGLE_API_KEYS from environment variable...")
                if self.initial_keys:
                    keys = [key.strip() for key in self.initial_keys.split(',') if key.strip()]
                    for key in keys:
                        await self.add_key(key)
            else:
                logging.info("Database already contains keys. Skipping seed from environment variable.")

    async def prewarm_pool(self):
        """预热密钥池"""
        logging.info("Pre-warming key pool...")
        await self._refill_key_pool()

    async def add_key(self, key: str):
        """向数据库中添加一个新的 API 密钥，如果它不存在的话"""
        async with self.db_write_lock:
            async with aiosqlite.connect(self.db_url) as db:
                cursor = await db.execute("""
                    INSERT INTO api_keys (key) VALUES (?)
                    ON CONFLICT(key) DO UPDATE SET
                        is_valid = 1,
                        failure_count = 0,
                        last_used = NULL
                """, (key,))
                await db.commit()
                if cursor.rowcount > 0:
                    logging.info(f"Upserted and activated key: ...{key[-4:]}")

    async def record_failure(self, key: str, model_name: str | None = None, status_code: int | None = None, error_message: str | None = None):
        """
        记录一次密钥失败。如果连续失败次数达到阈值，则将其标记为无效。
        同时，将详细的错误信息记录到 error_logs 表中。
        """
        import datetime
        max_failure_count_str = await config_manager.get_config("MAX_FAILURE_COUNT")
        max_failure_count = int(max_failure_count_str)

        # If model_name is not provided, try to get it from config
        if not model_name:
            model_name = await config_manager.get_config("VALIDATION_MODEL")

        async with self.db_write_lock:
            async with aiosqlite.connect(self.db_url) as db:
                async with db.execute("BEGIN"):
                    # 1. 获取密钥 ID 和当前的失败次数
                    cursor = await db.execute("SELECT id, failure_count FROM api_keys WHERE key = ?", (key,))
                    row = await cursor.fetchone()
                    if not row:
                        logging.warning(f"Attempted to record failure for a key that does not exist: {key}")
                        return

                    key_id, current_failures = row
                    new_failures = current_failures + 1

                    # 2. 更新密钥状态
                    if new_failures >= max_failure_count:
                        await db.execute("UPDATE api_keys SET is_valid = 0, failure_count = ? WHERE id = ?", (new_failures, key_id))
                        logging.warning(f"Key ...{key[-4:]} (ID: {key_id}) has been invalidated after {new_failures} failures.")
                    else:
                        await db.execute("UPDATE api_keys SET failure_count = ? WHERE id = ?", (new_failures, key_id))
                        logging.info(f"Recorded failure {new_failures}/{max_failure_count} for key ...{key[-4:]} (ID: {key_id}).")

                    # 3. 插入错误日志
                    if status_code and error_message:
                        await db.execute(
                            "INSERT INTO error_logs (key_id, model_name, identification_code, error_message) VALUES (?, ?, ?, ?)",
                            (key_id, model_name, status_code, error_message)
                        )
                        logging.info(f"Logged error for key ID {key_id}: Status {status_code}")

                    # 4. 记录调用历史 (与 record_success 相同)
                    if model_name:
                        await db.execute(
                            "INSERT INTO api_call_history (key_id, model_name, identification_code) VALUES (?, ?, ?)",
                            (key_id, model_name, status_code)
                        )

                    # 5. 更新月度统计 (与 record_success 相同)
                    current_month = datetime.datetime.now(ZoneInfo("Asia/Shanghai")).strftime('%Y-%m')
                    await db.execute("""
                        INSERT INTO monthly_stats (year_month, call_count) VALUES (?, 1)
                        ON CONFLICT(year_month) DO UPDATE SET call_count = call_count + 1
                    """, (current_month,))

                await db.commit()

    async def log_request_failure(self, key: str, model_name: str | None, status_code: int, error_message: str):
        """
        纯粹地记录一次请求失败到 error_logs，不影响密钥的失败计数或有效状态。
        这用于记录那些被内部重试机制处理的临时性失败。
        """
        async with self.db_write_lock:
            async with aiosqlite.connect(self.db_url) as db:
                cursor = await db.execute("SELECT id FROM api_keys WHERE key = ?", (key,))
                row = await cursor.fetchone()
                if not row:
                    logging.warning(f"Attempted to log failure for a key that does not exist: {key}")
                    return
                
                key_id = row[0]
                await db.execute(
                    "INSERT INTO error_logs (key_id, model_name, identification_code, error_message) VALUES (?, ?, ?, ?)",
                    (key_id, model_name, status_code, error_message)
                )
                await db.commit()
                logging.info(f"Logged temporary failure for key ID {key_id}: Status {status_code}")

    async def record_success(self, key: str, model_name: str | None):
        """
        在密钥成功使用后，重置其失败计数，记录模型调用历史，并更新月度统计。
        """
        import datetime

        async with self.db_write_lock:
            async with aiosqlite.connect(self.db_url) as db:
                async with db.execute("BEGIN"):
                    # 1. 重置失败计数
                    await db.execute("UPDATE api_keys SET failure_count = 0 WHERE key = ? AND failure_count > 0", (key,))
                    
                    # 2. 记录详细调用历史 (仅当模型名称存在时)
                    if model_name:
                        cursor = await db.execute("SELECT id FROM api_keys WHERE key = ?", (key,))
                        row = await cursor.fetchone()
                        if row:
                            key_id = row[0]
                            await db.execute(
                                "INSERT INTO api_call_history (key_id, model_name, identification_code) VALUES (?, ?, ?)",
                                (key_id, model_name, 200)
                            )
                    
                    # 3. 更新月度统计计数器
                    current_month = datetime.datetime.now(ZoneInfo("Asia/Shanghai")).strftime('%Y-%m')
                    await db.execute("""
                        INSERT INTO monthly_stats (year_month, call_count) VALUES (?, 1)
                        ON CONFLICT(year_month) DO UPDATE SET call_count = call_count + 1
                    """, (current_month,))

                await db.commit()

async def initialize_database():
    """初始化所有数据库相关的管理器和表"""
    logging.info("Initializing database...")
    async with aiosqlite.connect(DATABASE_URL) as db:
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL UNIQUE,
                is_valid BOOLEAN NOT NULL DEFAULT 1,
                failure_count INTEGER NOT NULL DEFAULT 0,
                last_used TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS api_call_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_id INTEGER NOT NULL,
                model_name TEXT,
                identification_code INTEGER,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (key_id) REFERENCES api_keys (id) ON DELETE CASCADE
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS config_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS error_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_id INTEGER NOT NULL,
                model_name TEXT,
                identification_code INTEGER,
                error_message TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (key_id) REFERENCES api_keys (id) ON DELETE CASCADE
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS monthly_stats (
                year_month TEXT PRIMARY KEY,
                call_count INTEGER NOT NULL DEFAULT 0
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS admin_sessions (
                token TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON admin_sessions (expires_at)")
        # 为 api_keys 表添加索引以优化密钥获取性能
        await db.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_validation ON api_keys (is_valid, last_used)")
        await db.commit()

    # 在初始化期间，批量植入配置，避免多次重启调度器
    config_manager.begin_bulk_update()
    try:
        # 检查并植入 ACCESS_KEY
        access_key_in_db = await config_manager.get_config("ACCESS_KEY")
        if not access_key_in_db:
            logging.info("ACCESS_KEY not found in DB, seeding from environment.")
            if not ACCESS_KEY:
                raise ValueError("Cannot seed ACCESS_KEY: not found in environment.")
            # 将密钥列表转换为逗号分隔的字符串以便存储
            access_key_str = ",".join(ACCESS_KEY)
            await config_manager.set_config("ACCESS_KEY", access_key_str)

        # 检查并植入 ADMIN_KEY
        admin_key_in_db = await config_manager.get_config("ADMIN_KEY")
        if not admin_key_in_db:
            logging.info("ADMIN_KEY not found in DB, seeding from environment.")
            if not ADMIN_KEY:
                raise ValueError("Cannot seed ADMIN_KEY: not found in environment.")
            await config_manager.set_config("ADMIN_KEY", ADMIN_KEY)

        # 检查并植入 MAX_FAILURE_COUNT
        max_failure_count_in_db = await config_manager.get_config("MAX_FAILURE_COUNT")
        if not max_failure_count_in_db:
            logging.info("MAX_FAILURE_COUNT not found in DB, seeding from config file.")
            await config_manager.set_config("MAX_FAILURE_COUNT", str(MAX_FAILURE_COUNT))

        # 检查并植入 MAX_RETRY_COUNT
        max_retry_count_in_db = await config_manager.get_config("MAX_RETRY_COUNT")
        if not max_retry_count_in_db:
            logging.info("MAX_RETRY_COUNT not found in DB, seeding from config file.")
            await config_manager.set_config("MAX_RETRY_COUNT", str(MAX_RETRY_COUNT))

        # 检查并植入 GEMINI_API_BASE_URL
        api_base_url_in_db = await config_manager.get_config("GEMINI_API_BASE_URL")
        if not api_base_url_in_db:
            logging.info("GEMINI_API_BASE_URL not found in DB, seeding from config file.")
            await config_manager.set_config("GEMINI_API_BASE_URL", GEMINI_API_BASE_URL)

        # --- 植入定时任务相关的配置 ---
        # VALIDATION_MODEL
        validation_model_in_db = await config_manager.get_config("VALIDATION_MODEL")
        if not validation_model_in_db:
            logging.info("VALIDATION_MODEL not found in DB, seeding from config file.")
            await config_manager.set_config("VALIDATION_MODEL", VALIDATION_MODEL)

        # KEY_VALIDATION_INTERVAL_HOURS
        key_validation_interval_in_db = await config_manager.get_config("KEY_VALIDATION_INTERVAL_HOURS")
        if not key_validation_interval_in_db:
            logging.info("KEY_VALIDATION_INTERVAL_HOURS not found in DB, seeding from config file.")
            await config_manager.set_config("KEY_VALIDATION_INTERVAL_HOURS", str(KEY_VALIDATION_INTERVAL_HOURS))

        # SCHEDULER_TIMEZONE
        scheduler_timezone_in_db = await config_manager.get_config("SCHEDULER_TIMEZONE")
        if not scheduler_timezone_in_db:
            logging.info("SCHEDULER_TIMEZONE not found in DB, seeding from config file.")
            await config_manager.set_config("SCHEDULER_TIMEZONE", SCHEDULER_TIMEZONE)

        # ERROR_LOG_RETENTION_DAYS
        error_log_retention_in_db = await config_manager.get_config("ERROR_LOG_RETENTION_DAYS")
        if not error_log_retention_in_db:
            logging.info("ERROR_LOG_RETENTION_DAYS not found in DB, seeding from config file.")
            await config_manager.set_config("ERROR_LOG_RETENTION_DAYS", str(ERROR_LOG_RETENTION_DAYS))

        # REQUEST_LOG_RETENTION_DAYS
        request_log_retention_in_db = await config_manager.get_config("REQUEST_LOG_RETENTION_DAYS")
        if not request_log_retention_in_db:
            logging.info("REQUEST_LOG_RETENTION_DAYS not found in DB, seeding from config file.")
            await config_manager.set_config("REQUEST_LOG_RETENTION_DAYS", str(REQUEST_LOG_RETENTION_DAYS))

    finally:
        # 初始化阶段由应用生命周期统一启动调度器，无需重启
        await config_manager.end_bulk_update(restart=False)

    # 初始化 KeyManager
    await key_manager.initialize_from_env()
    await key_manager.prewarm_pool()

# 创建单例
config_manager = ConfigManager()
key_manager = KeyManager(pool_size=30)