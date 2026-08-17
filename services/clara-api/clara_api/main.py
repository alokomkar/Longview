import asyncio
import os
from functools import lru_cache

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .auth import AuthenticationError, FirebaseTokenVerifier, TokenVerifier, bearer_token
from .engine import AdkRecommendationEngine, EngineUnavailableError, RecommendationEngine
from .models import RecommendationRequest, RecommendationResponse


@lru_cache(maxsize=1)
def default_engine() -> RecommendationEngine:
    return AdkRecommendationEngine()


def create_app(
    verifier: TokenVerifier | None = None,
    engine: RecommendationEngine | None = None,
    timeout_seconds: float | None = None,
    allowed_origins: list[str] | None = None,
) -> FastAPI:
    app = FastAPI(title="Longview Clara API", version="0.1.0")
    request_timeout = timeout_seconds if timeout_seconds is not None else float(
        os.getenv("CLARA_TIMEOUT_SECONDS", "15")
    )
    if request_timeout <= 0:
        raise ValueError("CLARA_TIMEOUT_SECONDS must be greater than zero")
    origins = allowed_origins if allowed_origins is not None else [
        origin.strip()
        for origin in os.getenv("CLARA_ALLOWED_ORIGINS", "https://longview-505611.web.app").split(",")
        if origin.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    token_verifier = verifier or FirebaseTokenVerifier()

    @app.get("/healthz")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/clara/recommendations", response_model=RecommendationResponse, response_model_by_alias=True)
    async def recommend(
        context: RecommendationRequest,
        authorization: str | None = Header(default=None),
    ) -> RecommendationResponse:
        try:
            user_id = await token_verifier.verify(bearer_token(authorization))
        except AuthenticationError as error:
            raise HTTPException(status_code=401, detail="Authentication required") from error

        try:
            active_engine = engine or default_engine()
            raw = await asyncio.wait_for(
                active_engine.recommend(context, user_id), timeout=request_timeout
            )
        except TimeoutError as error:
            raise HTTPException(status_code=504, detail="Recommendation timed out") from error
        except (EngineUnavailableError, ImportError) as error:
            raise HTTPException(status_code=503, detail="Recommendation unavailable") from error

        try:
            response = RecommendationResponse.model_validate(raw)
        except ValidationError as error:
            raise HTTPException(status_code=502, detail="Invalid recommendation response") from error
        if response.request_id != context.request_id or response.source_plan_id != context.plan.id:
            raise HTTPException(status_code=502, detail="Mismatched recommendation response")
        return response

    return app


app = create_app()
