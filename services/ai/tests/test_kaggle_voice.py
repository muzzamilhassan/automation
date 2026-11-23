"""Emotional voice via the free Kaggle GPU (docs/qa/emotional-voice-qa.md).

Pure tests: no Kaggle, no GPU, no Kokoro / whisper model — the CLI runner,
clock, audio reader, aligner and reference maker are injected fakes. The
modules live outside services/ai, so they are loaded by path."""
import importlib.util
import io
import json
import os
import sys
import tarfile

import numpy as np
import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, rel))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


vl = _load("voice_lines", "explainer/voice_lines.py")
kv = _load("kaggle_voice", "explainer/kaggle_voice.py")
narrate = _load("narrate", "youtube-flow/narrate.py")
WEEKS = json.load(open(os.path.join(ROOT, "tests", "fixtures", "gpu-usage-cases.json"), encoding="utf-8"))


# --------------------------------------------------------------------------
# EV-Q: the quota guard counts the same ISO week as the panel
# --------------------------------------------------------------------------
@pytest.mark.parametrize("case", WEEKS["weeks"], ids=[c["at"] for c in WEEKS["weeks"]])
def test_iso_week_key_matches_the_shared_fixture(case):
    assert kv.iso_week_key(kv.parse_iso(case["at"])) == case["key"]


@pytest.mark.parametrize("case", WEEKS["summaries"], ids=[c["name"] for c in WEEKS["summaries"]])
def test_usage_summary_matches_the_panel(case):
    assert kv.usage_summary(case["usage"], kv.parse_iso(case["now"])) == case["expect"]


def test_record_run_writes_this_week_and_keeps_8_weeks(tmp_path):
    p = str(tmp_path / "state" / "gpu-usage" / "money-rulebook.json")
    kv.record_run(p, at=kv.parse_iso("2026-11-22T10:00:00Z"), slug="money-rulebook", kernel="k", seconds=600.4, ok=True)
    kv.record_run(p, at=kv.parse_iso("2026-11-22T11:00:00Z"), slug="money-rulebook", kernel="k", seconds=300, ok=False)
    u = json.load(open(p, encoding="utf-8"))
    assert u["weeks"]["2026-W47"]["seconds"] == 900
    assert [r["ok"] for r in u["weeks"]["2026-W47"]["runs"]] == [True, False]
    from datetime import timedelta
    for k in range(12):
        kv.record_run(p, at=kv.parse_iso("2026-01-05T00:00:00Z") + timedelta(days=7 * k), slug="s", kernel="k", seconds=1, ok=True)
    weeks = json.load(open(p, encoding="utf-8"))["weeks"]
    assert len(weeks) == 8 and "2026-W47" in weeks, "the oldest weeks go first"


def test_usage_is_one_file_per_channel_summed_for_the_account(tmp_path):
    d = tmp_path / "gpu-usage"
    kv.record_run(kv.usage_file("money-rulebook", str(d)), at=kv.parse_iso("2026-11-22T10:00:00Z"), slug="money-rulebook", seconds=3600, ok=True)
    kv.record_run(kv.usage_file("Quote Quarry", str(d)), at=kv.parse_iso("2026-11-21T10:00:00Z"), slug="quotequarry", seconds=1800, ok=True)
    (d / "junk.json").write_text("{nope")
    assert sorted(os.listdir(d)) == ["junk.json", "money-rulebook.json", "quote-quarry.json"]
    s = kv.usage_summary(kv.load_all_usage(str(d)), kv.parse_iso("2026-11-22T12:00:00Z"))
    assert s["hours"] == 1.5 and s["runs"] == 2


def test_guard_blocks_at_25_hours():
    now = kv.parse_iso("2026-11-22T10:00:00Z")
    assert kv.usage_summary({"weeks": {"2026-W47": {"seconds": 25 * 3600 - 1}}}, now)["paused"] is False
    assert kv.usage_summary({"weeks": {"2026-W47": {"seconds": 25 * 3600}}}, now)["paused"] is True


# --------------------------------------------------------------------------
# EV-K: the kernel (one private GPU batch per channel, small push)
# --------------------------------------------------------------------------
def test_kernel_id_is_per_channel_and_kaggle_safe():
    assert kv.kernel_id("money-rulebook", "muzzamilhassan") == "muzzamilhassan/quarry-voice-money-rulebook"
    assert kv.kernel_id("Weird_Slug!!", "u") == "u/quarry-voice-weird-slug"
    assert len(kv.kernel_id("x" * 80, "u").split("/")[1]) <= 50


