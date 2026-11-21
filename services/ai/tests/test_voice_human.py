"""Step 1 voice lane (docs/qa/step1-mr-voice-moneyflow-qa.md V1-V5).

Pure tests: no Kokoro / whisper model — synth and aligner are injected fakes.
The modules live outside services/ai, so they are loaded by path."""
import importlib.util
import json
import os

import numpy as np
import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, rel))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


vl = _load("voice_lines", "explainer/voice_lines.py")
narrate = _load("narrate", "youtube-flow/narrate.py")


def test_split_sentences_keeps_punctuation_and_ellipsis():
    s = vl.split_sentences('Rent takes the biggest bite. Then what? It drains... fast! "Done."  Next')
    assert s == ["Rent takes the biggest bite.", "Then what?", "It drains...", "fast!", '"Done."', "Next"]


def test_split_sentences_strips_chatterbox_tags():
    assert vl.split_sentences("[sigh] Everything broke. [chuckle] Yeah.") == ["Everything broke.", "Yeah."]


def test_pause_after_follows_punctuation():
    assert vl.pause_after("It drains...") == 650
    assert vl.pause_after("Then what?") == 430
    assert vl.pause_after("Stop!") == 380
    assert vl.pause_after("Done.") == 340
    assert vl.pause_after('He said "no."') == 340
    assert vl.pause_after("no end") == 300


def test_sentence_speed_mood_and_punctuation_bounded():
    assert vl.sentence_speed("Plain.", 0.95) == 0.95
    assert vl.sentence_speed("Wow!", 1.0) == 1.04
    assert vl.sentence_speed("Why?", 1.0) == 0.98
    assert vl.sentence_speed("Plain.", 1.0, "excited") == 1.08
    assert vl.sentence_speed("Plain.", 5.0) == 1.3
    assert vl.sentence_speed("Plain.", 0.1) == 0.7


def test_map_to_script_uses_script_words_and_interpolates_misheard():
    rec = [("It", 0.0, 0.2), ("lands", 0.2, 0.5), ("in", 0.5, 0.6), ("checkin", 0.6, 1.0), ("every", 1.4, 1.7), ("month", 1.7, 2.0)]
    words, matched = vl.map_to_script("It lands in checking. $3,200, every month.", rec, 2.2)
    assert [w["w"] for w in words] == ["It", "lands", "in", "checking.", "$3,200,", "every", "month."]
    assert matched == 5
    starts = [w["s"] for w in words]
    assert starts == sorted(starts)
    assert 0.6 <= words[3]["s"] < words[4]["s"] < 1.4  # misheard words land in the gap


def test_map_to_script_never_runs_backwards():
    rec = [("a", 0.5, 0.6), ("b", 0.4, 0.45)]
    words, _ = vl.map_to_script("a b", rec, 1.0)
    assert words[1]["s"] >= words[0]["s"]


def _fake_synth(sentence, speed):
    sr = 24000
    return np.ones(int(sr * 0.1 * len(sentence.split())), dtype=np.float32) * 0.1, sr


def _fake_aligner(a, sr, sentence):
    ws = sentence.split()
    step = a.size / sr / len(ws)
    return [{"w": w, "s": round(k * step, 3), "d": round(step, 3)} for k, w in enumerate(ws)], len(ws)


def test_human_tts_inserts_pauses_and_aligns_once_on_the_script():
    calls = []

    def aligner(a, sr, text):
        calls.append((a.size, sr, text))
        return _fake_aligner(a, sr, text)
    samples, sr, words, matched, total = vl.human_tts("One two. Three four five?", _fake_synth, aligner)
    # lead 120ms + "One two." 0.2s + "." pause 340ms + "Three four five?" 0.3s (no trailing pause)
    assert samples.size == int(sr * 0.12) + int(sr * 0.2) + int(sr * 0.34) + int(sr * 0.3)
    assert calls == [(samples.size, 24000, "One two. Three four five?")]
    assert [w["w"] for w in words] == ["One", "two.", "Three", "four", "five?"]
    assert matched == total == 5
    # the pause is real silence
    pause = samples[int(sr * 0.12) + int(sr * 0.2): int(sr * 0.12) + int(sr * 0.2) + int(sr * 0.34)]
    assert pause.size > 0 and float(np.abs(pause).max()) == 0.0


def test_human_tts_weak_whole_pass_falls_back_to_per_sentence():
    calls = []

    def aligner(a, sr, text):
        calls.append(text)
        ws, m = _fake_aligner(a, sr, text)
        return ws, (0 if len(calls) == 1 else m)  # whole-file pass hears nothing
    samples, sr, words, matched, total = vl.human_tts("One two. Three four five?", _fake_synth, aligner)
    assert calls == ["One two. Three four five?", "One two.", "Three four five?"]
    assert matched == total == 5
    # per-sentence words are offset by the sentence start (lead 0.12 + 0.2 + pause 0.34)
    assert words[2]["w"] == "Three" and words[2]["s"] == pytest.approx(0.66, abs=1e-3)


def test_human_tts_raises_when_alignment_stays_weak_in_strict_mode(monkeypatch):
    monkeypatch.setenv("VOICE_ALIGN_STRICT", "1")
    with pytest.raises(RuntimeError, match="alignment too weak"):
        vl.human_tts("One two. Three four five?", _fake_synth, lambda a, sr, t: (_fake_aligner(a, sr, t)[0], 0))


