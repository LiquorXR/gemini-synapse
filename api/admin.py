from fastapi import APIRouter, Depends, HTTPException
from typing import List
import aiosqlite
import asyncio
import httpx
from pydantic import BaseModel, Field
import datetime
from zoneinfo import ZoneInfo

from api.database import key_manager, config_manager, DATABASE_URL
from api.security import security_service
from api.utils import create_partial_key
from api.path_builder import build_upstream_url

# --- Pydantic 模型 ---
class APIKeyInfo(BaseModel):
    id: int
    key_partial: str
    is_valid: bool
    failure_count: int
    last_used: str | None

class NewAPIKey(BaseModel):
    key: str

class KeyStats(BaseModel):
    total_keys: int
    valid_keys: int
    invalid_keys: int

class CallStats(BaseModel):
    last_minute: int
    last_hour: int
    last_24_hours: int
    this_month: int

class AdminStats(BaseModel):
    key_stats: KeyStats
    call_stats: CallStats

class BatchKeyIDs(BaseModel):
    key_ids: List[int]

class BatchNewKeys(BaseModel):
    keys: List[str]

class RevealedKeysResponse(BaseModel):
    revealed_keys: dict[int, str]

class BatchDeleteByValue(BaseModel):
    keys: List[str]

class BatchAddResponse(BaseModel):
    message: str
    added_count: int

class BatchDeleteResponse(BaseModel):
    message: str
    deleted_count: int

class ModelCallDetail(BaseModel):
    model_name: str
    total_calls_24h: int

class ChartDataset(BaseModel):
    label: str
    data: List[int]

class TrendData(BaseModel):
    labels: List[str]
    datasets: List[ChartDataset]

class ConfigKeys(BaseModel):
    access_key_partial: str
    is_admin_key_set: bool

class NewAccessKey(BaseModel):
    key: str

class NewAdminKey(BaseModel):
    key: str

class ErrorLogEntry(BaseModel):
    id: int
    key_partial: str
    model_name: str | None
    identification_code: int | None
    error_message: str
    timestamp: str

class PaginatedErrorLogs(BaseModel):
    logs: List[ErrorLogEntry]
    total_pages: int
    current_page: int

class RequestLogEntry(BaseModel):
    id: int
    key_partial: str
    model_name: str | None
    identification_code: int | None
    timestamp: str

class PaginatedRequestLogs(BaseModel):
    logs: List[RequestLogEntry]
    total_pages: int
    current_page: int

class ApiConfig(BaseModel):
    api_base_url: str | None = Field(None, description="Google Gemini API 的基础 URL")
    max_failure_count: int | None = Field(None, ge=1, le=100, description="密钥最大失败次数")
    max_retry_count: int | None = Field(None, ge=1, le=20, description="最大重试次数")

class SchedulerConfig(BaseModel):
    validation_model: str
    validation_model_display_name: str | None = None
    validation_interval: int
    scheduler_timezone: str
    error_log_retention_days: int
    request_log_retention_days: int

class AvailableModel(BaseModel):
    name: str
    displayName: str

class DashboardData(BaseModel):
    stats: AdminStats
    keys: List[APIKeyInfo]
    access_keys: List[str]
    error_logs: PaginatedErrorLogs
    api_config: ApiConfig
    scheduler_config: SchedulerConfig
    config_keys: ConfigKeys
    trend_data: TrendData

# --- API 路由 ---
router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
    dependencies=[Depends(security_service.verify_admin_key_from_cookie)]
)

@router.get("/dashboard-data", response_model=DashboardData)
async def get_dashboard_data():
    """获取仪表盘的所有数据，用于优化前端加载性能"""
    # 使用 asyncio.gather 并发执行所有数据获取任务
    results = await asyncio.gather(
        get_access_keys(),
        get_error_logs(page=1, size=50), # 获取第一页的错误日志
        get_api_config(),
        get_scheduler_config(),
        get_config_keys(),
        get_all_keys_internal(),
        get_admin_stats_internal(),
        get_stats_trend_internal(days=7) # 获取7天趋势数据
    )
    
    # 解包结果
    access_keys, error_logs, api_config, scheduler_config, config_keys, keys, stats, trend_data = results
    
    return DashboardData(
        stats=stats,
        keys=keys,
        access_keys=access_keys,
        error_logs=error_logs,
        api_config=api_config,
        scheduler_config=scheduler_config,
        config_keys=config_keys,
        trend_data=trend_data
    )

