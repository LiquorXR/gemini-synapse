import logging
import httpx
import asyncio
import aiosqlite
import os
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from api.database import config_manager, DATABASE_URL, key_manager
from api.admin import validate_gemini_key

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class JobService:
    def __init__(self, db_url=DATABASE_URL):
        self.db_url = db_url

    async def get_invalid_keys_for_validation(self):
        """获取数据库中所有标记为无效的密钥进行验证"""
        async with aiosqlite.connect(self.db_url) as db:
            cursor = await db.execute("SELECT id, key FROM api_keys WHERE is_valid = 0")
            return await cursor.fetchall()

    async def delete_old_logs(self, retention_days: int, table_name: str):
        """从指定表中删除超过保留期限的日志（限制在白名单表名内）。"""
        allowed_tables = {"error_logs", "api_call_history"}
        if table_name not in allowed_tables:
            logger.warning(f"Attempt to delete from non-allowed table: {table_name}. Skipped.")
            return 0
        async with aiosqlite.connect(self.db_url) as db:
            # 使用参数占位符仅绑定保留天数，表名使用白名单硬编码避免注入
            sql = f"DELETE FROM {table_name} WHERE timestamp < datetime('now', ?)"
            cursor = await db.execute(sql, (f"-{retention_days} days",))
            await db.commit()
            logger.info(f"Deleted {cursor.rowcount} old records from {table_name}.")
            return cursor.rowcount

job_service = JobService()

async def validate_and_update_key(client, key_value, model):
    """验证单个密钥并使用 KeyManager 更新数据库以确保日志记录"""
    is_valid, status_code, message = await validate_gemini_key(client, key_value, model)
    if is_valid:
        # 使用 KeyManager 记录成功，它会重置失败计数并记录调用
        await key_manager.record_success(key_value, model)
    else:
        # 使用 KeyManager 记录失败，它会增加失败计数、可能使密钥失效，并记录错误
        await key_manager.record_failure(key_value, model, status_code, message)

async def scheduled_key_validation():
    """定时任务：仅验证标记为无效的密钥。"""
    logger.info("Starting scheduled job: scheduled_key_validation for invalid keys")
    keys_to_validate = await job_service.get_invalid_keys_for_validation()
    total_keys = len(keys_to_validate)
    if not keys_to_validate:
        return

    validation_model = await config_manager.get_config("VALIDATION_MODEL")
    if not validation_model:
        validation_model = "gemini-2.5-flash-lite-preview-06-17"  # Fallback to default
        logger.warning(f"VALIDATION_MODEL not set in config, falling back to default: {validation_model}")

    batch_size = 10
    async with httpx.AsyncClient() as client:
        for i in range(0, total_keys, batch_size):
            batch = keys_to_validate[i:i + batch_size]
            logger.info(f"Validating batch {i//batch_size + 1}/{(total_keys + batch_size - 1)//batch_size} ({len(batch)} keys)...")
            tasks = [validate_and_update_key(client, key_value, validation_model) for _, key_value in batch]
            await asyncio.gather(*tasks)
            if i + batch_size < total_keys:
                await asyncio.sleep(0.5)  # 在批次之间短暂休息0.5秒，增加稳定性

    logger.info(f"Finished validating {total_keys} keys.")

async def cleanup_error_logs():
    """定时任务：清理旧的错误日志"""
    logger.info("Starting scheduled job: cleanup_error_logs")
    retention_days_str = await config_manager.get_config("ERROR_LOG_RETENTION_DAYS")
    if retention_days_str:
        await job_service.delete_old_logs(int(retention_days_str), "error_logs")
    else:
        logger.warning("ERROR_LOG_RETENTION_DAYS not configured. Skipping cleanup.")

