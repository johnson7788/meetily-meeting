# Meetily Meeting

会议转录与分析系统。前端使用 React + Vite + TypeScript，后端使用 FastAPI + Python。

## 前置要求

- **Node.js** >= 18（前端）
- **uv**（后端，安装: `curl -LsSf https://astral.sh/uv/install.sh | sh`）
- **Docker**（仅容器部署需要）

## 本地开发

```bash
# 1. 准备环境（安装依赖）
./prepare.sh

# 2. 启动开发服务（前端 Vite + 后端 Uvicorn，支持热重载）
./start.sh

# 按 Ctrl+C 停止所有服务
```

## 环境变量配置

复制 `env_example` 为 `.env` 并填入对应值：

```bash
cp env_example .env
```

| 变量 | 用途 | 获取方式 |
|------|------|---------|
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | 阿里云 AccessKey ID，用于认证通义听悟 API | [RAM 控制台](https://ram.console.aliyun.com/manage/ak) |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret，与 ID 配对使用 | 同上 |
| `TINGWU_APP_KEY` | 通义听悟应用密钥，用于会议音频转文字（ASR） | [通义听悟控制台](https://tingwu.console.aliyun.com/) |
| `MEETILY_PUBLIC_BASE_URL` | 应用公网地址，用于生成分享链接和回调 URL。本地开发填 `http://localhost:5173` | 自定义 |
| `LLM_API_KEY` | 大语言模型 API Key，用于会议摘要、内容分析等 AI 功能 | [DashScope 控制台](https://dashscope.console.aliyun.com/) |
| `LLM_PROVIDER` | LLM 服务商标识，当前支持 `qwen`（通义千问） | 固定值 |
| `LLM_MODEL` | 使用的模型名称，如 `qwen-plus`、`qwen-turbo` | 参考 DashScope 文档 |

## 容器部署

```bash
# 构建并启动（默认利用缓存，加 --no-cache 强制全量构建）
./deploy.sh

# 验证：http://localhost:12018 前端 / http://localhost:12067/health 后端
```

## 访问地址

| 服务 | 本地开发 | Docker |
|------|---------|--------|
| 前端 | http://localhost:5173 | http://localhost:12018 |
| 后端 API | http://localhost:5167/docs | http://localhost:12067/docs |
| 后端健康 | http://localhost:5167/health | http://localhost:12067/health |

## 项目结构

```
├── frontend/     # React + Vite + TypeScript
├── backend/      # FastAPI + Python
├── docker-compose.yml
├── nginx.conf
├── deploy.sh     # 容器部署
├── prepare.sh    # 本地环境准备
└── start.sh      # 本地开发启动
```
