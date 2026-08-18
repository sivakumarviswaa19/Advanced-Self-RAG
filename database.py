import psycopg2
from dotenv import load_dotenv
load_dotenv()
import os

def get_con():

    conn=psycopg2.connect(os.getenv("DATABASE_URL"))

    return conn

con=get_con()
cursor=con.cursor()
cursor.execute("""
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)""")
cursor.execute("""CREATE TABLE IF NOT EXISTS chats (
    chat_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
)""")
cursor.execute("""
CREATE TABLE IF NOT EXISTS messages (
    message_id SERIAL PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    query TEXT NOT NULL,
    answer TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id)
        REFERENCES chats(chat_id)
        ON DELETE CASCADE
)""")

cursor.close()
con.commit()
con.close()
