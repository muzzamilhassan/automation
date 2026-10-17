# Repair + relaunch: fix torchao, verify AceStep import, relaunch generation,
# poll to completion, upload to GitHub release. Single connection.
import subprocess, json, sys, os, time, re

UVX = r"C:\Users\Revnix\AppData\Roaming\Python\Python314\Scripts\uvx.exe"
proc = subprocess.Popen(
    [UVX, "git+https://github.com/googlecolab/colab-mcp"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=open("colab-repair-stderr.log", "wb"),
    text=True, encoding="utf-8", bufsize=1)

send_id = 2000
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

def run_code(code, timeout=180):
    marker = "REPAIRMARK" + str(int(time.time() * 1000) % 100000)
    code = marker + "\n" + code
    call("add_code_cell", {"cellIndex": 0, "language": "python", "code": code}, 60)
    time.sleep(1)
    cells_txt = call("get_cells", {"includeOutputs": True}, 60)
    try:
        cj = json.loads(cells_txt)
        items = cj if isinstance(cj, list) else cj.get("cells", [])
    except:
        items = []
    target = None
    for c in items:
        srcjoin = "".join(c.get("source") or []) if isinstance(c.get("source"), list) else str(c.get("source") or "")
        if (c.get("cell_type") or "code") == "code" and marker in srcjoin:
            target = c
    if not target:
        return "(cell not found)"
    cid = target.get("id") or target.get("cell_id")
    call("run_code_cell", {"cellId": cid}, timeout)
    time.sleep(2)
    cells_txt2 = call("get_cells", {"includeOutputs": True}, 60)
    try:
        cj2 = json.loads(cells_txt2)
        items2 = cj2 if isinstance(cj2, list) else cj2.get("cells", [])
    except:
        items2 = []
    texts = []
    def walk(o):
        got = []
        if isinstance(o, dict):
            for k, v in o.items():
                if k == "text": got.append("".join(v) if isinstance(v, list) else v)
                else: got.extend(walk(v))
        elif isinstance(o, list):
            for i in o: got.extend(walk(i))
        return got
    for c in items2:
        if (c.get("id") or c.get("cell_id")) == cid:
            texts.extend(walk(c.get("outputs", [])))
    return "\n".join(texts)[:800] if texts else "(no output)"

# 1. fix torchao
print("== fix torchao ==")
print(run_code("""
import subprocess
r = subprocess.run(['pip', 'install', '-Uq', 'torchao'], capture_output=True, text=True)
print('rc', r.returncode)
print((r.stderr or '')[-200:])
"""))

# 2. verify AceStep import
print("== verify import ==")
print(run_code("""
try:
    from diffusers import AceStepPipeline
    print('IMPORT_OK')
except Exception as e:
    print('IMPORT_FAIL', str(e)[:150])
"""))

# 3. relaunch generation (background)
gen_py = open(r"C:\Users\Revnix\Documents\youtube-automation\own-music\generate_runtime.py", encoding="utf-8").read()
writer = ("from pathlib import Path\nf = Path('/content/generate.py')\n"
          "f.write_text(" + repr(gen_py) + ")\nprint('written', len(f.read_text()))")
print("== write generate.py ==")
print(run_code(writer)[:120])
print("== launch ==")
print(run_code("""
import subprocess
subprocess.Popen(['nohup', 'python', '/content/generate.py'],
                 stdout=open('/content/generate.log', 'w'),
                 stderr=subprocess.STDOUT, start_new_session=True)
print('launched')
"""))
print("REPAIR_DONE")
