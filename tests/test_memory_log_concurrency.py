"""Real spawned processes sharing one decision log must serialize transactions."""

import multiprocessing
from unittest.mock import patch

import pytest

from tradingagents.decision_log import TradingMemoryLog

pytestmark = pytest.mark.unit
_DATE = "2026-01-05"


def _settle(log, operation, ticker):
    update = {
        "ticker": ticker,
        "trade_date": _DATE,
        "raw_return": 0.05,
        "alpha_return": 0.02,
        "holding_days": 5,
        "reflection": f"lesson {ticker}",
    }
    if operation == "batch":
        log.batch_update_with_outcomes([update])
    else:
        log.update_with_outcome(**update)


def _hold_transaction(path, operation, entered, release):
    log = TradingMemoryLog({"memory_log_path": path})

    def pause(value):
        entered.set()
        assert release.wait(30), "parent did not release transaction"
        return value

    if operation == "store":
        # Pause after the duplicate check, before the append.
        with patch("tradingagents.decision_log.parse_rating", side_effect=lambda _: pause("Buy")):
            log.store_decision("A", _DATE, "Rating: Buy\noriginal A")
    else:
        # Pause after the snapshot has been read, before atomic replacement.
        with patch.object(log, "_apply_rotation", side_effect=pause):
            _settle(log, operation, "A")


def _contend(path, operation, started, finished):
    log = TradingMemoryLog({"memory_log_path": path})
    started.set()
    if operation == "store":
        log.store_decision("A", _DATE, "Rating: Sell\nduplicate A")
        log.store_decision("D", _DATE, "Rating: Buy\nnew D")
    elif operation == "read":
        entries = log.load_entries()
        assert any(e["ticker"] == "A" for e in entries)
    else:
        _settle(log, operation, "B")
    finished.set()


@pytest.mark.parametrize("holder", ["store", "update", "batch"])
@pytest.mark.parametrize("contender", ["store", "update", "batch", "read"])
def test_transactions_are_serialized_across_processes(tmp_path, holder, contender):
    path = str(tmp_path / "memory.md")
    log = TradingMemoryLog({"memory_log_path": path})
    for ticker in (["B", "C"] if holder == "store" else ["A", "B", "C"]):
        log.store_decision(ticker, _DATE, f"Rating: Buy\noriginal {ticker}")

    ctx = multiprocessing.get_context("spawn")
    entered, release, started, finished = (ctx.Event() for _ in range(4))
    owner = ctx.Process(target=_hold_transaction, args=(path, holder, entered, release))
    other = ctx.Process(target=_contend, args=(path, contender, started, finished))
    owner.start()
    try:
        assert entered.wait(30), "owner did not reach its write transaction"
        other.start()
        assert started.wait(30), "contender did not start"
        assert not finished.wait(0.5), "operation bypassed the active write transaction"
        release.set()
        owner.join(30)
        other.join(30)
        assert owner.exitcode == 0
        assert other.exitcode == 0
    finally:
        release.set()
        for process in (owner, other):
            if process.pid is not None:
                process.join(5)
                if process.is_alive():
                    process.terminate()
                    process.join(5)

    entries = log.load_entries()
    by_ticker = {entry["ticker"]: entry for entry in entries}
    expected = {"A", "B", "C", "D"} if contender == "store" else {"A", "B", "C"}
    assert set(by_ticker) == expected
    assert len(entries) == len(expected), "duplicate decision was appended"
    assert by_ticker["A"]["decision"] == "Rating: Buy\noriginal A"
    assert by_ticker["A"]["reflection"] == ("" if holder == "store" else "lesson A")
    assert by_ticker["B"]["reflection"] == ("lesson B" if contender in {"update", "batch"} else "")
    assert by_ticker["C"]["pending"]
