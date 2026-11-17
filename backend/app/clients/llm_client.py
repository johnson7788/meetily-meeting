from anthropic import AsyncAnthropic
from openai import AsyncOpenAI


def create_prompt_completion(prompt: str, provider: str, model: str, api_key: str):
    if provider == "qwen":
        client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        )
        return client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
        )
    if provider == "claude":
        client = AsyncAnthropic(api_key=api_key)
        return client.messages.create(
            model=model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
    if provider == "openai":
        client = AsyncOpenAI(api_key=api_key)
        return client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
        )
    raise ValueError(f"不支持的 provider: {provider}")


async def generate_text(prompt: str, provider: str, model: str, api_key: str) -> str:
    if provider == "qwen":
        client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        )
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content or ""
    if provider == "claude":
        client = AsyncAnthropic(api_key=api_key)
        response = await client.messages.create(
            model=model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text
    if provider == "openai":
        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content or ""
    raise ValueError(f"不支持的 provider: {provider}")

