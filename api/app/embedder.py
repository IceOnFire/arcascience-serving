"""Async client for the embedding API.

Same request format and optimizations as optimized_embedder.py in the submission
(deduplication, batching, concurrent batches, keep-alive, retries), rewritten with
httpx so it doesn't block the FastAPI event loop.
"""

import asyncio

import httpx
import numpy as np

RETRY_STATUSES = {429, 500, 502, 503, 504}


class EmbeddingError(RuntimeError):
    """The embedding API could not produce embeddings for a request."""


class EmbeddingClient:
    def __init__(self, url, api_key, model, dimension, batch_size=128, timeout=30.0, retries=3):
        self.url, self.model, self.dimension = url, model, dimension
        self.batch_size, self.retries = batch_size, retries
        # One shared client: reuses TCP/TLS connections across requests
        self._client = httpx.AsyncClient(
            headers={"X-API-Key": api_key, "Accept-Encoding": "gzip"}, timeout=timeout
        )

    async def aclose(self):
        await self._client.aclose()

    async def embed(self, texts):
        """Embed a list of texts. Returns a float32 array (len(texts), dimension), in input order."""
        unique = list(dict.fromkeys(texts))  # each distinct text is embedded once
        batches = [unique[i:i + self.batch_size] for i in range(0, len(unique), self.batch_size)]
        results = await asyncio.gather(*(self._embed_batch(b) for b in batches))
        vectors = dict(zip(unique, (v for batch in results for v in batch)))
        return np.asarray([vectors[t] for t in texts], dtype=np.float32)

    async def _embed_batch(self, texts):
        payload = {"input": texts, "normalize": True, "model": self.model,
                   "truncation_dimension": self.dimension}
        for attempt in range(self.retries + 1):
            try:
                response = await self._client.post(self.url, json=payload)
                if response.status_code not in RETRY_STATUSES:
                    break
                error = f"HTTP {response.status_code}"
            except httpx.TransportError as e:  # timeouts, connection resets, DNS
                error = f"{type(e).__name__}: {e}"
            if attempt < self.retries:
                await asyncio.sleep(0.5 * 2 ** attempt)  # 0.5 s, 1 s, 2 s, ...
        else:
            raise EmbeddingError(f"embedding API unavailable after {self.retries + 1} attempts ({error})")

        if response.is_error:
            raise EmbeddingError(f"embedding API returned HTTP {response.status_code}")
        result = response.json().get("result")
        if not isinstance(result, list) or len(result) != len(texts) \
                or any(len(v) != self.dimension for v in result):
            raise EmbeddingError("embedding API returned a malformed response")
        return result
