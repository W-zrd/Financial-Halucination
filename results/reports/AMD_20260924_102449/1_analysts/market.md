# AMD Technical Analysis Report — 2026-09-24

## 1. Data & Verification Notes

- The verified snapshot's **latest trading row is 2026-09-23** (the indicator tool flags 2026-09-24 as a non-trading day, and 2026-09-22 was also a non-trading day). All "current" values below are as of the 2026-09-23 close, which I treat as the source of truth.
- ⚠️ **Discrepancy flag:** The raw CSV feed showed a 9/23 close of **613.88** (volume 12,306,285), while the verified snapshot shows **613.64** (volume 12,309,815). The difference is immaterial (~0.04%), but per protocol I use the **verified snapshot values** throughout. Also note the 9/23 volume (~12.3M) is well below the recent norm — verify live volume before acting, as it could reflect an incomplete feed.
- Analysis window: 2026-03-24 → 2026-09-23 (126 trading rows).

## 2. Market Regime Classification

AMD is in a **powerful long-term uptrend that has just transitioned from a multi-week correction-and-base into a fresh momentum breakout to new highs**, with elevated volatility and a short-term overbought reading. This is a "trend-following with pullback entries" regime, not a mean-reversion regime. The indicator set below was chosen to capture that: long/medium trend anchors, a fast entry average, momentum confirmation, overbought monitoring, breakout validation, and volatility-based risk sizing.

## 3. Indicator Selection Rationale (8 Indicators)

| Indicator | Why Selected |
|---|---|
| **close_200_sma** | Strategic trend benchmark; confirms the primary uptrend and measures long-term extension risk. |
| **close_50_sma** | Medium-term trend anchor; was the pivotal level that capped price in August and was reclaimed in early September. |
| **close_10_ema** | Fast, responsive average for timing entries/trailing stops in an accelerating leg. |
| **macd** | Momentum confirmation via the zero-line cross that launched this breakout leg. |
| **macdh** | Momentum *acceleration* — shows whether the leg is strengthening or tiring before MACD crosses. |
| **rsi** | Overbought/oversold check; currently flags a stretched short-term condition. |
| **boll_ub** | Validates the breakout (price riding the upper band) and marks the breakout zone. |
| **atr** | Volatility regime tracker; essential for stop placement and position sizing in a $25/point ATR market. |

**Deliberately excluded:** `macds` (redundant with macd + macdh combination), `boll`/`boll_lb` (price is far above them; the upper band is the relevant band here), `vwma` (volume behavior is directly observable in the OHLCV data; the 8 slots were better used elsewhere).

## 4. Price Structure: A Three-Act Trend

**Act 1 — The primary advance (late March → late June).** AMD closed at 205.37 on 2026-03-24 and staged a relentless advance through April and May (e.g., 303.46 on 4/22, 421.39 on 5/06, 503.89 on 5/26) to a closing peak of **580.91 on 6/30**. The 200 SMA has risen steadily throughout this window (307.09 on 7/27 → 358.61 now), confirming a structurally intact primary uptrend.

**Act 2 — Correction and base (July → early September).** A sharp drawdown took the close from 580.91 (6/30) down to **429.56 on 7/29** (intraday low 424.03 on 7/29) — roughly a 26% correction. Price then chopped sideways for a month (Aug 3 – Sep 3 closes roughly between 456 and 514), building a base. Critically, the **50 SMA (~505–514) acted as a ceiling** during August (price repeatedly closed below it), then **flattened and inflected upward** (514.33 on 8/3 → 495.03 on 9/16 → 498.58 now) as the base formed.

**Act 3 — Reclaim and breakout (Sep 4 → present).** The close of **505.74 on 9/8 reclaimed the 50 SMA** (498.96 that day) for the first time since mid-August. After a brief retest/consolidation (493.41–516.13, 9/10–9/16), price exploded: 545.09 (9/17), 559.82 (9/18), **615.52 on 9/21** — a new closing high above the June 580.91 peak, on expanding volume (44.5M shares on 9/21 vs. ~14–20M typical during the August base). The 9/23 close of **613.64** holds just below that, with an intraday high of **624.69** marking the all-time high of this dataset. Net move from the 9/3 close (456.16) to 9/23 (613.64): roughly +34.5% in 14 sessions.

