FROM python:3.11-slim
WORKDIR /app

# 安装 uv
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# 安装 uv
RUN pip install uv --no-cache-dir

# 复制依赖文件
COPY pyproject.toml uv.lock ./

# 安装依赖（不安装项目本身）
RUN uv sync --frozen --no-install-project

# 复制应用代码
COPY app/ ./app/
COPY nls/ ./nls/

# 数据目录（SQLite 持久化）
RUN mkdir -p /app/data

EXPOSE 5167

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5167"]
