import secrets
from contextlib import asynccontextmanager

import numpy as np
from fastapi import Depends, FastAPI, HTTPException, Request, Security
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader

from .classifier import LoadedModel, load_model
from .config import Settings
from .embedder import EmbeddingClient, EmbeddingError
from .schemas import CategoryScore, Health, Prediction, PredictRequest, PredictResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the model and open the upstream connection once, not per request."""
    settings = app.state.settings
    model = load_model(settings.model_dir)
    embedding = model.manifest["embedding"]
    app.state.model = model
    app.state.embedder = EmbeddingClient(
        settings.embedding_url, settings.gpu_model_server_api_key, embedding["model"],
        embedding["dimension"], settings.embed_batch_size, settings.embed_timeout, settings.embed_retries,
    )
    yield
    await app.state.embedder.aclose()


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="Endpoint classifier", version="1.0.0", lifespan=lifespan,
                  description="Classifies clinical trial endpoints into 9 categories.")
    app.state.settings = settings or Settings()

    api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

    def require_api_key(key: str | None = Security(api_key_header)):
        if not key or not secrets.compare_digest(key, app.state.settings.api_key):
            raise HTTPException(status_code=401, detail="Invalid or missing API key")

    def get_model(request: Request) -> LoadedModel:
        return request.app.state.model

    @app.exception_handler(EmbeddingError)
    async def embedding_unavailable(request: Request, exc: EmbeddingError):
        # The model can't run without embeddings: a dependency is down, not a bad request
        return JSONResponse(status_code=503, content={"detail": str(exc)}, headers={"Retry-After": "5"})

    @app.post("/predict", response_model=PredictResponse, dependencies=[Depends(require_api_key)])
    async def predict(body: PredictRequest, request: Request, model: LoadedModel = Depends(get_model)):
        X = await request.app.state.embedder.embed(body.texts)
        # A 768 -> 512 -> 128 -> 9 network on a few hundred rows takes well under a millisecond,
        # so it runs inline rather than in a thread pool
        proba = model.predict_proba(X)
        threshold = model.manifest["review_threshold"]
        predictions = []
        for p in proba:
            top = np.argsort(p)[::-1][:3]
            predictions.append(Prediction(
                category=model.classes[top[0]], confidence=float(p[top[0]]),
                needs_review=bool(p[top[0]] < threshold),
                top=[CategoryScore(category=model.classes[i], probability=float(p[i])) for i in top],
            ))
        return PredictResponse(model_version=model.manifest["classifier"]["version"], predictions=predictions)

    @app.get("/model", dependencies=[Depends(require_api_key)])
    async def model_info(model: LoadedModel = Depends(get_model)) -> dict:
        """The manifest: classifier version, the embedding space it depends on, its evaluation."""
        return model.manifest

    @app.get("/health", response_model=Health)
    async def health(model: LoadedModel = Depends(get_model)):
        """Liveness only: doesn't call the embedding API, so it stays cheap for load balancers."""
        return Health(status="ok", model_version=model.manifest["classifier"]["version"])

    return app
