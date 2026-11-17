# Meetily 项目结构

Meetily 是一款智能会议助手，支持实时录音转写、音频文件上传转写、AI 摘要生成、章节提取、待办管理、会议对话问答等功能。

技术栈：
- **前端**：React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui + TanStack Router + Zustand
- **后端**：Python + FastAPI + aiosqlite (SQLite) + LangGraph
- **AI / 语音**：阿里云听悟 (Tingwu)、DashScope ASR、NLS SDK；LLM 支持通义千问 / OpenAI / Claude

---

## 根目录

```
.
├── README.md                 # 项目说明
├── .env / env_example        # 环境变量配置
├── docker-compose.yml        # Docker Compose 编排配置
├── nginx.conf                # Nginx 反向代理配置
├── start.sh                  # 一键启动脚本（前后端）
├── prepare.sh                # 环境准备脚本
├── deploy.sh                 # 部署脚本
├── .github/                  # GitHub Issue/PR 模板与 CI/CD Workflows
├── docs/                     # 项目文档
├── frontend/                 # 前端（React + Vite）
└── backend/                  # 后端（FastAPI）
```

---

## 前端 (frontend/)

```
frontend/
├── index.html                          # HTML 入口
├── package.json                        # 依赖与脚本
├── vite.config.ts                      # Vite 构建配置
├── tsconfig.json / tsconfig.app.json   # TypeScript 配置
├── tailwind.config.ts                  # Tailwind CSS 配置
├── postcss.config.js                   # PostCSS 配置
├── eslint.config.js                    # ESLint 配置
├── components.json                     # shadcn/ui 配置
├── nginx.conf                          # 前端容器 Nginx 配置
├── Dockerfile                          # 前端镜像构建
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── worklets/pcm-processor.js       # Web Audio Worklet：麦克风 PCM 数据采集
└── src/
    ├── main.tsx                        # 应用入口，挂载根组件
    ├── router.ts                       # TanStack Router 路由定义（支持 /app 子路径布局）
    ├── index.css                       # 全局样式与 Tailwind 指令
    ├── types/index.ts                  # TypeScript 类型定义（会议、转写段、待办、章节等）
    │
    ├── pages/                          # 页面级组件
    │   ├── meetings.tsx                # 会议列表页：展示、删除、跳转
    │   ├── meeting-detail.tsx          # 会议详情页：转写、摘要、待办、对话、导出
    │   ├── realtime-meeting.tsx        # 实时录音会议页：麦克风录音 + 实时转写聊天
    │   ├── RecordUpload.tsx            # 音频文件上传页：选择文件后转写为新会议
    │   └── settings.tsx                # 设置页：模板管理、配置项
    │
    ├── components/
    │   ├── layout/
    │   │   └── Navbar.tsx              # 顶部导航栏
    │   ├── recording/
    │   │   ├── AudioWaveform.tsx       # 实时音频波形可视化
    │   │   ├── LiveTranscript.tsx      # 实时转写文本展示
    │   │   └── RecordButton.tsx        # 录音启停按钮组件
    │   ├── transcript/
    │   │   ├── ChapterNavigation.tsx   # 章节导航侧边栏
    │   │   ├── TranscriptList.tsx      # 转写片段列表
    │   │   └── TranscriptItem.tsx      # 单条转写片段组件
    │   ├── summary/
    │   │   ├── SummaryPanel.tsx        # 会议摘要展示面板
    │   │   ├── ActionItemsPanel.tsx    # 待办事项管理面板
    │   │   └── ChatPanel.tsx           # 会议对话问答面板
    │   ├── chat/
    │   │   └── MeetingChatPanel.tsx    # 会议助手对话界面
    │   └── ui/                         # shadcn/ui 基础组件（button、card、input 等）
    │
    ├── hooks/
    │   └── useRecording.ts             # 录音核心 Hook：WebSocket 连接、AudioWorklet、状态管理
    │
    ├── services/
    │   ├── api.ts                      # 后端 API 调用封装（会议、上传、摘要、对话、模板等）
    │   └── api-base.ts                 # API Base URL 与 WebSocket URL 解析工具
    │
    ├── store/                          # Zustand 全局状态
    │   ├── meetingStore.ts             # 会议列表与当前会议状态
    │   ├── recordingStore.ts           # 录音状态（idle / recording / processing 等）
    │   └── transcriptStore.ts          # 实时转写片段状态
    │
    └── lib/
        ├── app-entry.ts                # 判断当前路径是否为 /app 独立入口模式
        ├── recording-wav.ts            # WAV 音频文件编码与处理工具
        └── utils.ts                    # 通用工具函数（cn 等）
```

---

## 后端 (backend/)