def test_build_kernel_is_private_gpu_internet_and_small(tmp_path):
    jobs = [{"id": "0-0", "text": "Hello there.", "ref": "main", "temperature": 0.7, "seed": 1000}]
    size = kv.build_kernel(str(tmp_path), "muzzamilhassan/quarry-voice-mr", "chatterbox-turbo", jobs,
                           {"main": {"b64": "QUJD", "ext": "mp3"}}, nonce="n-123")
    meta = json.load(open(tmp_path / "kernel-metadata.json", encoding="utf-8"))
    assert meta["id"] == "muzzamilhassan/quarry-voice-mr"
    assert meta["title"] == "quarry-voice-mr"
    assert meta["is_private"] is True and meta["enable_gpu"] is True and meta["enable_internet"] is True
    assert meta["kernel_type"] == "script" and meta["code_file"] == "voice.py"
    src = open(tmp_path / "voice.py", encoding="utf-8").read()
    assert "n-123" in src and "Hello there." in src
    assert "ChatterboxTurboTTS" in src and "uninstall" in src and "torchvision" in src
    assert "voice-out.tar" in src and "result.json" in src
    assert size < 200_000
    compile(src, "voice.py", "exec")  # the generated kernel is valid Python


def test_kernel_carries_an_absolute_deadline_and_exits_if_it_starts_late(tmp_path):
    # the CLI cannot cancel a queued kernel: one that starts after the host gave up must not burn the quota
    kv.build_kernel(str(tmp_path), "u/k", "chatterbox-turbo", [], {}, nonce="n", deadline=1234567890.5)
    src = open(tmp_path / "voice.py", encoding="utf-8").read()
    assert "1234567890.5" in src
    head = src[:src.index("    install()")]
    assert 'time.time() > JOB["deadline"]' in head, "checked before the 4-min install"
    assert src.count('JOB["deadline"]') >= 2, "and again between lines"


def test_model_is_data_unknown_model_is_refused(tmp_path):
    assert list(kv.MODELS) == ["chatterbox-turbo"]
    for fn in ("def install", "def load", "def prepare", "def seed", "def generate"):
        assert fn in kv.MODELS["chatterbox-turbo"]
    with pytest.raises(kv.KaggleVoiceError):
        kv.build_kernel(str(tmp_path), "u/k", "orpheus", [], {}, nonce="n")


def test_models_and_expressions_match_the_panel_catalog():
    src = open(os.path.join(ROOT, "studio", "lib", "emotional-voice.mjs"), encoding="utf-8").read()
    import re
    ids = re.findall(r"id: '([a-z0-9-]+)',\n    label:", src)
    assert ids == list(kv.MODELS) == list(narrate.GPU_MODELS)
    assert list(narrate.EXPRESSIONS) == ["none", "light", "rich"]


def test_parse_status():
    assert kv.parse_status('u/k has status "KernelWorkerStatus.COMPLETE"') == "complete"
    assert kv.parse_status('u/k has status "running"') == "running"
    assert kv.parse_status('u/k has status "KernelWorkerStatus.CANCEL_ACKNOWLEDGED"') == "cancel_acknowledged"
    assert kv.parse_status("garbage") == ""


