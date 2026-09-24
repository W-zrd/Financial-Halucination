# INTC (Intel Corporation) — Technical Analysis Report
**Instrument:** INTC — Intel Corporation | Technology / Semiconductors | NMS
**Analysis date:** 2026-09-23 (data retrieved 2026-09-24)

---

## 1. Indicator Selection & Rationale (8 of 8 slots used)

INTC's current market context — a violent V-shaped recovery out of a ~42% summer drawdown, with a fresh high-volume momentum breakout — calls for a **trend-following + momentum + volatility framework**, not mean-reversion tools. The 8 indicators selected:

| # | Indicator | Role in this context |
|---|---|---|
| 1 | `close_200_sma` | Strategic trend confirmation — is the multi-month structure still bullish? |
| 2 | `close_50_sma` | Medium-term trend; this exact level defined the September pivot |
| 3 | `close_10_ema` | Short-term momentum gauge and dynamic trailing reference for entries |
| 4 | `macd` | Momentum regime change — the zero-line cross and acceleration drove this rally |
| 5 | `rsi` | Overbought/oversold monitoring and "momentum reset" detection |
| 6 | `boll_ub` | Breakout zone / short-term overextension detector (price is currently riding it) |
| 7 | `boll_lb` | Downside volatility envelope and crash-risk reference |
| 8 | `atr` | Position sizing and stop placement — essential in a ~5% daily-range stock |

**Deliberately excluded:** `macds` and `macdh` (redundant with the `macd` line — the verified snapshot supplies them as corroboration: signal 1.41, histogram 3.26); `boll` middle band (overlapping trend information with the 50 SMA — though the snapshot shows it currently sitting at the *same level* as the 50 SMA, a notable confluence noted below); `vwma` (volume signature is directly observable in the OHLCV data, and ATR contributes more unique information given the extreme volatility).

---

## 2. Data Integrity Notes (Discrepancies Flagged)

Per protocol, the **verified snapshot is treated as the source of truth**. Two other tools returned slightly different values, flagged here rather than reconciled:

| Metric | get_stock_data / get_indicators | Verified snapshot | Δ |
|---|---:|---:|---:|
| Close (2026-09-23) | 120.68 | **120.67** | 0.01 |
| Volume (2026-09-23) | 54,182,566 | **54,211,964** | ~29k |
| 10 EMA | 108.20 | **107.61** | 0.59 |
| 50 SMA | 97.68 | **97.81** | 0.13 |
| 200 SMA | 77.93 | **77.08** | 0.85 |
| RSI | 69.41 | **70.67** | 1.26 |
| Bollinger UB | 119.69 | **118.87** | 0.82 |
| Bollinger LB | 78.56 | **76.45** | 2.11 |
| MACD | 4.73 | **4.66** | 0.07 |
| ATR | 6.45 | **6.42** | 0.03 |

All deltas are small and **no qualitative conclusion changes** under either dataset (price is above the upper band, above all averages, and RSI is at/around the 70 threshold in both). Two additional data caveats:
- **2026-09-22 has no trading row** in either the price file or the indicator series (vendor marks it a non-trading day), so the tape jumps Sep 21 → Sep 23.
- The Sep 23 volume print (~54.2M) is far below Sep 21's 191.6M; given the 2026-09-24 00:50 retrieval timestamp, this row may reflect an incomplete session — do not read it as confirmed distribution.

---

## 3. Price Structure: The 12-Month Journey (all figures from tool output)

