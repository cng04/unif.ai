from datetime import date, datetime, timedelta, timezone

from unifai_agent import AgentProfile
from unifai_agent.llm import LLMResponse

from app.matching.plans import (
    best_slots,
    budget_cap,
    fits,
    interest_counts,
    pick_plans,
    search_area,
    summary,
    time_label,
    within_cap,
)
from app.services.event_search import Candidate, parse_candidates
from app.services.ticketmaster import local_start


class FakeLLM:
    """Returns a fixed JSON reply (or raises) and records what it was sent."""

    def __init__(self, text: str | None = None, error: bool = False):
        self.text, self.error, self.calls = text, error, []

    def generate(self, system, history, **kwargs):
        self.calls.append((system, history))
        if self.error:
            raise RuntimeError("model down")
        return LLMResponse(text=self.text)


def profile(uid: str, interests=(), area=None, budget=None, travel=None) -> AgentProfile:
    return AgentProfile.model_validate(
        {
            "user_id": uid,
            "public": {"name": uid, "interests": list(interests)},
            "private": {"dealbreakers": ["secret dealbreaker"], "logistics": {"area": area, "budget": budget, "travel": travel}},
        }
    )


PDT = timezone(timedelta(hours=-7))
SAT_10AM = datetime(2026, 10, 24, 10, 0, tzinfo=PDT)  # a Saturday
FRI_7PM = datetime(2026, 10, 23, 19, 0, tzinfo=PDT)
WINDOW = (date(2026, 10, 17), date(2026, 10, 31))


def test_best_slots_keeps_every_slot_everyone_shares_and_counts_flexible_people():
    availability = [["weekend_daytime", "weekday_evening"], ["weekend_daytime", "weekday_evening"], []]

    assert best_slots(availability) == (["weekday_evening", "weekend_daytime"], 3)


def test_best_slots_falls_back_to_the_best_covered_slot():
    availability = [["weekday_evening"], ["weekday_evening"], ["weekend_daytime"]]

    assert best_slots(availability) == (["weekday_evening"], 2)


def test_best_slots_is_open_when_nobody_stated_a_time():
    assert best_slots([[], []]) == ([], 2)


def test_budget_cap_is_the_lowest_stated_tier():
    assert budget_cap(["$$$", "$$", None, "whatever"]) == "$$"
    assert budget_cap(["$$", "free stuff"]) == "free"
    assert budget_cap([None]) is None


def test_within_cap_lets_unknown_prices_through():
    assert within_cap("$", "$$") and within_cap(None, "$") and within_cap("$$$", None)
    assert not within_cap("$$$", "$$")


def test_fits_checks_window_weekday_and_hour_in_local_time():
    assert fits(SAT_10AM, ["weekend_daytime"], *WINDOW)
    assert not fits(SAT_10AM, ["weekend_evening"], *WINDOW)
    assert fits(FRI_7PM, ["weekday_evening"], *WINDOW)
    assert fits(FRI_7PM, ["weekend_evening", "weekday_evening"], *WINDOW)
    assert not fits(FRI_7PM, ["weekend_evening"], *WINDOW)
    assert fits(FRI_7PM, [], *WINDOW)
    assert not fits(SAT_10AM.replace(hour=6), ["weekend_daytime"], *WINDOW)
    assert not fits(SAT_10AM + timedelta(days=30), [], *WINDOW)
    assert not fits(None, [], *WINDOW)


def test_time_label_uses_the_venue_wall_clock():
    assert time_label(SAT_10AM) == "sat 24 · 10:00"


def test_interest_counts_counts_each_person_once():
    profiles = [profile("a", ["Climbing", "climbing", "tacos"]), profile("b", ["climbing"])]

    assert interest_counts(profiles) == [("climbing", 2), ("tacos", 1)]


def test_interest_counts_drops_one_person_niches_once_two_are_shared():
    profiles = [profile("a", ["climbing", "poetry", "warhammer"]), profile("b", ["climbing", "poetry", "lifting"])]

    assert interest_counts(profiles) == [("climbing", 2), ("poetry", 2)]


def test_summary_says_who_is_free_and_the_price_cap():
    assert summary(["weekend_daytime"], 5, 5, "$$") == "Picked for when you're all free (weekend daytimes), at $$ or under."
    assert (
        summary(["weekday_evening", "weekend_evening"], 5, 5, None)
        == "Picked for when you're all free (weekday evenings or weekend evenings)."
    )
    assert summary(["weekday_evening"], 4, 5, None) == "Picked for weekday evenings, when 4 of 5 of you are free."
    assert summary([], 5, 5, "free") == "Picked for your shared interests, all free."


def test_search_area_sends_only_areas_and_travel():
    llm = FakeLLM('{"area": "Los Angeles, around Echo Park"}')
    profiles = [profile("a", area="Echo Park", travel="30 min"), profile("b", area="Silver Lake"), profile("c")]

    assert search_area(llm, profiles) == "Los Angeles, around Echo Park"
    sent = llm.calls[0][1][0]["content"]
    assert "Echo Park" in sent and "Silver Lake" in sent
    assert sent.count("lives:") == 2 and "secret dealbreaker" not in sent


def test_search_area_falls_back_to_the_most_common_area_or_none():
    profiles = [profile("a", area="Pasadena"), profile("b", area="Pasadena"), profile("c", area="Venice")]

    assert search_area(FakeLLM(error=True), profiles) == "Pasadena"
    assert search_area(FakeLLM(error=True), [profile("a")]) is None


CANDIDATES = [Candidate(name=f"option {n}", starts_at=SAT_10AM) for n in range(4)]


def test_pick_plans_keeps_valid_picks_and_fills_the_rest_in_order():
    llm = FakeLLM('{"picks": [{"index": 2, "reason": "Four of you climb."}, {"index": 9, "reason": "bad"}, {"index": 2, "reason": "dup"}]}')

    picks = pick_plans(llm, CANDIDATES, [("climbing", 4)], 5)

    assert [(c.name, r) for c, r in picks] == [
        ("option 2", "Four of you climb."),
        ("option 0", "Picked for your shared interest in climbing."),
        ("option 1", "Picked for your shared interest in climbing."),
    ]


def test_pick_plans_survives_a_model_error_and_empty_input():
    assert [c.name for c, _ in pick_plans(FakeLLM(error=True), CANDIDATES, [], 4)] == ["option 0", "option 1", "option 2"]
    assert pick_plans(FakeLLM(error=True), [], [], 4) == []


def test_parse_candidates_accepts_dicts_and_json_and_drops_bad_items():
    good = {"name": "bouldering", "starts_at": "2026-10-24T10:00:00-07:00", "price": "$$", "source": "meetup"}

    assert [c.name for c in parse_candidates({"candidates": [good, {"venue": "no name"}]})] == ["bouldering"]
    assert parse_candidates('{"candidates": [{"name": "walk"}]}')[0].name == "walk"
    blank = parse_candidates({"candidates": [{"name": "walk", "url": "", "starts_at": "", "price": ""}]})[0]
    assert (blank.url, blank.starts_at, blank.price) == (None, None, None)
    assert parse_candidates("not json") == [] and parse_candidates(None) == []


def test_ticketmaster_start_is_converted_to_venue_time():
    start = local_start({"start": {"dateTime": "2026-10-25T02:00:00Z"}, "timezone": "America/Los_Angeles"})

    assert (start.weekday(), start.hour) == (5, 19)  # Saturday 7pm in LA
    assert local_start({}) is None