class FakeKaggle:
    """A scripted Kaggle CLI: push answer, a status sequence, and an output tarball."""

    def __init__(self, statuses, push_ok=True, nonce=None, files=None, fatal=None, wall=300.0, busy=0):
        self.statuses = list(statuses)
        self.push_ok = push_ok
        self.busy = busy  # how many pushes hit the 2-GPU-session cap first
        self.nonce = nonce
        self.files = files or {}
        self.fatal = fatal
        self.wall = wall
        self.calls = []

    def __call__(self, cmd, **kw):
        self.calls.append(cmd)
        class R:
            pass
        r = R()
        r.returncode, r.stdout, r.stderr = 0, "", ""
        sub = cmd[cmd.index("kernels") + 1]
        if sub == "push":
            if self.busy > 0:
                self.busy -= 1
                r.stdout = "Kernel push error: Maximum batch GPU session count of 2 reached."
            elif self.push_ok:
                r.stdout = "Kernel version 2 successfully pushed.  Please check progress at https://www.kaggle.com/code/u/k"
            else:
                r.returncode, r.stdout = 1, "Maximum batch GPU session count of 2 reached."
        elif sub == "status":
            s = self.statuses.pop(0) if self.statuses else "running"
            r.stdout = f'u/k has status "KernelWorkerStatus.{s.upper()}"'
        elif sub == "output":
            out = cmd[cmd.index("-p") + 1]
            res = {"nonce": self.nonce, "ok": self.fatal is None, "wall_s": self.wall, "lines": [], "errors": []}
            if self.fatal:
                res["fatal"] = self.fatal
            buf = io.BytesIO()
            with tarfile.open(fileobj=buf, mode="w") as t:
                for name, data in self.files.items():
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    t.addfile(info, io.BytesIO(data))
            open(os.path.join(out, "voice-out.tar"), "wb").write(buf.getvalue())
            json.dump(res, open(os.path.join(out, "result.json"), "w"))
        return r


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.t += s


def _batch(tmp_path, fake, clock, timeout_s=1800, nonce="N1"):
    return kv.run_batch("u/k", "chatterbox-turbo", [{"id": "0-0", "text": "Hi.", "ref": "main"}], {"main": {"b64": "QQ==", "ext": "mp3"}},
                        str(tmp_path), timeout_s=timeout_s, poll_s=30, run=fake, sleep=clock.sleep, clock=clock,
                        nonce=nonce, log=lambda *a: None)


def test_run_batch_push_poll_download(tmp_path):
    fake = FakeKaggle(["queued", "running", "complete"], nonce="N1", files={"0-0.flac": b"FLAC"}, wall=412.0)
    clock = Clock()
    res = _batch(tmp_path, fake, clock)
    assert os.path.basename(res["files"]["0-0"]) == "0-0.flac"
    assert res["gpu_seconds"] == 412.0
    push = next(c for c in fake.calls if "push" in c)
    assert "-t" in push, "the kernel's own run-time limit is set on push"


def test_run_batch_waits_for_a_free_gpu_session_then_runs(tmp_path):
    fake = FakeKaggle(["running", "complete"], nonce="N1", files={"0-0.flac": b"FLAC"}, busy=2)
    res = _batch(tmp_path, fake, Clock())
    assert "0-0" in res["files"]
    assert sum(1 for c in fake.calls if "push" in c) == 3


def test_run_batch_gives_up_on_a_busy_gpu_after_the_push_wait(tmp_path):
    clock = Clock()
    with pytest.raises(kv.KaggleVoiceError, match="Maximum batch GPU session"):
        _batch(tmp_path, FakeKaggle([], busy=999), clock)
    assert kv.PUSH_WAIT_S <= clock.t <= kv.PUSH_WAIT_S + 300


def test_run_batch_push_error_raises_with_reason(tmp_path):
    with pytest.raises(kv.KaggleVoiceError) as e:
        _batch(tmp_path, FakeKaggle([], push_ok=False), Clock())
    assert "Maximum batch GPU session" in str(e.value)


def test_run_batch_kernel_error_and_fatal(tmp_path):
    with pytest.raises(kv.KaggleVoiceError, match="error"):
        _batch(tmp_path, FakeKaggle(["running", "error"], nonce="N1"), Clock())
    with pytest.raises(kv.KaggleVoiceError, match="CUDA"):
        _batch(tmp_path, FakeKaggle(["complete"], nonce="N1", fatal="RuntimeError: CUDA unavailable"), Clock())


def test_run_batch_hard_timeout_counts_the_time(tmp_path):
    clock = Clock()
    with pytest.raises(kv.KaggleVoiceError) as e:
        _batch(tmp_path, FakeKaggle(["running"] * 500, nonce="N1"), clock, timeout_s=600)
    assert "timed out" in str(e.value)
    assert e.value.seconds >= 600


def test_run_batch_ignores_a_stale_previous_version(tmp_path):
    # status says complete, but the outputs are the PREVIOUS run's (other nonce): keep polling, then time out
    clock = Clock()
    with pytest.raises(kv.KaggleVoiceError, match="timed out"):
        _batch(tmp_path, FakeKaggle(["complete"] * 100, nonce="OLD"), clock, timeout_s=300)


