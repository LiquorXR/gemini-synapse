from fastapi import FastAPI, Request, Response, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, JSONResponse
from contextlib import asynccontextmanager
import httpx
import logging
import asyncio
import os
import time
from api.path_builder import build_upstream_url

from api.database import key_manager, config_manager, initialize_database
from api.config import ENVIRONMENT
from api.security import security_service
from api.exceptions import APIError, ServiceUnavailableError, UnretryableError, AllKeysFailedError, NotFoundError
from api.admin import router as admin_router
from api.scheduler import start_scheduler, stop_scheduler
from pydantic import BaseModel
import mimetypes

# --- MIME 类型修正 ---
# 在某些环境中，.js 文件可能被错误地识别为 text/plain
# 我们在此显式地将其注册为 application/javascript，以修复前端模块加载问题
mimetypes.add_type("application/javascript", ".js")

# --- 日志配置 (统一使用 UTC) ---
# 创建一个自定义的 Formatter，它将所有日志时间转换为 UTC
class UTCFormatter(logging.Formatter):
    converter = time.gmtime

# 配置日志记录器
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s.%(msecs)03dZ - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S'
)

# 将 UTC Formatter 应用到根 logger
logging.getLogger().handlers[0].setFormatter(UTCFormatter(
    fmt='%(asctime)s.%(msecs)03dZ - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S'
))
logger = logging.getLogger(__name__)

# --- 全局变量 ---
client: httpx.AsyncClient | None = None

# --- 应用生命周期管理 ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """管理应用的生命周期事件，确保资源被正确初始化和关闭。"""
    global client
    logger.info("Initializing database and managers...")
    await initialize_database()
    logger.info("Database and managers initialized.")
    await start_scheduler()
    
    limits = httpx.Limits(max_connections=120, max_keepalive_connections=20)
    client = httpx.AsyncClient(timeout=300, limits=limits)
    yield
    
    if client:
        await client.aclose()
        logger.info("HTTP client closed.")
    stop_scheduler()

# --- FastAPI 应用实例 ---
app = FastAPI(lifespan=lifespan)

# --- 日志中间件 ---
@app.middleware("http")
async def detailed_logging_middleware(request: Request, call_next):
    """记录每个请求和响应的详细信息。"""
    import time
    import json

    start_time = time.time()
    
    # 准备请求日志详情
    request_details = {
        "client": request.client.host if request.client else "unknown",
        "method": request.method,
        "path": request.url.path,
    }
    
    # 过滤敏感头部
    sensitive_headers = {"authorization", "x-goog-api-key", "cookie", "set-cookie"}
    headers = {k: v for k, v in request.headers.items() if k.lower() not in sensitive_headers}
    request_details["headers"] = headers

    # 掩蔽敏感查询参数
    try:
        qp = dict(request.query_params)
        if "key" in qp:
            qp["key"] = "***"
        request_details["query"] = qp
    except Exception:
        request_details["query"] = str(request.query_params)
    
    logger.info(f"Request received: {json.dumps(request_details, indent=2, ensure_ascii=False)}")
    # 不再记录请求体，避免敏感信息泄露


    response = await call_next(request)

    process_time = (time.time() - start_time) * 1000
    
    # 准备响应日志详情
    response_details = {
        "status_code": response.status_code,
        "process_time_ms": f"{process_time:.2f}",
    }
    logger.info(f"Response sent: {json.dumps(response_details, indent=2, ensure_ascii=False)}")

    return response

# --- 挂载管理 API ---
app.include_router(admin_router)

class LoginPayload(BaseModel):
    admin_key: str

@app.post("/login")
async def login(payload: LoginPayload):
    """
    管理员登录端点。
    成功后，设置一个安全的 HttpOnly Cookie。
    """
    # 基础延迟，缓解暴力破解
    await asyncio.sleep(0.5)
    try:
        admin_key_from_db = await config_manager.get_config("ADMIN_KEY")
        if payload.admin_key and payload.admin_key == admin_key_from_db:
            # 创建安全的会话令牌
            session_token = await security_service.create_admin_session()
            
            response = JSONResponse(content={"success": True, "message": "Login successful."})
            response.set_cookie(
                key="admin_session_token",
                value=session_token, # 使用安全的令牌
                httponly=True,
                samesite="strict",
                secure=ENVIRONMENT == "production",
                max_age=int(security_service.SESSION_DURATION_HOURS * 3600)
            )
            return response
        else:
            # 失败时增加额外延迟，进一步缓解暴力破解
            await asyncio.sleep(1)
            raise APIError(status_code=401, detail="Invalid admin key.")
    except APIError as e:
        raise e
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise APIError(status_code=500, detail="An internal error occurred during login.")

