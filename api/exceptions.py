"""
统一的 API 异常处理模块。

定义了 APIError 基类和一系列具体的业务异常。
每个异常都包含明确的 status_code、detail (错误信息) 和 error_code (内部错误码)。
这使得在应用各处可以抛出具体的、带有上下文的错误，并由全局异常处理器统一捕获和格式化。
"""

class APIError(Exception):
    """API 错误基类"""
    def __init__(self, status_code: int, detail: str, error_code: str = None):
        self.status_code = status_code
        self.detail = detail
        self.error_code = error_code or "api_error"
        super().__init__(self.detail)

class AuthenticationError(APIError):
    """认证错误 (401)"""
    def __init__(self, detail: str = "Invalid or missing access key."):
        super().__init__(
            status_code=401, detail=detail, error_code="authentication_error"
        )

class NotFoundError(APIError):
    """资源未找到错误 (404)"""
    def __init__(self, detail: str = "The requested resource was not found."):
        super().__init__(status_code=404, detail=detail, error_code="not_found")

class UnretryableError(APIError):
    """不可重试的客户端错误 (400)"""
    def __init__(self, detail: str = "The request is invalid and should not be retried."):
        super().__init__(status_code=400, detail=detail, error_code="bad_request")

class ServiceUnavailableError(APIError):
    """服务不可用错误 (502)"""
    def __init__(self, detail: str, status_code: int = 502):
        super().__init__(
            status_code=status_code, detail=detail, error_code="service_unavailable"
        )

class AllKeysFailedError(ServiceUnavailableError):
    """所有 API Key 均失败的特定错误"""
    def __init__(self, detail: str = "All available API keys have failed. Please check key validity or add new keys."):
        super().__init__(detail=detail, status_code=503)