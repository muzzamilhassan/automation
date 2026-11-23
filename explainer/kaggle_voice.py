# Emotional voice via the free Kaggle GPU (docs/qa/emotional-voice-qa.md).
#
# ONE private GPU script kernel per narration (kernel id
# <owner>/quarry-voice-<slug>, so channels never collide): every sentence of
# every line goes in as JSON, the reference voice goes in as a small inline
# mp3 (base64; ~60 KB — a 500 KB inline wav made `kernels push` reset, a
# per-voice dataset is only used by the 27-voice library batch), the kernel
# writes one FLAC per sentence into ONE tar (no output paging) + result.json.
# The host then assembles every line with the SAME human pacing as the Kokoro
# lane (voice_lines.human_tts: pauses by punctuation, one loudness target) and
# faster-whisper timings on the CLEAN text (tags removed).
#
# Safety nets (the video always ships):
#   - per line: fewer than MIN_HEARD of the script words heard (or rambling
#     audio) -> that line is left to the normal Kokoro loop
#   - whole run: no key, quota guard, unknown model, push error, kernel error,
#     timeout, missing output -> nothing taken; voice_lines falls back to
#     today's Kokoro human voice and writes voice-report.json (the doc lane
#     raises a quiet advisory: "emotional voice unavailable today")
#
# The model is DATA: MODELS[id] is a recipe (install/load/prepare/seed/generate)
# behind one model-agnostic interface (lines + reference in -> audio per line
# out). Only chatterbox-turbo is built; studio/lib/emotional-voice.mjs
# GPU_VOICE_MODELS lists the same ids.
#
# The token is NEVER read, printed or written here: the Kaggle CLI reads
# KAGGLE_API_TOKEN (CI secret) or ~/.kaggle/access_token itself.
import base64
import json
import os
import re
import subprocess
import sys
import tarfile
import time
import uuid
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OWNER = "muzzamilhassan"
# one file per channel (parallel channel jobs never conflict on commit); the
# guard sums them all — the free GPU quota is per Kaggle account
USAGE_DIR = os.path.join(ROOT, "yt-mcp", "state", "gpu-usage")
LIMIT_HOURS = 30   # Kaggle's free GPU allowance (about 30 h a week)
GUARD_HOURS = 25   # stop here (studio/lib/gpu-usage.mjs GPU_GUARD_HOURS)
KEEP_WEEKS = 8
TIMEOUT_S = 30 * 60
# Kaggle runs at most 2 GPU sessions per account: a refused push waits for a
# free one (inside the hard timeout) before the run falls back
PUSH_WAIT_S = 10 * 60
MIN_HEARD = 0.85   # per-line quality gate
TAG_RE = re.compile(r"\[([^\]\n]{1,30})\]")

# The reference clip every GPU voice clones (Kokoro, licence-clean). The SAME
# text for the channel engine and the voice-library previews, so a channel
# sounds exactly like its library preview.
REF_TEXT = ("Some stories take a little time to tell, and the best ones are worth the wait. "
            "So let me walk you through this one, step by step, the way I would explain it to a friend.")
REF_SPEED = 1.0


class KaggleVoiceError(RuntimeError):
    """A whole-run failure. seconds = GPU/wall time spent (still counted)."""

    def __init__(self, reason, seconds=0.0):
        super().__init__(reason)
        self.seconds = float(seconds or 0)


# ---------------------------------------------------------------------------
# Model recipes (kernel-side code). Interface: install(); load() -> model;
# prepare(model, ref_path); seed(n); generate(model, text, temperature) -> (1-D float audio, sr)
# ---------------------------------------------------------------------------
MODELS = {
    "chatterbox-turbo": '''
def install():
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "git+https://github.com/resemble-ai/chatterbox.git", "soundfile"], check=True)
    # chatterbox pins torch 2.6; Kaggle's torchvision needs a newer torch and breaks the transformers import
    subprocess.run([sys.executable, "-m", "pip", "uninstall", "-y", "-q", "torchvision"], check=False)

def load():
    from chatterbox.tts_turbo import ChatterboxTurboTTS
    return ChatterboxTurboTTS.from_pretrained(device="cuda")

def prepare(model, ref):
    model.prepare_conditionals(ref, norm_loudness=False)

def seed(n):
    import torch
    torch.manual_seed(n)

def generate(model, text, temperature):
    wav = model.generate(text, temperature=temperature)
    return wav.squeeze(0).cpu().numpy(), model.sr
''',
}

