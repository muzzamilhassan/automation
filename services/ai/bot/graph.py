# Template bot graph (Phase B — docs/qa/template-bot-qa.md).
# LangGraph state machine: draft -> self_review -> (repair when the review
# finds issues) -> shape -> END. An empty-critique review skips repair —
# a rewrite pass with nothing to fix can only drift the drafts.
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

ALLOWED_THEMES = ["vox", "investing", "poster", "history", "wisdom", "science", "travel", "focus",
                  "brief", "stoic", "legacy", "midnight", "signal", "volt", "frontier", "letterpress"]
ALLOWED_VOICES = ["en-US-AndrewNeural", "en-US-BrianNeural", "en-US-AriaNeural", "en-US-EmmaNeural", "en-US-ChristopherNeural", "en-GB-RyanNeural"]
ALLOWED_MOODS = ["epic", "uplifting", "driving", "bright", "calming", "mystical", "heroic", "grooving"]
ALLOWED_LAYOUTS = ["split", "quote", "process", "versus", "timeline", "map", "terminal", "stat"]
DEFAULT_LAYOUT_CYCLE = ["split", "quote", "split", "process", "split", "stat"]

NICHE_SHAPE_RULES = (
    "Return STRICT JSON, no markdown fences, shape:\n"
    '{"templates":[{"template_id":"<kebab-slug>-storybook",'
    '"theme":"<vox|investing|poster|history|wisdom|science|travel|focus|brief|stoic|legacy|midnight|signal|volt|frontier|letterpress>",'
    '"voice":"<en-US-AndrewNeural|en-US-BrianNeural|en-US-AriaNeural|en-US-EmmaNeural|en-US-ChristopherNeural|en-GB-RyanNeural>",'
    '"music_mood":"<epic|uplifting|driving|bright|calming|mystical|heroic|grooving>",'
    '"doc_layouts":["<6 entries from: split|quote|process|versus|timeline|map|terminal|stat; first and last recommended to be split>"],'
    '"beats":["<slot 1 opening beat>","<slot 2 evidence beat>","<slot 3 mechanism beat>","<slot 4 payoff beat>"],'
    '"hook_classes":["<3 hook styles>"],'
    '"title_patterns":["<3 title patterns; each MUST contain a creative exemplar title specific to the niche - never restate the niche name>"],'
    '"payoff_rule":"<the closing rule>",'
    '"brand":"<the template brand identity, 1-3 punchy words, e.g. IRON WILL>",'
    '"badge":"<2-3 letter initials of the brand>",'
    '"eyebrow":"<letterspaced kicker line, e.g. TRAINING STORIES // IW>",'
    '"disclaimer":"<one honest niche disclaimer>"}]}\n\n'
    "The quality bar — every field is MANDATORY and creative, defaults never fire:\n"
    "- theme: pick the pool entry that MATCHES the niche mood. Money/business "
    "niches get investing; tax/legal and business-explainer briefs get brief; "
    "discipline/training gets stoic; old-money/luxury gets legacy; sleep and "
    "calm night science gets midnight; AI/tech investigations get signal; "
    "focus/productivity and sleek tech get volt; history gets frontier; "
    "quotes/wisdom gets letterpress; science gets science; travel gets travel. "
    "vox is a last resort for generic explainer moods only.\n"
    "- brand: INVENT a punchy 1-3 word identity for the niche (like IRON WILL "
    "for training) — NEVER reuse the niche's own words. badge = its initials; "
    "eyebrow = '<niche kicker> // <badge>'.\n"
    "- title_patterns: each carries a CREATIVE exemplar in quotes — a real "
    "video title with numbers/stakes, never a restatement of the niche name.\n"
    "- beats: name concrete content for THIS niche (a stat, a case, a "
    "mechanism, a payoff) — never generic slot descriptions.\n"
    "- disclaimer: ONE honest sentence about THIS niche's limits (e.g. money "
    "niches: not financial advice), never placeholder text.\n"
    "Example of a GOOD brand block for a training niche: "
    '"brand":"IRON WILL","badge":"IW","eyebrow":"TRAINING STORIES // IW"'
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


def _one_str(v) -> list[str]:
    """Singleton string fields (brand, badge, eyebrow, disclaimer) accept a
    SCALAR or a 1-element list — the contract shows scalars ("brand":"IRON
    WILL"), so _clamp_str_arr alone (array-only) silently dropped every
    scalar and staged fallbacks (the 2026-11-09 root cause)."""
    if isinstance(v, list):
        return _clamp_str_arr(v, 1)
    s = re.sub('[�‑]', '-', str(v)).strip() if v is not None else ""
    return [] if s.lower() in {'undefined', 'null', 'none', ''} else [s]


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
    disclaimer = (_one_str(raw.get("disclaimer")) or ["Summarized from cited sources; not professional advice."])[0]
    brand = (_one_str(raw.get("brand")) or [fallback_brand(niche)])[0]
    badge = (_one_str(raw.get("badge")) or ["".join(w[0] for w in brand.split()[:3]).upper() or "ST"])[0]
    eyebrow = (_one_str(raw.get("eyebrow")) or [f"{niche.split('&')[0].strip().upper()} // {badge.upper()}"])[0]
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
                       "note": "template bot draft — staged, awaiting owner approval (--approve)"}],
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
            "You are the ruthless quality reviewer for storybook template entries.\n"
            f"Niche: \"{state['niche']}\"\nDrafts JSON:\n{json.dumps(state['drafts'])}\n\n"
            "Reject and critique HARD:\n"
            '- GENERIC TITLES: the exemplar title inside the quotes must be a CREATIVE, '
            'specific video title for the niche (e.g. "The Sleep Debt Nobody Talks About — Explained") '
            '— never a restatement of the niche name.\n'
            '- PALETTE LAZINESS: pick the allowed theme that MATCHES the niche mood — '
            'do not default to vox. Money/business niches get investing; tax/legal briefs '
            'get brief; discipline gets stoic; luxury gets legacy; sleep gets midnight; '
            'AI/tech gets signal or volt; history gets frontier; quotes/wisdom gets '
            'letterpress; science gets science. vox is for generic explainer moods only.\n'
            '- BRAND LAZINESS: the brand must be an INVENTED identity (like IRON WILL for '
            'training) — a brand that merely restates the niche name (PERSONAL FINANCE for a '
            'finance niche) is a reject.\n'
            '- PLACEHOLDER DISCLAIMER: one honest sentence about THIS niche — a draft with '
            'no disclaimer or only boilerplate is a reject.\n'
            '- GENERIC BEATS: each beat must name concrete content for THIS niche, no filler.\n'
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
            "Hard requirements on every template — never emit null/undefined for any "
            "field: theme from the allowed pool; brand = an INVENTED 1-3 word identity "
            "(never the niche's own words); badge = its initials; eyebrow = '<niche "
            "kicker> // <badge>'; disclaimer = ONE honest sentence about this niche's "
            "limits (never generic boilerplate).\n\n"
            f"Niche: \"{state['niche']}\"\nCritiques:\n{critiques}\n\n"
            f"Current drafts JSON:\n{json.dumps(state['drafts'])}\n\n"
            "Return the FULL corrected STRICT JSON: {\"templates\":[...]}"
        )
        raw = _extract_json(_invoke(prompt))
        drafts = raw.get("templates") if isinstance(raw, dict) else None
        return {"drafts": drafts if isinstance(drafts, list) and drafts else state["drafts"], "attempts": state.get("attempts", 1) + 1}

    def route_after_review(state: BotState) -> str:
        # an empty critique list means the reviewer signed off — skip the
        # rewrite pass entirely (fewer LLM calls, no drift)
        return "repair" if state.get("critiques") else "shape"

    def shape_node(state: BotState) -> dict:
        niche = state["niche"]
        raws = [d for d in state["drafts"] if isinstance(d, dict)]
        shaped = [shape_draft(d, niche) for d in raws]
        issues = []
        critiques = []
        fallback_title = f"the {niche} explainer"
        generic_disclaimer = "Summarized from cited sources; not professional advice."
        for raw, d in zip(raws, shaped):
            fixes = []
            if len(d["story_structure"]["beats"]) < 4:
                fixes.append("beats fell back to generic slots — name concrete content "
                             "for THIS niche (a stat, a case, a mechanism, a payoff)")
            if any(t.startswith(fallback_title) for t in d["story_structure"]["title_patterns"]):
                # the title fallback fired — the LLM's titles were missing or
                # empty; loop the repair pass instead of staging generic soup
                fixes.append("titles fell back to the niche-name explainer — give each "
                             "title_pattern a creative exemplar with numbers/stakes")
            if raw.get("theme") not in ALLOWED_THEMES:
                fixes.append(f"theme '{raw.get('theme')}' is off-pool — pick the allowed "
                             f"entry that matches the niche mood: {', '.join(ALLOWED_THEMES)}")
            # The flag inputs go through the SAME normalizer the shaper uses —
            # the gate and shape_draft must agree on what "missing" means, or
            # a scalar brand survives the gate but dies in the shaper (the
            # 2026-11-09 root cause: gate saw the model's good scalar, the
            # array-only clamp in the shaper dropped it into the fallback).
            norm_brand = (_one_str(raw.get("brand")) or [""])[0]
            if not norm_brand:
                fixes.append("brand missing — INVENT a punchy 1-3 word identity (like IRON "
                             "WILL), never the niche's own words, never null/undefined")
            elif norm_brand.upper() == fallback_brand(niche):
                fixes.append("brand echoes the niche's own words — invent an identity the "
                             "niche name does not spell out")
            norm_disc = (_one_str(raw.get("disclaimer")) or [""])[0]
            if not norm_disc or norm_disc.lower() == generic_disclaimer:
                fixes.append("disclaimer missing or placeholder — write ONE honest sentence "
                             "about THIS niche's limits (e.g. money: not financial advice)")
            if fixes:
                issues.append(d["template_id"])
                critiques.append(f"{d['template_id']}: " + "; ".join(fixes))
        return {"shaped": shaped, "issues": issues, "critiques": critiques}

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
    g.add_conditional_edges("review", route_after_review, {"repair": "repair", "shape": "shape"})
    g.add_edge("repair", "shape")
    g.add_conditional_edges("shape", route_after_shape, {"repair": "repair", "end": END})
    return g.compile()
