# Template bot graph (Phase B — docs/qa/template-bot-qa.md).
# LangGraph state machine: draft -> self_review -> repair -> shape -> END.
#
# The owner's premium bar (2026-11-05): every draft carries its own palette,
# voice, music mood, layout cycle, niche-shaped beats/hooks/titles, and an
# honest disclaimer — normalized here deterministically (the pools below),
# with the LLM supplying only the creative content. The Node side runs the
# REAL registry validator on the output; invalid entries never stage.
#
# Key policy: this endpoint is key-GATED (GROQ_API_KEY) — the rest of the
# sidecar stays keyless (the founding principle, app.py docstring).
from __future__ import annotations

import json
import logging
import re
from typing import Any, TypedDict

logger = logging.getLogger("bot.graph")

ALLOWED_THEMES = ["vox", "investing", "poster", "history", "wisdom", "science", "travel", "focus"]
ALLOWED_VOICES = ["en-US-AndrewNeural", "en-US-BrianNeural", "en-US-AriaNeural", "en-US-EmmaNeural", "en-US-ChristopherNeural", "en-GB-RyanNeural"]
ALLOWED_MOODS = ["epic", "uplifting", "driving", "bright", "calming", "mystical", "heroic", "grooving"]
ALLOWED_LAYOUTS = ["split", "quote", "process", "versus", "timeline", "map", "terminal", "stat"]
DEFAULT_LAYOUT_CYCLE = ["split", "quote", "split", "process", "split", "stat"]

NICHE_SHAPE_RULES = (
    "Return STRICT JSON, no markdown fences, shape:\n"
    '{"templates":[{"template_id":"<kebab-slug>-storybook",'
    '"theme":"<vox|investing|poster|history|wisdom|science|travel|focus>",'
    '"voice":"<en-US-AndrewNeural|en-US-BrianNeural|en-US-AriaNeural|en-US-EmmaNeural|en-US-ChristopherNeural|en-GB-RyanNeural>",'
    '"music_mood":"<epic|uplifting|driving|bright|calming|mystical|heroic|grooving>",'
    '"doc_layouts":["<6 entries from: split|quote|process|versus|timeline|map|terminal|stat; first and last recommended to be split>"],'
    '"beats":["<slot 1 opening beat>","<slot 2 evidence beat>","<slot 3 mechanism beat>","<slot 4 payoff beat>"],'
    '"hook_classes":["<3 hook styles>"],'
    '"title_patterns":["<3 title patterns, each with an exemplar title in quotes>"],'
    '"payoff_rule":"<the closing rule>",'
    '"brand":"<the template brand identity, 1-3 punchy words, e.g. IRON WILL>",'
    '"badge":"<2-3 letter initials of the brand>",'
    '"eyebrow":"<letterspaced kicker line, e.g. TRAINING STORIES // IW>",'
    '"disclaimer":"<one honest niche disclaimer>"}]}'
)


class BotState(TypedDict, total=False):
    niche: str
    count: int
    theme_hint: str
    drafts: list[dict[str, Any]]
    shaped: list[dict[str, Any]]
    critiques: list[str]
    issues: list[str]
    attempts: int
    max_attempts: int


def _extract_json(text: str) -> Any:
    t = re.sub(r"```json|```", "", str(text)).strip()
    start = t.find("{")
    return json.loads(t[start: t.rfind("}") + 1])


def _clamp_str_arr(v, max_n: int) -> list[str]:
    if not isinstance(v, list):
        return []
    # scrub replacement chars (broken encodings) and JS-ism non-values
    bad = {'undefined', 'null', 'none', ''}
    return [re.sub('[�‑]', '-', str(x)).strip() for x in v
            if str(x).strip().lower() not in bad][:max_n]


def shape_draft(raw: dict, niche: str) -> dict:
    """Deterministic normalization — the SAME rules the Node registry
    validator enforces (pools, counts, id slug, verbatim niche string)."""
    theme = raw.get("theme") if raw.get("theme") in ALLOWED_THEMES else "vox"
    voice = raw.get("voice") if raw.get("voice") in ALLOWED_VOICES else "en-US-AndrewNeural"
    mood = raw.get("music_mood") if raw.get("music_mood") in ALLOWED_MOODS else "calming"
    layouts = [x for x in _clamp_str_arr(raw.get("doc_layouts"), 8) if x in ALLOWED_LAYOUTS][:6] or list(DEFAULT_LAYOUT_CYCLE)
    tid_raw = re.sub(r"[^a-z0-9]+", "-", str(raw.get("template_id") or "").lower()).strip("-")
    if not tid_raw.endswith("-storybook"):
        tid_raw = (tid_raw or slug_of(niche)) + "-storybook"
    beats = _clamp_str_arr(raw.get("beats"), 4)
    hooks = _clamp_str_arr(raw.get("hook_classes"), 3)
    titles = _clamp_str_arr(raw.get("title_patterns"), 3)
    disclaimer = (_clamp_str_arr(raw.get("disclaimer"), 1) or ["Summarized from cited sources; not professional advice."])[0]
    brand = (_clamp_str_arr(raw.get("brand"), 1) or [fallback_brand(niche)])[0]
    badge = (_clamp_str_arr(raw.get("badge"), 1) or ["".join(w[0] for w in brand.split()[:3]).upper() or "ST"])[0]
    eyebrow = (_clamp_str_arr(raw.get("eyebrow"), 1) or [f"{niche.split('&')[0].strip().upper()} // {badge.upper()}"])[0]
    return {
        "version": "1.0.0",
        "template_id": tid_raw,
        "family": "documentary-frames",
        "niches": [niche],
        "formats": ["long", "short"],
        "renderer": "remotion",
        "required_capabilities": ["script-gen", "tts", "captions"],
        "doc_presentation": {"theme": theme, "voice": voice, "music_mood": mood,
                             "doc_layouts": layouts or list(DEFAULT_LAYOUT_CYCLE),
                             "brand": brand.upper(), "badge": badge.upper(),
                             "eyebrow": eyebrow.upper()},
        "story_structure": {
            "doc_render": "storybook",
            "sections": ["cold_open", "chapters:10", "exhibits", "outro"],
            "chapter_min_words": 170,
            "beats": beats or ["slot 1 opens the arc", "slot 2 brings the cited evidence",
                               "slot 3 explains the mechanism", "slot 4 lands the payoff"],
            "hook_classes": hooks or ["the-open question", "the-scale number", "the-stake call-out"],
            "title_patterns": titles or [f'the {niche} explainer ("A {niche} Story — Explained")'],
            "payoff_rule": str(raw.get("payoff_rule") or "the closing lands ONE takeaway the viewer keeps"),
        },
        "variation_rules": [
            "distinct subject/arc per video — differs from every one in the channel's last 5 videos (enforced: the variation gate similarity + seed rotation)",
            "no recycled example set against the last 5 videos (enforced: the variation gate similarity)",
            "no repeated hook across the channel's last 5 videos (enforced: the variation gate similarity)",
            "every figure and fact is a cited source (prose for the author and the review desk — spec Honest Limits)",
        ],
        "review_thumb_pick": True,
        "safety": {"required_sources": True, "review_required": [], "disclaimers": [disclaimer]},
        "deprecated": False,
        "changelog": [{"version": "1.0.0", "date": "2026-11-05",
                       "note": "template bot draft — owner-approved via the bot chain"}],
    }


