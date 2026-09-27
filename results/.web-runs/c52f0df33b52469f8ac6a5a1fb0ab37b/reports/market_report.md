# AVGO (Broadcom Inc.) — Technical Analysis Report
**Analysis date: 2026-09-25 | Exchange: NMS | Sector: Technology / Semiconductors**

## 1. Indicator Selection Rationale

I selected **eight complementary indicators** spanning trend, momentum, volatility, and volume, deliberately avoiding redundancy (e.g., only one of the MACD family, only one momentum oscillator):

| # | Indicator | Role in this analysis |
|---|---|---|
| 1 | `close_50_sma` | Medium-term trend direction & dynamic resistance (falling hard, converging on the 200-day) |
| 2 | `close_200_sma` | Long-term trend benchmark; death-cross setup watch |
| 3 | `close_10_ema` | Responsive short-term trigger / near-term resistance on bounce attempts |
| 4 | `macd` | Momentum trend + crossover status (recently crossed back above signal) |
| 5 | `rsi` | Overbought/oversold context; recent oversold recovery |
| 6 | `boll` (middle) | Dynamic band benchmark; plus upper/lower bands from the verified snapshot |
| 7 | `atr` | Volatility regime for stop-loss & position sizing |
| 8 | `vwma` | Volume-weighted trend confirmation (is the move backed by volume?) |

This set gives trend (two SMAs + EMA), momentum (MACD + RSI), volatility (ATR + Bollinger), and volume (VWMA) without duplicating — e.g., I took only the MACD line (not `macds`/`macdh`, which are derivable from it and the snapshot), and only the Bollinger middle (upper/lower bands are directly available in the verified snapshot).

## 2. Market Context: A Persistent Multi-Month Downtrend

AVGO has been in a **sustained downtrend** since early June. From the June 2 close of **$479.94**, price fell to an intraday low of **$335.20 on 2026-09-16** (closing low **$338.65 on 09-15**), a drawdown of roughly **–29%**. The drop was front-loaded: the June 3→June 4 session saw a one-day collapse from **$477.60 to $417.49** (≈ –12.6%), and selling has persisted in stair-step fashion ever since.

Key structural facts as of the latest verified row (2026-09-25, close **$352.81**):

- **Price is below every major moving average** — the 10 EMA (**$354.72**), the 200 SMA (**$367.04**), and the 50 SMA (**$376.01**). This is the classic "bearish alignment" for short-, medium-, and long-term trend.
- **Lower highs and lower lows are intact**: Aug 5–7 rally peaked ≈ **$427**; Aug 14 close **$392**; Sept 22 rebound high **$364.54**; Sept 15–16 swing low ≈ **$338**.
- **The 50 SMA is collapsing toward the 200 SMA.** The 50 SMA has fallen from **$397.62 on 07-27** to **$376.01 on 09-25**, while the 200 SMA is essentially flat (roughly **$367**). The gap has narrowed from ~$34 to just **$9** in two months, **setting up a potential "death cross"** if downside pressure persists. This is not yet triggered — the 50 SMA remains above the 200 SMA — but the convergence is a key forward risk.

## 3. Momentum & Oscillator Read — Early, Unconfirmed Stabilization

- **MACD**: The line is still deeply negative at **–6.26**, but it has **risen sharply off its 09-17 low of –10.52**. Against the signal line (snapshot `macds` = **–7.48**), the MACD has **crossed back above signal**, producing a **positive histogram of +1.22**. This is a near-term momentum-improvement signal, but it occurred *below the zero line*, so it is a *counter-trend* improvement rather than evidence of an uptrend.
- **RSI**: At **44.04**, RSI is neutral — it recovered from an oversold reading of **~32.2 on 09-15 / 32.5 on 09-16** and is now mid-range. Note that RSI did **not** print a bullish divergence at the September low (the 09-15/16 RSI trough was a lower low vs. the late-August ~34.3 trough), so the bounce is not yet divergence-confirmed.
- **VWMA**: At **$354.88**, it sits just above price and essentially co-located with the 10 EMA, confirming the recent rebound has **not been volume-supported** (price closed below its volume-weighted average).

## 4. Volatility & Volume Context

