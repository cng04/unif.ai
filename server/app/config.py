from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://unifai:unifai@localhost:5432/unifai"
    gemini_api_key: str = ""
    ticketmaster_api_key: str = ""
    photon_api_key: str = ""
    client_url: str = "http://localhost:3000"

    feature_count: int = 12
    candidate_neighbors: int = 6
    max_conversation_turns: int = 12
    max_concurrent_conversations: int = 8
    min_group_size: int = 4
    max_group_size: int = 8


@lru_cache
def get_settings() -> Settings:
    return Settings()