async def get_admin_stats_internal():
    """内部函数：获取仪表盘的统计数据"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        # Key Stats
        cursor = await db.execute("SELECT COUNT(*), SUM(CASE WHEN is_valid = 1 THEN 1 ELSE 0 END) FROM api_keys")
        total, valid = await cursor.fetchone()
        total = total or 0
        valid = valid or 0
        key_stats = KeyStats(total_keys=total, valid_keys=valid, invalid_keys=total - valid)

        # Call Stats
        now = datetime.datetime.utcnow()
        # 月度统计需要基于上海时区
        current_month_str = datetime.datetime.now(ZoneInfo("Asia/Shanghai")).strftime('%Y-%m')

        # 1. 获取本月调用次数 (从新的聚合表)
        cursor = await db.execute("SELECT call_count FROM monthly_stats WHERE year_month = ?", (current_month_str,))
        this_month_row = await cursor.fetchone()
        this_month_calls = this_month_row[0] if this_month_row else 0

        # 2. 获取短期调用次数 (直接从数据库 COUNT)
        # 使用参数化查询以防止 SQL 注入
        query = """
            SELECT
                (SELECT COUNT(*) FROM api_call_history WHERE timestamp > ?),
                (SELECT COUNT(*) FROM api_call_history WHERE timestamp > ?),
                (SELECT COUNT(*) FROM api_call_history WHERE timestamp > ?)
        """
        params = (
            now - datetime.timedelta(minutes=1),
            now - datetime.timedelta(hours=1),
            now - datetime.timedelta(days=1)
        )
        cursor = await db.execute(query, params)
        last_minute, last_hour, last_24_hours = await cursor.fetchone()

        call_stats = CallStats(
            last_minute=last_minute,
            last_hour=last_hour,
            last_24_hours=last_24_hours,
            this_month=this_month_calls
        )

    return AdminStats(key_stats=key_stats, call_stats=call_stats)

async def get_all_keys_internal():
    """内部函数：获取所有 API 密钥的脱敏信息"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        cursor = await db.execute("SELECT id, key, is_valid, failure_count, last_used FROM api_keys ORDER BY id ASC")
        rows = await cursor.fetchall()
        
        return [
            APIKeyInfo(
                id=r[0],
                key_partial=create_partial_key(r[1]),
                is_valid=r[2],
                failure_count=r[3],
                last_used=r[4]
            ) for r in rows
        ]

@router.post("/keys/batch-add", response_model=BatchAddResponse)
async def batch_add_keys(payload: BatchNewKeys):
    """批量添加新密钥，并过滤掉数据库中已存在的密钥"""
    if not payload.keys:
        return BatchAddResponse(message="No keys provided.", added_count=0)

    # 1. 获取数据库中所有现存的密钥
    async with aiosqlite.connect(DATABASE_URL) as db:
        cursor = await db.execute("SELECT key FROM api_keys")
        rows = await cursor.fetchall()
        existing_keys = {row[0] for row in rows}

    # 2. 过滤掉已经存在的密钥
    new_keys_to_add = [key.strip() for key in payload.keys if key.strip() and key.strip() not in existing_keys]
    
    added_count = len(new_keys_to_add)

    # 3. 只添加真正新的密钥
    if not new_keys_to_add:
        return BatchAddResponse(message="No new keys to add.", added_count=0)

    for key in new_keys_to_add:
        await key_manager.add_key(key)
        
    key_manager.key_queue.clear()
    return BatchAddResponse(message=f"Successfully added {added_count} keys.", added_count=added_count)

