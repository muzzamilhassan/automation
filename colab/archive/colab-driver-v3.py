# Colab MCP driver v3 — FULL END-TO-END autonomous run.
# Connect (retry 30 min for user's T4 click) -> discover exec tool ->
# install deps -> launch 48-track generation (background in runtime) ->
# poll to completion -> build manifest -> upload to GitHub release -> exit.
import subprocess, json, sys, os, time, re

UVX = r"C:\Users\Revnix\AppData\Roaming\Python\Python314\Scripts\uvx.exe"
LOG = r"C:\Users\Revnix\Documents\youtube-automation\colab-run.log"
REPO = "muzzamilhassan/automation"
TAG = "own-music-v1"

# GitHub token for the release upload (owner's own PAT from local .env)
pat = ""
for line in open(r"C:\Users\Revnix\Documents\youtube-automation\.env", encoding="utf-8"):
    m = re.match(r"^GITHUB_PAT=(.*)$", line)
    if m: pat = m.group(1).strip()
if not pat:
    print("FATAL: no GITHUB_PAT in .env — cannot upload"); sys.exit(1)

proc = subprocess.Popen(
    [UVX, "git+https://github.com/googlecolab/colab-mcp"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
    stderr=open(r"C:\Users\Revnix\Documents\youtube-automation\colab-mcp-stderr3.log", "wb"),
    text=True, encoding="utf-8", bufsize=1,
)
logf = open(LOG, "a", encoding="utf-8")
def log(s):
    logf.write(s + "\n"); logf.flush(); print(s, flush=True)

def send(obj): proc.stdin.write(json.dumps(obj) + "\n"); proc.stdin.flush()

send_id = 5000
def rpc(method, params, timeout=300):
    global send_id
    send_id += 1
    rid = send_id
    send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            time.sleep(0.05)
            if proc.poll() is not None: return {"error": "server died"}
            continue
        try: msg = json.loads(line)
        except: continue
        if msg.get("id") == rid: return msg
    return {"error": f"timeout waiting for {method}"}

def tools_list():
    r = rpc("tools/list", {})
    return (r.get("result") or {}).get("tools", [])

def call_tool(name, args, timeout=300):
    r = rpc("tools/call", {"name": name, "arguments": args}, timeout)
    res = r.get("result") or {}
    txt = ""
    try: txt = "\n".join(c.get("text", "") for c in res.get("content", []))
    except: pass
    return res, txt

log("=== driver v3 start ===")
r = rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                       "clientInfo": {"name": "quarry-zcode", "version": "1.0"}}, 30)
if not r.get("result"):
    log("FATAL: init failed: " + json.dumps(r)[:150]); sys.exit(1)
log("initialized: " + str(r["result"].get("serverInfo", {})))
send({"jsonrpc": "2.0", "method": "notifications/initialized"})

# ---- connect loop: retry for up to ~30 min (user may be away) ----
connected = False
for attempt in range(1, 6):
    log(f"connection attempt {attempt}/5 — (re)opening the Colab tab; user: click T4 GPU")
    res, txt = call_tool("open_colab_browser_connection", {}, timeout=400)
    ok = (res.get("isError") is not True) and ("true" in (txt or "").lower() or (txt or "").strip() in ("True", "true"))
    log(f"  open_colab_browser_connection -> {'true' if ok else txt[:100]}")
    if ok:
        connected = True
        break
    time.sleep(20)

if not connected:
    # probe once more — some builds return plain result after the fact
    tools = tools_list()
    colab_tools = [t for t in tools if t["name"] != "open_colab_browser_connection"]
    if not colab_tools:
        log("FATAL: never connected. Tab may still be open — rerun the driver."); sys.exit(2)

# ---- discover the notebook execution tool ----
tools = tools_list()
log("unlocked tools: " + str([t["name"] for t in tools]))
exec_tool = None
for pat_name in ("execute_code", "run_code", "exec_code", "execute_cell", "run_cell", "execute", "run"):
    for t in tools:
        if pat_name in t["name"].lower():
            exec_tool = t; break
    if exec_tool: break
if not exec_tool:
    cand = [t for t in tools if t["name"] != "open_colab_browser_connection"]
    exec_tool = cand[0] if cand else None
if not exec_tool:
    log("FATAL: no execution tool found"); sys.exit(3)
log(f"execution tool: {exec_tool['name']}")

def colab_exec(code, timeout=240):
    # build arguments from the tool's schema (single main param expected)
    props = ((exec_tool.get("inputSchema") or {}).get("properties") or {})
    if props:
        first = list(props.keys())[0]
        args = {first: code}
    else:
        args = {"code": code}
    res, txt = call_tool(exec_tool["name"], args, timeout)
    return txt

# ---- 1. install ----
log("step 1: install diffusers + soundfile")
out = colab_exec("!pip install -Uq diffusers soundfile\nimport diffusers, soundfile; print('diffusers', diffusers.__version__)", 240)
log("  -> " + out[-200:])

