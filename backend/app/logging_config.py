import json
import logging
import os
from datetime import datetime, timezone


SERVICE_NAME = "task-suggester"


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "service": SERVICE_NAME,
        }
        for key in (
            "event", "user_id", "task_id", "action", "task_type", "category_ids",
            "method", "path", "status_code", "latency_ms", "client_ip",
            "trace_id", "request_id",
        ):
            val = getattr(record, key, None)
            if val is not None:
                entry[key] = val
        if record.exc_info:
            entry["stack_trace"] = self.formatException(record.exc_info)
        return json.dumps(entry)


def setup_logging() -> None:
    level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)

    stdout_handler = logging.StreamHandler()
    stdout_handler.setFormatter(JsonFormatter())
    handlers: list[logging.Handler] = [stdout_handler]

    log_path = "/var/log/app/app.log"
    try:
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        file_handler = logging.FileHandler(log_path)
        file_handler.setFormatter(JsonFormatter())
        handlers.append(file_handler)
    except OSError:
        pass  # container may not have writable /var/log/app

    logging.basicConfig(level=level, handlers=handlers, force=True)

    # Suppress uvicorn's own access log — our middleware replaces it
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
