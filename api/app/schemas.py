from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

MAX_TEXTS = 256
EndpointText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class PredictRequest(BaseModel):
    texts: list[EndpointText] = Field(min_length=1, max_length=MAX_TEXTS,
                                      examples=[["Change from baseline in HbA1c at week 24"]])


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