KERNEL_TEMPLATE = r'''# Quarry emotional voice: one batch on a Kaggle GPU.
# Built by explainer/kaggle_voice.py (docs/qa/emotional-voice-qa.md) - do not edit by hand.
import base64, io, json, os, subprocess, sys, tarfile, time, traceback
T0 = time.time()
OUT = "/kaggle/working"
JOB = json.loads(__JOB__)
RESULT = {"nonce": JOB["nonce"], "model": JOB["model"], "ok": False, "lines": [], "errors": []}


def save():
    RESULT["wall_s"] = round(time.time() - T0, 1)
    with open(os.path.join(OUT, "result.json"), "w") as f:
        json.dump(RESULT, f)


def find_input(name):
    for base, _dirs, files in os.walk("/kaggle/input"):
        if name in files:
            return os.path.join(base, name)
    raise FileNotFoundError(name)

__RECIPE__

# The CLI cannot cancel a queued kernel: one that starts after the caller gave
# up (it already fell back to the standard voice) exits at once, unused.
if JOB.get("deadline") and time.time() > JOB["deadline"]:
    RESULT["fatal"] = "started after the caller gave up (deadline passed); nothing rendered"
    save()
    sys.exit(0)

try:
    install()
    RESULT["install_s"] = round(time.time() - T0, 1)
    import numpy as np
    import soundfile as sf
    refs = {}
    for name, ref in JOB["refs"].items():
        if ref.get("b64"):
            p = os.path.join(OUT, "ref-" + name + "." + ref.get("ext", "mp3"))
            with open(p, "wb") as f:
                f.write(base64.b64decode(ref["b64"]))
        else:
            p = find_input(ref["find"])
        refs[name] = p
    t = time.time()
    model = load()
    RESULT["load_s"] = round(time.time() - t, 1)
    cur = None
    with tarfile.open(os.path.join(OUT, "voice-out.tar"), "w") as tar:
        for ln in JOB["lines"]:
            if JOB.get("deadline") and time.time() > JOB["deadline"]:
                RESULT["errors"].append({"id": ln["id"], "error": "deadline passed"})
                continue
            try:
                if ln["ref"] != cur:
                    prepare(model, refs[ln["ref"]])
                    cur = ln["ref"]
                seed(int(ln.get("seed", 1000)))
                t = time.time()
                audio, sr = generate(model, ln["text"], float(ln.get("temperature", 0.8)))
                audio = np.asarray(audio, dtype="float32").reshape(-1)
                buf = io.BytesIO()
                sf.write(buf, audio, sr, format="FLAC")
                data = buf.getvalue()
                info = tarfile.TarInfo(name=ln["id"] + ".flac")
                info.size = len(data)
                tar.addfile(info, io.BytesIO(data))
                RESULT["lines"].append({"id": ln["id"], "seconds": round(audio.size / sr, 2), "gen_s": round(time.time() - t, 2)})
            except Exception as e:
                RESULT["errors"].append({"id": ln["id"], "error": str(e)[:300]})
    RESULT["ok"] = True
except Exception:
    RESULT["fatal"] = traceback.format_exc()[-1500:]
finally:
    save()
print("done", json.dumps({k: RESULT.get(k) for k in ("ok", "install_s", "load_s", "wall_s")}), flush=True)
'''


