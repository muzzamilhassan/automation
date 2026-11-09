# Phase B graph tests — deterministic: the chat model is a fake cycling
# scripted AIMessage payloads, so the graph's routing, repair loop, and
# shape normalization are what's under test (never the network).
import json

from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage

from bot.graph import build_graph, shape_draft


def _scripted(drafts, critiques=None, repaired=None):
    msgs = [
        AIMessage(content=json.dumps({"templates": drafts})),
        AIMessage(content=json.dumps({"critiques": critiques or []})),
    ]
    if repaired is not None:
        msgs.append(AIMessage(content=json.dumps({"templates": repaired})))
    return GenericFakeChatModel(messages=iter(msgs))


def _good_draft(name):
    return {
        "template_id": f"{name}-storybook",
        "theme": "wisdom",
        "voice": "en-US-AndrewNeural",
        "music_mood": "calming",
        "doc_layouts": ["split", "quote", "split", "process", "split", "stat"],
        "beats": ["slot 1 opens", "slot 2 evidence", "slot 3 mechanism", "slot 4 payoff"],
        "hook_classes": ["hook a", "hook b", "hook c"],
        "title_patterns": ['the x explainer ("X — Explained")'],
        "payoff_rule": "one takeaway",
        "brand": "IRON WILL",
        "disclaimer": "Summarized from cited sources.",
    }


def test_shape_draft_normalizes_pools_and_id():
    raw = _good_draft("gym")
    raw.update({"theme": "kaleidoscope", "voice": "en-US-NobodyNeural", "music_mood": "kazoo"})
    shaped = shape_draft(raw, "Gym & training motivation")
    assert shaped["doc_presentation"]["theme"] == "vox", "an off-pool theme falls to the default"
    assert shaped["doc_presentation"]["voice"] == "en-US-AndrewNeural", "an off-pool voice falls to Andrew"
    assert shaped["doc_presentation"]["music_mood"] == "calming", "an off-pool mood falls to calming"
    assert shaped["template_id"] == "gym-storybook"
    assert shaped["niches"] == ["Gym & training motivation"], "the VERBATIM canonical niche"
    assert len(shaped["story_structure"]["beats"]) == 4


def test_shape_draft_clamps_counts():
    raw = _good_draft("focus")
    raw["beats"] = ["a", "b", "c", "d", "e", "f"]
    raw["doc_layouts"] = ["terminal", "map", "quote", "versus", "timeline", "process", "stat", "split"]
    shaped = shape_draft(raw, "Focus & productivity systems")
    assert len(shaped["story_structure"]["beats"]) == 4, "beats clamp to 4"
    assert len(shaped["doc_presentation"]["doc_layouts"]) <= 6, "layouts clamp to 6"


def test_graph_happy_path_skips_repair_when_review_signs_off():
    drafts = [_good_draft("travel"), _good_draft("history")]
    # NO repaired payload is scripted: if the graph still routed empty
    # critiques through repair, the fake model would run out of messages
    # and the test would fail. Clean review = the rewrite pass is skipped
    # (a rewrite with nothing to fix can only drift the drafts).
    g = build_graph(_scripted(drafts, critiques=[]))
    out = g.invoke({"niche": "Travel & geography explained", "count": 2, "max_attempts": 2})
    shaped = out["shaped"]
    assert len(shaped) == 2
    for s in shaped:
        assert s["doc_presentation"]["theme"] in ("travel", "history", "wisdom", "vox"), "theme from the allowed pool"
        assert s["story_structure"]["doc_render"] == "storybook"
    assert out["attempts"] == 1, "no repair pass ran, so the attempt count stays 1"


def test_graph_repair_loop_runs_on_critique():
    drafts = [_good_draft("focus")]
    # a REAL list (a JSON-encoded string would collapse to [] at the review
    # node's isinstance check and route straight to shape)
    critiques = ["the beats are generic filler — name the distraction plainly"]
    repaired = [_good_draft("focus-v2")]
    g = build_graph(_scripted(drafts, critiques=critiques, repaired=repaired))
    out = g.invoke({"niche": "Focus & productivity systems", "count": 1, "max_attempts": 2})
    assert out["attempts"] == 2, "the repair node ran after the review"
    assert out["shaped"][0]["template_id"] == "focus-v2-storybook"


def test_graph_shape_gate_loops_repair_on_fallback_fields():
    # The reviewer signs off (empty critiques), but the draft gives an
    # off-pool theme, no brand, and no disclaimer — the R6 fallback soup that
    # slipped through the 2026-11-09 live run (vox / PERSONAL FINANCE /
    # boilerplate). The shape gate must flag them and loop the repair pass
    # (attempts 2) instead of staging the fallbacks.
    bad = _good_draft("money")
    bad.pop("brand")
    bad.pop("disclaimer")
    bad["theme"] = "kaleidoscope"
    repaired = [_good_draft("money-v2")]
    g = build_graph(_scripted([bad], critiques=[], repaired=repaired))
    out = g.invoke({"niche": "Personal finance rules & money habits",
                    "count": 1, "max_attempts": 2})
    assert out["attempts"] == 2, "the shape gate flagged the fallback fields, so repair ran"
    assert out["shaped"][0]["template_id"] == "money-v2-storybook"


def test_graph_shape_gate_treats_junk_and_nested_values_as_fallbacks():
    # The LIVE 2026-11-09 root cause: _clamp_str_arr was array-only, so the
    # shaper dropped the model's correct SCALAR brand/disclaimer into the
    # fallbacks while the gate (reading the raw scalar) flagged nothing.
    # _one_str now accepts scalar AND list everywhere. This test pins the
    # remaining degenerate shapes — junk strings and nested arrays must also
    # trip the gate instead of silently becoming fallbacks.
    bad_junk = _good_draft("money")
    bad_junk["brand"] = "undefined"
    bad_junk["disclaimer"] = "null"
    bad_nested = _good_draft("wallet")
    bad_nested["brand"] = ["PERSONAL FINANCE"]
    bad_nested["disclaimer"] = ["Summarized from cited sources; not professional advice."]
    repaired = [_good_draft("money-v2"), _good_draft("wallet-v2")]
    g = build_graph(_scripted([bad_junk, bad_nested], critiques=[], repaired=repaired))
    out = g.invoke({"niche": "Personal finance rules & money habits",
                    "count": 2, "max_attempts": 2})
    assert out["attempts"] == 2, "junk AND nested brand/disclaimer values must trip the gate"
    assert [s["template_id"] for s in out["shaped"]] == ["money-v2-storybook", "wallet-v2-storybook"]
