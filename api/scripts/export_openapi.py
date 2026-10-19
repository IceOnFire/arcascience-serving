"""Write the API's OpenAPI schema to openapi.json: the contract the web apps generate their types from.

The schema only depends on the code, not on configuration or the model, so placeholder
settings are enough and no server needs to run. Run it after changing an endpoint or a
schema, and commit the result:

  .venv/bin/python scripts/export_openapi.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

placeholders = Settings(api_key="-", gpu_model_server_api_key="-", embedding_url="-", _env_file=None)
schema = create_app(placeholders).openapi()
(ROOT / "openapi.json").write_text(json.dumps(schema, indent=2) + "\n")
print(f"Wrote openapi.json: {len(schema['paths'])} paths, {len(schema['components']['schemas'])} schemas")
