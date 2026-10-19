from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

MAX_TEXTS = 256
EndpointText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class PredictRequest(BaseModel):
    texts: list[EndpointText] = Field(min_length=1, max_length=MAX_TEXTS,
                                      # pre-filled in /docs: one confident prediction, one flagged for review
                                      examples=[["Maximum plasma concentration (Cmax)", "Number of participants"]])


class CategoryScore(BaseModel):
    category: str
    probability: float


class Prediction(BaseModel):
    category: str
    confidence: float = Field(description="Probability of the predicted category")
    needs_review: bool = Field(description="Confidence below the model's review threshold")
    top: list[CategoryScore] = Field(description="The 3 most likely categories")


class PredictResponse(BaseModel):
    model_version: str
    predictions: list[Prediction] = Field(description="One per input text, in the same order")


class Health(BaseModel):
    status: str
    model_version: str


class Window(BaseModel):
    size: int
    capacity: int
    since: float | None = Field(description="Unix time of the oldest prediction in the window")


class CategoryShare(BaseModel):
    category: str
    share: float
    baseline: float


class ConfidenceShare(BaseModel):
    bin: tuple[float, float]
    share: float
    baseline: float


class DriftScore(BaseModel):
    psi: float = Field(description="Population Stability Index against the baseline")
    status: Literal["stable", "moderate", "significant"] = Field(description="< 0.1, 0.1 to 0.25, >= 0.25")


class Drift(BaseModel):
    categories: DriftScore
    confidence: DriftScore


class Stats(BaseModel):
    window: Window
    review_rate: float | None = None
    baseline_review_rate: float | None = None
    categories: list[CategoryShare] = []
    confidence: list[ConfidenceShare] = []
    drift: Drift | None = Field(description="Null until the window holds enough predictions to compare")


# --- Model manifest (written by scripts/package_model.py) ----------------------------------

class ClassifierInfo(BaseModel):
    name: str
    version: str
    file: str
    sha256: str
    classes: list[str]
    source: str = Field(description="Where the weights come from: repository, commit and path")
    trained_on: str = Field(description="Date of the commit that last changed the weights")


class EmbeddingInfo(BaseModel):
    model: str
    dimension: int
    normalize: bool


class Evaluation(BaseModel):
    accuracy: float
    macro_f1: float
    protocol: str


class CategoryBaseline(BaseModel):
    values: dict[str, float] = Field(description="Share of each predicted category")
    source: str


class ConfidenceBaseline(BaseModel):
    bins: list[float] = Field(description="Bin edges; the last bin starts at the review threshold")
    shares: list[float]
    source: str


class Baseline(BaseModel):
    category_shares: CategoryBaseline
    confidence: ConfidenceBaseline


class Manifest(BaseModel):
    classifier: ClassifierInfo
    embedding: EmbeddingInfo
    evaluation: Evaluation
    review_threshold: float
    baseline: Baseline
