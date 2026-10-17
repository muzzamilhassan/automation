# Colab MCP driver v4 — self-adapting cell execution + full own-music pipeline.
# Connect -> adapt to live tool schemas -> install -> generate (bg + poll) ->
# manifest -> upload to GitHub release -> summary.
import subprocess, json, sys, os, time, re

UVX = r"C:\Users\Revnix\AppData\Roaming\Python\Python314\Scripts\uvx.exe"
LOG = r"C:\Users\Revnix\Documents\youtube-automation\colab-run.log"
REPO = "muzzamilhassan/automation"
TAG = "own-music-v1"
pat = ""
for line in open(r"C:\Users\Revnix\Documents\youtube-automation\.env", encoding="utf-8"):
    m = re.match(r"^GITHUB_PAT=(.*)$", line)
    if m: pat = m.group(1).strip()

proc = subprocess.Popen(
    [UVX, "git+https://github.com/googlecolab/colab-mcp"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=open(r"C:\Users\Revnix\Documents\youtube-automation\colab-mcp-stderr4.log", "wb"),
    text=True, encoding="utf-8", bufsize=1,
)
logf = open(LOG, "a", encoding="utf-8")
def log(s):
    logf.write(s + "\n"); logf.flush(); print(s, flush=True)

send_id = 5000
def send(obj): proc.stdin.write(json.dumps(obj) + "\n"); proc.stdin.flush()

def read_until(want_id, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            time.sleep(0.05)
            if proc.poll() is not None: return None
            continue
        try: msg = json.loads(line)
        except: continue
        if msg.get("id") == want_id: return msg
    return None

def rpc(method, params, timeout=120):
    global send_id
    send_id += 1
    rid = send_id
    send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
    r = read_until(rid, timeout)
    return (r or {}).get("result") or {}

def call_tool(name, args, timeout=240):
    res = rpc("tools/call", {"name": name, "arguments": args}, timeout)
    txt = ""
    try: txt = "\n".join(c.get("text", "") for c in res.get("content", []))
    except: pass
    return res, txt

log("=== driver v4 start ===")
r = {}
for _ in range(3):
    r = rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                           "clientInfo": {"name": "quarry-zcode", "version": "1.0"}}, 90)
    if "protocolVersion" in r: break  # rpc returns the RESULT dict
    time.sleep(3)
if "protocolVersion" not in r:
    log("FATAL init"); sys.exit(1)
log("initialized: " + str(r.get("result", {}).get("serverInfo", {})))
send({"jsonrpc": "2.0", "method": "notifications/initialized"})

# ---- connect ----
connected = False
for attempt in range(1, 4):
    log(f"connect attempt {attempt}/3")
    res, txt = call_tool("open_colab_browser_connection", {}, timeout=400)
    ok = (res.get("isError") is not True) and ("true" in (txt or "").lower())
    log(f"  -> {'connected' if ok else txt[:80]}")
    if ok: connected = True; break
    time.sleep(15)
if not connected:
    log("FATAL: could not connect the browser session"); sys.exit(2)

tools = rpc("tools/list", {}, 30).get("tools", [])
schemas = {t["name"]: t.get("inputSchema", {}) for t in tools}
log("unlocked tools: " + str([t["name"] for t in tools]))
json.dump(schemas, open(r"C:\Users\Revnix\Documents\youtube-automation\colab-schemas-v4.json", "w", encoding="utf-8"), indent=1)

def find_tool(*keywords):
    for t in tools:
        if all(k in t["name"].lower() for k in keywords): return t
    return None

add_tool = find_tool("add", "code") or find_tool("add", "cell")
run_tool = find_tool("run", "code") or find_tool("run", "cell")
get_tool = find_tool("get", "cell")
if not add_tool or not run_tool:
    log("FATAL: cell tools missing: " + str([t["name"] for t in tools])); sys.exit(3)
log(f"using add={add_tool['name']} run={run_tool['name']}")

def props_of(tool): return (tool.get("inputSchema") or {}).get("properties") or {}
def main_key(tool, prefer):
    pr = list(props_of(tool).keys())
    for k in prefer:
        if k in pr: return k
    return pr[0] if pr else "source"

def get_cells_json():
    if not get_tool: return None
    key = main_key(get_tool, [""])
    res, txt = call_tool(get_tool["name"], {} if key in ("", "none") else {key: ""})
    try: return json.loads(txt)
    except: return None

def colab_exec(code, timeout=300):
    cells = get_cells_json()
    n = 0
    if cells:
        items = cells if isinstance(cells, list) else cells.get("cells", [])
        n = len(items)
    res, txt = call_tool(add_tool["name"], {"cellIndex": n, "language": "python", "code": code}, 60)
    if res.get("isError"):
        return "ADD-ERR " + txt[:250]
    # resolve the new cell's id straight from the add result: {"newCellId":"..."}
    cell_id = None
    try: cell_id = json.loads(txt).get("newCellId")
    except: pass
    if not cell_id:
        return "ADD-ERR could not resolve cell id; add said: " + txt[:120]
    # run it
    run_key = main_key(run_tool, ["cell_id", "id"])
    res, txt = call_tool(run_tool["name"], {run_key: cell_id}, timeout)
    out = txt
    # fetch outputs for that cell (includeOutputs)
    if get_tool:
        gk = main_key(get_tool, ["cellIndexStart"])
        gargs = {"includeOutputs": True}
        if "cellIndexStart" in props_of(get_tool): gargs["cellIndexStart"] = max(0, n - 1)
        if "cellIndexEnd" in props_of(get_tool): gargs["cellIndexEnd"] = n
        res2, txt2 = call_tool(get_tool["name"], gargs, 60)
        try:
            cj = json.loads(txt2)
            items = cj if isinstance(cj, list) else cj.get("cells", [])
            for c in items:
                if c.get("id") == cell_id:
                    outs = c.get("outputs") or []
                    ot = chr(10).join((o.get("text") or json.dumps(o.get("data", "")))[:300] for o in outs)
                    if ot.strip(): out = "OUT: " + ot[:800]
                    break
        except: pass
    return out