- **ATR** is **$10.93** (≈ **3.1% of price**), down sharply from **$16–17 in early August**. Volatility is compressing even as price grinds lower — a condition that often precedes a directional resolution.
- **Bollinger Bands** (snapshot): middle **$357.54**, upper **$377.01**, lower **$338.08**. Price ($352.81) is trading **in the lower half of the band**, below the middle but above the lower band. The band upper ($377) closely coincides with the 50 SMA ($376), creating a dense **resistance zone around $367–$377**.
- **Volume**: The rally attempts are showing declining conviction — daily volume tapered from **44.0M on 09-18** to **16.2M on 09-25** as price faded from the $364.54 (09-22) bounce high. Downside legs (e.g., 09-03 at 60.2M, 09-14 at 32.7M) carried more churn than the rebound days.

## 5. Key Levels to Watch (derived from verified data)

| Level type | Price | Basis |
|---|---|---|
| **Support zone** | **$335–$338** | 09-15/16 swing lows ($338.89/$338.65 closes; $335.20 intraday) + Bollinger lower band $338.08 |
| **Near-term resistance** | **$354.7–$357.5** | 10 EMA $354.72 / VWMA $354.88 / Bollinger middle $357.54 — capped the 09-23→09-25 bounce |
| **Major resistance 1** | **$367** | 200 SMA + rounding |
| **Major resistance 2** | **$376–$377** | 50 SMA $376.01 + Bollinger upper $377.01 |

## 6. Actionable Interpretation

1. **Primary trend is DOWN** — price below all three moving averages with lower highs/lows. Counter-trend longs are tactically justified only near the $335–$338 support, and even then the reward is capped near $367–$377.
2. **The bounce is fading at the 10 EMA/VWMA cluster ($354.7–$354.9).** A daily close back above ~$357.5 (Bollinger middle) would be the first sign the stabilization is gaining traction; until then, rallies into $354–$358 are candidate short/re-fade zones while the broader downtrend holds.
3. **The MACD's fresh bullish crossover is a heads-up, not a buy signal** — it is below zero and not corroborated by volume (VWMA still above price). Treat it as a trigger to *reduce* bearish conviction only on confirmation (e.g., a close above the 10 EMA and then the 200 SMA at $367).
4. **A death-cross is brewing** (50 SMA converging on the 200 SMA from above). A confirmed cross below $367 in the 50 SMA would add another layer of bearish confirmation for the medium term.
5. **Risk management**: with ATR ≈ **$10.93**, a standard 2×ATR stop on a position entered near $352.81 would sit around **$331** (just under the $335–$338 support), and a 1×ATR stop ≈ **$342**. Position sizing should account for the still-lower-band environment until volatility (ATR) shows signs of expansion again.

---

## Key Points Summary

| Dimension | Current Read (2026-09-25) | Implication |
|---|---|---|
| Price (verified) | **$352.81** close | Below all major MAs → bearish alignment |
| 10 EMA | $354.72 (price just below) | Capping recent bounce; near-term trigger level |
| 50 SMA | $376.01 (falling fast) | Dynamic resistance; converging with 200 SMA |
| 200 SMA | $367.04 (flat) | Long-term trend floor overhead; death-cross watch |
| MACD / Signal / Hist | –6.26 / –7.48 / **+1.22** | Sub-zero bullish cross → early stabilization only |
| RSI (14) | **44.04** | Neutral; recovered from oversold ~32 (09-15/16), no bull divergence |
| Bollinger | mid $357.54 / upper $377.01 / lower $338.08 | Price in lower half; lower band aligns with support |
| ATR | **$10.93** (~3.1%) | Volatility compressing → stops ~$331–$342 on a 1–2×ATR basis |
| VWMA | $354.88 (> price) | Rebound not volume-confirmed |
| Support | **$335–$338** | Sep 15–16 lows + Bollinger lower band |
| Resistance | **$354.7–$357.5**, then **$367**, then **$376–$377** | Bollinger mid/10EMA/VWMA cluster first, then 200 SMA, then 50 SMA/upper band |

**Net assessment: Downtrend intact with tentative, volume-light stabilization. Favor downside-fade of rallies into $354–$358 unless/until price reclaims $357.5 (Bollinger middle) and then $367 (200 SMA) on rising volume; short-term support is at the $335–$338 floor.**