## 5. Indicator Deep Dive

### 5.1 Moving Averages — Fully Stacked Bullish, But Extended
- **10 EMA: 548.75** — rising steeply (492.77 on 9/14 → 548.75 on 9/23). Price sits ~11.8% above it. This is the nearest dynamic support for active traders.
- **50 SMA: 498.58** — inflected from decline to rise during the base; price is ~23.1% above it. The prior ceiling (Aug) is now deep support.
- **200 SMA: 358.61** — steadily rising. Price is **~71.1% above the 200 SMA**, an extreme long-term extension. This is the single biggest caution in the report: powerful trends can stay extended, but the distance-to-mean is stretched enough that pullbacks toward the 10 EMA / mid-band should be expected and planned for, not feared.

### 5.2 MACD — Zero-Line Cross, Then Violent Acceleration
- The **MACD line crossed above zero on 9/10** (0.98 vs. -0.76 on 9/9), a textbook momentum regime shift that coincided with the post-reclaim thrust.
- MACD has since expanded to **25.39**, and the **histogram is accelerating** almost every session: 4.82 (9/15) → 4.86 (9/16) → 6.70 (9/17) → 8.43 (9/18) → 12.58 (9/21) → **14.34 (9/23)**. MACD (25.39) is far above its signal (11.05).
- **Trading implication:** As long as the histogram keeps expanding, do not fight the trend. The first histogram contraction (a smaller bar) is your early-warning that the thrust is tiring; a MACD cross back below its signal would be the momentum exit trigger.

### 5.3 RSI — Overbought, But That Is What Strong Trends Do
- RSI: **72.39** (peaked at 72.96 on 9/21), having climbed from 42.75 on 9/3. It has crossed the classic 70 threshold.
- Context matters: in a fresh breakout with an expanding Bollinger band, RSI can hold 70–80 for weeks. I do **not** claim a bearish divergence here — the 9/23 close (613.64) is slightly *below* the 9/21 close (615.52) while RSI ticked down from 72.96 to 72.39, which is normal two-bar noise, not a confirmed divergence.
- **Use it as a "chase filter":** RSI > 70 means buying breakouts at current levels carries poor immediate risk/reward; it is a reason to wait for the pullback, not a reason to short.

### 5.4 Bollinger Upper Band — Breakout Confirmed, Band Expanding
- The upper band has rocketed from ~509.82 (9/8) to **599.15** (9/23) while the lower band sits at 412.27 — band width ~186.9 points (~37% of the 505.71 middle band). **Band expansion after a squeeze is the classic volatility-breakout confirmation**, and it lines up exactly with the 9/17–9/21 price thrust.
- Price closed **~2.4% above the upper band** (613.64 vs. 599.15). "Riding the band" is a hallmark of strong trends, but entries here are chasing; the upper band (~599) is the first level that *could* act as support on any giveback.
- Note the middle band (505.71) now nearly coincides with the 50 SMA (498.58) — a powerful confluence zone around **499–506** that defines the "trend still healthy" line for swing traders.

### 5.5 ATR — Volatility Regime
- ATR is **25.66 (~4.2% of price)**. It has *declined* from the correction extremes (~40.39 on 8/4) to a ~22–26 range over the past month, meaning the chaos of the July selloff has normalized even as price breaks out.
- Practical math: a 2×ATR stop is ~$51 wide; a 3×ATR stop ~$77. This directly dictates position sizing (see §6).

### 5.6 Volume Behavior (from OHLCV data)
Breakout days carried expanding volume: 28.2M (9/8), 28.5M (9/17), 31.9M (9/18), **44.5M (9/21)** — versus ~14–20M during the August base. Volume expansion confirms institutional participation in the breakout. The low 9/23 print (12.3M) is the one soft spot — verify it against live data as noted above.

## 6. Actionable Trading Plan

**Bias: Bullish while above the 498–506 confluence (50 SMA + Bollinger mid-band). Do not initiate shorts against this tape.**

