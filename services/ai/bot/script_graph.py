# Market-episode SCRIPT graph (market-files P2 —
# docs/qa/market-files-p2-qa.md). The template bot (graph.py) designs
# templates; THIS brain writes EPISODES: a topic + the operator's FACT SHEET
# in, a Paper-Billions-style script out (cold open, chapters, minute-by-
# minute sequences, dialogue asides) as strict JSON our Node gate
# (lib/market-script.mjs) validates before anything stages.
#
# HONEST LIMITS (R2): the fact sheet is the ONLY legal source of numbers.
# The drafting prompt states the rule and the review node lists every number
# in the draft that does not appear in the facts — hallucinated market data
# is the one unforgivable sin in this lane.
#
# Style source: research/paper-billions-cartoon-market-lane-2026-11-10.md
# (18 reference frames + the full 15:00 transcript analysis).
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, TypedDict

logger = logging.getLogger("bot.script_graph")

ALLOWED_LAYOUTS = ["hero", "chapter", "split", "stat", "quote", "process", "timeline", "end"]
ALLOWED_LOCATIONS = ["trading", "office", "datacenter", "stage"]
ALLOWED_MOODS = ["calm", "party", "crash", "night", "data"]
ALLOWED_VOICES = ["en-US-AndrewNeural", "en-US-BrianNeural", "en-US-AriaNeural", "en-US-EmmaNeural", "en-US-ChristopherNeural", "en-GB-RyanNeural"]

# ---- the style guide (R7) — the Paper Billions grammar -----------------------
STYLE_RULES = (
    "NARRATION VOICE (the Paper Billions grammar — this is the show):\n"
    "- Cold-open hook: the most shocking number first, in one breath, then the "
    "question the episode answers.\n"
    "- Short present-tense sentences. One idea per sentence. 8-16 words is the "
    "sweet spot.\n"
    "- Concrete numbers everywhere the facts supply them: '$400 billion', "
    "'six minutes', '8 cents of every dollar'.\n"
    "- One vivid ANALOGY per chapter that turns the mechanism into a picture "
    "(e.g. 'Picture a restaurant where three tables order two of every five "
    "plates').\n"
    "- Event days get a MINUTE-BY-MINUTE timeline beat: timestamped ticks "
    "('9:30 The bell rings', '10:35 Down 4%') — the market day as a story.\n"
    "- Dialogue asides: short lines a CHARACTER says (3-8 words), spoken by a "
    "second voice — the joke or the pushback the viewer is thinking. Mark "
    "them as dialogue beats.\n"
    "- Chapters: the day/event broken into acts (The Top, The Cracks, The "
    "Party, The Morning, Who Gets Hurt, Did It Pop?).\n"
    "- The ending lands on an ORDINARY PERSON (a kitchen table, a 401k, an "
    "electric bill), then one closing line that earns the click.\n"
    "- Scene directions per beat: location (trading|office|datacenter|stage), "
    "mood (calm|party|crash|night|data), and for event-day beats the wall-"
    "clock 'time' ('10:35 AM ET') and the 'day' chip ('THURSDAY').\n"
)

FACT_RULE = (
    "FACT DISCIPLINE (unforgivable): every number you write MUST come from "
    "the FACT SHEET below. Invent nothing — no prices, no percentages, no "
    "dates, no market caps. If the facts don't have the number, the script "
    "doesn't have the number. Numbers already famous as context (years like "
    "1982 or 2008) may appear only if the fact sheet or the style of a "
    "historical comparison truly needs them — prefer leaving them out.\n"
)

