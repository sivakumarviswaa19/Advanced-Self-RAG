from fastapi import FastAPI
from contextlib import asynccontextmanager

from database import init_db
from auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)

app.include_router(auth_router)


@app.get("/")
def home():
    return {"message": "Welcome to Advanced_RAG_Agent"}
