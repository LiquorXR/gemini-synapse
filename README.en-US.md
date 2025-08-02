# Gemini Synapse - Next Generation

[中文文档](README.md) | [Changelog](CHANGELOG.md)

---

**Gemini Synapse** is a next-generation lightweight proxy service designed for the native Google Gemini API. It not only provides stable and efficient API request forwarding but also introduces a powerful web admin panel and a suite of advanced features, aiming to offer developers the ultimate convenience and control.

![Web UI](https://user-images.githubusercontent.com/13223253/287421687-70573635-23a3-475a-b7a7-3d2b256e6b12.png)

## ✨ Core Features

-   **High-Performance API Proxy**: Provides stable and efficient request forwarding services in network environments where direct connection to the Google API is not possible.
-   **Intelligent Key Pool & Load Balancing**:
    -   **Dynamic Rotation**: Automatically rotates through the Gemini API Keys in the key pool with each request, effectively distributing the request load.
    -   **Failure Retry & Auto-Disable**: When a request with a specific key fails, the system automatically retries. If the failure count exceeds a threshold, the key is automatically disabled to ensure service continuity.
    -   **Scheduled Auto-Validation**: Periodically checks the validity of all keys in the key pool and updates their status automatically.
-   **Powerful Web Admin Panel**:
    -   **Real-time Dashboard**: Monitor key status, API call statistics (overview, trend charts, model distribution), and error logs.
    -   **Dynamic Key Management**: Easily add, delete, disable, enable, or validate API keys through the web interface without restarting the service.
    -   **Access Control**: Dynamically manage the `ACCESS_KEY`s used to access the service, with hot-reloading support.
    -   **Online Configuration**: Modify and persist core configurations directly in the web interface, such as API Base URL, failure retry counts, and scheduler settings.
-   **Unified and Secure Access Point**:
    -   Use one or more `ACCESS_KEY`s to access the proxy service, without exposing your actual Gemini API Keys on the client-side.
    -   Supports multiple `ACCESS_KEY` authentication methods (Bearer Token, URL query, `x-goog-api-key` header).
-   **Detailed Logging System**:
    -   Records detailed information for every API request and response, facilitating debugging and auditing.
    -   Provides paginated views for error logs and request history.
-   **Flexible Deployment Options**: Supports both traditional `uvicorn` deployment and convenient `Docker` containerized deployment.

## 🚀 Quick Start

### Option 1: Deploy with Docker (Recommended)

1.  **Prepare the `.env` file**:
    Copy the configuration from `.env.example`:
    ```bash
    cp .env.example .env
    ```
    Then, edit the `.env` file to set at least the `ADMIN_KEY` (for logging into the web panel) and `GOOGLE_API_KEYS` (your Gemini keys).

2.  **Start with Docker Compose**:
    ```bash
    docker-compose up -d
    ```

3.  **Access the Service**:
    -   The API proxy service runs at: `http://localhost:8000`
    -   The Web Admin Panel is at: `http://localhost:8000` (access the root path)

### Option 2: Traditional Manual Deployment

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/LiquorXR/gemini-synapse.git
    cd gemini-synapse
    ```

2.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

3.  **Configure environment variables**:
    Copy `.env.example` to `.env`:
    ```bash
    cp .env.example .env
    ```
    Then, edit the `.env` file as needed.

4.  **Start the service**:
    ```bash
    uvicorn api.index:app --host 0.0.0.0 --port 8000
    ```

## ⚙️ Configuration

Configure the service by editing the `.env` file. **Please note**: Many configuration items, after the service's initial startup and database initialization, are managed dynamically through the Web Admin Panel.

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `ACCESS_KEY` | `""` | Keys for accessing this proxy service. Supports multiple, comma-separated. **Managed in the web panel after first launch**. |
| `ADMIN_KEY` | `""` | Password to log in to the Web Admin Panel. **Can be changed in the web panel after first launch**. |
| `GOOGLE_API_KEYS` | `""` | Your Google Gemini API keys. Supports multiple, comma-separated. **Managed in the web panel after first launch**. |
| `DATABASE_URL` | `data.db` | Path to the SQLite database file. |
| `GEMINI_API_BASE_URL` | `https://generativelanguage.googleapis.com` | Upstream URL for the Google API. **Can be changed in the web panel**. |
| `MAX_FAILURE_COUNT` | `5` | Number of consecutive failures before a key is disabled. **Can be changed in the web panel**. |
| `MAX_RETRY_COUNT` | `3` | Maximum number of retries for a failed request with a single key. **Can be changed in the web panel**. |
| `VALIDATION_MODEL` | `gemini-1.5-flash-latest` | Model used for automatically validating key validity. **Can be changed in the web panel**. |
| `KEY_VALIDATION_INTERVAL_HOURS` | `1` | Interval (in hours) for scheduled key validation. **Can be changed in the web panel**. |
| `SCHEDULER_TIMEZONE` | `Asia/Shanghai` | Timezone for scheduled tasks. **Can be changed in the web panel**. |
| `ERROR_LOG_RETENTION_DAYS` | `15` | Number of days to retain error logs. **Can be changed in the web panel**. |
| `REQUEST_LOG_RETENTION_DAYS` | `30` | Number of days to retain request history. **Can be changed in the web panel**. |

## 💡 How to Use

### 1. Log in to the Web Admin Panel

-   Open your browser and navigate to `http://<your-server-ip>:8000`.
-   Enter the `ADMIN_KEY` you set in your `.env` file to log in.
-   In the panel, you can manage all your Gemini API keys, access keys, and system configurations.

### 2. Integrate with Clients

Configure your third-party clients or applications to use this proxy service:

-   **API Endpoint / Base URL**: `http://<your-server-ip>:8000`
-   **API Key**: Use one of the `ACCESS_KEY`s you set in the `.env` file or the web panel.

Requests will be automatically forwarded to the Gemini API through the proxy, enjoying all advanced features like key load balancing, failure retries, and more.

## 🤝 Contributing

Contributions of all kinds are welcome! If you have any ideas, suggestions, or find a bug, please feel free to submit [Issues](https://github.com/LiquorXR/gemini-synapse/issues) or [Pull Requests](https://github.com/LiquorXR/gemini-synapse/pulls).

## 📄 License

This project is open-sourced under the [MIT License](LICENSE).