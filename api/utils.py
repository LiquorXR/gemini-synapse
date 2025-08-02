def create_partial_key(key: str) -> str:
    """为过长的密钥创建一个部分视图，例如 'sk-12...ab'"""
    if not key or len(key) <= 8:
        return "Not Set or Too Short"
    return f"{key[:4]}...{key[-4:]}"