# ---- 2. write generate.py + MOOD_PLAN ----
gen_py = r'''
import os, subprocess, time, torch, soundfile as sf
os.makedirs('/content/own-music', exist_ok=True)
from diffusers import AceStepPipeline
pipe = AceStepPipeline.from_pretrained("ACE-Step/acestep-v15-xl-turbo-diffusers", torch_dtype=torch.float16)
pipe = pipe.to("cuda")
print('model loaded', flush=True)
MOOD_PLAN = [
  ('calm', 1, 'ambient cinematic calm, soft piano, warm pads, slow, peaceful, instrumental', 120),
  ('calm', 2, 'ambient cinematic calm, soft piano, warm pads, slow, peaceful, instrumental', 120),
  ('calm', 3, 'ambient cinematic calm, soft piano, warm pads, slow, peaceful, instrumental', 120),
  ('calm', 4, 'ambient cinematic calm, soft piano, warm pads, slow, peaceful, instrumental', 120),
  ('calm', 5, 'ambient cinematic calm, soft piano, warm pads, slow, peaceful, instrumental', 120),
  ('calm', 6, 'ambient cinematic calm, soft piano, warm pads, slow, peaceful, instrumental', 120),
  ('calm', 101, 'gentle neoclassical strings and piano, contemplative, soft, instrumental', 120),
  ('calm', 102, 'gentle neoclassical strings and piano, contemplative, soft, instrumental', 120),
  ('calm', 103, 'gentle neoclassical strings and piano, contemplative, soft, instrumental', 120),
  ('calm', 104, 'gentle neoclassical strings and piano, contemplative, soft, instrumental', 120),
  ('calm', 105, 'gentle neoclassical strings and piano, contemplative, soft, instrumental', 120),
  ('calm', 106, 'gentle neoclassical strings and piano, contemplative, soft, instrumental', 120),
  ('epic', 1, 'epic cinematic orchestral, heroic drums, rising tension, powerful, instrumental', 90),
  ('epic', 2, 'epic cinematic orchestral, heroic drums, rising tension, powerful, instrumental', 90),
  ('epic', 3, 'epic cinematic orchestral, heroic drums, rising tension, powerful, instrumental', 90),
  ('epic', 4, 'epic cinematic orchestral, heroic drums, rising tension, powerful, instrumental', 90),
  ('epic', 5, 'epic cinematic orchestral, heroic drums, rising tension, powerful, instrumental', 90),
  ('epic', 101, 'dark epic trailer music, braams, percussion, motivational, instrumental', 90),
  ('epic', 102, 'dark epic trailer music, braams, percussion, motivational, instrumental', 90),
  ('epic', 103, 'dark epic trailer music, braams, percussion, motivational, instrumental', 90),
  ('epic', 104, 'dark epic trailer music, braams, percussion, motivational, instrumental', 90),
  ('epic', 105, 'dark epic trailer music, braams, percussion, motivational, instrumental', 90),
  ('driving', 1, 'driving electronic beat, pulsing synth bass, focused energy, modern, instrumental', 90),
  ('driving', 2, 'driving electronic beat, pulsing synth bass, focused energy, modern, instrumental', 90),
  ('driving', 3, 'driving electronic beat, pulsing synth bass, focused energy, modern, instrumental', 90),
  ('driving', 4, 'driving electronic beat, pulsing synth bass, focused energy, modern, instrumental', 90),
  ('driving', 101, 'corporate driving rhythm, clean plucks, steady momentum, instrumental', 90),
  ('driving', 102, 'corporate driving rhythm, clean plucks, steady momentum, instrumental', 90),
  ('driving', 103, 'corporate driving rhythm, clean plucks, steady momentum, instrumental', 90),
  ('driving', 104, 'corporate driving rhythm, clean plucks, steady momentum, instrumental', 90),
  ('bright', 1, 'bright acoustic pop, uplifting light percussion, optimistic, instrumental', 90),
  ('bright', 2, 'bright acoustic pop, uplifting light percussion, optimistic, instrumental', 90),
  ('bright', 3, 'bright acoustic pop, uplifting light percussion, optimistic, instrumental', 90),
  ('bright', 4, 'bright acoustic pop, uplifting light percussion, optimistic, instrumental', 90),
  ('bright', 101, 'sunny ukulele and claps, feel-good, light, instrumental', 90),
  ('bright', 102, 'sunny ukulele and claps, feel-good, light, instrumental', 90),
  ('bright', 103, 'sunny ukulele and claps, feel-good, light, instrumental', 90),
  ('bright', 104, 'sunny ukulele and claps, feel-good, light, instrumental', 90),
  ('luxury', 1, 'elegant neoclassical strings and grand piano, sophisticated, slow waltz, instrumental', 120),
  ('luxury', 2, 'elegant neoclassical strings and grand piano, sophisticated, slow waltz, instrumental', 120),
  ('luxury', 3, 'elegant neoclassical strings and grand piano, sophisticated, slow waltz, instrumental', 120),
  ('luxury', 101, 'quiet luxury jazz lounge, smooth brushes, warm saxophone, classy, instrumental', 120),
  ('luxury', 102, 'quiet luxury jazz lounge, smooth brushes, warm saxophone, classy, instrumental', 120),
  ('luxury', 103, 'quiet luxury jazz lounge, smooth brushes, warm saxophone, classy, instrumental', 120),
  ('dark', 1, 'dark cinematic tension, subtle drones, mystery, documentary, instrumental', 120),
  ('dark', 2, 'dark cinematic tension, subtle drones, mystery, documentary, instrumental', 120),
  ('dark', 3, 'dark cinematic tension, subtle drones, mystery, documentary, instrumental', 120),
  ('dark', 4, 'dark cinematic tension, subtle drones, mystery, documentary, instrumental', 120),
]
print('plan:', len(MOOD_PLAN), 'tracks', flush=True)
done, failed = 0, []
t0 = time.time()
for mood, seed, tags, dur in MOOD_PLAN:
    out_dir = f'/content/own-music/{mood}'
    os.makedirs(out_dir, exist_ok=True)
    out_name = f'qs-{mood}-{seed:03d}'
    if os.path.exists(f'{out_dir}/{out_name}.mp3'):
        done += 1; continue
    try:
        g = torch.Generator('cuda').manual_seed(seed)
        audio = pipe(prompt=f'{tags}, professional background music', lyrics='',
                     audio_duration=float(dur), num_inference_steps=8, generator=g).audios
        wav = f'/content/{out_name}.wav'
        sf.write(wav, audio[0].T.float().cpu().numpy(), 48000)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav,
                        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
                        '-codec:a', 'libmp3lame', '-b:a', '192k',
                        f'{out_dir}/{out_name}.mp3'], check=True)
        os.remove(wav)
        done += 1
        print(f'PROGRESS {done}/{len(MOOD_PLAN)} {out_name}.mp3', flush=True)
    except Exception as e:
        failed.append((out_name, str(e)[:80]))
        print(f'FAILED {out_name}: {str(e)[:80]}', flush=True)
    time.sleep(2)
print(f'GENERATION_DONE {done}/{len(MOOD_PLAN)} failed={len(failed)}', flush=True)
'''
colab_exec("with open('/content/generate.py', 'w') as f:\n" +
           "\n".join("    f.write(" + repr(line + "\n") + ")" for line in gen_py.split("\n")), 120)