@router.post("/keys/reveal", response_model=RevealedKeysResponse)
async def reveal_keys(payload: BatchKeyIDs):
    """根据 ID 列表获取完整的密钥"""
    if not payload.key_ids:
        return RevealedKeysResponse(revealed_keys={})
    
    async with aiosqlite.connect(DATABASE_URL) as db:
        placeholders = ','.join('?' for _ in payload.key_ids)
        cursor = await db.execute(f"SELECT id, key FROM api_keys WHERE id IN ({placeholders})", payload.key_ids)
        rows = await cursor.fetchall()
        return RevealedKeysResponse(revealed_keys=dict(rows))

@router.get("/keys/{key_id}/details", response_model=List[ModelCallDetail])
async def get_key_call_details(key_id: int):
    """获取单个密钥在过去24小时内按模型分组的总调用详情"""
    day_ago = datetime.datetime.utcnow() - datetime.timedelta(days=1)
    
    async with aiosqlite.connect(DATABASE_URL) as db:
        cursor = await db.execute(
            """
            SELECT model_name, COUNT(*)
            FROM api_call_history
            WHERE key_id = ? AND timestamp > ? AND model_name IS NOT NULL
            GROUP BY model_name
            ORDER BY COUNT(*) DESC
            """,
            (key_id, day_ago)
        )
        rows = await cursor.fetchall()

    response = [
        ModelCallDetail(
            model_name=model,
            total_calls_24h=count
        ) for model, count in rows
    ]
    
    return response

async def get_stats_trend_internal(days: int) -> TrendData:
    """内部函数：获取指定天数范围内的 API 调用趋势数据，按模型分组"""
    end_time_utc = datetime.datetime.utcnow()
    
    if days == 1:
        start_time_utc = end_time_utc - datetime.timedelta(days=1)
        group_format = '%Y-%m-%d %H'
        label_format = '%H:00'
        time_unit = 'hours'
        range_count = 24
    else:
        start_time_utc = end_time_utc - datetime.timedelta(days=days)
        group_format = '%Y-%m-%d'
        label_format = '%m-%d'
        time_unit = 'days'
        range_count = days

    async with aiosqlite.connect(DATABASE_URL) as db:
        cursor = await db.execute(
            """
            SELECT
              strftime(?, timestamp, '+8 hours') as time_group, -- Convert to Shanghai time for grouping
              model_name,
              COUNT(*) as call_count
            FROM api_call_history
            WHERE timestamp >= ? AND model_name IS NOT NULL
            GROUP BY time_group, model_name
            """,
            (group_format, start_time_utc)
        )
        rows = await cursor.fetchall()

    # --- 数据透视 ---
    labels = []
    all_models = sorted(list(set(row[1] for row in rows)))
    
    pivoted_data = {model: {} for model in all_models}
    for row in rows:
        time_group, model_name, call_count = row
        if model_name in pivoted_data:
            pivoted_data[model_name][time_group] = call_count

    final_datasets = {model: [] for model in all_models}
    
    # Generate labels based on Shanghai time
    end_time_shanghai = end_time_utc + datetime.timedelta(hours=8)

    for i in range(range_count - 1, -1, -1):
        if time_unit == 'hours':
            current_time = end_time_shanghai - datetime.timedelta(hours=i)
        else:
            current_time = end_time_shanghai - datetime.timedelta(days=i)
        
        time_key = current_time.strftime(group_format)
        labels.append(current_time.strftime(label_format))
        
        for model in all_models:
            final_datasets[model].append(pivoted_data[model].get(time_key, 0))

    chart_datasets = [
        ChartDataset(label=model, data=data_points)
        for model, data_points in final_datasets.items()
    ]

    return TrendData(labels=labels, datasets=chart_datasets)

@router.get("/stats/trend", response_model=TrendData)
async def get_stats_trend(range: str = "7d"):
    """获取 API 模型调用趋势图数据"""
    if range == "1d":
        days = 1
    elif range == "30d":
        days = 30
    else:
        days = 7
    return await get_stats_trend_internal(days)