@app.post("/logout")
async def logout(request: Request):
    """管理员登出端点，清除 Cookie 和数据库中的会话。"""
    token = request.cookies.get("admin_session_token")
    if token:
        await security_service.delete_admin_session(token)
    
    response = JSONResponse(content={"success": True, "message": "Logout successful."})
    response.delete_cookie("admin_session_token")
    return response

# --- 全局异常处理器 ---
@app.exception_handler(APIError)
async def api_error_handler(request: Request, exc: APIError):
    """处理自定义的 API 错误"""
    logger.error(f"API Error: {exc.detail} (Code: {exc.error_code})", exc_info=False)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.error_code, "message": exc.detail}},
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """处理所有未捕获的通用异常"""
    logger.exception(f"Unhandled Exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_server_error",
                "message": "An unexpected internal error occurred.",
            }
        },
    )

# --- 核心代理服务 ---
class ProxyService:
    """封装代理逻辑，使其更清晰、可测试。"""
    MAX_KEY_ROTATIONS = 10

    async def _determine_target_url(self, path: str) -> str:
        return await build_upstream_url(path)

    def _parse_model_name(self, path: str) -> str | None:
        """从请求路径中解析出模型名称。"""
        import re
        # 使用更健壮的正则表达式，以处理 tunedModels 和不带冒号的路径
        match = re.search(r"(?:models|tunedModels)/([^:/]+)", path)
        if match:
            return match.group(1)
        return None

    async def _stream_generator(self, response: httpx.Response):
        """安全的异步生成器，用于代理流式响应并确保连接被关闭。"""
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        finally:
            await response.aclose()
            logger.info("Stream closed and connection released.")

    async def _send_request_with_single_key(self, method: str, url: str, headers: dict, params: dict, content: bytes, key: str, model_name: str | None) -> Response:
        """使用单个密钥发送请求，并内置重试逻辑。"""
        global client
        assert client is not None, "HTTP Client not initialized."
        
        max_retry_count_str = await config_manager.get_config("MAX_RETRY_COUNT")
        max_retries = int(max_retry_count_str) if max_retry_count_str else 3
        
        headers['x-goog-api-key'] = key
        is_streaming = params.get("alt") == "sse"
        last_exception = None

        for attempt in range(max_retries):
            try:
                logger.info(f"Sending request to upstream (Key: ...{key[-4:]}, Attempt: {attempt + 1}/{max_retries})")
                req = client.build_request(method=method, url=url, headers=headers, params=params, content=content)
                r = await client.send(req, stream=True)

                # 成功
                if r.status_code < 400:
                    await key_manager.record_success(key, model_name)
                    logger.info(f"Key ...{key[-4:]} succeeded with status {r.status_code} for model {model_name}.")
                    
                    if is_streaming:
                        return StreamingResponse(self._stream_generator(r), status_code=r.status_code, media_type=r.headers.get("content-type"))
                    
                    response_content = await r.aread()
                    final_headers = {k: v for k, v in r.headers.items() if k.lower() not in ['content-encoding', 'transfer-encoding', 'content-length']}
                    final_headers['content-length'] = str(len(response_content))
                    return Response(content=response_content, status_code=r.status_code, headers=final_headers, media_type=r.headers.get("content-type"))

                # 失败
                error_body = await r.aread()
                await r.aclose()
                
                error_message = error_body.decode('utf-8', errors='ignore')
                last_exception = httpx.HTTPStatusError(f"Status {r.status_code}: {error_message}", request=req, response=r)
                
                # 立即记录每一次失败的尝试
                # await key_manager.log_request_failure(key, model_name, r.status_code, error_message)

                # 如果是明确的、不可重试的客户端错误，立即向上抛出，终止此密钥的所有重试
                # 403 (权限) 和 429 (速率限制) 错误应立即触发密钥轮换，而不是在同一个密钥上重试
                if r.status_code in {400, 403, 429}:
                    logger.warning(f"Key rotation triggered for status {r.status_code} for key ...{key[-4:]}. Rotating immediately.")
                    raise httpx.HTTPStatusError(f"Status {r.status_code}: {error_body.decode()}", request=req, response=r) # Re-raise to trigger rotation

                # 404 错误透传为 NotFound（避免错误映射为 400）
                if r.status_code == 404:
                    logger.warning("Upstream returned 404. Failing fast without retry for this key.")
                    raise NotFoundError(detail=error_body.decode())

                logger.warning(f"Attempt {attempt + 1}/{max_retries} for key ...{key[-4:]} failed: {last_exception}")

            except httpx.RequestError as e:
                # 网络错误（例如超时、连接失败）现在也会利用重试循环
                last_exception = e
                logger.warning(f"Attempt {attempt + 1}/{max_retries} for key ...{key[-4:]} failed with a network error: {e}")
                # 让循环继续，以便在下一次尝试前应用退避等待
            
            if attempt < max_retries - 1:
                # 为 5xx 和网络错误的重试应用指数退避策略
                wait_time = 2 ** attempt
                logger.info(f"Waiting for {wait_time} seconds before next retry.")
                await asyncio.sleep(wait_time)
            

        # 如果所有重试都失败了，向上抛出最后的异常，这将触发密钥轮换
        if last_exception:
            raise last_exception
        # Fallback, should not be reached
        raise Exception("Request failed after all retries with a single key.")


    async def forward_request(self, request: Request, path: str) -> Response:
        """
        核心处理流程：获取密钥、轮换、重试、代理请求。
        """
        client_ip = request.client.host if request.client else "unknown"
        logger.info(f"Received {request.method} request from {client_ip} for path: /{path}")

        target_url = await self._determine_target_url(path)
        
        query_params = dict(request.query_params)
        query_params.pop('key', None)

        excluded_headers = ['host', 'authorization', 'x-goog-api-key', 'content-length', 'cookie', 'set-cookie']
        headers = {k: v for k, v in request.headers.items() if k.lower() not in excluded_headers}
        
        request_body = await request.body()
        
        last_error_details = ""
        model_name = self._parse_model_name(path)

        for i in range(self.MAX_KEY_ROTATIONS):
            gemini_key = await key_manager.get_key() # May raise AllKeysFailedError
            
            logger.info(f"Attempting with key ...{gemini_key[-4:]} (Rotation {i+1}/{self.MAX_KEY_ROTATIONS}) for model {model_name}")
            try:
                # 尝试使用一个密钥发送请求（内置重试逻辑）
                return await self._send_request_with_single_key(
                    method=request.method,
                    url=target_url,
                    headers=headers,
                    params=query_params,
                    content=request_body,
                    key=gemini_key,
                    model_name=model_name
                )
            except UnretryableError as e:
                # 如果是不可重试的错误(404)，直接抛出给全局处理器，不再轮换密钥
                logger.error(f"Unretryable error received from upstream. Aborting rotations. Details: {e.detail}")
                raise e
            except APIError as e:
                # 例如 NotFoundError：直接透传，不再轮换
                logger.error(f"APIError received from upstream. Aborting rotations. Details: {e.detail}")
                raise e
            except httpx.RequestError as e:
                # 网络错误（在单密钥重试后）：不记录密钥失败，直接终止整个请求。
                last_error_details = f"Network error after retries: {e}"
                logger.error(f"A network error occurred with key ...{gemini_key[-4:]} and was not resolved by retries. Aborting all rotations. Error: {e}")
                # 抛出 ServiceUnavailableError 以向客户端返回 502 错误
                raise ServiceUnavailableError(detail=f"A network error occurred and was not resolved by retries: {e}") from e
            except Exception as e:
                # 其他所有可轮换的错误（主要是 HTTPStatusError）：记录密钥失败并继续轮换
                status_code = e.response.status_code if isinstance(e, httpx.HTTPStatusError) else None
                error_message = e.response.text if isinstance(e, httpx.HTTPStatusError) else str(e)
                
                await key_manager.record_failure(gemini_key, model_name, status_code, error_message)
                last_error_details = str(e)
                logger.warning(f"Key ...{gemini_key[-4:]} failed. Rotating to next key. Error: {e}")

        # 如果所有密钥轮换都失败了
        logger.error(f"Request failed after trying {self.MAX_KEY_ROTATIONS} keys. Last error: {last_error_details}")
        raise AllKeysFailedError(detail=f"Request failed after trying {self.MAX_KEY_ROTATIONS} keys. Last error: {last_error_details}")

