import json
import os
import sys
from pathlib import Path

try:
    from rembg import new_session, remove
except Exception as error:
    print(json.dumps({"type": "init_error", "error": str(error)}), flush=True)
    sys.exit(1)


def emit(payload):
    print(json.dumps(payload), flush=True)


model_name = os.environ.get("REMBG_MODEL", "u2net")

try:
    session = new_session(model_name)
except Exception as error:
    emit({"type": "init_error", "error": f"Failed to load rembg model '{model_name}': {error}"})
    sys.exit(1)

emit({"type": "ready", "model": model_name})

for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue

    try:
        message = json.loads(line)
    except Exception:
        continue

    request_id = message.get("id")
    action = message.get("action")

    if action == "shutdown":
        emit({"id": request_id, "ok": True})
        break

    if action != "process":
        emit({"id": request_id, "ok": False, "error": "Unsupported action"})
        continue

    input_path = message.get("inputPath")
    output_path = message.get("outputPath")

    if not input_path or not output_path:
        emit({"id": request_id, "ok": False, "error": "Missing inputPath or outputPath"})
        continue

    try:
        with open(input_path, "rb") as input_file:
            input_bytes = input_file.read()

        output_bytes = remove(input_bytes, session=session)

        output_target = Path(output_path)
        output_target.parent.mkdir(parents=True, exist_ok=True)
        with open(output_target, "wb") as output_file:
            output_file.write(output_bytes)

        emit({"id": request_id, "ok": True})
    except Exception as error:
        emit({"id": request_id, "ok": False, "error": str(error)})