- **Sep 23, 2025:** close 29.34 (dataset low zone; intraday low 28.82) → **Sep 23, 2026: close 120.67 — a +311% one-year move.**
- **Jan 2026:** Rally from 39.38 (Jan 2) to closes of 54.25 (Jan 21) and 54.32 (Jan 22), then a **-17.0% single-day collapse to 45.07 on Jan 23** on the dataset's highest volume (294.7M shares) — the defining demonstration of this name's gap/event risk.
- **Apr 2026:** Explosive breakout — Apr 23 close 66.78 → **Apr 24 open 82.20 (+23.1% overnight gap), close 82.54 (+23.6%)** on 281.4M shares.
- **May–Jun 2026:** Sustained advance to the cycle peak: **highest close 140.94 (Jun 22), highest intraday print 142.35 (Jun 30)**; heavy-volume accelerations May 8 (close 124.92) and Jun 18 (close 133.99, 233.9M shares).
- **Jul 2026 — the correction:** From the Jun 22 close of 140.94 to the **Jul 29 close of 81.88 (intraday low 81.79) — a -41.9% peak-to-trough decline on a closing basis** in five weeks. RSI bottomed at 31.49 on Jul 29 (per the indicator series).
- **Aug 2026:** Failed rebound to 104.56 (Aug 13), then a grind down to the 87.26–88.24 close cluster (Aug 24–26) — a double-base with the July lows.
- **Sep 2026 — the recovery thrust:** Sep 4 close 95.80 → Sep 8 close 104.47 (+9.0%); pullback to closes of 97.19/97.14 (Sep 14/15); then the ignition sequence — Sep 17 +7.7% to 108.80, Sep 18 108.60, **Sep 21 +12.1% to 121.78** (intraday high 124.73, volume 191.6M), and Sep 23 close 120.67 after an inside day (O 123.81 / H 124.25 / L 119.44 / C 120.67).
- **From the Jul 29 close (81.88) to the Sep 21 close (121.78): +48.7% in under two months; from the Sep 15 close (97.14) to Sep 21 (121.78): +25.4% in four sessions.**

---

## 4. Multi-Timeframe Trend Analysis

**Long-term (200 SMA = 77.08, verified):** Structurally bullish. Price sits **+56.6% above** the 200 SMA, and the average itself has been rising steadily throughout the entire pullback and recovery (per the indicator series it climbed from ~66.03 on Jul 27 to ~77.9 by Sep 23; the verified snapshot prints 77.08 today — flagged discrepancy, same conclusion). Even the -42% summer drawdown never approached the 200 SMA. The long-term trend has never broken.

**Medium-term (50 SMA = 97.81, verified):** This is the pivotal line of the whole setup. The 50 SMA declined from ~114.69 (Jul 27) to a trough of ~97.09 (Sep 18), then curled upward — **it has just inflected from down to up**, the classic signature of a completed correction and new intermediate uptrend. Critically, the **Sep 14–15 pullback lows (closes 97.19 and 97.14) landed precisely on the 50 SMA (97.39–97.89 on those dates)** — price tested the medium-term average and rejected it, launching the +25% thrust. Note the powerful confluence: the verified 50 SMA (97.81) and the Bollinger basis/20-day average (97.66) are effectively at the same level — **the 97–98 zone is a triple-confluence support** (50-day, 20-day, and the actual September breakout pivot).

**Short-term (10 EMA = 107.61, verified):** Rising steeply (from ~90.9 on Sep 1 to ~107.6–108.2 now). Two key facts: (1) the **10 EMA crossed above the 50 SMA on Sep 14** (10 EMA 97.95 vs 50 SMA 97.89, after being below on Sep 11 at 98.11 vs 98.35) — the bullish short/medium MA cross occurred *exactly* at the pullback low, one session before the vertical move; (2) price is now **+12.1% above the 10 EMA** — a substantial short-term extension that argues against chasing at market.

---

## 5. Momentum Analysis

**MACD (line = 4.66, signal = 1.41, histogram = +3.26, verified):** A textbook momentum reversal. The MACD line bottomed near -7.8 in late July, crossed **above zero on Sep 10** (-0.19 on Sep 9 → +0.18 on Sep 10), and has since accelerated almost monotonically: 0.68 (Sep 11) → 0.79 (Sep 16) → 1.59 (Sep 17) → 2.19 (Sep 18) → 3.69 (Sep 21) → **4.66 today**, with the line now far above its signal (histogram +3.26 and expanding). This is an early-to-middle-stage momentum regime, not an exhausted one — the histogram's continued expansion says buyers are still pressing.