def test_human_tts_weak_alignment_falls_back_to_estimated_timings(monkeypatch):
    # 2026-11-19: an approved doc was discarded on "12/21 words heard" though the
    # audio was fine. Default now keeps the audio and estimates word timings.
    monkeypatch.delenv("VOICE_ALIGN_STRICT", raising=False)
    samples, sr, words, matched, total = vl.human_tts(
        "One two. Three four five?", _fake_synth, lambda a, sr, t: (_fake_aligner(a, sr, t)[0], 0))
    assert matched == 0 and total == 5
    assert [w["w"] for w in words] == ["One", "two.", "Three", "four", "five?"]
    starts = [w["s"] for w in words]
    assert starts == sorted(starts), "timings are monotonic"
    assert all(w["d"] > 0 for w in words)
    assert words[-1]["s"] + words[-1]["d"] <= samples.size / sr + 1e-3, "inside the audio"


def test_human_tts_fails_loudly_on_empty_audio():
    with pytest.raises(ValueError, match="no audio"):
        vl.human_tts("Hello there.", lambda s, sp: (np.zeros(0, dtype=np.float32), 24000), _fake_aligner)


def test_voice_profile_reads_kit_data(tmp_path):
    p = tmp_path / "brands.json"
    p.write_text(json.dumps({
        "money-rulebook": {"voice": "bm_daniel", "voiceProfile": {"engine": "kokoro", "voice": "bm_daniel", "speed": 0.95}},
        "quotequarry": {"voice": "am_michael"},
        "broken": {"voiceProfile": {"engine": "kokoro"}},
    }))
    assert narrate.voice_profile("money-rulebook", str(p))["voice"] == "bm_daniel"
    assert narrate.voice_profile("quotequarry", str(p)) is None  # V4: no profile = legacy chain
    assert narrate.voice_profile("broken", str(p)) is None
    assert narrate.voice_profile("missing", str(p)) is None


def test_try_human_falls_back_on_failure(tmp_path, capsys):
    class Boom:
        @staticmethod
        def human_tts_to_mp3(*a, **k):
            raise RuntimeError("kokoro model missing")
    assert narrate.try_human("Hi.", str(tmp_path / "x.mp3"), {"voice": "bm_daniel"}, lane=Boom) is None
    assert "falling back" in capsys.readouterr().err


def test_try_human_returns_meta(tmp_path):
    class Ok:
        @staticmethod
        def human_tts_to_mp3(text, voice, speed, mood, out_mp3, tmp):
            assert voice == "bm_daniel" and speed == 0.95
            return [{"w": "Hi.", "s": 0.12, "d": 0.3}], 420, 1, 1
    meta = narrate.try_human("Hi.", str(tmp_path / "x.mp3"), {"voice": "bm_daniel", "speed": 0.95}, lane=Ok)
    assert meta["engine"] == "kokoro-human" and meta["words"][0]["w"] == "Hi." and meta["duration"] == 0.42


# ---------------------------------------------------------------------------
# Human voice as a panel setting (docs/qa/human-voice-panel-qa.md HV-E*).
# The SAME case table as tests/human-voice-panel.test.mjs (lib/voice-profile.mjs),
# so the Python lanes (Shorts + legacy doc narration via narrate.py) and the Node
# lanes (storybook + diagram via voiceProfileFor) can never disagree.
# ---------------------------------------------------------------------------
CASES = json.load(open(os.path.join(ROOT, "tests", "fixtures", "voice-profile-cases.json"), encoding="utf-8"))


@pytest.mark.parametrize("case", CASES["cases"], ids=[c["name"] for c in CASES["cases"]])
def test_voice_profile_registry_kit_precedence(case, tmp_path):
    brands = tmp_path / "brands.json"
    brands.write_text(json.dumps(CASES["brands"]), encoding="utf-8")
    reg = tmp_path / "registry.json"
    reg.write_text(json.dumps(case["registry"]), encoding="utf-8")
    assert narrate.voice_profile(case["slug"], str(brands), str(reg)) == case["expect"]


def test_voice_profile_without_registry_file_is_todays_behaviour(tmp_path):
    brands = tmp_path / "brands.json"
    brands.write_text(json.dumps(CASES["brands"]), encoding="utf-8")
    missing = str(tmp_path / "nope.json")
    assert narrate.voice_profile("money-rulebook", str(brands), missing) == CASES["brands"]["money-rulebook"]["voiceProfile"]
    assert narrate.voice_profile("quotequarry", str(brands), missing) is None


def test_narrate_moods_are_the_voice_lane_moods():
    assert list(narrate.HUMAN_MOODS) == list(vl.MOOD)


gen = _load("gen_previews", "scripts/generate-human-voice-previews.py")


def test_preview_generator_offers_exactly_the_picker_voices():
    assert gen.picker_voices() == ["am_michael", "bm_george", "bm_daniel", "am_fenrir", "am_adam", "af_heart", "am_onyx"]
    assert gen.MOODS == list(vl.MOOD)


def test_preview_text_has_a_pause_a_question_and_an_end():
    assert vl.split_sentences(gen.PREVIEW_TEXT) == [
        "Here's the thing...", "Why does it matter?", "Small habits compound."]


def test_preview_render_is_human_tts_without_alignment():
    speeds = []

    def synth(sentence, speed):
        speeds.append(speed)
        return _fake_synth(sentence, speed)
    samples, sr = gen.render_preview(gen.PREVIEW_TEXT, "sad", synth)
    # per-sentence speed = mood x punctuation (the real human_tts path)
    assert speeds == [vl.sentence_speed(s, 1.0, "sad") for s in vl.split_sentences(gen.PREVIEW_TEXT)]
    # lead + 3 sentences + the "..." and "?" pauses
    words = [len(s.split()) for s in vl.split_sentences(gen.PREVIEW_TEXT)]
    assert samples.size == int(sr * 0.12) + sum(int(sr * 0.1 * n) for n in words) + int(sr * 0.65) + int(sr * 0.43)
    # no aligner: the no-op one reports every word heard, so no fallback pass runs
    assert gen.no_align(samples, sr, "a b c") == ([], 3)
