import json
import urllib.request

payload = {
    "command": r"D:\Dev\repos\moshi\.venv\Scripts\python.exe",
    "args": ["-m", "moshi.server", "--hf-repo", "kyutai/moshiko-pytorch-bf16"],
    "cwd": r"D:\Dev\repos\moshi",
    "http_url": "http://127.0.0.1:8998",
}

req = urllib.request.Request(
    "http://127.0.0.1:10924/api/moshi/service/config",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=10) as resp:
    print(resp.read().decode("utf-8"))

