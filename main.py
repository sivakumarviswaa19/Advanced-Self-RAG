from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from starlette.middleware.sessions import SessionMiddleware
import os
from dotenv import load_dotenv

from database import init_db
from auth import router as auth_router

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)


origins = [o.strip() for o in os.getenv("CORS_ORIGINS", os.getenv("FRONTEND_URL")).split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.add_middleware(SessionMiddleware, secret_key=os.getenv("SECRET_KEY", "changeme"))

app.include_router(auth_router)


@app.get("/")
def home():
    return {"message": "Welcome to Advanced_RAG_Agent"}