def test_credentials_from_env_or_home(tmp_path):
    assert kv.has_credentials({"KAGGLE_API_TOKEN": "x"}, str(tmp_path)) is True
    assert kv.has_credentials({}, str(tmp_path)) is False
    (tmp_path / ".kaggle").mkdir()
    (tmp_path / ".kaggle" / "access_token").write_text("x")
    assert kv.has_credentials({}, str(tmp_path)) is True


# --------------------------------------------------------------------------
# EV-A: assembly — the SAME human pacing, timings on the clean text,
# per-line quality gate, whole-run fallback
# --------------------------------------------------------------------------
def test_split_tagged_sentences_pairs_with_the_clean_split():
    raw = "Most people never check. [sigh] It quietly drains them... Why?"
    assert kv.split_tagged_sentences(raw) == ["Most people never check.", "[sigh] It quietly drains them...", "Why?"]
    assert [vl.clean(s) for s in kv.split_tagged_sentences(raw)] == vl.split_sentences(raw)
    # a tag-only fragment joins the sentence before it (never an empty sentence)
    assert kv.split_tagged_sentences("Done. [laugh]") == ["Done. [laugh]"]


def test_plan_jobs_none_sends_no_tags_and_light_keeps_only_allowed():
    lines = [{"i": 3, "text": "One here. [chuckle] Two [sigh] there."}]
    jobs, per = kv.plan_jobs(lines, expression="none", allowed_tags=[], mood="calm")
    assert [j["text"] for j in jobs] == ["One here.", "Two there."]
    assert per == {3: ["3-0", "3-1"]}
    jobs, _ = kv.plan_jobs(lines, expression="light", allowed_tags=["sigh"], mood="calm")
    assert [j["text"] for j in jobs] == ["One here.", "Two [sigh] there."]
    assert jobs[0]["temperature"] == vl.MOOD["calm"][3]
    assert jobs[0]["ref"] == "main" and jobs[1]["seed"] != jobs[0]["seed"]


def _tone(seconds, sr=24000):
    return (0.3 * np.sin(np.linspace(0, 440 * 2 * np.pi * seconds, int(sr * seconds)))).astype(np.float32)


def test_assemble_line_uses_human_pacing_and_clean_words():
    sr = 24000
    clips = {"p0": (_tone(1.0), sr), "p1": (_tone(0.8), sr)}

    def aligner(samples, rate, script):
        return [{"w": w, "s": 0.0, "d": 0.1} for w in script.split()], len(script.split())
    samples, rate, words, matched, total = kv.assemble_line("It drains... Why?", ["p0", "p1"], aligner, read=lambda p: clips[p])
    assert rate == sr
    # lead 120 ms + clip + the "..." pause (650 ms) + clip (silence trimmed only at the edges)
    assert abs(samples.size - (int(sr * 0.12) + sr + int(sr * 0.65) + int(sr * 0.8))) < sr * 0.15
    assert [w["w"] for w in words] == ["It", "drains...", "Why?"]
    assert (matched, total) == (3, 3)


def test_quality_gate():
    assert kv.passes_gate(matched=17, total=20, seconds=8.0) is True   # 85 %
    assert kv.passes_gate(matched=16, total=20, seconds=8.0) is False  # dropped words
    assert kv.passes_gate(matched=20, total=20, seconds=60.0) is False  # rambling / garbage audio
    assert kv.MIN_HEARD == 0.85


def _fake_ref(voice, d):
    p = os.path.join(d, f"ref-{voice}.mp3")
    open(p, "wb").write(b"ID3fake")
    return p


