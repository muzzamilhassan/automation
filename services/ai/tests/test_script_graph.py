# P2 script-graph tests — deterministic (fake chat model, no network):
# routing, the fact-discipline critique, shape normalization, and the
# style/fact rules actually reaching the prompt. Mirrors test_bot_graph.py.
import json

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from bot.script_graph import build_graph, shape_script, _numbers_in

FACTS = (
    "On Thursday the S&P 500 fell more than 4%, the Dow lost 1,833 points, "
    "Nvidia dropped 9%, losing more than $400 billion in a single morning. "
    "Nasdaq fell 5.5%. About 600,000 Nvidia chips are stuck in Hong Kong. "
    "VIX up 65% at 11:17. The closing bell rang at 4:00 PM ET."
)


def _good_script():
    # meets the shape gate's structural bar: hero first, end last,
    # 4 chapters, 2+ quotes, 2+ stats, 1 timeline
    return {
        "script_id": "the-november-crash",
        "topic": "Why the stock market just crashed",
        "voices": {"narrator": "en-US-AndrewNeural", "dialogue": "en-US-EmmaNeural"},
        "beats": [
            {"layout": "hero", "text": "On Thursday, Nvidia lost more than $400 billion in a single morning.", "scene": {"day": "THURSDAY", "mood": "crash", "time": "9:54 AM ET"}},
            {"layout": "chapter", "text": "The morning", "scene": {"mood": "crash"}},
            {"layout": "split", "text": "The Dow lost 1,833 points and nobody had done anything wrong.", "scene": {"location": "trading", "mood": "crash"}},
            {"layout": "quote", "text": "Buy the dip?", "dialogue": {"speaker": "THE INVESTOR", "line": "Buy the dip?"}},
            {"layout": "stat", "text": "Six hundred thousand chips are sitting in Hong Kong.", "big": "600,000", "label": "chips stuck in Hong Kong", "scene": {"mood": "data"}},
            {"layout": "chapter", "text": "The cracks", "scene": {"mood": "data"}},
            {"layout": "split", "text": "The S&P 500 fell more than 4% before lunch.", "scene": {"location": "office", "mood": "crash"}},
            {"layout": "quote", "text": "Sell the winners.", "dialogue": {"speaker": "THE TRADER", "line": "Sell the winners."}},
            {"layout": "chapter", "text": "The day", "scene": {"mood": "crash"}},
            {"layout": "stat", "text": "The VIX, Wall Street's fear gauge, jumped 65%.", "big": "+65%", "label": "the price of crash insurance", "scene": {"time": "11:17 AM ET", "mood": "crash"}},
            {"layout": "timeline", "text": "Thursday, minute by minute.", "ticks": ["9:30 The bell", "10:35 Down 4%", "11:17 VIX up 65%", "4:00 PM The closing bell"]},
            {"layout": "chapter", "text": "Who gets hurt", "scene": {"mood": "night"}},
            {"layout": "end", "text": "Follow for more stories."},
        ],
    }


def _scripted(script, critiques=None, repaired=None):
    # the draft contract: the model returns the SCRIPT OBJECT directly
    # (beats at top level), not a wrapper
    msgs = [
        AIMessage(content=json.dumps(script)),
        AIMessage(content=json.dumps({"critiques": critiques or []})),
    ]
    if repaired is not None:
        msgs.append(AIMessage(content=repaired if isinstance(repaired, str) else json.dumps(repaired)))
    return GenericFakeChatModel(messages=iter(msgs))


def test_shape_script_normalizes_enums_voices_and_slug():
    raw = _good_script()
    raw["script_id"] = "The November Crash!!"
    raw["voices"] = {"narrator": "kokoro-daniel", "dialogue": "en-US-EmmaNeural"}
    raw["beats"][2]["layout"] = "map"
    raw["beats"][2]["scene"] = {"location": "kitchen", "mood": "ecstatic", "time": "10:35 AM ET"}
    shaped = shape_script(raw, "Why the stock market just crashed")
    assert shaped["script_id"] == "the-november-crash", "slugified"
    assert shaped["voices"]["narrator"] == "en-US-AndrewNeural", "off-pool narrator falls to Andrew"
    assert shaped["voices"]["dialogue"] == "en-US-EmmaNeural"
    assert shaped["beats"][2]["layout"] == "split", "an unsupported layout falls to split"
    scene2 = shaped["beats"][2]["scene"]
    assert "mood" not in scene2 or scene2["mood"] == "calm", "off-pool mood dropped/fallback"
    assert "kitchen" not in json.dumps(shaped), "off-pool location dropped"


