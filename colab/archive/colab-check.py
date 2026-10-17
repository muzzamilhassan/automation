# One-off runtime status check via colab-mcp (direct result text).
import subprocess, json, time

UVX = r"C:\Users\Revnix\AppData\Roaming\Python\Python314\Scripts\uvx.exe"
proc = subprocess.Popen(
    [UVX, "git+https://github.com/googlecolab/colab-mcp"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=open("colab-check-stderr.log", "wb"),
    text=True, encoding="utf-8", bufsize=1)

send_id = 7000
def send(obj): proc.stdin.write(json.dumps(obj) + "\n"); proc.stdin.flush()
def rpc(method, params, timeout=120):
    global send_id
    send_id += 1
    rid = send_id
    send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            if proc.poll() is not None: return {"error": "died"}
            time.sleep(0.05); continue
        try: msg = json.loads(line)
        except: continue
        if msg.get("id") == rid: return msg
    return {"error": "timeout"}

send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
    "protocolVersion": "2024-11-05", "capabilities": {},
    "clientInfo": {"name": "q", "version": "1.0"}}})
deadline = time.time() + 120
while time.time() < deadline:
    line = proc.stdout.readline()
    try:
        msg = json.loads(line)
        if msg.get("id") == 1:
            print("init OK", flush=True)
            break
    except: pass
send({"jsonrpc": "2.0", "method": "notifications/initialized"})

def call(name, args, timeout=240):
    r = rpc("tools/call", {"name": name, "arguments": args}, timeout)
    res = r.get("result") or {}
    try: return "\n".join(c.get("text", "") for c in res.get("content", []))
    except: return ""

res = call("open_colab_browser_connection", {}, 400)
print("connect:", res[:40], flush=True)

STATUS = """
import os, glob, subprocess, json
ps = subprocess.run(['bash', '-c', "ps aux | grep generate.py | grep -v grep | wc -l"], capture_output=True, text=True)
log = open('/content/generate.log').read() if os.path.exists('/content/generate.log') else '(no log)'
n = len(glob.glob('/content/own-music/*/*.mp3'))
out = json.dumps({'genproc': ps.stdout.strip(), 'mp3': n,
                  'tail': log.splitlines()[-2:] if log else []})
print('STATE' + out)
"""
call("add_code_cell", {"cellIndex": 0, "language": "python", "code": STATUS}, 60)
time.sleep(1)
cells_txt = call("get_cells", {}, 60)
cid = None
try:
    cj = json.loads(cells_txt)
    items = cj if isinstance(cj, list) else cj.get("cells", [])
    for c in items:
        srcjoin = "".join(c.get("source") or []) if isinstance(c.get("source"), list) else str(c.get("source") or "")
        if (c.get("cell_type") or "code") == "code" and "GENPROC-PROBE" in srcjoin and c.get("id"):
            cid = c.get("id")
except: pass
print("cell id:", cid, flush=True)
if cid:
    out = call("run_code_cell", {"cellId": cid}, 120)
    print("RUN RESULT:", out[:500], flush=True)