def fallback_brand(niche: str) -> str:
    words = [w for w in re.split(r"[^A-Za-z]+", str(niche)) if w][:2]
    return " ".join(words).upper() or "NEW STORIES"


def slug_of(niche: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(niche).lower()).strip("-")[:40] or "niche"


def build_graph(model):
    """Compile the bot graph around an injected chat model (LangChain chat
    interface; tests inject a fake)."""
    from langgraph.graph import StateGraph, START, END

    def _invoke(prompt: str) -> str:
        resp = model.invoke(prompt)
        return resp.content if isinstance(resp.content, str) else str(resp.content)

    def draft_node(state: BotState) -> dict:
        count = state.get("count", 1)
        hint = state.get("theme_hint")
        prompt = (
            f"You are the template architect for a faceless-documentary YouTube factory.\n\n"
            f"Design {count} new storybook video template(s) for the niche: \"{state['niche']}\".\n"
            + (f"Palette direction: \"{hint}\" — pick the closest allowed theme.\n" if hint else "")
            + "\n" + NICHE_SHAPE_RULES
        )
        raw = _extract_json(_invoke(prompt))
        drafts = raw.get("templates") if isinstance(raw, dict) else None
        if not isinstance(drafts, list) or not drafts:
            raise ValueError("the model returned no templates")
        return {"drafts": drafts[:count], "attempts": 1}

    def review_node(state: BotState) -> dict:
        prompt = (
            "You are the strict quality reviewer for template entries.\n"
            f"Niche: \"{state['niche']}\"\nDrafts JSON:\n{json.dumps(state['drafts'])}\n\n"
            "Critique each draft: niche fit, beat specificity (no generic filler), "
            "honest disclaimer, hook variety, title exemplars present. "
            "Return STRICT JSON: {\"critiques\":[\"<fixable critique per issue>\"]}"
        )
        raw = _extract_json(_invoke(prompt))
        critiques = raw.get("critiques") if isinstance(raw, dict) else []
        return {"critiques": [str(c) for c in critiques] if isinstance(critiques, list) else []}

    def repair_node(state: BotState) -> dict:
        critiques = "\n".join(f"- {c}" for c in state.get("critiques", []))
        prompt = (
            "Revise the template drafts to fix every critique. Keep the JSON shape "
            "and the allowed pools identical.\n\n"
            f"Niche: \"{state['niche']}\"\nCritiques:\n{critiques}\n\n"
            f"Current drafts JSON:\n{json.dumps(state['drafts'])}\n\n"
            "Return the FULL corrected STRICT JSON: {\"templates\":[...]}"
        )
        raw = _extract_json(_invoke(prompt))
        drafts = raw.get("templates") if isinstance(raw, dict) else None
        return {"drafts": drafts if isinstance(drafts, list) and drafts else state["drafts"], "attempts": state.get("attempts", 1) + 1}

    def shape_node(state: BotState) -> dict:
        shaped = [shape_draft(d, state["niche"]) for d in state["drafts"] if isinstance(d, dict)]
        issues = [d["template_id"] for d in shaped if len(d["story_structure"]["beats"]) < 4]
        return {"shaped": shaped, "issues": issues}

    def route_after_shape(state: BotState) -> str:
        if state.get("issues") and state.get("attempts", 1) < state.get("max_attempts", 2):
            return "repair"
        return "end"

    g = StateGraph(BotState)
    g.add_node("draft", draft_node)
    g.add_node("review", review_node)
    g.add_node("repair", repair_node)
    g.add_node("shape", shape_node)
    g.add_edge(START, "draft")
    g.add_edge("draft", "review")
    g.add_edge("review", "repair")
    g.add_edge("repair", "shape")
    g.add_conditional_edges("shape", route_after_shape, {"repair": "repair", "end": END})
    return g.compile()