**RSI (= 70.67, verified; 69.41 per the indicator series):** The sequence is instructive: oversold-adjacent 31.49 at the Jul 29 price low → mid-30s to low-40s through August → a **reset to almost exactly 50.3 on Sep 14–15** (the pullback low, where RSI returned to neutral without breaking down — a bullish momentum reset) → 62.0 (Sep 17) → 70.9 (Sep 21) → ~70 today. RSI is now **at the overbought threshold**. Per the indicator guidance: in strong trends RSI can ride 70+; it is a caution flag for *new* long entries, not a sell signal. There is no bearish divergence evident in the available series (price highs and RSI highs rose together into Sep 21).

---

## 6. Volatility & Bollinger Structure

- **Upper band (118.87, verified):** Price closed **+1.5% above** the upper band — INTC is "riding the band," which in strong trends is continuation behavior but is also the textbook definition of short-term overextension. The band ride began Sep 21 (close 121.78 vs band ~115.97).
- **Band expansion:** The upper band rose from ~105.65 (Sep 15) to ~118.87–119.69 today while the lower band fell from ~82.40 to ~76.45 — bands are widening sharply, confirming this is a genuine volatility-expansion breakout rather than a low-energy drift.
- **Lower band (76.45, verified) and 200 SMA (77.08, verified) sit on top of each other** — the 76–77 zone is the deep-support confluence. A decline into that zone would mean the entire recovery had failed and the stock had reverted to its long-term mean.
- **ATR (6.42, verified):** Daily true range ≈ **5.3% of price** — extraordinary. ATR compressed from ~8.6 (late July) to ~5.1 (Sep 4) as the base formed, and is now re-expanding (5.1 → 6.4+) with the breakout — volatility is fueling the move. Practical implication: a 2×ATR stop from 120.67 is ~107.8, which lands almost exactly on the 10 EMA (107.61) — the volatility math and the trend math agree on where a momentum trade should be exited.

---

## 7. Volume Signature

The September advance is volume-confirmed: Sep 8 +9.0% on 140.3M, Sep 17 +7.7% on 149.7M, Sep 18 on 175.0M, **Sep 21 +12.1% on 191.6M** — versus the Sep 14 -5.6% pullback day on only 96.5M. Up-days are carrying roughly 1.5–2× the volume of the lone pullback day — an accumulation signature, consistent with institutional participation rather than a low-liquidity squeeze. (The Sep 23 print of 54.2M is treated as unreliable pending a complete session — see Section 2.) The two largest volume days in the entire dataset (Jan 23: 294.7M; Apr 24: 281.4M) were both violent event gaps in opposite directions — a standing reminder that this name reprices overnight without warning.

---

## 8. Actionable Scenarios & Levels

**Bull continuation (momentum case, currently active):** MACD above zero and above signal with an expanding histogram, RSI through 70, price riding the upper band, 10 EMA > 50 SMA cross (Sep 14), 50 SMA inflecting up, and heavy up-volume. First objective is the **124.25–124.73 zone** (Sep 21/Sep 23 highs) — note Sep 23 already stalled there (close below open, lower high vs Sep 21). Above that, the June supply shelf: **129–134** (Jun 23–25 closes of 132.28/131.65/132.87; Jun 18 close 133.99), then the cycle extremes **140.94–142.35**.

**Consolidation/pullback (near-term risk):** Price +12% above the 10 EMA, RSI at 70, and an inside day on Sep 23 argue for digestion. Constructive pullbacks would target **108–110** (the 10 EMA at ~107.6 and the 2×ATR volatility stop zone) and, deeper, the **97–98 triple confluence** (50 SMA 97.81 + Boll basis 97.66 + the Sep 14–15 breakout pivot at 97.14–97.19). A shallow pullback that holds above the 10 EMA would constitute a classic bull-flag continuation setup — a higher-quality entry than chasing 120+.

**Bear invalidation:** A daily close below **97–98** negates the breakout thesis and puts the 87–90 August base (Aug 24–26 closes 87.26/87.48/88.24) in play; below that, the 81.79–81.88 July low. A close below **76–77** (200 SMA + lower band) would flip the long-term structure to bearish for the first time in the dataset.

