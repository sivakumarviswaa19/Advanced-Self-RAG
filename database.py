import psycopg2
from psycopg2 import pool
from contextlib import contextmanager
from dotenv import load_dotenv
import os
from psycopg2 import pool, OperationalError, InterfaceError
load_dotenv()

_pool = psycopg2.pool.SimpleConnectionPool(1, 10, os.getenv("DATABASE_URL"))


@contextmanager
def get_db():
    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
        _pool.putconn(conn)
    except (OperationalError, InterfaceError):
        _pool.putconn(conn, close=True)
        raise
    except Exception:
        conn.rollback()
        _pool.putconn(conn)
        raise


def init_db():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id    SERIAL PRIMARY KEY,
                email      TEXT UNIQUE NOT NULL,
                name       TEXT,
                google_id  TEXT UNIQUE,
                picture    TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # migrations for tables created before google auth columns existed
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS chats (
                chat_id    SERIAL PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                title      TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                message_id SERIAL PRIMARY KEY,
                chat_id    INTEGER NOT NULL REFERENCES chats(chat_id) ON DELETE CASCADE,
                query      TEXT NOT NULL,
                answer     TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.close()



def _row_to_user(row) -> dict:
    return {
        "user_id": row[0], "email": row[1], "name": row[2],
        "google_id": row[3], "picture": row[4], "created_at": row[5],
    }


def get_user_by_email(email: str) -> dict | None:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT user_id, email, name, google_id, picture, created_at FROM users WHERE email = %s",
            (email,),
        )
        row = cur.fetchone()
        cur.close()
    return _row_to_user(row) if row else None


def get_user_by_id(user_id: int) -> dict | None:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT user_id, email, name, google_id, picture, created_at FROM users WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
        cur.close()
    return _row_to_user(row) if row else None


def upsert_google_user(email: str, name: str, google_id: str, picture: str | None = None) -> dict:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO users (email, name, google_id, picture)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (email) DO UPDATE
                SET name      = EXCLUDED.name,
                    google_id = EXCLUDED.google_id,
                    picture   = EXCLUDED.picture
            RETURNING user_id, email, name, google_id, picture, created_at
        """, (email, name, google_id, picture))
        row = cur.fetchone()
        cur.close()
    return _row_to_user(row)



def create_chat(user_id: int, title: str = "New Chat") -> dict:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO chats (user_id, title) VALUES (%s, %s) RETURNING chat_id, title, created_at",
            (user_id, title),
        )
        row = cur.fetchone()
        cur.close()
    return {"chat_id": row[0], "title": row[1], "created_at": row[2]}


def get_user_chats(user_id: int) -> list[dict]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT chat_id, title, created_at FROM chats WHERE user_id = %s ORDER BY created_at DESC",
            (user_id,),
        )
        rows = cur.fetchall()
        cur.close()
    return [{"chat_id": r[0], "title": r[1], "created_at": r[2]} for r in rows]


def delete_chat(chat_id: int, user_id: int) -> bool:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM chats WHERE chat_id = %s AND user_id = %s",
            (chat_id, user_id),
        )
        deleted = cur.rowcount > 0
        cur.close()
    return deleted




def add_message(chat_id: int, query: str, answer: str) -> dict:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO messages (chat_id, query, answer) VALUES (%s, %s, %s) RETURNING message_id, created_at",
            (chat_id, query, answer),
        )
        row = cur.fetchone()
        cur.close()
    return {"message_id": row[0], "chat_id": chat_id, "query": query, "answer": answer, "created_at": row[1]}


def get_chat_messages(chat_id: int) -> list[dict]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT message_id, query, answer, created_at FROM messages WHERE chat_id = %s ORDER BY created_at ASC",
            (chat_id,),
        )
        rows = cur.fetchall()
        cur.close()
    return [{"message_id": r[0], "query": r[1], "answer": r[2], "created_at": r[3]} for r in rows]
