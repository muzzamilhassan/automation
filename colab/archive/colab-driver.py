# Colab MCP driver — phase 1: spawn colab-mcp, MCP handshake, list tools.
import subprocess, json, sys, os, threading, time

UVX = r"C:\Users\Revnix\AppData\Roaming\Python\Python314\Scripts\uvx.exe"
proc = subprocess.Popen(
    [UVX, "git+https://github.com/googlecolab/colab-mcp"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=open(r"C:\Users\Revnix\Documents\youtube-automation\colab-mcp-stderr.log", "wb"),
    text=True, encoding="utf-8", bufsize=1,
)

send_id = 0
def send(obj):
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()

def read_until(want_id, timeout=30):
    deadline = time.time() + timeout
    lines = []
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            time.sleep(0.05); continue
        line = line.strip()
        if not line: continue
        try: msg = json.loads(line)
        except: continue
        if msg.get("id") == want_id: return msg
        lines.append(msg)
    return None

send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {"name": "quarry-zcode", "version": "1.0"}}})
init = read_until(1, 30)
print("initialize:", "OK" if init else "FAIL")
if init: print("  server:", init.get("result", {}).get("serverInfo", {}))
send({"jsonrpc": "2.0", "method": "notifications/initialized"})

send({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
tl = read_until(2, 20)
tools = (tl or {}).get("result", {}).get("tools", [])
print("tools:", [t["name"] for t in tools])
for t in tools:
    print("---", t["name"], "---")
    print((t.get("description") or "")[:300])

# keep the process alive so the session persists for later phases
print("KEEPALIVE")
while True:
    time.sleep(5)
    if proc.poll() is not None:
        print("server exited"); break