log("connection live — starting pipeline")

# ---- 1. install ----
out = colab_exec("!pip install -Uq diffusers soundfile\nimport diffusers, soundfile\nprint('diffusers', diffusers.__version__)", 240)
log("install -> " + out[-160:])

# ---- 2. write generate.py ----
gen_py = open(r"C:\Users\Revnix\Documents\youtube-automation\own-music\generate_runtime.py", encoding="utf-8").read()
writer = "from pathlib import Path\nf = Path('/content/generate.py')\nf.write_text(" + repr(gen_py) + ")\nprint('written', len(f.read_text()))"
out = colab_exec(writer, 120)
log("generate.py write -> " + out[-100:])

# ---- 3. launch in runtime background ----
pat = ""
try:
    for _l in open(r"C:\Users\Revnix\Documents\youtube-automation\.env", encoding="utf-8"):
        _m = _re.match(r"^GITHUB_PAT=(.*)$", _l)
        if _m: pat = _m.group(1).strip()
except Exception: pass
launch_code = ("import os\n"
               "os.environ['GITHUB_TOKEN'] = " + repr(pat) + "\n"
               "import subprocess\n"
               "subprocess.Popen(['nohup', 'python', '/content/generate.py'],\n"
               "                 stdout=open('/content/generate.log', 'w'),\n"
               "                 stderr=subprocess.STDOUT, start_new_session=True)\n"
               "print('launched with token')") if pat else ("import subprocess\n"
               "subprocess.Popen(['nohup', 'python', '/content/generate.py'],\n"
               "                 stdout=open('/content/generate.log', 'w'),\n"
               "                 stderr=subprocess.STDOUT, start_new_session=True)\n"
               "print('launched (no token — uploads disabled)')")
out = colab_exec(launch_code, 60)
log("launch -> " + out[-100:])

# ---- 4. poll to completion (max ~100 min) ----
gen_ok = False
deadline = time.time() + 100 * 60
while time.time() < deadline:
    time.sleep(120)
    out = colab_exec("import glob, os\n"
                     "log = open('/content/generate.log').read() if os.path.exists('/content/generate.log') else ''\n"
                     "print('TAIL|' + ' || '.join(log.splitlines()[-2:]))\n"
                     "print('COUNT|', len(glob.glob('/content/own-music/*/*.mp3')))", 90)
    tail = [l for l in out.splitlines() if l.startswith('TAIL|') or l.startswith('COUNT|')]
    log("poll: " + " ".join(tail)[-200:])
    if "GENERATION_DONE" in out:
        gen_ok = True; break

log(f"generation complete: {gen_ok}")

# ---- 5. manifest + upload ----
up_code = f'''
import json, glob, os, urllib.request
tracks = []
for path in sorted(glob.glob('/content/own-music/*/*.mp3')):
    mood = path.split('/')[-2]
    name = os.path.basename(path)
    num = name.replace('.mp3', '').split('-')[-1].upper()
    tracks.append({{'file': f'{{mood}}/{{name}}', 'mood': mood,
                   'title': f'Quarry {{mood.capitalize()}} {{num}}', 'tags': mood}})
manifest = {{'version': 1,
            'library': 'Quarry Studio Originals — self-produced with ACE-Step (Apache 2.0), no attribution required',
            'tracks': tracks}}
json.dump(manifest, open('/content/own-music/manifest.json', 'w'), indent=2)
print('manifest tracks:', len(tracks))
repo = '{REPO}'; tag = '{TAG}'; token = '{pat}'
def hdr():
    return {{'Authorization': f'Bearer {{token}}', 'Content-Type': 'application/json', 'User-Agent': 'colab-music'}}
def api(url, method='GET', body=None):
    req = urllib.request.Request(url, method=method, headers=hdr(),
                                 data=json.dumps(body).encode() if body else None)
    return urllib.request.urlopen(req)
try:
    rel = json.load(api(f'https://api.github.com/repos/{{repo}}/releases/tags/{{tag}}'))
except Exception:
    rel = json.load(api(f'https://api.github.com/repos/{{repo}}/releases', 'POST',
                        {{'tag_name': tag, 'name': 'Quarry Originals — own music library',
                          'body': 'Self-produced ACE-Step instrumentals (Apache 2.0). Claim-proof.'}}))
existing = {{a['name'] for a in rel.get('assets', [])}}
files = ['/content/own-music/manifest.json'] + sorted(glob.glob('/content/own-music/*/*.mp3'))
up = 0
for f in files:
    name = os.path.basename(f) if 'manifest' in f else '/'.join(f.split('/')[-2:])
    if name in existing:
        print('skip:', name); continue
    data = open(f, 'rb').read()
    req = urllib.request.Request(f'https://uploads.github.com/repos/{{repo}}/releases/{{rel["id"]}}/assets?name={{name}}',
                                 method='POST', data=data,
                                 headers={{'Authorization': f'Bearer {{token}}', 'Content-Type': 'application/octet-stream', 'User-Agent': 'colab-music'}})
    urllib.request.urlopen(req)
    up += 1
    print('uploaded:', name, flush=True)
print(f'UPLOAD_DONE {{up}} files')
'''
out = colab_exec(up_code, 400)
log("upload -> " + out[-300:])

out = colab_exec("import glob\nprint('final tracks:', len(glob.glob('/content/own-music/*/*.mp3')))", 60)
log("=== driver v4 complete === " + out[-120:])
