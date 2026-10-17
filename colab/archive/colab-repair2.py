# Repair v2 with GITHUB STATUS REPORTING — every step writes own-music/status.json
# to the repo, so ground truth is readable from the local machine without
# relying on Colab output extraction.
import subprocess, json, sys, os, time, re

UVX = r"C:\Users\Revnix\AppData\Roaming\Python\Python314\Scripts\uvx.exe"
REPO = "muzzamilhassan/automation"
TOKEN = ""
for line in open(r"C:\Users\Revnix\Documents\youtube-automation\.env", encoding="utf-8"):
    m = re.match(r"^GITHUB_PAT=(.*)$", line)
    if m: TOKEN = m.group(1).strip()
if not TOKEN:
    print("FATAL: no GITHUB_PAT"); sys.exit(1)

proc = subprocess.Popen(
    [UVX, "git+https://github.com/googlecolab/colab-mcp"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=open("colab-repair2-stderr.log", "wb"),
    text=True, encoding="utf-8", bufsize=1)

send_id = 3000
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

# every cell gets this prelude so it can report status to the repo itself
PRELUDE = """
import json, urllib.request, datetime, base64
TOKEN = {token!r}
def _status(step, ok, err=''):
    payload = json.dumps({{'step': step, 'ok': ok, 'err': str(err)[:200],
                           'ts': datetime.datetime.utcnow().isoformat()}}).encode()
    body = json.dumps({{'message': f'status: {{step}}',
                        'content': base64.b64encode(payload).decode(), 'branch': 'main'}}).encode()
    req = urllib.request.Request(
        'https://api.github.com/repos/{repo}/contents/own-music/status.json',
        method='PUT', data=body,
        headers={{'Authorization': f'Bearer {{TOKEN}}', 'User-Agent': 'colab-status',
                 'Accept': 'application/vnd.github+json'}})
    try:
        urllib.request.urlopen(req)
        print('STATUS_WRITTEN', step, ok)
    except Exception as e:
        print('STATUS_FAIL', str(e)[:80])
""".format(token=TOKEN, repo=REPO)

def run_code(code, timeout=240, step="step"):
    marker = "REPAIRMARK" + str(int(time.time() * 1000) % 100000)
    full = "# " + marker + "\n" + PRELUDE + "\ntry:\n" + "\n".join("    " + l for l in code.split("\n")) + \
           "\n    _status(" + repr(step) + ", True)\nexcept Exception as e:\n" + \
           "    _status(" + repr(step) + ", False, str(e)[:200])\n    raise"
    call("add_code_cell", {"cellIndex": 0, "language": "python", "code": full}, 60)
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
    return "\n".join(texts)[:900] if texts else "(no output)"

def marker_template():
    return "STATUS_WRITTEN"

# ---- STEP 1: fix torchao + verify AceStep import ----
print("== STEP 1: torchao fix + import verify ==")
out = run_code("""
import subprocess
r = subprocess.run(['pip', 'install', '-Uq', 'torchao'], capture_output=True, text=True)
print('torchao rc', r.returncode)
from diffusers import AceStepPipeline
print('AceStepPipeline IMPORT_OK')
""", timeout=240, step="torchao_import")
print(out[:400])

# ---- STEP 2: write generate.py + launch ----
gen_py = open(r"C:\Users\Revnix\Documents\youtube-automation\own-music\generate_runtime.py", encoding="utf-8").read()
writer = ("from pathlib import Path\nf = Path('/content/generate.py')\n"
          "f.write_text(" + repr(gen_py) + ")\nprint('written', len(f.read_text()))")
print("== STEP 2: write + launch generation ==")
out = run_code(writer, 120, step="write_generate")
print(out[:200])
out = run_code("""
import subprocess
subprocess.Popen(['nohup', 'python', '/content/generate.py'],
                 stdout=open('/content/generate.log', 'w'),
                 stderr=subprocess.STDOUT, start_new_session=True)
print('launched')
""", 60, step="launch_generation")
print(out[:200])

print("REPAIR2_DONE — check own-music/status.json + /content/generate.log")