# ---- 3. launch generation as a background process in the runtime ----
log("step: launching generation in the runtime background")
colab_exec("import subprocess\n"
           "subprocess.Popen(['nohup', 'python', '/content/generate.py'],\n"
           "                 stdout=open('/content/generate.log','w'),\n"
           "                 stderr=subprocess.STDOUT,\n"
           "                 start_new_session=True)\n"
           "print('launched')", 60)

# ---- 4. poll until done (up to 100 min) ----
deadline = time.time() + 100 * 60
gen_ok = False
while time.time() < deadline:
    time.sleep(120)
    out = colab_exec("import os\n"
                     "log = open('/content/generate.log').read() if os.path.exists('/content/generate.log') else ''\n"
                     "tail = '\\n'.join(log.splitlines()[-2:])\n"
                     "n = 0\n"
                     "import glob\n"
                     "for p in glob.glob('/content/own-music/*/*.mp3'): n += 1\n"
                     "print(f'COUNT {n} | ' + tail[-160:])", 60)
    log("poll: " + out[-180:].replace("\n", " | "))
    if "GENERATION_DONE" in out:
        gen_ok = True
        break

# ---- 5. manifest + upload ----
log("step: manifest + upload to GitHub release")
upload_code = f'''
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

repo = '{REPO}'
tag = '{TAG}'
token = '{pat}'
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
    req = urllib.request.Request(f'https://uploads.github.com/repos/{{repo}}/releases/{{rel[\"id\"]}}/assets?name={{name}}',
                                 method='POST', data=data,
                                 headers={{'Authorization': f'Bearer {{token}}', 'Content-Type': 'application/octet-stream', 'User-Agent': 'colab-music'}})
    urllib.request.urlopen(req)
    up += 1
    print('uploaded:', name, flush=True)
print(f'UPLOAD_DONE {{up}} files')
'''
colab_exec(upload_code, 400)

# ---- 6. summary ----
out = colab_exec("import glob\n"
                 "print('tracks:', len(glob.glob('/content/own-music/*/*.mp3')))\n"
                 "print('manifest:', os.path.exists('/content/own-music/manifest.json'))", 60)
log("final runtime state: " + out[-200:])
log("=== driver v3 complete — check UPLOAD_DONE above ===")
