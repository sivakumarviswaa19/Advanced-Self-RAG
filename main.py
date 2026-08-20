from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from starlette.middleware.sessions import SessionMiddleware
from pydantic import BaseModel, Field
import os
from dotenv import load_dotenv
from pydantic import BaseModel

from database import init_db
from auth import router as auth_router, get_current_user
from workflow import app as agent_app

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


class RespondRequest(BaseModel):
    query: str = Field(..., min_length=1, description="The user's question for the agent")


class RespondResponse(BaseModel):
    query: str
    answer: str


@app.post("/respond", response_model=RespondResponse)
def respond(body: RespondRequest, current_user: dict = Depends(get_current_user)):
    """Run the user's query through the RAG agent graph and return its answer."""

    initial_state = {
        "query": body.query,
        "iterations": 0
    }

    result = agent_app.invoke(initial_state)

    return RespondResponse(query=body.query, answer=result["final_ans"])
