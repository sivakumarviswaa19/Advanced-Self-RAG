from datetime import datetime, timedelta
from jose import JWTError, jwt
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
import os

from database import get_user_by_id, upsert_google_user

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "changeme-set-a-real-secret-in-env")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


oauth = OAuth()
oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

router = APIRouter( tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/google", auto_error=False)



def create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = get_user_by_id(int(user_id))
    if user is None:
        raise credentials_exception
    return user




@router.get("/auth/google")
async def google_login(request: Request):
    """Step 1 — redirect the browser to Google's consent screen."""
    redirect_uri = request.url_for("google_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/auth/google/callback", name="google_callback")
async def google_callback(request: Request):
    """Step 2 — Google redirects here with an auth code.
    Exchange it for tokens, extract user info, upsert in DB, issue JWT."""
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google auth failed")

    user_info = token.get("userinfo")
    if not user_info:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not fetch user info from Google")

    user = upsert_google_user(
        email=user_info["email"],
        name=user_info.get("name", ""),
        google_id=user_info["sub"],       # Google's stable unique ID for the account
        picture=user_info.get("picture"),
    )

    access_token = create_access_token(user["user_id"])

    return RedirectResponse(url=f"{FRONTEND_URL}/auth/callback?token={access_token}")


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    """Return the authenticated user's profile. Requires Bearer token."""
    return current_user