def _narrate(tmp_path, **over):
    adir = tmp_path / "audio"
    adir.mkdir(exist_ok=True)
    usage_dir = str(tmp_path / "usage")
    usage = kv.usage_file("money-rulebook", usage_dir)
    sr = 24000
    lines = [{"i": 0, "text": "First line here."}, {"i": 1, "text": "Second line now."}]

    def fake_batch(kernel, model, jobs, refs, workdir, **kw):
        files = {}
        for j in jobs:
            p = os.path.join(workdir, j["id"] + ".flac")
            files[j["id"]] = p
        return {"files": files, "gpu_seconds": 420.0, "result": {}}

    heard = over.pop("heard", {0: 3, 1: 3})

    def aligner(samples, rate, script):
        n = len(script.split())
        line = 0 if script.startswith("First") else 1
        return [{"w": w, "s": 0.0, "d": 0.1} for w in script.split()], min(n, heard[line])
    args = dict(lines=lines, voice="bm_daniel", mood="calm", model="chatterbox-turbo", expression="none", allowed_tags=[],
                slug="money-rulebook", adir=str(adir), tmp=str(tmp_path), stem="beat", key_of=lambda ln: f"k{ln['i']}", cache={},
                usage_dir=usage_dir, env={"KAGGLE_API_TOKEN": "x"}, home=str(tmp_path), now=kv.parse_iso("2026-11-22T10:00:00Z"),
                batch=fake_batch, make_ref=_fake_ref, read=lambda p: (_tone(1.0), sr),
                aligner=aligner, to_mp3=lambda wav, mp3: open(mp3, "wb").write(b"mp3"), log=lambda *a: None)
    args.update(over)
    return kv.gpu_narrate(**args), usage


def test_gpu_narrate_happy_path_records_usage(tmp_path):
    (done, report), usage = _narrate(tmp_path)
    assert sorted(done) == [0, 1]
    assert done[0]["words"][0]["w"] == "First"
    assert report["requested"] is True and report["ok"] is True and report["gpuLines"] == 2 and report["fallbackLines"] == []
    assert json.load(open(usage, encoding="utf-8"))["weeks"]["2026-W47"]["seconds"] == 420


def test_gpu_narrate_line_gate_leaves_the_line_to_kokoro(tmp_path):
    (done, report), _ = _narrate(tmp_path, heard={0: 3, 1: 1})
    assert sorted(done) == [0], "line 1 dropped words -> not taken; the normal Kokoro loop renders it"
    assert report["ok"] is True and report["fallbackLines"] == [1]


@pytest.mark.parametrize("why,over", [
    ("no Kaggle key", {"env": {}}),
    ("used up", {"usage_seed": 25 * 3600}),
    ("not built", {"model": "orpheus"}),
    ("push failed", {"batch": "raise"}),
])
def test_gpu_narrate_whole_run_fallback(tmp_path, why, over):
    seed = over.pop("usage_seed", None)
    if seed is not None:  # another channel used it up: the quota is per Kaggle account
        (tmp_path / "usage").mkdir()
        json.dump({"weeks": {"2026-W47": {"seconds": seed, "runs": []}}}, open(tmp_path / "usage" / "other-channel.json", "w"))
    if over.get("batch") == "raise":
        def boom(*a, **k):
            raise kv.KaggleVoiceError("push failed: Maximum batch GPU session count of 2 reached.", 12)
        over["batch"] = boom
    (done, report), usage = _narrate(tmp_path, **over)
    assert done == {}
    assert report["requested"] is True and report["ok"] is False
    assert why.split()[0].lower() in report["reason"].lower()
    if why == "push failed":
        assert json.load(open(usage, encoding="utf-8"))["weeks"]["2026-W47"]["seconds"] == 12, "failed time still counts"


def test_voice_lines_cli_has_the_gpu_flags_and_writes_a_report():
    src = open(os.path.join(ROOT, "explainer", "voice_lines.py"), encoding="utf-8").read()
    for flag in ("--gpu-model", "--expression", "--gpu-tags", "--gpu-slug"):
        assert flag in src
    assert "chatterbox-kaggle" in src
    assert "voice-report.json" in src
    assert "kaggle_voice.gpu_narrate(" in src


# narrate.py mirror: emotional keys parsed exactly like the panel (the shared
# case table in test_voice_human.py covers precedence)
def test_narrate_kit_settings_parse_emotional():
    s = narrate._kit_settings({"human": True, "emotional": True, "expression": "light"})
    assert s["emotional"] is True and s["expression"] == "light" and s["model"] == "chatterbox-turbo"
    assert narrate._kit_settings({"human": True, "emotional": "yes"}) is None
    assert narrate._kit_settings({"human": True, "emotional": True, "model": "orpheus"}) is None
    assert "emotional" not in narrate._kit_settings({"human": True})
