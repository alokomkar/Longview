import re

from .models import PlanMatchCandidate, PlanMatchRequest, PlanMatchResponse


STOP_WORDS = {
    "about", "after", "again", "also", "been", "before", "being", "could", "from",
    "have", "into", "more", "only", "other", "should", "that", "their", "there",
    "these", "they", "this", "through", "using", "very", "what", "when", "where",
    "which", "with", "would", "your",
}


def _tokens(value: str) -> set[str]:
    return {
        token for token in re.findall(r"[a-z0-9]{3,}", value.lower())
        if token not in STOP_WORDS
    }


def match_plans(request: PlanMatchRequest) -> PlanMatchResponse:
    source_tokens = _tokens(" ".join([
        request.source.title, request.source.excerpt, request.source.note, request.source.topic
    ]))
    ranked: list[PlanMatchCandidate] = []
    for plan in request.plans:
        plan_tokens = _tokens(" ".join([plan.title, plan.outcome, plan.why]))
        overlap = sorted(source_tokens & plan_tokens)
        score = min(100, round(100 * len(overlap) / max(4, min(len(source_tokens), len(plan_tokens)))))
        confidence = "high" if score >= 70 else "medium" if score >= 40 else "low"
        rationale = (
            f"Shared context: {', '.join(overlap[:5])}."
            if overlap else "The supplied source and Plan summary do not share enough specific context."
        )
        ranked.append(PlanMatchCandidate(planId=plan.id, score=score, confidence=confidence, rationale=rationale))
    ranked.sort(key=lambda candidate: (-candidate.score, candidate.plan_id))
    candidates = ranked[:3]
    leading = candidates[0].score if candidates else 0
    runner_up = candidates[1].score if len(candidates) > 1 else 0
    requires_clarification = leading < 40 or leading - runner_up < 15
    summary = (
        "One Plan has a materially stronger contextual match. Review it before linking."
        if not requires_clarification
        else "No single Plan is clearly stronger. Choose the useful association yourself."
    )
    return PlanMatchResponse(
        schemaVersion=1,
        requestId=request.request_id,
        requiresClarification=requires_clarification,
        summary=summary,
        candidates=candidates,
    )
