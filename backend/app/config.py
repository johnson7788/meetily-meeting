import os


def get_llm_api_key() -> str:
    return os.getenv("LLM_API_KEY", "")


def get_llm_provider() -> str:
    return os.getenv("LLM_PROVIDER", "qwen")


def get_llm_model() -> str:
    return os.getenv("LLM_MODEL", "qwen-plus")