SCRIPT_SHAPE_RULES = (
    "Return STRICT JSON, no markdown fences, shape:\n"
    '{"script_id":"<kebab-slug>","topic":"<the episode question>",'
    '"voices":{"narrator":"<en-US-AndrewNeural|en-US-BrianNeural|en-US-AriaNeural|en-US-EmmaNeural|en-US-ChristopherNeural|en-GB-RyanNeural>",'
    '"dialogue":"<a DIFFERENT voice from the same pool>"},'
    '"beats":[\n'
    '{"layout":"hero","text":"<cold open, 2-3 sentences>","scene":{"day":"<DAY>","mood":"<mood>","time":"<H:MM AM ET>"}},\n'
    '{"layout":"chapter","text":"<chapter title as spoken>","scene":{"mood":"<mood>"}},\n'
    '{"layout":"split","text":"<1-3 spoken sentences>","scene":{"location":"<set>","mood":"<mood>"}},\n'
    '{"layout":"stat","text":"<the spoken line about the number>","big":"<-4%|-$400B|...>","label":"<the board caption>","scene":{"time":"<H:MM AM ET>"}},\n'
    '{"layout":"quote","text":"<the character line, 3-8 words>","dialogue":{"speaker":"<THE INVESTOR|THE TRADER|...>"}},\n'
    '{"layout":"process","text":"<the mechanism intro>","lines":["<step 1>","<step 2>","<step 3>","<step 4>"]},\n'
    '{"layout":"timeline","text":"<the day as a story>","ticks":["<H:MM what happens>","..."]},\n'
    '{"layout":"end","text":"<the follow line>"}\n'
    "]}\n\n"
    "STRUCTURE (mandatory):\n"
    "- beat 1 = hero (cold open); last beat = end.\n"
    "- 6-9 chapters, each opened by a chapter beat and carrying 3-6 content "
    "beats (split/stat/quote/process/timeline mixed — NOT all split).\n"
    "- at least 2 dialogue (quote) beats and at least 1 timeline beat and at "
    "least 2 stat beats with big numbers from the facts.\n"
    "- scene.mood tracks the story (crash reds on the bad day, party greens "
    "on the rally, night for the aftermath, data for the machinery).\n"
    "- dialogues use SCREAMING-CAPS speaker names (THE INVESTOR).\n"
    f"- {FACT_RULE}"
)


class ScriptState(TypedDict, total=False):
    topic: str
    facts: str
    target_min: int
    script: dict[str, Any]
    shaped: dict[str, Any]
    critiques: list[str]
    issues: list[str]
    attempts: int
    max_attempts: int


def _extract_json(text: str) -> Any:
    t = re.sub(r"```json|```", "", str(text)).strip()
    start = t.find("{")
    t = t[start: t.rfind("}") + 1]
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        # the live model's long outputs occasionally carry trailing commas or
        # stray control chars — one deterministic repair pass before giving up
        repaired = re.sub(r",\s*([}\]])", r"\1", t)  # trailing commas
        repaired = re.sub(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f]", " ", repaired)
        return json.loads(repaired)


def _clamp_str(v, max_len: int = 600) -> str:
    s = re.sub("[�‑]", "-", str(v)).strip() if v is not None else ""
    bad = {"undefined", "null", "none"}
    return "" if s.lower() in bad else s[:max_len]


def _clamp_str_arr(v, max_n: int) -> list[str]:
    if not isinstance(v, list):
        return []
    return [clean for clean in (_clamp_str(x, 200) for x in v) if clean][:max_n]


