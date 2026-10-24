# Own-music monitor: polls the Colab runtime every 3 min via colab-mcp,
# tracks generation progress, and when GENERATION_DONE appears: builds the
# manifest and uploads everything to the GitHub release, then exits.
import subprocess, json, sys, os, time, re, glob

UVX = r"C:\Users\Revnix\AppData\Roaming\Python\Python314\Scripts\uvx.exe"
REPO = "muzzamilhassan/automation"
TAG = "own-music-v1"
TOKEN = ""
for line in open(r"C:\Users\Revnix\Documents\youtube-automation\.env", encoding="utf-8"):
    m = re.match(r"^GITHUB_PAT=(.*)$", line)
    if m: TOKEN = m.group(1).strip()
if not TOKEN:
    print("FATAL: no GITHUB_PAT"); sys.exit(1)

proc = subprocess.Popen(
    [UVX, "git+https://github.com/googlecolab/colab-mcp"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=open("colab-monitor-stderr.log", "wb"),
    text=True, encoding="utf-8", bufsize=1)

send_id = 4000
def send(obj): proc.stdin.write(json.dumps(obj) + "\n"); proc.stdin.flush()

# #51: threaded reader + queue — readline() used to block past deadlines and
# the init loop busy-spun at EOF without a poll() check
import threading, queue as _q
outq = _q.Queue()
def _reader():
    for line in proc.stdout:
        outq.put(line)
    outq.put(None)
threading.Thread(target=_reader, daemon=True).start()

def rpc(method, params, timeout=120):
    global send_id
    send_id += 1
    rid = send_id
    send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
    deadline = time.time() + timeout
    while True:
        remaining = deadline - time.time()
        if remaining <= 0: return {"error": "timeout"}
        try: line = outq.get(timeout=min(remaining, 0.5))
        except _q.Empty: continue
        if line is None: return {"error": "died"}  # EOF — server exited
        try: msg = json.loads(line)
        except: continue
        if msg.get("id") == rid: return msg

send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
    "protocolVersion": "2024-11-05", "capabilities": {},
    "clientInfo": {"name": "q", "version": "1.0"}}})
init_deadline = time.time() + 120
while time.time() < init_deadline:
    try: line = outq.get(timeout=min(init_deadline - time.time(), 0.5))
    except _q.Empty: continue
    if line is None: print("FATAL: server died during init"); sys.exit(1)
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

if call("open_colab_browser_connection", {}, 400).strip().lower() not in ("true",):
    print("WARN: connect returned non-true — continuing anyway", flush=True)

POLL_CODE = """
import os, glob, json, urllib.request, datetime
log = open('/content/generate.log').read() if os.path.exists('/content/generate.log') else ''
tail = ' || '.join(log.splitlines()[-2:])[-200:]
n = len(glob.glob('/content/own-music/*/*.mp3'))
done = 'GENERATION_DONE' in log
st = {'step': 'generation_progress', 'mp3': n, 'done': done, 'tail': tail,
      'ts': datetime.datetime.utcnow().isoformat()}
body = json.dumps({'message': 'status: generation', 'content': __import__('base64').b64encode(json.dumps(st).encode()).decode(), 'branch': 'main'}).encode()
req = urllib.request.Request('https://api.github.com/repos/muzzamilhassan/automation/contents/own-music/status.json',
                             method='PUT', data=body,
                             headers={'Authorization': 'Bearer {token}', 'User-Agent': 'colab', 'Accept': 'application/vnd.github+json'})
try:
    urllib.request.urlopen(req)
except Exception as e:
    print('status write failed:', str(e)[:60])
print(f'POLL mp3={{n}} done={{done}} tail={{tail[-80:}}'.replace('}}', '}'))
""".replace("{token}", TOKEN)

def poll_once():
    return call("run_code_cell", {}, 240)  # placeholder replaced below