```
backend/
├── main.py                             # 入口：启动 uvicorn
├── pyproject.toml                      # Python 项目配置与依赖
├── uv.lock                             # uv 依赖锁定文件
├── Dockerfile                          # 后端镜像构建
├── start.sh / start.bat                # 后端启动脚本
├── meetily.db                          # SQLite 数据库文件
│
├── app/
│   ├── main.py                         # FastAPI 应用、生命周期、CORS、路由注册、模板接口、WebSocket
│   ├── config.py                       # 环境变量读取（LLM Provider / Model / API Key）
│   ├── models.py                       # Pydantic 请求/响应模型定义
│   ├── summarize.py                    # LLM Prompt 模板（摘要、翻译、章节提取）与底层调用封装
│   ├── diarization.py                  # 说话人分离后处理：句子合并与归一化
│   ├── ws_record.py                    # WebSocket `/ws/record` 处理器：实时音频流转发听悟
│   ├── temp_media.py                   # 临时媒体文件缓存与管理
│   ├── tingwu_client.py                # 阿里云听悟（Tingwu）REST API 客户端
│   ├── dashscope_asr.py                # DashScope 语音识别客户端
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   └── meetings.py             # 会议 REST API 路由（CRUD、上传、摘要、对话等）
│   │   └── deps/
│   │       └── auth.py                 # 认证依赖（CurrentUser / get_current_user）
│   │
│   ├── services/                       # 业务逻辑层
│   │   ├── meeting_service.py          # 会议核心业务：保存、上传、重命名、摘要、翻译、章节提取、对话入口
│   │   ├── meeting_agent.py            # LangGraph ReAct Agent：实现会议智能对话（read/grep 工具）
│   │   ├── summary_service.py          # 摘要生成、翻译、章节提取、要点挑选服务
│   │   ├── transcription_service.py    # 通用音频转写服务（文本分段）
│   │   ├── tingwu_transcription_service.py  # 听悟文件转写服务
│   │   ├── tingwu_realtime_service.py  # 听悟实时转写会话管理
│   │   ├── rtc_service.py              # RTC（实时通信）相关服务
│   │   └── auth_service.py             # 认证服务
│   │
│   ├── repositories/                   # 数据访问层（SQLite / aiosqlite）
│   │   ├── meetings.py                 # 会议表的增删改查
│   │   ├── action_items.py             # 待办事项表的增删改查
│   │   ├── speaker_labels.py           # 发言人标签表的增删改查
│   │   ├── templates.py                # 摘要模板表的增删改查
│   │   ├── db.py                       # 数据库初始化（建表）
│   │   └── _common.py                  # 数据库连接、通用工具、行转换函数
│   │
│   └── clients/                        # 第三方客户端封装
│       ├── llm_client.py               # LLM 多提供商统一客户端（OpenAI / 通义千问 / Claude）
│       └── transcription_client.py     # 转写客户端封装
│
├── nls/                                # 阿里云 NLS SDK（语音合成/识别/实时会议）
│   ├── core.py
│   ├── realtime_meeting.py
│   ├── speech_recognizer.py
│   ├── speech_synthesizer.py
│   ├── speech_transcriber.py
│   ├── token.py
│   └── websocket/                      # NLS WebSocket 底层实现
│
└── tests/                              # 测试用例
    ├── conftest.py
    ├── test_upload_meeting.py
    ├── test_recorded_meeting_upload.py
    ├── test_meeting_diarization.py
    ├── test_meeting_speakers.py
    ├── test_meeting_translation.py
    ├── test_meeting_project_classification.py
    ├── test_summary_fallback.py
    ├── test_tingwu_client.py
    ├── test_tingwu_realtime_service.py
    ├── test_tingwu_transcription_service.py
    ├── test_ws_record.py
    ├── test_action_items.py
    ├── test_repository_compat.py
    └── test_upload_transcription.py
```

---

## 数据流概览

1. **实时录音**：前端 `useRecording` → WebSocket `/ws/record` → `ws_record.py` → 听悟实时服务 → `transcriptStore`
2. **文件上传**：前端 `RecordUpload.tsx` → `api.uploadMeeting` → `meeting_service.upload_meeting` → 听悟文件转写 → 保存到 DB
3. **摘要生成**：`meeting_service.summarize_meeting` → BackgroundTask → `summary_service.generate_summary` → LLM → DB
4. **章节提取**：`meeting_service.get_meeting_chapters` → `summary_service.generate_chapters` → LLM → 持久化缓存到 DB
5. **会议对话**：`meeting_service.chat_with_meeting` → `meeting_agent.run_meeting_agent` → LangGraph ReAct Agent（read/grep 工具）→ LLM
6. **翻译**：`meeting_service.translate_meeting` → `summary_service.translate_transcript_text` → LLM 逐段翻译 → DB