def shape_script(raw: dict, topic: str) -> dict:
    """Deterministic normalization — mirrors lib/market-script.mjs so the
    Node validator and this shaper agree on what 'valid' means."""
    sid = re.sub(r"[^a-z0-9]+", "-", str(raw.get("script_id") or "").lower()).strip("-")[:60] or "market-episode"
    voices_raw = raw.get("voices") if isinstance(raw.get("voices"), dict) else {}
    narrator = voices_raw.get("narrator") if voices_raw.get("narrator") in ALLOWED_VOICES else "en-US-AndrewNeural"
    dialogue = voices_raw.get("dialogue") if voices_raw.get("dialogue") in ALLOWED_VOICES and voices_raw.get("dialogue") != narrator else ("en-US-EmmaNeural" if narrator != "en-US-EmmaNeural" else "en-US-BrianNeural")

    beats_raw = raw.get("beats") if isinstance(raw.get("beats"), list) else []
    beats: list[dict[str, Any]] = []
    for b in beats_raw[:120]:
        if not isinstance(b, dict):
            continue
        layout = b.get("layout") if b.get("layout") in ALLOWED_LAYOUTS else "split"
        scene_raw = b.get("scene") if isinstance(b.get("scene"), dict) else {}
        scene: dict[str, str] = {}
        if scene_raw.get("location") in ALLOWED_LOCATIONS:
            scene["location"] = scene_raw["location"]
        if scene_raw.get("mood") in ALLOWED_MOODS:
            scene["mood"] = scene_raw["mood"]
        if _clamp_str(scene_raw.get("time"), 20):
            scene["time"] = _clamp_str(scene_raw.get("time"), 20)
        if _clamp_str(scene_raw.get("day"), 30):
            scene["day"] = _clamp_str(scene_raw.get("day"), 30).upper()
        beat: dict[str, Any] = {"layout": layout, "text": _clamp_str(b.get("text"), 800)}
        if _clamp_str(b.get("headline"), 200):
            beat["headline"] = _clamp_str(b.get("headline"), 200)
        if _clamp_str(b.get("sub"), 300):
            beat["sub"] = _clamp_str(b.get("sub"), 300)
        if _clamp_str(b.get("big"), 12):
            beat["big"] = _clamp_str(b.get("big"), 12)
        if _clamp_str(b.get("label"), 200):
            beat["label"] = _clamp_str(b.get("label"), 200)
        lines = _clamp_str_arr(b.get("lines"), 6)
        if layout == "process" and len(lines) >= 2:
            beat["lines"] = lines
        ticks = _clamp_str_arr(b.get("ticks"), 6)
        if layout == "timeline" and ticks:
            beat["ticks"] = ticks
        d_raw = b.get("dialogue") if isinstance(b.get("dialogue"), dict) else None
        if d_raw is not None and _clamp_str(d_raw.get("speaker"), 40):
            beat["dialogue"] = {"speaker": _clamp_str(d_raw.get("speaker"), 40).upper(), "line": _clamp_str(d_raw.get("line"), 120) or beat["text"]}
        if scene:
            beat["scene"] = scene
        beats.append(beat)
    # structural normalization (reordering/deduping only — never authoring):
    # the cold open leads, ONE end card closes. If the model put a hero/end
    # elsewhere, MOVE it; duplicates of the end layout keep only the last; if
    # neither exists, the shape gate's critique loops repair.
    end_idx = [i for i, b in enumerate(beats) if b["layout"] == "end"]
    for i in reversed(end_idx[:-1] if len(end_idx) > 1 else []):
        beats.pop(i)
    hero_idx = next((i for i, b in enumerate(beats) if b["layout"] == "hero"), None)
    if hero_idx is not None and hero_idx > 0:
        beats.insert(0, beats.pop(hero_idx))
    if not beats or beats[-1]["layout"] != "end":
        any_end = next((i for i, b in enumerate(beats) if b["layout"] == "end"), None)
        if any_end is not None:
            beats.append(beats.pop(any_end))
    return {
        "version": "1.0.0",
        "script_id": sid,
        "topic": _clamp_str(topic, 200),
        "voices": {"narrator": narrator, "dialogue": dialogue},
        "beats": beats,
        "meta": {"facts_used": True, "target_min": int(raw.get("target_min") or 0) or None, "status": "draft"},
    }


def _numbers_in(text: str) -> list[str]:
    """The number tokens a fact-discipline review compares against the sheet."""
    return sorted(set(re.findall(r"(?:[$€£]\s?\d[\d,.]*\s?(?:billion|million|trillion)?|\d[\d,.]*\s?%|\b\d{1,3}(?:,\d{3})+\b|\b(?:19|20)\d{2}\b|\b\d+\s?(?:am|pm)\b)", str(text), re.IGNORECASE)))


