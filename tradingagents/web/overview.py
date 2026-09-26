"""Evidence-conservative overview of saved analyses; never generates market prices."""

from __future__ import annotations

import re
from pathlib import Path

from tradingagents.web.runs import read_run, scan_runs

BUDGET_CENTS = 10_500
PLANNED_SLEEVE_CENTS = 7_500
SINGLE_NAME_CAP_CENTS = 5_000
ALLOCATION_WEIGHT = {"Buy": 3, "Overweight": 2}
MISSING = "Not available"
RATING_ORDER = {"Buy": 0, "Overweight": 1, "Hold": 2, "Underweight": 3, "Sell": 4}
MONEY = re.compile(r"^\$?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\b")


def _field(text: str, label: str) -> str:
    match = re.search(rf"^\*\*{re.escape(label)}\*\*\s*:\s*(.+)$", text, re.I | re.M)
    value = match.group(1).strip() if match else ""
    return value if value and not re.match(r"(?i)^(?:not |none|n/?a\b)", value) else ""


def _level(text: str) -> tuple[str, float | None]:
    match = MONEY.match(text)
    if not match:
        return MISSING, None
    number = float(match.group(1).replace(",", ""))
    if number <= 0:
        return MISSING, None
    context = text[match.end():].strip(" —-:;")
    return f"${number:,.2f}" + (f" · {context[:100]}" if context else ""), number


def build_overview(results_dir: Path) -> dict:
    latest: dict[str, dict] = {}
    for run in scan_runs(results_dir):
        if run["status"] != "done":
            continue
        ticker = str(run["ticker"]).upper()
        current = latest.get(ticker)
        if current is None or (str(run["analysis_date"]), str(run["created_at"])) > (
            str(current["analysis_date"]), str(current["created_at"])
        ):
            latest[ticker] = run

    rows = []
    counts = {"buy": 0, "hold": 0, "sell": 0, "unknown": 0}
    for ticker, summary in latest.items():
        run = read_run(results_dir, summary["id"])
        if not run:
            continue
        sections = run.get("sections", {})
        final = sections.get("final_trade_decision") or sections.get("5_portfolio_decision", "")
        trader = sections.get("trader_investment_plan") or sections.get("3_trading_trader", "")
        rating = str(run["rating"])
        if rating in ("Buy", "Overweight"):
            category, action = "buy", "WAIT FOR VALIDATION"
        elif rating == "Hold":
            category, action = "hold", "HOLD / NO NEW BUY"
        elif rating in ("Underweight", "Sell"):
            category, action = "sell", "AVOID NEW BUY"
        else:
            category, action = "unknown", "REVIEW"
        counts[category] += 1

        entry_text = _field(trader, "Entry Price")
        entry, entry_price = _level(entry_text)
        stop_text = _field(trader, "Stop Loss")
        stop, stop_price = _level(stop_text)
        # A sale's re-evaluation trigger is not a protective stop on a new long.
        if category != "buy" or not re.search(r"\b(?:ATR|SMA|EMA|support|structure|shelf|band)\b", stop_text, re.I):
            stop, stop_price = MISSING, None
        if category == "buy" and entry_price and re.search(r"\b(?:pullback|limit order|wait)\b", entry_text + " " + trader[:500], re.I):
            action = "WAIT FOR PULLBACK"
        tp1, tp1_price = _level(_field(trader, "TP1") or _field(final, "TP1"))
        tp2, tp2_price = _level(_field(trader, "TP2") or _field(final, "TP2"))
        distance = round((entry_price - stop_price) * 100 / entry_price, 2) if entry_price and stop_price and entry_price > stop_price else None
        risk_reward = MISSING
        if (
            entry_price is not None and stop_price is not None
            and tp1_price is not None and tp2_price is not None
            and stop_price < entry_price < tp1_price < tp2_price
        ):
            risk_reward = f"{(tp2_price - entry_price) / (entry_price - stop_price):.2f}:1"
        horizon = _field(final, "Time Horizon")
        invalidation = _field(final, "Invalidation") or _field(trader, "Invalidation")
        caveat = "Saved analysis, not a live quote. Confirm price and levels before acting."
        if ticker == "SPY" and stop_price is None:
            caveat = "A tight mechanical stop is impractical for long-term SPY accumulation; review macro and thesis instead."
        rows.append({
            "id": summary["id"], "ticker": ticker, "analysis_date": summary["analysis_date"],
            "rating": rating, "score": None, "action": action,
            "horizon": horizon[:120] if horizon else MISSING,
            "allocation": 0, "entry": entry, "tp1": tp1, "tp2": tp2,
            "stop_loss": stop, "risk_reward": risk_reward, "confidence": MISSING,
            "invalidation": invalidation[:180] if invalidation else MISSING,
            "time_stop": "Review at the next monthly contribution; sooner if the thesis changes.",
            "risk_dollars": None, "stop_distance_pct": distance,
            "rationale": "No purchase from this month's budget until a current quote, valid entry, protective stop, and two sourced targets are confirmed." if category == "buy" else "Existing holdings are unknown; this rating does not authorize a new purchase.",
            "caveat": caveat,
        })

    rows.sort(key=lambda row: (RATING_ORDER.get(row["rating"], 5), row["ticker"]))
    eligible = [row for row in rows if row["rating"] in ALLOCATION_WEIGHT]
    if eligible:
        weight_total = sum(ALLOCATION_WEIGHT[row["rating"]] for row in eligible)
        assigned = []
        for row in eligible:
            cents = min(SINGLE_NAME_CAP_CENTS, PLANNED_SLEEVE_CENTS * ALLOCATION_WEIGHT[row["rating"]] // weight_total)
            assigned.append(cents)
        remainder = PLANNED_SLEEVE_CENTS - sum(assigned)
        for index, cents in enumerate(assigned):
            extra = min(remainder, SINGLE_NAME_CAP_CENTS - cents)
            assigned[index] += extra
            remainder -= extra
        for row, cents in zip(eligible, assigned, strict=True):
            row["allocation"] = cents / 100
            row["rationale"] = "Proposed monthly target, not an order. Verify current price, existing holdings, and the saved report's entry conditions before deployment."
    cash_cents = BUDGET_CENTS - sum(round(row["allocation"] * 100) for row in rows)
    return {
        "budget": BUDGET_CENTS / 100, "cash": cash_cents / 100,
        "counts": counts, "rows": rows,
    }
