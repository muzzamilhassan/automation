# Quick diagnostic v2: connect, add+run a status cell, extract ALL text.
import subprocess, json, sys, os, time

UVX = r"C:\Users\Revnix\AppData\Roaming\Python\Python314\Scripts\uvx.exe"
proc = subprocess.Popen(
    [UVX, "git+https://github.com/googlecolab/colab-mcp"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=open("colab-diag-stderr.log", "wb"),
    text=True, encoding="utf-8", bufsize=1)

send_id = 1000
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
deadline = time.time() + 90
while time.time() < deadline:
    line = proc.stdout.readline()
    try:
        msg = json.loads(line)
        if msg.get("id") == 1:
            print("init OK")
            break
    except: pass
send({"jsonrpc": "2.0", "method": "notifications/initialized"})

def call(name, args, timeout=180):
    r = rpc("tools/call", {"name": name, "arguments": args}, timeout)
    res = r.get("result") or {}
    try: return "\n".join(c.get("text", "") for c in res.get("content", []))
    except: return ""

res = call("open_colab_browser_connection", {}, 400)
print("connect:", res[:40])

status_code = """
import os, glob, subprocess
ps = subprocess.run(['bash', '-c', "ps aux | grep generate.py | grep -v grep | wc -l"], capture_output=True, text=True)
print('GENPROC', ps.stdout.strip())
log = open('/content/generate.log').read() if os.path.exists('/content/generate.log') else '(no log)'
print('LOGTAIL', ' || '.join(log.splitlines()[-3:])[-300:])
print('MP3S', len(glob.glob('/content/own-music/*/*.mp3')))
"""

# add the cell
n_add = call("add_code_cell", {"cellIndex": 0, "language": "python", "code": status_code}, 60)
# get cells to find its id
cells_txt = call("get_cells", {"includeOutputs": True}, 60)
try:
    cj = json.loads(cells_txt)
    items = cj if isinstance(cj, list) else cj.get("cells", [])
except:
    items = []
target = None
for c in items:
    srcjoin = "".join(c.get("source") or []) if isinstance(c.get("source"), list) else str(c.get("source") or "")
    if (c.get("cell_type") or "code") == "code" and "GENPROC" in srcjoin:
        target = c
if target:
    cid = target.get("id") or target.get("cell_id")
    print("found status cell:", cid)
    run_res = call("run_code_cell", {"cellId": cid}, 120)
    # outputs: re-fetch cells with outputs
    cells_txt2 = call("get_cells", {"includeOutputs": True}, 60)
    found_out = False
    def walk(o):
        got = []
        if isinstance(o, dict):
            for k, v in o.items():
                if k == "text": got.append("".join(v) if isinstance(v, list) else v)
                else: got.extend(walk(v))
        elif isinstance(o, list):
            for i in o: got.extend(walk(i))
        return got
    try:
        cj2 = json.loads(cells_txt2)
        items2 = cj2 if isinstance(cj2, list) else cj2.get("cells", [])
        for c in items2:
            if (c.get("id") or c.get("cell_id")) == cid:
                texts = walk(c.get("outputs", []))
                if texts: print("CELL OUTPUT:", "\n".join(texts)[:600]); found_out = True
    except Exception as e:
        print("parse err", e)
    if not found_out: print("(no outputs captured from get_cells)")
else:
    print("status cell not found — get_cells sample:", cells_txt[:300])
