# Gemini Synapse - Next Generation

[English Version](README.en-US.md) | [更新日志](CHANGELOG.md)

---

**Gemini Synapse** 是一个为 Google Gemini 原生 API 设计的下一代轻量级代理服务。它不仅提供了稳定、高效的 API 请求中转，还引入了强大的 Web 管理面板和一系列高级功能，旨在为开发者提供极致的便利和控制。

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

## 🌐 公网访问 (内网穿透)

如果你的服务部署在没有公网 IP 的设备上（例如家庭网络、办公室或 Termux 环境），你可以使用内网穿透工具将其安全地暴露到公网上。这里我们推荐使用 **Cloudflare Tunnel**，因为它完全免费、稳定，并且能自动为你配置 HTTPS。

### 使用 Cloudflare Tunnel (推荐)

**注意**: 在某些较旧的 Android 内核上，Termux 用户运行 `cloudflared tunnel login` 可能会遇到 `SIGSYS: bad system call` 错误。这是因为 `cloudflared` 尝试调用一个当前系统不支持的系统调用来打开浏览器。下面的 **Token 认证方法** 可以完美绕过此问题，是官方推荐的服务器和 Termux 环境部署方式。

#### 步骤 1: 下载 `cloudflared` 客户端

在你的服务器或 Termux 环境中，根据你的系统架构下载对应的 `cloudflared` 客户端。

*   **对于 Linux (x86_64):**
    ```bash
    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
    ```
*   **对于 Linux (ARM64, 例如 Termux):**
    ```bash
    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o cloudflared
    ```

下载后，赋予其执行权限：
```bash
chmod +x cloudflared
```

#### 步骤 2: 在 Cloudflare 控制台创建隧道并获取 Token

1.  在你的**电脑或手机浏览器**上，访问 [Cloudflare Zero Trust 控制台](https://one.dash.cloudflare.com/) 并登录。
2.  在左侧边栏，找到并点击 **Access** -> **Tunnels**。
3.  点击 **Create a tunnel** 按钮。
4.  选择 **Cloudflared** 作为连接器类型，点击 **Next**。
5.  **为你的隧道命名** (例如 `gemini-termux`)，然后点击 **Save tunnel**。
6.  在下一个页面，你会看到不同操作系统的安装指令。**请忽略这些指令**，我们只需要页面上显示的 **Token**。它是一长串字符，请**复制**它。

#### 步骤 3: 在 Termux 或服务器上运行隧道

回到你的 Termux/服务器，执行以下命令。请将 `<Your-Token-Here>` 替换为您刚刚从 Cloudflare 网站复制的真实 Token。

```bash
./cloudflared tunnel --no-autoupdate run --token <Your-Token-Here>
```
此时，你的设备和 Cloudflare 之间已经建立了安全的连接。

#### 步骤 4: 配置公网域名并指向本地服务

1.  回到浏览器中的 Cloudflare Tunnels 控制台。你应该能看到刚刚创建的隧道状态为 **"Connected"**。
2.  点击你的隧道名称，然后切换到 **Public Hostname** 标签页。
3.  点击 **Add a public hostname**。
4.  在 **Service** 部分，将 **Type** 设置为 `HTTP`，并将 **URL** 设置为 `localhost:8000` (这是 Gemini Synapse 服务的地址)。
5.  点击 **Save hostname**。

完成！Cloudflare 会自动为你分配一个 `.trycloudflare.com` 的域名（或使用你自己的域名），并将其指向你在本地运行的服务。现在，你可以通过这个公网地址访问你的应用了。为了让它在后台稳定运行，建议配合 `tmux` 或 `screen` 等工具使用。

## 🤝 贡献

欢迎各种形式的贡献！如果你有任何想法、建议或发现 Bug，请随时提交 [Issues](https://github.com/LiquorXR/gemini-synapse/issues) 或 [Pull Requests](https://github.com/LiquorXR/gemini-synapse/pulls)。

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。
