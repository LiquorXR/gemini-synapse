# Gemini Synapse - Next Generation

[English Version](README.en-US.md) | [更新日志](CHANGELOG.md)

---

**Gemini Synapse** 是一个为 Google Gemini 原生 API 设计的下一代轻量级代理服务。它不仅提供了稳定、高效的 API 请求中转，还引入了强大的 Web 管理面板和一系列高级功能，旨在为开发者提供极致的便利和控制。

![Web UI](httpshttps://user-images.githubusercontent.com/13223253/287421687-70573635-23a3-475a-b7a7-3d2b256e6b12.png)

## ✨ 核心功能

-   **高性能 API 代理**: 在无法直连 Google API 的网络环境中，提供稳定、高效的请求中转服务。
-   **智能密钥池与负载均衡**:
    -   **动态轮换**: 在每次请求时自动轮换使用密钥池中的 Gemini API Key，有效分摊请求压力。
    -   **失败重试与自动禁用**: 当某个密钥请求失败时，系统会自动重试。若失败次数超过阈值，该密钥将被自动禁用，确保服务连续性。
    -   **定时自动验证**: 定期检查密钥池中所有密钥的有效性，并自动更新其状态。
-   **强大的 Web 管理面板**:
    -   **实时仪表盘**: 监控密钥状态、API 调用统计（总览、趋势图、模型分布）和错误日志。
    -   **动态密钥管理**: 无需重启服务，即可在 Web 界面上轻松添加、删除、禁用、启用或验证 API 密钥。
    -   **访问控制**: 动态管理用于访问本服务的 `ACCESS_KEY`，支持热更新。
    -   **在线配置**: 直接在 Web 界面修改和持久化核心配置，如 API Base URL、失败重试次数、定时任务设置等。
-   **统一且安全的访问入口**:
    -   使用一个或多个 `ACCESS_KEY` 来访问代理服务，无需在客户端暴露真实的 Gemini API Key。
    -   支持多种 `ACCESS_KEY` 验证方式（Bearer Token, URL query, `x-goog-api-key` header）。
-   **详细的日志系统**:
    -   记录每一次 API 请求和响应的详细信息，便于调试和审计。
    -   提供可分页查看的错误日志和请求历史。
-   **灵活的部署方式**: 支持传统的 `uvicorn` 部署和便捷的 `Docker` 容器化部署。

## 🚀 快速开始

### 方式一：使用 Docker 部署 (推荐)

1.  **准备 `.env` 文件**:
    从 `.env.example` 复制一份配置:
    ```bash
    cp .env.example .env
    ```
    然后编辑 `.env` 文件，至少设置 `ADMIN_KEY` (用于登录 Web 面板) 和 `GOOGLE_API_KEYS` (你的 Gemini 密钥)。

2.  **使用 Docker Compose 启动**:
    ```bash
    docker-compose up -d
    ```

3.  **访问服务**:
    -   API 代理服务运行在: `http://localhost:8000`
    -   Web 管理面板位于: `http://localhost:8000` (直接访问根路径)

### 方式二：传统手动部署

1.  **克隆仓库**:
    ```bash
    git clone https://github.com/LiquorXR/gemini-synapse.git
    cd gemini-synapse
    ```

2.  **安装依赖**:
    ```bash
    pip install -r requirements.txt
    ```

3.  **配置环境变量**:
    复制 `.env.example` 文件为 `.env`：
    ```bash
    cp .env.example .env
    ```
    然后编辑 `.env` 文件，按需配置。

4.  **启动服务**:
    ```bash
    uvicorn api.index:app --host 0.0.0.0 --port 8000
    ```

## ⚙️ 配置说明

通过编辑 `.env` 文件来配置服务。**请注意**: 许多配置项在服务首次启动并初始化数据库后，会转为通过 Web 管理面板进行动态管理。

| 环境变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `ACCESS_KEY` | `""` | 访问本代理服务的密钥，支持多个，用逗号分隔。**首次启动后可在 Web 面板管理**。 |
| `ADMIN_KEY` | `""` | 登录 Web 管理面板的密码。**首次启动后可在 Web 面板修改**。 |
| `GOOGLE_API_KEYS` | `""` | 你的 Google Gemini API 密钥，支持多个，用逗号分隔。**首次启动后可在 Web 面板管理**。 |
| `DATABASE_URL` | `data.db` | SQLite 数据库文件的路径。 |
| `GEMINI_API_BASE_URL` | `https://generativelanguage.googleapis.com` | Google API 的上游地址。**可在 Web 面板修改**。 |
| `MAX_FAILURE_COUNT` | `5` | 密钥连续失败多少次后被禁用。**可在 Web 面板修改**。 |
| `MAX_RETRY_COUNT` | `3` | 单个密钥请求失败后的最大重试次数。**可在 Web 面板修改**。 |
| `VALIDATION_MODEL` | `gemini-1.5-flash-latest` | 用于自动验证密钥有效性的模型。**可在 Web 面板修改**。 |
| `KEY_VALIDATION_INTERVAL_HOURS` | `1` | 定时验证密钥的间隔（小时）。**可在 Web 面板修改**。 |
| `SCHEDULER_TIMEZONE` | `Asia/Shanghai` | 定时任务的时区。**可在 Web 面板修改**。 |
| `ERROR_LOG_RETENTION_DAYS` | `15` | 错误日志的保留天数。**可在 Web 面板修改**。 |
| `REQUEST_LOG_RETENTION_DAYS` | `30` | 请求历史的保留天数。**可在 Web 面板修改**。 |

## 💡 如何使用

### 1. 登录 Web 管理面板

-   打开浏览器，访问 `http://<你的服务器IP>:8000`。
-   输入你在 `.env` 中设置的 `ADMIN_KEY` 进行登录。
-   在面板中，你可以管理所有 Gemini API 密钥、访问密钥和系统配置。

### 2. 对接客户端

将你的第三方客户端或应用配置为使用本代理服务：

-   **API 端点 / Base URL**: `http://<你的服务器IP>:8000`
-   **API 密钥**: 填入你在 `.env` 或 Web 面板中设置的 `ACCESS_KEY` 之一。

请求将自动通过代理转发至 Gemini API，并享受密钥负载均衡、失败重试等所有高级功能。

## 🤝 贡献

欢迎各种形式的贡献！如果你有任何想法、建议或发现 Bug，请随时提交 [Issues](https://github.com/LiquorXR/gemini-synapse/issues) 或 [Pull Requests](https://github.com/LiquorXR/gemini-synapse/pulls)。

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。
