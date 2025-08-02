"""
独立的安全和认证模块。

遵循单一职责原则，将认证逻辑与核心业务逻辑分离。
"""
from fastapi import Request, Depends
import secrets
import aiosqlite
from datetime import datetime, timedelta, timezone
from api.database import config_manager, DATABASE_URL
from api.exceptions import AuthenticationError

class SecurityService:
    """
    封装了所有与安全相关的操作。
    密钥从数据库中实时获取，以确保更新后立即生效。
    """

    SESSION_DURATION_HOURS = 2

    async def create_admin_session(self) -> str:
        """创建并存储一个新的管理员会话令牌"""
        token = secrets.token_hex(32)
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=self.SESSION_DURATION_HOURS)
        
        async with aiosqlite.connect(DATABASE_URL) as db:
            await db.execute(
                "INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)",
                (token, expires_at.isoformat())
            )
            await db.commit()
        return token

    async def delete_admin_session(self, token: str):
        """删除一个管理员会话令牌"""
        async with aiosqlite.connect(DATABASE_URL) as db:
            await db.execute("DELETE FROM admin_sessions WHERE token = ?", (token,))
            await db.commit()

    async def verify_access_key(self, request: Request):
        """
        从请求中按优先级顺序提取并验证访问密钥。
        顺序: Bearer Token > URL Query 'key' > Header 'x-goog-api-key'.
        
        如果验证失败，则会引发 AuthenticationError。
        """
        access_key_str = await config_manager.get_config("ACCESS_KEY")
        if not access_key_str:
            raise AuthenticationError("Access key is not configured in the database.")
        
        access_keys = [key.strip() for key in access_key_str.split(',') if key.strip()]
        if not access_keys:
            raise AuthenticationError("No valid access keys configured.")

        auth_header = request.headers.get('authorization')
        if auth_header and auth_header.lower().startswith('bearer '):
            token = auth_header.split(' ', 1)[1]
        elif 'key' in request.query_params:
            token = request.query_params['key']
        else:
            token = request.headers.get('x-goog-api-key')

        if not token or token not in access_keys:
            raise AuthenticationError("Invalid or missing access key.")

    async def verify_admin_key_from_cookie(self, request: Request):
        """
        从请求的 Cookie 中提取并验证管理员会话令牌。
        """
        token = request.cookies.get("admin_session_token")
        if not token:
            raise AuthenticationError("Admin session token not found in cookie.")

        async with aiosqlite.connect(DATABASE_URL) as db:
            cursor = await db.execute(
                "SELECT expires_at FROM admin_sessions WHERE token = ?", (token,)
            )
            row = await cursor.fetchone()

        if not row:
            raise AuthenticationError("Invalid admin session token.")

        expires_at = datetime.fromisoformat(row[0])
        if expires_at < datetime.now(timezone.utc):
            # The token has expired, delete it
            await self.delete_admin_session(token)
            raise AuthenticationError("Admin session has expired.")

    async def verify_admin_key_from_body(self, payload: dict):
        """
        从请求体中验证管理员密钥。
        """
        admin_key = await config_manager.get_config("ADMIN_KEY")
        if not admin_key:
            raise AuthenticationError("Admin key is not configured in the database.")
            
        key = payload.get("admin_key")
        if not key or key != admin_key:
            raise AuthenticationError("Invalid or missing admin key.")

# 创建一个可以被 FastAPI 依赖注入系统使用的单例
security_service = SecurityService()