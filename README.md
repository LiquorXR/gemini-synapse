# Gemini Synapse - Next Generation

[Chinese Readme](README.zh-CN.md)

---

**Gemini Synapse** is a next-generation lightweight proxy service designed for the native Google Gemini API. It not only provides stable and efficient API request forwarding but also introduces a powerful web admin panel and a suite of advanced features, aiming to offer developers the ultimate convenience and control.

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

#### Method A: Using Docker Compose (Easiest)

1.  **Prepare the `.env` file**:
    Copy the configuration from `.env.example`:
    ```bash
    cp .env.example .env
    ```
    Then, edit the `.env` file to set at least the `ADMIN_KEY` (for logging into the web panel) and `GOOGLE_API_KEYS` (your Gemini keys).

2.  **Start with Docker Compose**:
    This command will automatically build and start the service based on the `docker-compose.yml` configuration.
    ```bash
    docker-compose up -d
    ```

3.  **Access the Service**:
    -   The API proxy service runs at: `http://localhost:8008`
    -   The Web Admin Panel is at: `http://localhost:8008` (access the root path)

#### Method B: Manually Building and Running the Docker Image

If you prefer not to use `docker-compose`, you can follow these manual steps.

1.  **Prepare the `.env` file**:
    Similarly, first copy and configure the `.env` file from `.env.example`.

2.  **Build the Docker Image**:
    In the project root directory, run the following command to build the image.
    ```bash
    docker build -t gemini-synapse .
    ```

3.  **Run the Docker Container**:
    Use the following command to start the container.
    -   **For Linux / macOS / PowerShell:**
        ```bash
        docker run -d -p 8008:8008 --name my-gemini-app --env-file .env -v "$(pwd)/data.db:/app/data.db" gemini-synapse
        ```
    -   **For Windows (CMD):**
        ```bash
        docker run -d -p 8008:8008 --name my-gemini-app --env-file .env -v "%cd%\\data.db:/app/data.db" gemini-synapse
        ```

    **Argument Explanation:**
    - `-d`: Run in detached mode
    - `-p 8008:8008`: Port mapping (host:container)
    - `--name my-gemini-app`: Name the container
    - `--env-file .env`: Load environment variables from the `.env` file into the container
    - `-v ...`: **(Important)** Mount the local `data.db` file into the container for data persistence.

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
    uvicorn api.index:app --host 0.0.0.0 --port 8008
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

-   Open your browser and navigate to `http://<your-server-ip>:8008`.
-   Enter the `ADMIN_KEY` you set in your `.env` file to log in.
-   In the panel, you can manage all your Gemini API keys, access keys, and system configurations.

### 2. Integrate with Clients

Configure your third-party clients or applications to use this proxy service:

-   **API Endpoint / Base URL**: `http://<your-server-ip>:8008`
-   **API Key**: Use one of the `ACCESS_KEY`s you set in the `.env` file or the web panel.

Requests will be automatically forwarded to the Gemini API through the proxy, enjoying all advanced features like key load balancing, failure retries, and more.

## 🌐 Public Access (NAT Traversal)

If your service is deployed on a device without a public IP address (e.g., a home network, office, or Termux environment), you can use a NAT traversal tool to securely expose it to the internet. We recommend using **Cloudflare Tunnel** because it is completely free, stable, and automatically configures HTTPS for you.

### Using Cloudflare Tunnel (Recommended)

**Note**: Termux users on some older Android kernels might encounter a `SIGSYS: bad system call` error when running `cloudflared tunnel login`. This happens because `cloudflared` attempts a system call to open a browser, which the underlying system may not support. The **Token Authentication Method** below bypasses this issue entirely and is the officially recommended way for server and Termux environments.

#### Step 1: Download the `cloudflared` Client

In your server or Termux environment, download the appropriate `cloudflared` client for your system architecture.

*   **For Linux (x86_64):**
    ```bash
    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
    ```
*   **For Linux (ARM64, e.g., Termux):**
    ```bash
    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o cloudflared
    ```

After downloading, grant it execute permissions:
```bash
chmod +x cloudflared
```

#### Step 2: Create a Tunnel and Get a Token from the Cloudflare Dashboard

1.  On your **PC or phone's browser**, go to the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/) and log in.
2.  In the left sidebar, navigate to **Access** -> **Tunnels**.
3.  Click **Create a tunnel**.
4.  Choose **Cloudflared** as your connector type and click **Next**.
5.  **Give your tunnel a name** (e.g., `gemini-termux`) and click **Save tunnel**.
6.  On the next page, you will see installation instructions for various OSes. **Ignore these** and look for the **Token**. It's a long string of characters. **Copy** it.

#### Step 3: Run the Tunnel on Your Termux or Server

Back in your Termux/server, execute the following command. Replace `<Your-Token-Here>` with the actual token you just copied from the Cloudflare website.

```bash
./cloudflared tunnel --no-autoupdate run --token <Your-Token-Here>
```
At this point, a secure connection between your device and Cloudflare has been established.

#### Step 4: Configure a Public Hostname to Point to Your Local Service

1.  Go back to the Cloudflare Tunnels dashboard in your browser. You should see your newly created tunnel with a **"Connected"** status.
2.  Click on your tunnel's name, then switch to the **Public Hostname** tab.
3.  Click **Add a public hostname**.
4.  In the **Service** section, set the **Type** to `HTTP` and the **URL** to `localhost:8008` (the address of your Gemini Synapse service).
5.  Click **Save hostname**.

Done! Cloudflare will automatically assign you a `.trycloudflare.com` domain (or you can use your own) and point it to your locally running service. You can now access your application via this public address. For stable background operation, it is recommended to use it with tools like `tmux` or `screen`.