def build_graph(model):
    """Compile the script graph around an injected chat model (tests inject a
    fake — the network is never under test)."""
    from langgraph.graph import StateGraph, START, END

    def _invoke(prompt: str) -> str:
        # free-tier Groq is tokens-per-minute bucketed (8k TPM) — a full
        # script round-trip can cross the window mid-graph. Honor the
        # server's "try again in Ns" hint, twice, then let it fail.
        last: Exception | None = None
        for attempt in range(3):
            try:
                resp = model.invoke(prompt)
                return resp.content if isinstance(resp.content, str) else str(resp.content)
            except Exception as e:  # noqa: BLE001 — rate limits surface as various types
                msg = str(e)
                if "Rate limit" not in msg and "429" not in msg:
                    raise
                last = e
                m = re.search(r"try again in ([\d.]+)s", msg)
                wait = min(float(m.group(1)) + 1.5, 35.0) if m else 12.0
                logger.warning("groq 429 — waiting %.1fs (attempt %d)", wait, attempt + 1)
                time.sleep(wait)
        raise last

    def draft_node(state: ScriptState) -> dict:
        beats_target = max(24, min(90, int(state.get("target_min", 12)) * 6))
        prompt = (
            "You are the head writer of a faceless financial-documentary YouTube channel.\n\n"
            f"Write a FULL episode script for the topic: \"{state['topic']}\".\n"
            f"Target: about {state.get('target_min', 12)} minutes (roughly {beats_target} beats — shorter is fine, padding is not).\n\n"
            "FACT SHEET (the ONLY legal source of numbers):\n"
            f"{state.get('facts', '(none supplied)')}\n\n"
            + STYLE_RULES + "\n" + SCRIPT_SHAPE_RULES
        )
        try:
            raw = _extract_json(_invoke(prompt))
        except Exception:
            # one strict re-ask: long script JSON occasionally comes back
            # malformed — a compact retell usually fixes it
            raw = _extract_json(_invoke(
                prompt + "\n\nIMPORTANT: your previous reply was not parseable JSON. "
                "Return the COMPLETE script again as ONE COMPACT valid JSON object — "
                "no trailing commas, no comments, no text outside the JSON, no blank "
                "lines inside strings."))
        if not isinstance(raw, dict) or not isinstance(raw.get("beats"), list) or not raw["beats"]:
            raise ValueError("the model returned no script beats")
        return {"script": raw, "attempts": 1}

    def review_node(state: ScriptState) -> dict:
        facts = state.get("facts", "")
        beats = state["script"].get("beats", [])
        spoken = " ".join(str(b.get("text", "")) for b in beats if isinstance(b, dict))
        suspects = [n for n in _numbers_in(spoken) if n.strip("$€£% ").replace(",", "") not in re.sub(r"[^\d]", "", facts) and n not in facts]
        prompt = (
            "You are the ruthless story editor for a financial-documentary channel.\n"
            f"Topic: \"{state['topic']}\"\nFACT SHEET:\n{facts}\n\n"
            f"Script beats JSON:\n{json.dumps(beats)}\n\n"
            "Critique HARD (fixable, specific):\n"
            "- INVENTED NUMBERS: any number that does not appear in the fact sheet"
            + (f" (mechanical suspects already flagged: {suspects})" if suspects else "")
            + " is a REJECT — rewrite that beat with a fact-sheet number or drop the figure.\n"
            "- STYLE DRIFT: sentences over ~20 words, missing analogies, no cold-open "
            "hook, no minute-by-minute timeline, no dialogue asides, an ending that "
            "doesn't land on an ordinary person — each is a fixable critique.\n"
            "- FLAT SCENES: every beat the same location/mood is a reject — the day "
            "must move (crash reds, party greens, the night aftermath).\n"
            "- PADDING: beats that restate the previous beat add nothing — cut or "
            "replace with a concrete fact.\n"
            "Return STRICT JSON: {\"critiques\":[\"<fixable critique per issue>\"]}"
        )
        raw = _extract_json(_invoke(prompt))
        critiques = raw.get("critiques") if isinstance(raw, dict) else []
        return {"critiques": [str(c) for c in critiques] if isinstance(critiques, list) else []}

    def repair_node(state: ScriptState) -> dict:
        critiques = "\n".join(f"- {c}" for c in state.get("critiques", []))
        prompt = (
            "Revise the script to fix every critique. Keep the STRICT JSON shape "
            "identical (same schema, same allowed pools). The fact sheet remains "
            "the only legal source of numbers.\n\n"
            f"FACT SHEET:\n{state.get('facts', '')}\n\nCritiques:\n{critiques}\n\n"
            f"Current script JSON:\n{json.dumps(state['script'])}\n\n"
            "Return the FULL corrected STRICT JSON (the whole script object)."
        )
        raw = _extract_json(_invoke(prompt))
        script = raw if isinstance(raw, dict) and isinstance(raw.get("beats"), list) and raw["beats"] else state["script"]
        return {"script": script, "attempts": state.get("attempts", 1) + 1}

    def route_after_review(state: ScriptState) -> str:
        return "repair" if state.get("critiques") else "shape"

    def shape_node(state: ScriptState) -> dict:
        shaped = shape_script(state["script"], state["topic"])
        issues: list[str] = []
        critiques: list[str] = []
        beats = shaped["beats"]
        layouts = [b["layout"] for b in beats]
        fixes = []
        if not beats or beats[0]["layout"] != "hero":
            fixes.append("beat 1 must be the hero cold open")
        if not beats or beats[-1]["layout"] != "end":
            fixes.append("the last beat must be the end card")
        if layouts.count("quote") < 2:
            fixes.append("add dialogue asides — at least 2 quote beats with speakers")
        if layouts.count("timeline") < 1:
            fixes.append("add the minute-by-minute timeline beat for the event day")
        if layouts.count("stat") < 2:
            fixes.append("add stat beats with big numbers from the fact sheet")
        for i, b in enumerate(beats):
            if b["layout"] == "stat" and not b.get("big"):
                fixes.append(f"stat beat {i} is missing its big board number (e.g. \"-4%\") — "
                             "take it from the fact sheet or retype the beat as a split")
        chapters = layouts.count("chapter")
        if chapters < 4:
            fixes.append(f"only {chapters} chapters — break the story into 4-9 acts")
        # mechanical fact discipline on the SHAPED spoken text
        spoken = " ".join(str(b.get("text", "")) for b in beats)
        facts = state.get("facts", "")
        suspects = [n for n in _numbers_in(spoken) if n not in facts]
        if suspects:
            fixes.append(f"numbers not in the fact sheet: {', '.join(suspects[:8])} — replace with fact-sheet numbers or drop")
        if fixes and state.get("attempts", 1) < state.get("max_attempts", 2):
            issues.append(shaped["script_id"])
            critiques.append("; ".join(fixes))
        # the critiques loop back through repair once; either way the shaped
        # script returns and the NODE validator has the final word (R3)
        return {"shaped": shaped, "issues": issues, "critiques": critiques}

    def route_after_shape(state: ScriptState) -> str:
        if state.get("issues") and state.get("attempts", 1) < state.get("max_attempts", 2):
            return "repair"
        return "end"

    g = StateGraph(ScriptState)
    g.add_node("draft", draft_node)
    g.add_node("review", review_node)
    g.add_node("repair", repair_node)
    g.add_node("shape", shape_node)
    g.add_edge(START, "draft")
    g.add_edge("draft", "review")
    g.add_conditional_edges("review", route_after_review, {"repair": "repair", "shape": "shape"})
    g.add_edge("repair", "shape")
    g.add_conditional_edges("shape", route_after_shape, {"repair": "repair", "end": END})
    return g.compile()
