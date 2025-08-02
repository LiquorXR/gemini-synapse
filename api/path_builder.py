from urllib.parse import urlparse, urljoin
from api.database import config_manager
from api.config import GEMINI_API_BASE_URL

async def build_upstream_url(path: str) -> str:

    base_url_from_db = await config_manager.get_config("GEMINI_API_BASE_URL")
    base_url = base_url_from_db or GEMINI_API_BASE_URL

    parsed_base = urlparse(base_url)
    
    # 规范化路径，移除开头和结尾的斜杠
    path = path.strip('/')

    # 检查基础URL的路径部分是否包含 'v1beta'
    if 'v1beta' not in parsed_base.path:
        # 如果基础URL没有版本，且请求路径也没有，则添加版本
        if not path.startswith('v1beta/'):
            path = f'v1beta/{path}'
    else:
        # 如果基础URL有版本，则从请求路径中移除版本以避免重复
        if path.startswith('v1beta/'):
            path = path.replace('v1beta/', '', 1)

    # 使用 urljoin 来安全地拼接 URL，确保基础URL末尾有斜杠
    return urljoin(base_url + ('/' if not base_url.endswith('/') else ''), path)