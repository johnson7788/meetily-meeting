会议讲了什么？

根据会议记录，目前没有生成摘要内容。我可以为您读取完整的会议转写记录、待办事项、元信息（如标题、参会人、时间等），或者按关键词搜索具体内容。您希望了解哪方面的信息？例如：

- 会议的完整讨论内容（转写记录）  
- 明确提出的待办事项（任务列表）  
- 会议的基本信息（标题、主持人、参会人、时间等）  
- 某个特定话题或关键词的讨论片段  

请告诉我您的需求，我将为您调取相应信息。

生成会议摘要

根据会议记录，当前**没有生成摘要内容**（摘要字段为空）。

不过，我可以为您获取以下信息以帮助理解会议内容：

- ✅ 完整的会议转写记录（含发言时间、发言人、对话内容）  
- ✅ 待办事项列表（已明确分配的任务）  
- ✅ 会议元信息（标题、主持人、参会人、时间、时长等）  
- 🔍 按关键词（如“预算”“上线”“测试”等）搜索具体讨论内容  

您希望优先查看哪一部分？例如：  
- “请读出全部待办事项”  
- “显示会议的基本信息”  
- “查找张伟提到的‘交付时间’相关内容”  

欢迎随时告诉我。

好的，会议开始时间？

对话失败：500 {"detail":"对话失败: sequence item 0: expected str instance, NoneType found"}

http://localhost:5173/meetings/m-1778730523848-ncgk3y

日志:
11:48:29 [INFO] meetily.ws - PCM 帧[3300] bytes=3200 samples=1600 peak=9215 avg=853 silent=false
11:48:34 [INFO] meetily.ws - PCM 帧[3350] bytes=3200 samples=1600 peak=1160 avg=226 silent=false
11:48:39 [INFO] meetily.ws - PCM 帧[3400] bytes=3200 samples=1600 peak=771 avg=179 silent=false
11:48:42 [INFO] meetily.ws - 收到 stop，共 3437 帧音频
INFO:     connection closed
11:48:44 [INFO] meetily - POST /api/meetings → 保存 m-1778730523848-ncgk3y（32 段）
INFO:     127.0.0.1:65074 - "POST /api/meetings HTTP/1.1" 200 OK
11:48:44 [INFO] meetily - GET /api/meetings → 9 条
INFO:     127.0.0.1:65074 - "GET /api/meetings HTTP/1.1" 200 OK
11:48:44 [INFO] meetily.ws - WS 会话结束
INFO:     127.0.0.1:65074 - "OPTIONS /api/meetings/m-1778730523848-ncgk3y HTTP/1.1" 200 OK
INFO:     127.0.0.1:65078 - "OPTIONS /api/meetings/m-1778730523848-ncgk3y/chapters HTTP/1.1" 200 OK
INFO:     127.0.0.1:65080 - "OPTIONS /api/meetings/m-1778730523848-ncgk3y HTTP/1.1" 200 OK
INFO:     127.0.0.1:65081 - "OPTIONS /api/meetings/m-1778730523848-ncgk3y/chapters HTTP/1.1" 200 OK
INFO:     127.0.0.1:65074 - "GET /api/meetings/m-1778730523848-ncgk3y HTTP/1.1" 200 OK
INFO:     127.0.0.1:65078 - "GET /api/meetings/m-1778730523848-ncgk3y HTTP/1.1" 200 OK
11:48:53 [INFO] httpx - HTTP Request: POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions "HTTP/1.1 200 OK"
INFO:     127.0.0.1:65080 - "POST /api/meetings/m-1778730523848-ncgk3y/chapters HTTP/1.1" 200 OK
11:48:53 [INFO] httpx - HTTP Request: POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions "HTTP/1.1 200 OK"
INFO:     127.0.0.1:65081 - "POST /api/meetings/m-1778730523848-ncgk3y/chapters HTTP/1.1" 200 OK
INFO:     127.0.0.1:65101 - "OPTIONS /api/meetings/m-1778730523848-ncgk3y/chat HTTP/1.1" 200 OK
11:48:58 [INFO] httpx - HTTP Request: POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions "HTTP/1.1 200 OK"
11:49:01 [INFO] httpx - HTTP Request: POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions "HTTP/1.1 200 OK"
INFO:     127.0.0.1:65101 - "POST /api/meetings/m-1778730523848-ncgk3y/chat HTTP/1.1" 200 OK
11:49:25 [INFO] httpx - HTTP Request: POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions "HTTP/1.1 200 OK"
11:49:29 [INFO] httpx - HTTP Request: POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions "HTTP/1.1 200 OK"
INFO:     127.0.0.1:65129 - "POST /api/meetings/m-1778730523848-ncgk3y/chat HTTP/1.1" 200 OK
11:49:50 [INFO] httpx - HTTP Request: POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions "HTTP/1.1 200 OK"
11:49:50 [ERROR] meetily - 会议对话失败 m-1778730523848-ncgk3y: sequence item 0: expected str instance, NoneType found
INFO:     127.0.0.1:65154 - "POST /api/meetings/m-1778730523848-ncgk3y/chat HTTP/1.1" 500 Internal Server Error