# 创建代理服务的单例
proxy_service = ProxyService()

# --- 代理 API 路由 (捕获 v1beta 路径) ---
@app.api_route("/v1beta/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def universal_proxy(
    request: Request,
    path: str,
    _=Depends(security_service.verify_access_key) # 使用依赖注入进行认证
):
    """
    一个通用的 API 网关，将请求代理到 Google Gemini 原生 API。
    只捕获 /v1beta/ 开头的路径，避免与静态文件冲突。
    """
    full_path = f"v1beta/{path}"
    return await proxy_service.forward_request(request, full_path)

# --- 静态文件服务 (必须放在最后，作为 "catch-all") ---
# 这样做可以确保 /admin 和 /v1beta 路由优先被匹配
# 任何不匹配上述路由的请求，都会被尝试作为静态文件处理
frontend_dir = os.path.join(os.path.dirname(__file__), '..', 'frontend')
if os.path.exists(frontend_dir):
    # 将 index.html 作为根路径的默认页面
    class SPAStaticFiles(StaticFiles):
        async def get_response(self, path: str, scope):
            try:
                return await super().get_response(path, scope)
            except HTTPException as ex:
                if ex.status_code == 404:
                    return await super().get_response("index.html", scope)
                raise ex

    app.mount("/", SPAStaticFiles(directory=frontend_dir, html=True), name="frontend")