from collections.abc import AsyncIterator

from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.config import get_settings

pool = AsyncConnectionPool(
    get_settings().database_url,
    kwargs={"row_factory": dict_row},
    open=False,
)


async def get_conn() -> AsyncIterator[AsyncConnection]:
    async with pool.connection() as conn:
        yield conn