**Risk management (non-negotiable given the data):** ATR 6.42 (~5.3%/day) means position sizes should be cut to roughly a third of normal for equivalent dollar risk; stops belong at 2–3× ATR (≈ $12.8–$19.3), *not* tighter — the Jan 23 (-17%) and Apr 24 (+23.1% gap) episodes show that tight stops in INTC are simply donations. Realized volatility of this magnitude also implies very rich option premiums; risk-defined structures (spreads) are generally preferable to naked long premium here (this is a general observation, not tool-verified IV data).

---

## 9. Key Points Summary Table

| Theme | Indicator / Level (verified, 2026-09-23) | Reading | Signal / Actionable Implication |
|---|---|---|---|
| **Price** | Close 120.67 (O 123.81 / H 124.25 / L 119.44) | Inside day vs Sep 21 after +12.1% surge | Stalling at 124–125 resistance; don't chase; wait for pullback or breakout confirmation |
| **Long-term trend** | 200 SMA = 77.08 (rising) | Price +56.6% above | Structural uptrend fully intact; strategic long bias |
| **Medium-term trend** | 50 SMA = 97.81 (just inflected up) | Price +23.4% above; Sep 14–15 lows (97.14/97.19) tested it and held | 97–98 = triple confluence support (50 SMA + Boll basis 97.66 + breakout pivot) |
| **Short-term trend** | 10 EMA = 107.61 (steeply rising) | Price +12.1% above; 10 EMA crossed above 50 SMA on Sep 14 | Overextended vs 10 EMA — pullback to 108–110 is the higher-quality entry zone |
| **Momentum** | MACD 4.66 / signal 1.41 / histogram +3.26 | Zero-cross Sep 10; accelerating; histogram expanding | Early-to-mid stage momentum regime — trend intact, not exhausted |
| **Momentum gauge** | RSI = 70.67 | At overbought threshold after a 50.3 reset on Sep 14–15 | Caution for new entries; can ride 70+ in strong trends; no bearish divergence in series |
| **Volatility envelope** | Boll UB = 118.87; LB = 76.45 (bands expanding) | Close +1.5% above upper band (riding it since Sep 21); LB ≈ 200 SMA | Breakout continuation vs short-term overextension; 76–77 = deep structural support |
| **Volatility sizing** | ATR = 6.42 (~5.3% of price; re-expanding from 5.1 low) | Extreme daily ranges | Stop at 2×ATR ≈ 107.8 (≈ 10 EMA); cut position size ~2/3; beware gap risk (Jan 23 -17%, Apr 24 +23.1%) |
| **Volume** | Sep 8/17/21: 140M/150M/192M vs Sep 14 pullback: 96M | Up-day volume 1.5–2× down-day volume | Accumulation signature confirms the rally; Sep 23's 54M print unreliable (possible partial session) |
| **Resistance map** | 124.25–124.73 → 129–134 → 140.94–142.35 | Sep highs, then June supply shelf, then cycle extremes | Staged profit-taking targets for trend-followers |
| **Support map** | 119.4 → 108–110 → 97–98 → 87–90 → 81.8 → 76–77 | Sep 23 low, 10 EMA/2×ATR, triple confluence, Aug base, Jul low, 200 SMA+lower band | Escalating invalidation levels; 97–98 is the thesis line |
| **Data caveats** | Close 120.67 vs 120.68; RSI 70.67 vs 69.41; 200 SMA 77.08 vs 77.93; no 2026-09-22 row | Minor tool-to-tool discrepancies; snapshot treated as truth | No qualitative conclusion changes; avoid precision claims beyond the snapshot |

**Bottom line:** INTC is in a confirmed, volume-backed V-shaped recovery within an unbroken long-term uptrend — a momentum regime where trend-following tools (10 EMA / 50 SMA / 200 SMA / MACD) say "stay long," while RSI at 70, a close above the upper Bollinger band, and +12% extension over the 10 EMA say "don't initiate here." The highest-probability actionable structure is patience for a retest of 108–110 (10 EMA / 2×ATR) or 97–98 (triple confluence), with the 97–98 zone as the hard invalidation for the entire bullish thesis, and ATR-derived sizing (roughly one-third normal) plus gap-aware stops as the risk framework. The final trade decision rests with the downstream agent; all levels above are sourced from the verified 2026-09-23 snapshot and the tool-retrieved price history.