@router.delete("/keys/{key_id}", status_code=204)
async def delete_key(key_id: int):
    """删除一个 API 密钥"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        await db.execute("DELETE FROM api_keys WHERE id = ?", (key_id,))
        await db.commit()
    key_manager.key_queue.clear()
    return None

@router.post("/keys/batch-delete", response_model=BatchDeleteResponse)
async def batch_delete_keys(payload: BatchKeyIDs):
    """批量删除 API 密钥"""
    if not payload.key_ids:
        return BatchDeleteResponse(message="No keys provided.", deleted_count=0)
        
    async with aiosqlite.connect(DATABASE_URL) as db:
        placeholders = ','.join('?' for _ in payload.key_ids)
        cursor = await db.execute(f"DELETE FROM api_keys WHERE id IN ({placeholders})", payload.key_ids)
        await db.commit()
        deleted_count = cursor.rowcount
        
    key_manager.key_queue.clear()
    return BatchDeleteResponse(message=f"Successfully deleted {deleted_count} keys.", deleted_count=deleted_count)

@router.post("/keys/batch-delete-by-value")
async def batch_delete_keys_by_value(payload: BatchDeleteByValue):
    """根据密钥值批量删除 API 密钥"""
    if not payload.keys:
        raise HTTPException(status_code=400, detail="Key list cannot be empty.")
    
    async with aiosqlite.connect(DATABASE_URL) as db:
        placeholders = ','.join('?' for _ in payload.keys)
        cursor = await db.execute(f"DELETE FROM api_keys WHERE key IN ({placeholders})", payload.keys)
        await db.commit()
        deleted_count = cursor.rowcount
    
    key_manager.key_queue.clear()
    return {"message": f"Successfully deleted {deleted_count} keys.", "deleted_count": deleted_count}

@router.post("/keys/batch-deactivate", status_code=204)
async def batch_deactivate_keys(payload: BatchKeyIDs):
    """批量禁用密钥"""
    if not payload.key_ids:
        return
    async with aiosqlite.connect(DATABASE_URL) as db:
        placeholders = ','.join('?' for _ in payload.key_ids)
        await db.execute(f"UPDATE api_keys SET is_valid = 0 WHERE id IN ({placeholders})", payload.key_ids)
        await db.commit()
    key_manager.key_queue.clear()
    return None

@router.post("/keys/batch-reset", status_code=204)
async def batch_reset_keys(payload: BatchKeyIDs):
    """批量重置密钥（设为有效，失败计数清零）"""
    if not payload.key_ids:
        return
    async with aiosqlite.connect(DATABASE_URL) as db:
        placeholders = ','.join('?' for _ in payload.key_ids)
        await db.execute(f"UPDATE api_keys SET is_valid = 1, failure_count = 0 WHERE id IN ({placeholders})", payload.key_ids)
        await db.commit()
    key_manager.key_queue.clear()
    return None

@router.put("/keys/{key_id}/status", response_model=APIKeyInfo)
async def toggle_key_status(key_id: int):
    """手动切换一个密钥的 is_valid 状态"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        # First, get the current status
        cursor = await db.execute("SELECT is_valid FROM api_keys WHERE id = ?", (key_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Key not found.")
        
        new_status = not row[0]
        await db.execute("UPDATE api_keys SET is_valid = ? WHERE id = ?", (new_status, key_id))
        await db.commit()
    
    key_manager.key_queue.clear()

    # Return the updated key
    async with aiosqlite.connect(DATABASE_URL) as db:
        cursor = await db.execute("SELECT id, key, is_valid, failure_count, last_used FROM api_keys WHERE id = ?", (key_id,))
        updated_row = await cursor.fetchone()
        
    return APIKeyInfo(
        id=updated_row[0],
        key_partial=create_partial_key(updated_row[1]),
        is_valid=updated_row[2],
        failure_count=updated_row[3],
        last_used=updated_row[4]
    )

async def validate_gemini_key(client: httpx.AsyncClient, key: str, model: str) -> tuple[bool, int, str]:
    """
    使用 httpx 向 Gemini API 发送请求以验证密钥。
    返回 (is_valid, status_code, message)
    """
    url = await build_upstream_url(f"models/{model}:countTokens")
    params = {"key": key}
    payload = {"contents": [{"parts": [{"text": "hello"}]}]}
    try:
        response = await client.post(url, params=params, json=payload, timeout=10)
        if response.status_code == 200:
            return True, 200, "Validation successful"
        
        return False, response.status_code, response.text
    except httpx.TimeoutException:
        return False, 408, "Request timed out"
    except httpx.RequestError as e:
        return False, 500, f"Client error: {str(e)}"

@router.post("/keys/batch-validate/", status_code=204)
async def batch_validate_keys(payload: BatchKeyIDs):
    """批量验证密钥的有效性，并使用 KeyManager 记录成功和失败。"""
    if not payload.key_ids:
        return

    batch_size = 10
    validation_model_name = await config_manager.get_config("VALIDATION_MODEL") or "gemini-2.5-flash-lite-preview-06-17"

    async with aiosqlite.connect(DATABASE_URL) as db:
        placeholders = ','.join('?' for _ in payload.key_ids)
        cursor = await db.execute(f"SELECT id, key FROM api_keys WHERE id IN ({placeholders})", payload.key_ids)
        keys_to_validate = await cursor.fetchall()

    async with httpx.AsyncClient() as client:
        for i in range(0, len(keys_to_validate), batch_size):
            batch = keys_to_validate[i:i + batch_size]
            tasks = [asyncio.create_task(validate_gemini_key(client, key_value, validation_model_name)) for _, key_value in batch]
            results = await asyncio.gather(*tasks)

            # 使用 KeyManager 记录结果，它会处理所有数据库逻辑
            for (_, key_value), (is_valid, status_code, message) in zip(batch, results):
                if is_valid:
                    await key_manager.record_success(key_value, validation_model_name)
                else:
                    await key_manager.record_failure(key_value, validation_model_name, status_code, message)
            
            # 在批次之间短暂休息0.5秒，增加稳定性
            if i + batch_size < len(keys_to_validate):
                await asyncio.sleep(0.5)

    key_manager.key_queue.clear()
    return None

# --- 新增的配置管理路由 ---

@router.get("/config/keys", response_model=ConfigKeys)
async def get_config_keys():
    """获取当前的配置密钥信息"""
    access_key = await config_manager.get_config("ACCESS_KEY")
    admin_key = await config_manager.get_config("ADMIN_KEY")
    return ConfigKeys(
        access_key_partial=create_partial_key(access_key),
        is_admin_key_set=bool(admin_key)
    )

@router.post("/config/access_key")
async def set_access_key(payload: NewAccessKey):
    """设置新的访问密钥并持久化到数据库"""
    if not payload.key:
        raise HTTPException(status_code=400, detail="密钥不能为空。")
    
    await config_manager.set_config("ACCESS_KEY", payload.key)
    return {"message": "Access key updated successfully."}

@router.post("/config/admin_key")
async def set_admin_key(payload: NewAdminKey):
    """设置新的管理员密钥，并清除所有现有会话"""
    if not payload.key:
        raise HTTPException(status_code=400, detail="密钥不能为空。")
        
    async with aiosqlite.connect(DATABASE_URL) as db:
        async with db.execute("BEGIN"):
            # 1. 更新管理员密钥
            await db.execute(
                "INSERT INTO config_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                ("ADMIN_KEY", payload.key)
            )
            # 2. 清除所有现有会话
            await db.execute("DELETE FROM admin_sessions")
        await db.commit()
        
    return {"message": "Admin key updated successfully. All active sessions have been logged out."}

@router.get("/config/api", response_model=ApiConfig)
async def get_api_config():
    """获取当前的 API 配置"""
    api_base_url = await config_manager.get_config("GEMINI_API_BASE_URL")
    max_failure_count = await config_manager.get_config("MAX_FAILURE_COUNT")
    max_retry_count = await config_manager.get_config("MAX_RETRY_COUNT")
    
    return ApiConfig(
        api_base_url=api_base_url,
        max_failure_count=int(max_failure_count) if max_failure_count else None,
        max_retry_count=int(max_retry_count) if max_retry_count else None
    )

@router.post("/config/api")
async def set_api_config(payload: ApiConfig):
    """设置新的 API 配置"""
    if payload.api_base_url is not None:
        await config_manager.set_config("GEMINI_API_BASE_URL", payload.api_base_url)
    if payload.max_failure_count is not None:
        await config_manager.set_config("MAX_FAILURE_COUNT", str(payload.max_failure_count))
    if payload.max_retry_count is not None:
        await config_manager.set_config("MAX_RETRY_COUNT", str(payload.max_retry_count))
        
    return {"message": "API configuration updated successfully."}

# --- ACCESS_KEY 管理 ---

class DeleteAccessKey(BaseModel):
    key: str

@router.get("/access-keys", response_model=List[str])
async def get_access_keys():
    """获取所有当前的 ACCESS_KEY"""
    access_key_str = await config_manager.get_config("ACCESS_KEY")
    if not access_key_str:
        return []
    return [key.strip() for key in access_key_str.split(',') if key.strip()]

@router.post("/access-keys", status_code=201)
async def add_access_key(payload: NewAccessKey):
    """添加一个新的 ACCESS_KEY"""
    if not payload.key:
        raise HTTPException(status_code=400, detail="Key cannot be empty.")
    
    access_key_str = await config_manager.get_config("ACCESS_KEY")
    access_keys = [key.strip() for key in access_key_str.split(',') if key.strip()]
    
    if payload.key in access_keys:
        raise HTTPException(status_code=409, detail="访问密钥已存在。")
        
    access_keys.append(payload.key)
    new_access_key_str = ",".join(access_keys)
    await config_manager.set_config("ACCESS_KEY", new_access_key_str)
    return {"message": "Access key added successfully."}

@router.delete("/access-keys", status_code=200)
async def delete_access_key(payload: DeleteAccessKey):
    """删除一个 ACCESS_KEY"""
    if not payload.key:
        raise HTTPException(status_code=400, detail="Key cannot be empty.")

    access_key_str = await config_manager.get_config("ACCESS_KEY")
    access_keys = [key.strip() for key in access_key_str.split(',') if key.strip()]
    
    if payload.key not in access_keys:
        raise HTTPException(status_code=404, detail="Access key not found.")
        
    access_keys.remove(payload.key)
    new_access_key_str = ",".join(access_keys)
    await config_manager.set_config("ACCESS_KEY", new_access_key_str)
    return {"message": "Access key deleted successfully."}

@router.delete("/error-logs", status_code=204)
async def clear_all_error_logs():
    """清除所有错误日志记录"""
    async with aiosqlite.connect(DATABASE_URL) as db:
        await db.execute("DELETE FROM error_logs")
        await db.commit()
    return None

@router.get("/error-logs", response_model=PaginatedErrorLogs)
async def get_error_logs(page: int = 1, size: int = 30):
    """获取分页的错误日志"""
    if page < 1: page = 1
    if not 1 <= size <= 50: size = 50
    offset = (page - 1) * size

    async with aiosqlite.connect(DATABASE_URL) as db:
        # Get total count for pagination
        count_cursor = await db.execute("SELECT COUNT(*) FROM error_logs")
        total_count = (await count_cursor.fetchone())[0]
        total_pages = (total_count + size - 1) // size

        # Get paginated logs
        cursor = await db.execute("""
            SELECT e.id, a.key, e.model_name, e.identification_code, e.error_message, e.timestamp
            FROM error_logs e
            JOIN api_keys a ON e.key_id = a.id
            ORDER BY e.timestamp DESC
            LIMIT ? OFFSET ?
        """, (size, offset))
        rows = await cursor.fetchall()

    logs = [
        ErrorLogEntry(
            id=row[0],
            key_partial=create_partial_key(row[1]),
            model_name=row[2],
            identification_code=row[3],
            error_message=row[4],
            timestamp=row[5]
        ) for row in rows
    ]

    return PaginatedErrorLogs(
        logs=logs,
        total_pages=total_pages,
        current_page=page
    )

@router.get("/request-logs", response_model=PaginatedRequestLogs)
async def get_request_logs(page: int = 1, size: int = 30):
    """获取分页的全部请求日志"""
    if page < 1: page = 1
    if not 1 <= size <= 50: size = 50
    offset = (page - 1) * size

    async with aiosqlite.connect(DATABASE_URL) as db:
        # Get total count for pagination
        count_cursor = await db.execute("SELECT COUNT(*) FROM api_call_history")
        total_count = (await count_cursor.fetchone())[0]
        total_pages = (total_count + size - 1) // size

        # Get paginated logs
        cursor = await db.execute("""
            SELECT h.id, a.key, h.model_name, h.timestamp, h.identification_code
            FROM api_call_history h
            JOIN api_keys a ON h.key_id = a.id
            ORDER BY h.timestamp DESC
            LIMIT ? OFFSET ?
        """, (size, offset))
        rows = await cursor.fetchall()

    logs = [
        RequestLogEntry(
            id=row[0],
            key_partial=create_partial_key(row[1]),
            model_name=row[2],
            identification_code=row[4],
            timestamp=row[3]
        ) for row in rows
    ]

    return PaginatedRequestLogs(
        logs=logs,
        total_pages=total_pages,
        current_page=page
    )

@router.get("/available-models", response_model=List[AvailableModel])
async def get_available_models():
    """从 Google API 获取可用的模型列表。如果失败则返回空列表。"""
    max_retries = 5
    for attempt in range(max_retries):
        api_key = await key_manager.get_key()
        if not api_key:
            # No keys available at all, or all keys failed. Stop trying.
            return []

        url = await build_upstream_url("models")
        url += f"?key={api_key}"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=15)
                if response.status_code == 200:
                    data = response.json()
                    models = [
                        AvailableModel(name=m.get('name', '').replace('models/', ''), displayName=m.get('displayName', ''))
                        for m in data.get('models', [])
                        if 'generateContent' in m.get('supportedGenerationMethods', []) and 'token' not in m.get('name', '').lower()
                    ]
                    return sorted(models, key=lambda x: x.displayName)
                else:
                    # Key failed, record it and loop to try another one.
                    await key_manager.record_failure(
                        key=api_key,
                        model_name="model-discovery",
                        status_code=response.status_code,
                        error_message=response.text
                    )
        except Exception as e:
            # Network error or timeout, record failure and loop to try another key.
            await key_manager.record_failure(
                key=api_key,
                model_name="model-discovery",
                status_code=500,
                error_message=str(e)
            )
    
    # If all retries fail, return an empty list.
    return []


@router.get("/scheduler/config", response_model=SchedulerConfig)
async def get_scheduler_config():
    """获取当前的定时任务配置"""
    validation_model = await config_manager.get_config("VALIDATION_MODEL")
    validation_interval = await config_manager.get_config("KEY_VALIDATION_INTERVAL_HOURS")
    scheduler_timezone = await config_manager.get_config("SCHEDULER_TIMEZONE")
    error_log_retention_days = await config_manager.get_config("ERROR_LOG_RETENTION_DAYS")
    request_log_retention_days = await config_manager.get_config("REQUEST_LOG_RETENTION_DAYS")

    current_validation_model = validation_model or "gemini-2.5-flash-lite-preview-06-17"
    return SchedulerConfig(
        validation_model=current_validation_model,
        validation_model_display_name=None, # 移除实时外部 API 调用，以提高性能
        validation_interval=int(validation_interval) if validation_interval else 1,
        scheduler_timezone=scheduler_timezone or "Asia/Shanghai",
        error_log_retention_days=int(error_log_retention_days) if error_log_retention_days else 7,
        request_log_retention_days=int(request_log_retention_days) if request_log_retention_days else 7,
    )

@router.post("/scheduler/config", status_code=200)
async def set_scheduler_config(payload: SchedulerConfig):
    """设置新的定时任务配置并重启调度器"""
    await config_manager.set_config("VALIDATION_MODEL", payload.validation_model)
    await config_manager.set_config("KEY_VALIDATION_INTERVAL_HOURS", str(payload.validation_interval))
    await config_manager.set_config("SCHEDULER_TIMEZONE", payload.scheduler_timezone)
    await config_manager.set_config("ERROR_LOG_RETENTION_DAYS", str(payload.error_log_retention_days))
    await config_manager.set_config("REQUEST_LOG_RETENTION_DAYS", str(payload.request_log_retention_days))
    
    return {"message": "定时任务配置已更新并成功应用。"}