"""CLI entrypoint for running the CORA FastAPI server."""

from __future__ import annotations

import argparse
import uvicorn

from .app import create_app


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the CORA AI FastAPI service.")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8082, help="Bind port (default: 8082)")
    parser.add_argument("--reload", action="store_true", help="Enable autoreload (for local dev)")
    args = parser.parse_args()

    uvicorn.run(
        "cora.app:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info"
    )


if __name__ == "__main__":
    main()
