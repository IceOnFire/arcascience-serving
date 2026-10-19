FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# CPU-only PyTorch first, from PyTorch's own index: the default wheel for x86_64 Linux
# bundles CUDA libraries, several GB that a CPU server never uses. Then everything else
# from PyPI, where torch is already satisfied.
COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu "torch>=2.14" \
 && pip install -r requirements.txt

# Run as an unprivileged user; /data holds the prediction log (a volume in docker-compose.yml)
RUN useradd --create-home --uid 1000 app && mkdir /data && chown app /data
COPY app/ app/
COPY model/ model/
USER app

ENV DATABASE_PATH=/data/predictions.sqlite3
EXPOSE 8000

# The image has no curl: Python checks /health
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"]

# Configuration (API_KEY, EMBEDDING_URL, GPU_MODEL_SERVER_API_KEY) comes from the environment
# at run time, never from the image
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
