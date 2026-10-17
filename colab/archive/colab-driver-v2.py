# Colab MCP driver v2 — connect browser, discover tools, dump schemas.
import subprocess, json, sys, os, time

UVX = r"C:\Users\Revnix\AppData\Roaming\Python\Python314\Scripts\uvxx.exe"
UVX = r"C:\Users\Revnix\AppData\Roaming\Python\Python314\Scripts\uvx.exe"
LOG = r"C:\Users\Revnix\Documents\youtube-automation\colab-run.log"

proc = subprocess.Popen(
    [UVX, "git+https://github.com/googlecolab/colab-mcp"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=open(r"C:\Users\Revnix\Documents\youtube-automation\colab-mcp-stderr2.log", "wb"),
    text=True, encoding="utf-8", bufsize=1,
)
logf = open(LOG, "a", encoding="utf-8")
def log(s):
    logf.write(s + "\n"); logf.flush(); print(s, flush=True)

send_id = 0
def send(obj):
    proc.stdin.write(json.dumps(obj) + "\n"); proc.stdin.flush()

def read_until(want_id, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            time.sleep(0.05); continue
        line = line.strip()
        if not line: continue
        try: msg = json.loads(line)
        except: continue
        if msg.get("id") == want_id: return msg
        # notifications (list_changed etc.) ignored here
    return None

log("spawn + initialize")
send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
    "protocolVersion": "2024-11-05", "capabilities": {},
    "clientInfo": {"name": "quarry-zcode", "version": "1.0"}}})
if not read_until(1, 30): log("FATAL: no init response"); sys.exit(1)
send({"jsonrpc": "2.0", "method": "notifications/initialized"})

def tools_list(tag):
    global send_id
    send_id += 1
    send({"jsonrpc": "2.0", "id": 100 + send_id, "method": "tools/list"})
    r = read_until(100 + send_id, 30)
    return (r or {}).get("result", {}).get("tools", [])

tools = tools_list("pre")
log(f"pre-connect tools: {[t['name'] for t in tools]}")

# ---- open the browser connection (retry up to ~6 min for the user's T4 click) ----
send_id += 1
conn_id = 500
log("CALL open_colab_browser_connection — waiting for the user's T4 click in the browser tab")
send({"jsonrpc": "2.0", "id": conn_id, "method": "tools/call",
      "params": {"name": "open_colab_browser_connection", "arguments": {}}})

deadline = time.time() + 360
connected = False
while time.time() < deadline:
    line = proc.stdout.readline()
    if not line:
        time.sleep(0.05); continue
    line = line.strip()
    if not line: continue
    try: msg = json.loads(line)
    except: continue
    if msg.get("id") == conn_id:
        res = msg.get("result", {})
        txt = ""
        try: txt = res["content"][0]["text"]
        except: pass
        connected = Boolean = (res.get("isError") != True) and ("true" in txt.lower() or "success" in txt.lower() or txt.lower() in ("true", ""))
        log(f"open_colab_browser_connection returned: {txt[:120]!r} isError={res.get('isError')}")
        break
    if msg.get("method") == "notifications/tools/list_changed":
        log("tools/list_changed received — Colab tools unlocked")

if not connected:
    # some builds return the bool only via later message; probe tools anyway
    log("conn call ended; probing tools/list for colab tools")
tools = tools_list("post")
log(f"post-connect tools: {[t['name'] for t in tools]}")

schemas = {t["name"]: {"description": (t.get("description") or "")[:400], "inputSchema": t.get("inputSchema", {})} for t in tools}
json.dump({"connected": connected, "tools": schemas},
          open(r"C:\Users\Revnix\Documents\youtube-automation\colab-tools.json", "w", encoding="utf-8"),
          indent=1)
log("schemas dumped to colab-tools.json")

# keep the bridge process + websocket alive for the execution phase
log("KEEPALIVE (bridge stays up)")
while True:
    time.sleep(5)
    if proc.poll() is not None:
        log("server exited"); break