1. **Chasing here (613.64) is the worst risk/reward entry.** Price is >2% above the upper band, RSI > 70, and ~12% above the 10 EMA. If you must be long, use reduced size and a wide stop.
2. **Preferred entry A — first pullback to the 10 EMA (~549).** With MACD histogram still expanding, a shallow pullback to the fast average is the highest-probability momentum continuation entry. Stop: 1×ATR below the 10 EMA (~523), risking ~$26–27.
3. **Preferred entry B — deep pullback to the 499–506 confluence** (50 SMA 498.58 + Bollinger middle 505.71, plus the 9/8 reclaim candle and the 515–521 prior consolidation shelf just above). Stop: below ~478 (under the 9/4 swing and 1×ATR under the confluence), risking ~$28–30 from entry.
4. **Position sizing formula:** Risk $ (e.g., 0.5–1% of equity) ÷ (ATR multiple used for stop). At 2×ATR ($51.33), every 1% of account risk supports roughly $R/$51 per-share sizing. Volatility is high — size down, not up.
5. **Trail management:** Once in a winner, trail with the 10 EMA (exit on a daily close below it) or a 2.5–3×ATR trailing stop from the highest close. Take partial profits into the 616.69/624.69 prior-high zone only if momentum stalls (first MACD histogram contraction).
6. **Trend invalidation:** A daily close below **498–506** flips the medium-term structure back to neutral/repair and should trigger exit or heavy de-risking of swing longs. A MACD signal-line cross and histogram rollover would typically precede that.
7. **Key levels map:** Support: 599 (prior upper band) → 549 (10 EMA) → 545–560 (9/17–9/18 breakout shelf) → 515–521 (base ceiling) → 499–506 (confluence) → 456–429 (August base / July low). Resistance: 616.69 / 624.69 (all-time highs) → uncharted above.
8. **Catalyst risk:** The 9/21 thrust (+10% single-day close-to-close from 559.82 to 615.52) suggests a news/catalyst event. Post-catalyst moves often retrace 30–50% of the thrust leg; that retracement zone (~585–600) overlaps the prior upper band — a logical first support test.

## 7. Risks & Cautions

- **Extreme extension:** ~71% above the 200 SMA and ~23% above the 50 SMA leaves enormous air below; a garden-variety 2–3 week correction could be 15–20% without breaking the trend structure. Trade size accordingly.
- **Overbought conditions:** RSI 72.39 + price above the upper Bollinger band historically precede at least a pause/consolidation. Expect chop, not necessarily reversal.
- **Data caveats:** 9/22 was a non-trading day; the 9/24 session is not yet reflected; the 9/23 close differs slightly between feeds (613.64 verified vs. 613.88 CSV) and 9/23 volume looks anomalously low. Confirm live data before executing.

## 8. Summary Table

| Category | Indicator | Value (9/23, verified) | Signal | Interpretation |
|---|---|---:|---|---|
| Long-term trend | close_200_sma | 358.61 | Rising | Primary uptrend intact; price ~71% above = long-term extension risk |
| Medium-term trend | close_50_sma | 498.58 | Inflected up | Prior Aug ceiling → reclaimed 9/8 → deep support at 498–506 confluence |
| Short-term trend | close_10_ema | 548.75 | Rising steeply | Price ~12% above; first pullback buy zone ~549 |
| Momentum | macd | 25.39 | Strong bullish | Zero-line cross 9/10 ignited the breakout leg |
| Momentum accel. | macdh | 14.34 | Expanding | Thrust still strengthening; first contraction = early warning |
| Overbought check | rsi | 72.39 | Overbought (>70) | Chasing filter, not a short signal; no confirmed divergence |
| Breakout / volatility | boll_ub | 599.15 | Price ~2.4% above | Riding the band; band expansion confirms breakout; ~599 first support |
| Volatility | atr | 25.66 | Elevated (~4.2% of price) | 2×ATR stop ≈ $51; size positions down |
| **Price (verified)** | Close 613.64 | High 624.69 / Low 608.09 | New-high territory | Volume 12.3M on 9/23 (verify; anomaly vs. 44.5M on 9/21) |

**Bottom line:** AMD is in a confirmed strong-uptrend breakout — moving averages stacked bullish, MACD accelerating, Bollinger bands expanding on volume. The correct posture is long-biased but disciplined: don't chase an overbought, band-riding tape; buy the pullback to ~549 (momentum entry) or ~499–506 (swing entry), size to the ~$26 ATR, and treat a daily close below 498–506 as the structural exit. Another agent may add fundamental/news context; this report covers the technicals only.