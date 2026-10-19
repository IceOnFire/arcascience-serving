from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (or a .env file)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    api_key: str = ""                   # what callers send in X-API-Key; required at startup
    gpu_model_server_api_key: str = ""  # upstream embedding API key; never leaves the server
    embedding_url: str = "https://model-gpu-test.arcascience.ai/text-embedding"
    model_dir: Path = Path(__file__).resolve().parent.parent / "model"

    embed_batch_size: int = 128     # texts per upstream request, as in optimized_embedder.py
    embed_timeout: float = 30.0     # seconds per upstream request
    embed_retries: int = 3          # extra attempts on 429/5xx and connection errors