async def cleanup_request_logs():
    """定时任务：清理旧的请求日志"""
    logger.info("Starting scheduled job: cleanup_request_logs")
    retention_days_str = await config_manager.get_config("REQUEST_LOG_RETENTION_DAYS")
    if retention_days_str:
        await job_service.delete_old_logs(int(retention_days_str), "api_call_history")
    else:
        logger.warning("REQUEST_LOG_RETENTION_DAYS not configured. Skipping cleanup.")

async def cleanup_expired_sessions():
    """定时任务：清理数据库中所有已过期的管理员会话。"""
    logger.info("Starting scheduled job: cleanup_expired_sessions")
    async with aiosqlite.connect(DATABASE_URL) as db:
        # 直接删除 expires_at 早于当前时间的记录
        cursor = await db.execute(
            "DELETE FROM admin_sessions WHERE expires_at < ?",
            (datetime.now(timezone.utc).isoformat(),)
        )
        await db.commit()
        if cursor.rowcount > 0:
            logger.info(f"Cleaned up {cursor.rowcount} expired admin sessions.")


# --- 调度器设置与控制 ---
scheduler = None
# 在单进程模式下，主进程自动成为领导者。

def _is_process_leader():
    """在单进程模式下，当前进程始终是领导者。"""
    logger.info(f"Running in single-process mode. Process {os.getpid()} is the leader.")
    return True

async def get_scheduler():
    global scheduler
    if scheduler is None:
        timezone = await config_manager.get_config("SCHEDULER_TIMEZONE") or "Asia/Shanghai"
        scheduler = AsyncIOScheduler(timezone=timezone)
    return scheduler

async def setup_scheduler():
    """添加所有任务到调度器。"""
    sch = await get_scheduler()
    
    # Clear existing jobs to prevent duplicates on re-setup
    sch.remove_all_jobs()

    interval_hours_str = await config_manager.get_config("KEY_VALIDATION_INTERVAL_HOURS")
    try:
        interval_value = int(interval_hours_str) if interval_hours_str is not None else 1
    except (TypeError, ValueError):
        logger.warning(
            "Invalid KEY_VALIDATION_INTERVAL_HOURS value: %r. Falling back to 1 hour.",
            interval_hours_str,
        )
        interval_value = 1
    # Enforce a sensible lower bound to avoid too-frequent scheduling and perceived duplicates
    interval_hours = max(1, interval_value)
    
    sch.add_job(
        scheduled_key_validation,
        "interval",
        hours=interval_hours,
        id="scheduled_key_validation_job",
        misfire_grace_time=None,
        coalesce=True,
    )
    sch.add_job(
        cleanup_error_logs,
        "cron",
        hour=3,
        minute=0,
        id="cleanup_error_logs_job",
        misfire_grace_time=None,
        coalesce=True,
    )
    sch.add_job(
        cleanup_request_logs,
        "cron",
        hour=3,
        minute=5,
        id="cleanup_request_logs_job",
        misfire_grace_time=None,
        coalesce=True,
    )
    sch.add_job(
        cleanup_expired_sessions,
        "cron",
        hour=3,
        minute=10,
        id="cleanup_expired_sessions_job",
        misfire_grace_time=None,
        coalesce=True,
    )
    logger.info(
        "Scheduler jobs configured with misfire_grace_time=None and coalesce=True."
    )


async def start_scheduler():
    """启动调度器，但仅在当前进程是“领导者”时启动。"""
    if not _is_process_leader():
        return

    sch = await get_scheduler()
    if not sch.running:
        await setup_scheduler()
        sch.start()
        logger.info(f"Scheduler started in process {os.getpid()}.")
    else:
        logger.info(f"Scheduler is already running in process {os.getpid()}.")

def stop_scheduler():
    """停止调度器。"""
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown()
        logger.info(f"Scheduler stopped in process {os.getpid()}.")

async def restart_scheduler():
    """重启调度器以应用新配置"""
    logger.info("Restarting scheduler to apply new settings...")
    stop_scheduler()
    # Reset scheduler instance to reload timezone
    global scheduler
    scheduler = None
    await start_scheduler()
    logger.info("Scheduler restarted.")