# ---------------------------------------------------------------------------
# Quota guard (mirror of studio/lib/gpu-usage.mjs; tests/fixtures/gpu-usage-cases.json)
# ---------------------------------------------------------------------------
def parse_iso(s):
    return datetime.fromisoformat(str(s).replace("Z", "+00:00"))


def iso_week_key(dt=None):
    dt = dt or datetime.now(timezone.utc)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc)
    y, w, _ = dt.date().isocalendar()
    return f"{y}-W{w:02d}"


def usage_summary(usage, now=None):
    week = iso_week_key(now)
    w = {}
    if isinstance(usage, dict) and isinstance(usage.get("weeks"), dict) and isinstance(usage["weeks"].get(week), dict):
        w = usage["weeks"][week]
    secs = w.get("seconds")
    secs = secs if isinstance(secs, (int, float)) and not isinstance(secs, bool) and secs == secs and secs > 0 else 0
    hours = round(secs / 3600 * 10) / 10
    if hours == int(hours):
        hours = int(hours)
    return {"week": week, "hours": hours, "runs": len(w["runs"]) if isinstance(w.get("runs"), list) else 0,
            "limitHours": LIMIT_HOURS, "guardHours": GUARD_HOURS, "paused": secs >= GUARD_HOURS * 3600}


def load_usage(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def merge_usage(usages):
    """Every channel's usage file -> one {weeks: {key: {seconds, runs}}} (junk skipped)."""
    weeks = {}
    for u in usages:
        if not isinstance(u, dict) or not isinstance(u.get("weeks"), dict):
            continue
        for k, w in u["weeks"].items():
            if not isinstance(w, dict):
                continue
            cur = weeks.setdefault(k, {"seconds": 0, "runs": []})
            s = w.get("seconds")
            if isinstance(s, (int, float)) and not isinstance(s, bool) and s == s and s > 0:
                cur["seconds"] += s
            if isinstance(w.get("runs"), list):
                cur["runs"] += w["runs"]
    return {"weeks": weeks}


def load_all_usage(usage_dir=None):
    d = usage_dir or os.environ.get("KAGGLE_USAGE_DIR") or USAGE_DIR
    try:
        names = sorted(f for f in os.listdir(d) if f.endswith(".json"))
    except Exception:
        names = []
    return merge_usage([load_usage(os.path.join(d, f)) for f in names])


def usage_file(slug, usage_dir=None):
    d = usage_dir or os.environ.get("KAGGLE_USAGE_DIR") or USAGE_DIR
    return os.path.join(d, re.sub(r"[^a-z0-9-]+", "-", str(slug).lower()).strip("-") + ".json")


def record_run(path, at=None, slug="", kernel="", seconds=0.0, ok=False):
    usage = load_usage(path)
    weeks = dict(usage["weeks"]) if isinstance(usage, dict) and isinstance(usage.get("weeks"), dict) else {}
    at = at or datetime.now(timezone.utc)
    key = iso_week_key(at)
    cur = weeks.get(key) if isinstance(weeks.get(key), dict) else {}
    secs = max(0, int(round(float(seconds or 0))))
    prev = cur.get("seconds") if isinstance(cur.get("seconds"), (int, float)) else 0
    runs = (cur.get("runs") if isinstance(cur.get("runs"), list) else []) + [
        {"at": at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"), "slug": slug, "kernel": kernel, "seconds": secs, "ok": bool(ok)}]
    weeks[key] = {"seconds": prev + secs, "runs": runs[-50:]}
    keep = sorted(weeks)[-KEEP_WEEKS:]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"weeks": {k: weeks[k] for k in keep}}, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Kaggle CLI
# ---------------------------------------------------------------------------
def kernel_id(slug, owner=None):
    owner = owner or os.environ.get("KAGGLE_USERNAME") or DEFAULT_OWNER
    s = re.sub(r"[^a-z0-9]+", "-", str(slug).lower()).strip("-") or "channel"
    return f"{owner}/{('quarry-voice-' + s)[:50].rstrip('-')}"


def has_credentials(env=None, home=None):
    env = os.environ if env is None else env
    if env.get("KAGGLE_API_TOKEN") or (env.get("KAGGLE_USERNAME") and env.get("KAGGLE_KEY")):
        return True
    d = os.path.join(home or os.path.expanduser("~"), ".kaggle")
    return any(os.path.exists(os.path.join(d, f)) for f in ("access_token", "kaggle.json"))


def cli():
    custom = os.environ.get("KAGGLE_CLI", "").strip()
    return custom.split() if custom else [sys.executable, "-m", "kaggle"]


def parse_status(text):
    m = re.search(r'status "(?:KernelWorkerStatus\.)?([A-Za-z_]+)"', text or "")
    return m.group(1).lower() if m else ""


def build_kernel(kdir, kernel, model, jobs, refs, nonce, dataset_sources=(), kernel_sources=(), deadline=None):
    """Writes voice.py + kernel-metadata.json into kdir; returns the script size in bytes.
    jobs: [{id, text, ref, temperature?, seed?}]; refs: {name: {b64, ext} | {find: filename}}
    ({find} = a file under /kaggle/input, i.e. from dataset_sources / kernel_sources)."""
    if model not in MODELS:
        raise KaggleVoiceError(f"model {model!r} is not built (known: {', '.join(MODELS)})")
    os.makedirs(kdir, exist_ok=True)
    job = {"nonce": nonce, "model": model, "refs": refs, "lines": jobs}
    if deadline:
        job["deadline"] = round(float(deadline), 1)  # absolute epoch seconds (the caller's hard timeout)
    src = KERNEL_TEMPLATE.replace("__RECIPE__", MODELS[model]).replace("__JOB__", json.dumps(json.dumps(job)))
    with open(os.path.join(kdir, "voice.py"), "w", encoding="utf-8") as f:
        f.write(src)
    with open(os.path.join(kdir, "kernel-metadata.json"), "w", encoding="utf-8") as f:
        json.dump({
            "id": kernel, "title": kernel.split("/", 1)[1], "code_file": "voice.py", "language": "python",
            "kernel_type": "script", "is_private": True, "enable_gpu": True, "enable_internet": True,
            "dataset_sources": list(dataset_sources), "competition_sources": [], "kernel_sources": list(kernel_sources),
        }, f, indent=2)
    return len(src.encode("utf-8"))


def _out(r):
    return f"{r.stdout or ''}\n{r.stderr or ''}".strip()


def run_batch(kernel, model, jobs, refs, workdir, timeout_s=TIMEOUT_S, poll_s=30, dataset_sources=(), kernel_sources=(),
              run=subprocess.run, sleep=time.sleep, clock=time.monotonic, nonce=None, log=print):
    """Push -> poll (hard timeout) -> download. Returns {files: {id: path}, gpu_seconds, result}.
    Raises KaggleVoiceError(reason, seconds) on any failure."""
    nonce = nonce or uuid.uuid4().hex
    kdir = os.path.join(workdir, "kernel")
    size = build_kernel(kdir, kernel, model, jobs, refs, nonce, dataset_sources, kernel_sources,
                        deadline=time.time() + timeout_s)
    base = cli()
    t0 = clock()
    log(f"[gpu-voice] push {kernel} ({len(jobs)} sentences, {size // 1024} KB, {model})")
    while True:
        # the kernel's own run-time limit, so a stuck session never burns the quota
        left = int(timeout_s - (clock() - t0))
        r = run(base + ["kernels", "push", "-p", kdir, "-t", str(max(60, left))], capture_output=True, text=True, timeout=300)
        out = _out(r)
        if r.returncode == 0 and "successfully pushed" in out:
            break
        if "Maximum batch GPU session" in out and clock() - t0 + 120 <= PUSH_WAIT_S:
            log("[gpu-voice] both free GPU sessions are busy — trying the push again in 2 min")
            sleep(120)
            continue
        raise KaggleVoiceError(f"push failed: {out[-300:]}", 0)  # nothing ran: no GPU time
    t_run = clock()
    elapsed = lambda: clock() - t_run  # noqa: E731  GPU session time (counted in the quota)
    deadline = t0 + timeout_s
    out_dir = os.path.join(workdir, "out")
    first = True
    while True:
        sleep(max(poll_s, 60) if first else poll_s)  # setup alone takes ~5 min
        first = False
        if clock() > deadline:
            raise KaggleVoiceError(f"timed out after {int(timeout_s // 60)} min", elapsed())
        st = parse_status(_out(run(base + ["kernels", "status", kernel], capture_output=True, text=True, timeout=120)))
        if st in ("error", "cancel_requested", "cancel_acknowledged", "cancelled"):
            raise KaggleVoiceError(f"kernel {st}", elapsed())
        if st != "complete":
            continue
        os.makedirs(out_dir, exist_ok=True)
        for f in ("result.json", "voice-out.tar"):
            if os.path.exists(os.path.join(out_dir, f)):
                os.remove(os.path.join(out_dir, f))
        d = run(base + ["kernels", "output", kernel, "-p", out_dir, "-o", "--file-pattern", r"result\.json|voice-out\.tar"],
                capture_output=True, text=True, timeout=600)
        try:
            with open(os.path.join(out_dir, "result.json"), encoding="utf-8") as f:
                res = json.load(f)
        except Exception:
            raise KaggleVoiceError(f"no result.json in the kernel output ({_out(d)[-200:]})", elapsed())
        if res.get("nonce") != nonce:
            continue  # the previous version's output: this run has not finished yet
        gpu = float(res.get("wall_s") or elapsed())
        if res.get("fatal") or not res.get("ok"):
            raise KaggleVoiceError(f"kernel failed: {str(res.get('fatal') or 'not ok')[-300:]}", gpu)
        tar_path = os.path.join(out_dir, "voice-out.tar")
        if not os.path.exists(tar_path):
            raise KaggleVoiceError("no audio in the kernel output", gpu)
        files = {}
        audio_dir = os.path.join(workdir, "audio")
        os.makedirs(audio_dir, exist_ok=True)
        with tarfile.open(tar_path) as t:
            for m in t.getmembers():
                name = os.path.basename(m.name)
                if not m.isfile() or not re.fullmatch(r"[A-Za-z0-9_.-]+\.flac", name):
                    continue  # never trust archive paths
                p = os.path.join(audio_dir, name)
                with open(p, "wb") as f:
                    f.write(t.extractfile(m).read())
                files[name[:-5]] = p
        if not files:
            raise KaggleVoiceError("no audio in the kernel output", gpu)
        errs = res.get("errors") or []
        log(f"[gpu-voice] done: {len(files)}/{len(jobs)} sentences in {gpu / 60:.1f} GPU min"
            f" (install {res.get('install_s')}s, load {res.get('load_s')}s){f', {len(errs)} failed' if errs else ''}")
        return {"files": files, "gpu_seconds": gpu, "result": res}


# ---------------------------------------------------------------------------
# Planning + assembly (host side)
# ---------------------------------------------------------------------------
def _vl():
    import voice_lines
    return voice_lines


def split_tagged_sentences(raw):
    """The raw (tagged) sentences, one per voice_lines.split_sentences entry. A tag-only
    fragment joins the sentence before it."""
    vl = _vl()
    t = re.sub(r"\s+", " ", raw or "").strip()
    parts = re.split(r"(?:(?<=[.!?…])|(?<=[.!?…][" + re.escape(vl._TRAIL) + r"]))\s+(?=\S)", t)
    out = []
    for p in (x.strip() for x in parts):
        if not p:
            continue
        if not vl.clean(p) and out:
            out[-1] = f"{out[-1]} {p}"
        elif vl.clean(p):
            out.append(p)
    return out


def _keep_tags(text, allowed):
    def sub(m):
        name = re.sub(r"\s+", " ", m.group(1).lower()).strip()
        return f"[{name}]" if name in allowed else " "
    return re.sub(r"\s+", " ", TAG_RE.sub(sub, text)).strip()


def plan_jobs(lines, expression, allowed_tags, mood=None, ref="main"):
    """-> (jobs, per_line {i: [job ids in sentence order]}). 'none' = no tags at all."""
    vl = _vl()
    jobs, per = [], {}
    allowed = set(allowed_tags or []) if expression in ("light", "rich") else set()
    for ln in lines:
        i = ln["i"]
        raw = split_tagged_sentences(ln["text"])
        clean = vl.split_sentences(ln["text"])
        if [vl.clean(s) for s in raw] != clean:
            raw = clean  # could not pair the tags with sentences: natural delivery for this line
        temp = vl.MOOD.get(ln.get("mood") or mood or "warm", vl.MOOD["warm"])[3]
        ids = []
        for k, s in enumerate(raw):
            jid = f"{i}-{k}"
            ids.append(jid)
            jobs.append({"id": jid, "text": _keep_tags(s, allowed) if allowed else vl.clean(s), "ref": ref,
                         "temperature": temp, "seed": 1000 + i * 100 + k})
        per[i] = ids
    return jobs, per


def read_audio(path):
    import soundfile as sf
    a, sr = sf.read(path, dtype="float32")
    if getattr(a, "ndim", 1) > 1:
        a = a.mean(axis=1)
    return a, sr


def trim_silence(a, sr, pad_ms=60):
    import numpy as np
    a = np.asarray(a, dtype=np.float32).reshape(-1)
    if a.size == 0:
        return a
    thr = max(1e-4, float(np.abs(a).max()) * 0.02)
    idx = np.flatnonzero(np.abs(a) > thr)
    if idx.size == 0:
        return a
    pad = int(sr * pad_ms / 1000)
    return a[max(0, idx[0] - pad): min(a.size, idx[-1] + pad + 1)]


def assemble_line(text, paths, aligner, read=read_audio):
    """The SAME human pacing as the Kokoro lane: voice_lines.human_tts with a synth that
    hands back the GPU sentence clips in order. -> (samples, sr, words, matched, total)."""
    vl = _vl()
    queue = list(paths)

    def synth(_sentence, _speed):
        if not queue:
            raise RuntimeError("fewer GPU clips than sentences")
        a, sr = read(queue.pop(0))
        return trim_silence(a, sr), sr
    return vl.human_tts(text, synth, aligner, 1.0, None)


def passes_gate(matched, total, seconds):
    if total <= 0:
        return False
    if matched < MIN_HEARD * total:
        return False
    return seconds <= max(8.0, total * 1.0 + 5.0)  # < ~1 word/s = rambling or garbage audio


def make_reference(voice, out_dir):
    """The Kokoro reference clip the GPU engine clones (licence-clean) -> mp3 path (~60 KB)."""
    import numpy as np
    import soundfile as sf
    vl = _vl()
    os.makedirs(out_dir, exist_ok=True)
    a, sr = vl.kokoro_model().create(REF_TEXT, voice=voice, speed=REF_SPEED, lang="en-us")
    wav = os.path.join(out_dir, f"ref-{voice}.wav")
    mp3 = os.path.join(out_dir, f"ref-{voice}.mp3")
    sf.write(wav, np.asarray(a, dtype=np.float32), sr)
    vl.ff("-i", wav, "-ar", "24000", "-ac", "1", "-b:a", "48k", mp3)
    return mp3


def gpu_narrate(lines, voice, mood, model, expression, allowed_tags, slug, adir, tmp, stem, key_of, cache,
                usage_dir=None, env=None, home=None, now=None, batch=run_batch, make_ref=make_reference,
                read=read_audio, aligner=None, to_mp3=None, timeout_s=None, log=print):
    """The emotional pass of voice_lines.main. -> (done {i: {ms, words}}, report).
    Lines NOT in `done` (quality gate, missing clip) are rendered by the normal
    Kokoro loop; an empty `done` with report.ok False = the whole run fell back."""
    vl = _vl()
    usage_path = usage_file(slug, usage_dir)
    report = {"requested": True, "engine": "chatterbox-kaggle", "model": model, "expression": expression, "ok": False}
    kernel = kernel_id(slug)
    done = {}

    def fail(reason):
        report["reason"] = reason
        log(f"[voice] emotional voice unavailable today — used the standard voice ({reason})")
        return {}, report

    if model not in MODELS:
        return fail(f"model {model} is not built yet")
    summary = usage_summary(load_all_usage(usage_dir), now)
    report["weekHours"] = summary["hours"]
    if summary["paused"]:
        return fail(f"free GPU used up this week ({summary['hours']} h of ~{LIMIT_HOURS} h)")
    if not has_credentials(env, home):
        return fail("no Kaggle key on this runner")
    todo = []
    for ln in lines:
        hit = cache.get(str(ln["i"]))
        mp3 = os.path.join(adir, f"{stem}-{ln['i']:02d}.mp3")
        if hit and hit.get("key") == key_of(ln) and os.path.exists(mp3):
            done[ln["i"]] = {"ms": hit["ms"], "words": hit["words"]}
        else:
            todo.append(ln)
    if not todo:
        report.update(ok=True, gpuLines=len(done), fallbackLines=[], gpuSeconds=0)
        return done, report
    work = os.path.join(tmp, "gpu")
    os.makedirs(work, exist_ok=True)
    try:
        ref = make_ref(voice, work)
        with open(ref, "rb") as f:
            ref_b64 = base64.b64encode(f.read()).decode()
        jobs, per = plan_jobs(todo, expression, allowed_tags, mood)
        kw = {"log": log}
        if timeout_s:
            kw["timeout_s"] = timeout_s
        res = batch(kernel, model, jobs, {"main": {"b64": ref_b64, "ext": "mp3"}}, work, **kw)
    except KaggleVoiceError as e:
        record_run(usage_path, at=now, slug=slug, kernel=kernel, seconds=e.seconds, ok=False)
        return fail(str(e)[:300])
    except Exception as e:  # anything unexpected: never lose the video
        return fail(f"error: {str(e)[:200]}")
    record_run(usage_path, at=now, slug=slug, kernel=kernel, seconds=res["gpu_seconds"], ok=True)
    report["gpuSeconds"] = round(res["gpu_seconds"])
    aligner = aligner or vl.whisper_aligner()
    to_mp3 = to_mp3 or vl.to_mp3
    fallback = []
    for ln in todo:
        i = ln["i"]
        paths = [res["files"].get(j) for j in per[i]]
        if not paths or any(p is None for p in paths):
            fallback.append(i)
            continue
        try:
            text = vl.clean(ln["text"])
            samples, sr, words, matched, total = assemble_line(text, paths, aligner, read)
            seconds = samples.size / sr
            if not passes_gate(matched, total, seconds):
                log(f"  [voice] line {i:02d}: GPU take heard {matched}/{total} words — standard voice for this line")
                fallback.append(i)
                continue
            import soundfile as sf
            wav = os.path.join(work, f"line-{i:02d}.wav")
            sf.write(wav, samples, sr)
            mp3 = os.path.join(adir, f"{stem}-{i:02d}.mp3")
            to_mp3(wav, mp3)
            ms = round(seconds * 1000)
            cache[str(i)] = {"key": key_of(ln), "ms": ms, "words": words}
            done[i] = {"ms": ms, "words": words}
            log(f"  [voice] line {i:02d}: {seconds:.1f}s on the GPU voice ({matched}/{total} heard)")
        except Exception as e:
            log(f"  [voice] line {i:02d}: GPU take unusable ({str(e)[:120]}) — standard voice for this line")
            fallback.append(i)
    report.update(ok=True, gpuLines=len(done), fallbackLines=fallback)
    return done, report
