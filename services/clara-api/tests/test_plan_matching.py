from fastapi.testclient import TestClient

from clara_api.auth import AuthenticationError
from clara_api.main import create_app


REQUEST = {
    "schemaVersion": 1,
    "requestId": "plan-match-123",
    "source": {
        "title": "Visible first value",
        "excerpt": "A visible first result helps users continue product setup.",
        "note": "Use this for the launch milestone.",
        "topic": "User activation",
    },
    "plans": [
        {
            "id": "launch-plan",
            "title": "Launch Longview",
            "outcome": "Release a tested product setup to real users.",
            "why": "Learn which visible result creates user activation.",
        },
        {
            "id": "learning-plan",
            "title": "Learn distributed systems",
            "outcome": "Complete practical distributed systems exercises.",
            "why": "Build durable engineering knowledge through practice.",
        },
    ],
}


class Verifier:
    def __init__(self, fail=False):
        self.fail = fail

    async def verify(self, token):
        if self.fail:
            raise AuthenticationError()
        return "owner-1"


def test_plan_matching_is_authenticated_ranked_and_read_only():
    client = TestClient(create_app(verifier=Verifier()))
    assert client.post("/v1/clara/plan-matches", json=REQUEST).status_code == 401
    response = client.post("/v1/clara/plan-matches", json=REQUEST, headers={"Authorization": "Bearer token"})
    assert response.status_code == 200
    value = response.json()
    assert value["requestId"] == REQUEST["requestId"]
    assert value["candidates"][0]["planId"] == "launch-plan"
    assert value["candidates"][0]["score"] > value["candidates"][1]["score"]
    assert "proposedChange" not in value


def test_plan_matching_rejects_duplicate_plans_and_is_available_in_release_five():
    client = TestClient(create_app(verifier=Verifier(), release_mode="release-five"))
    duplicate = {**REQUEST, "plans": [REQUEST["plans"][0], REQUEST["plans"][0]]}
    assert client.post("/v1/clara/plan-matches", json=duplicate, headers={"Authorization": "Bearer token"}).status_code == 422
    assert "/v1/clara/plan-matches" in client.get("/openapi.json").json()["paths"]