def test_shape_script_dialogue_fallback_when_voices_collapse():
    raw = _good_script()
    raw["voices"] = {"narrator": "en-US-AndrewNeural", "dialogue": "en-US-AndrewNeural"}
    shaped = shape_script(raw, "t")
    assert shaped["voices"]["dialogue"] != "en-US-AndrewNeural", "two voices is the format"


def test_shape_script_reorders_hero_and_end_without_authoring():
    # the live-model failure (2026-11-10): the script shipped with the hero
    # buried mid-list — the shaper MOVES it, it never writes new content
    raw = _good_script()
    beats = raw["beats"]
    hero = beats[0]
    del beats[0]
    beats.insert(3, hero)          # hero buried mid-list
    beats.insert(0, beats.pop(5))  # a chapter leads instead
    end = beats[-1]
    beats.insert(6, end)           # end card mid-list
    beats.append({"layout": "split", "text": "trailing noise"})
    shaped = shape_script(raw, "t")
    assert shaped["beats"][0]["layout"] == "hero", "the hero moved to the front"
    assert shaped["beats"][-1]["layout"] == "end", "the end card moved to the close"
    assert sum(1 for b in shaped["beats"] if b["layout"] == "hero") == 1
    assert all(b["layout"] != "end" for b in shaped["beats"][:-1]), "only ONE end, at the close"


def test_numbers_in_extracts_the_discipline_set():
    nums = _numbers_in("The Dow lost 1,833 points and VIX rose 65% in 2026 at 10:35 am. $400 billion gone.")
    joined = " ".join(nums)
    assert "1,833" in joined and "65%" in joined and "2026" in joined and "$400 billion" in joined


def test_graph_flags_off_fact_numbers_in_review():
    script = _good_script()
    script["beats"][2]["text"] = "The Dow lost 2,500 points."  # 2,500 is NOT in the facts
    captured = {}

    class ProbeModel:
        def invoke(self, prompt):
            captured.setdefault("prompts", []).append(str(prompt))
            i = len(captured["prompts"])
            if i == 1:
                return AIMessage(content=json.dumps(script))
            return AIMessage(content=json.dumps({"critiques": []}))

    result = build_graph(ProbeModel()).invoke({"topic": "crash", "facts": FACTS, "target_min": 10, "max_attempts": 2})
    review_prompt = captured["prompts"][1]
    assert "2,500" in review_prompt, "the mechanical suspect number reaches the reviewer"
    assert "FACT SHEET" in review_prompt


def test_graph_shape_gate_loops_repair_on_structure_failures():
    script = _good_script()
    script["beats"] = [b for b in script["beats"] if b["layout"] != "quote"]  # drop the dialogue beats
    repaired = _good_script()
    msgs = [
        AIMessage(content=json.dumps(script)),
        AIMessage(content=json.dumps({"critiques": ["add dialogue asides"]})),
        AIMessage(content=json.dumps(repaired)),
    ]
    result = build_graph(GenericFakeChatModel(messages=iter(msgs))).invoke(
        {"topic": "crash", "facts": FACTS, "target_min": 10, "max_attempts": 2})
    assert result["attempts"] == 2, "the shape gate looped repair exactly once"
    assert result["shaped"]["beats"], "the repaired script is what ships"
    quotes = [b for b in result["shaped"]["beats"] if b["layout"] == "quote"]
    assert len(quotes) >= 2, "the repair restored the dialogue beats the gate demanded"


def test_graph_happy_path_shapes_and_signs_off():
    result = build_graph(_scripted(_good_script())).invoke(
        {"topic": "Why the stock market just crashed", "facts": FACTS, "target_min": 10, "max_attempts": 2})
    shaped = result["shaped"]
    assert shaped["script_id"] == "the-november-crash"
    assert shaped["voices"]["narrator"] == "en-US-AndrewNeural"
    assert shaped["beats"][0]["layout"] == "hero"
    assert shaped["beats"][-1]["layout"] == "end"


def test_draft_prompt_carries_style_and_fact_rules():
    captured = {}

    class ProbeModel:
        def invoke(self, prompt):
            captured.setdefault("prompts", []).append(str(prompt))  # keep ALL — the DRAFT prompt is the first
            return AIMessage(content=json.dumps(_good_script()))

    build_graph(ProbeModel()).invoke({"topic": "t", "facts": FACTS, "target_min": 12, "max_attempts": 2})
    p = captured["prompts"][0]
    assert "Cold-open hook" in p and "MINUTE-BY-MINUTE" in p and "Dialogue asides" in p, "style rules present"
    assert "ONLY legal source of numbers" in p and FACTS[:40] in p, "fact sheet + discipline rule present"