# find last code cell each time: add poll cell + run it
def poll():
    call("add_code_cell", {"cellIndex": 0, "language": "python", "code": POLL_CODE}, 60)
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
        if (c.get("cell_type") or "code") == "code" and "POLL mp3" in srcjoin:
            target = c
    if not target:
        return "(poll cell missing)"
    cid = target.get("id") or target.get("cell_id")
    out = call("run_code_cell", {"cellId": cid}, 240)
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
    try:
        cj2 = json.loads(out)
        items2 = cj2 if isinstance(cj2, list) else cj2.get("cells", [])
        for c in items2:
            if (c.get("id") or c.get("cell_id")) == cid:
                texts.extend(walk(c.get("outputs", [])))
    except: pass
    return "\n".join(texts)[:300] if texts else "(empty)"

deadline = time.time() + 110 * 60
last_count = -1
while time.time() < deadline:
    out = poll()
    print(time.strftime("%H:%M"), out.replace("\n", " | ")[:200], flush=True)
    if "done=True" in out.replace("'", ""):
        print("GENERATION DONE — uploading to release")
        break
    time.sleep(180)

# ---- upload everything to the release ----
UPLOAD_CODE = """
import json, glob, os, urllib.request
tracks = []
for path in sorted(glob.glob('/content/own-music/*/*.mp3')):
    mood = path.split('/')[-2]
    name = os.path.basename(path)
    num = name.replace('.mp3', '').split('-')[-1].upper()
    tracks.append({'file': f'{mood}/{name}', 'mood': mood,
                   'title': f'Quarry {mood.capitalize()} {num}', 'tags': mood})
manifest = {'version': 1,
            'library': 'Quarry Studio Originals — self-produced with ACE-Step (Apache 2.0), no attribution required',
            'tracks': tracks}
json.dump(manifest, open('/content/own-music/manifest.json', 'w'), indent=2)
print('manifest tracks:', len(tracks))
repo = 'muzzamilhassan/automation'
tag = 'own-music-v1'
token = 'TOKENPLACE'
def hdr():
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json', 'User-Agent': 'colab-music'}
def api(url, method='GET', body=None):
    req = urllib.request.Request(url, method=method, headers=hdr(),
                                 data=json.dumps(body).encode() if body else None)
    return urllib.request.urlopen(req)
try:
    rel = json.load(api(f'https://api.github.com/repos/{repo}/releases/tags/{tag}'))
except Exception:
    rel = json.load(api(f'https://api.github.com/repos/{repo}/releases', 'POST',
                        {'tag_name': tag, 'name': 'Quarry Originals — own music library',
                         'body': 'Self-produced ACE-Step instrumentals (Apache 2.0). Claim-proof.'}))
existing = {a['name'] for a in rel.get('assets', [])}
files = ['/content/own-music/manifest.json'] + sorted(glob.glob('/content/own-music/*/*.mp3'))
up = 0
for f in files:
    name = os.path.basename(f) if 'manifest' in f else '/'.join(f.split('/')[-2:])
    if name in existing:
        print('skip:', name)
        continue
    data = open(f, 'rb').read()
    req = urllib.request.Request(f'https://uploads.github.com/repos/{repo}/releases/{rel["id"]}/assets?name={name}',
                                 method='POST', data=data,
                                 headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/octet-stream', 'User-Agent': 'colab-music'})
    urllib.request.urlopen(req)
    up += 1
    print('uploaded:', name, flush=True)
print(f'UPLOAD_DONE {up}')
""".replace("TOKENPLACE", TOKEN)

out = call("run_code_cell", {}, 60)  # no-op safe guard
print("== uploading library ==")
res = call("run_code_cell", {"cellId": "UPLOAD"}, 300)
# run via add+run properly
call("add_code_cell", {"cellIndex": 0, "language": "python", "code": UPLOAD_CODE}, 60)
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
    if (c.get("cell_type") or "code") == "code" and "UPLOAD_DONE" in srcjoin:
        target = c
if target:
    cid = target.get("id") or target.get("cell_id")
    out = call("run_code_cell", {"cellId": cid}, 300)
    print("upload output:", out[:300])
else:
    print("upload cell missing")

print("MONITOR_COMPLETE")
