# HK ETF 2x Long Hynix vs SK Hynix Cross-Market Arbitrage

## Overview

A backtesting tool for cross-market arbitrage between a Hong Kong-listed 2x leveraged long SK Hynix ETF and SK Hynix stock on the Korean market. The tool helps validate whether the strategy is profitable given historical data.

## Strategy

### Core Logic

1. **Premium/Discount Reversion** — When the ETF market price deviates from its theoretical value (iNAV), trade the spread:
   - ETF underperforms iNAV (discount) → Buy ETF + Sell Hynix stock
   - ETF outperforms iNAV (premium) → Sell ETF + Buy Hynix stock

2. **Time-Zone Arbitrage** — Exploit trading time differences across three venues:
   - Korean KRX Main Board: 08:00-14:30 (UTC+8)
   - Next Trade Platform: 07:00-19:00 (UTC+8)
   - Hong Kong ETF: 09:30-16:10 (UTC+8, lunch break 12:00-13:00)

### User's Edge

The user already holds a large position in SK Hynix stock, making the sell-side immediately executable.

## Input Indicators

### Mode A: With iNAV Data

| Indicator | Formula | Description |
|-----------|---------|-------------|
| iNAV Change (%) | `(iNAV_current - iNAV_prev) / iNAV_prev × 100` | ETF theoretical value change (includes 2x leverage + FX + fees) |
| ETF Market Price Change (%) | `(ETF_price_current - ETF_price_prev) / ETF_price_prev × 100` | Actual ETF trading price change on HKEX |
| Premium/Discount Rate (%) | `(ETF_price - iNAV) / iNAV × 100` | Positive = premium (ETF expensive), Negative = discount (ETF cheap) |

### Mode B: Without iNAV Data (Self-Calculated)

| Indicator | Formula | Description |
|-----------|---------|-------------|
| Hynix Stock Change (%) | `(Hynix_current - Hynix_prev) / Hynix_prev × 100` | SK Hynix stock price change (KRX or Next Trade) |
| FX Change (%) | `(KRWHKD_current - KRWHKD_prev) / KRWHKD_prev × 100` | KRW/HKD exchange rate change |
| ETF Market Price Change (%) | `(ETF_price_current - ETF_price_prev) / ETF_price_prev × 100` | Actual ETF trading price change on HKEX |

In Mode B, the system synthesizes iNAV:
```
Synthetic iNAV Change = Hynix Change × 2 + FX Change (approximate)
Premium/Discount = ETF Market Price Change - Synthetic iNAV Change
```

### Relationship Between Indicators

```
SK Hynix Price Change
        │
        ▼ (× 2 leverage + FX conversion + fees)
      iNAV  ← ETF theoretical value (calculated by issuer)
        │
        ▼ compare
   ETF Market Price ← actual trading price
        │
        ▼
  Difference = Arbitrage Signal
```

## Backtesting Tool Design

### Technology

Pure frontend static HTML/JS page. No backend required. Open and use immediately.

### Page Layout: Single-Page Multi-Block (Top to Bottom)

#### Block 1: Indicator Guide

- Collapsible panel showing calculation formulas for each input indicator
- Data source guidance (Bloomberg fields reference)
- Helps users process raw Bloomberg data before input

#### Block 2: Data Input

- Mode switch (Radio): "With iNAV" / "Without iNAV"
- Editable table format, one row per time point
- Columns adapt based on mode selection
- Each row: Time Label (optional) + indicator values
- Add/delete row buttons

#### Block 3: Strategy Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| Open Threshold (%) | Premium/discount rate to trigger entry | 1.5% |
| Close Threshold (%) | Spread reversion level to exit | 0.3% |
| Stop Loss (%) | Maximum loss per trade | 3.0% |
| Transaction Cost (%) | One-way fee rate (commission + stamp duty) | 0.2% |
| Position Size | Amount per trade (HKD) | 100,000 |

#### Block 4: Backtest Results

**Statistics Panel:**
- Total Return (%)
- Maximum Drawdown (%)
- Win Rate (%)
- Profit/Loss Ratio
- Sharpe Ratio
- Number of Trades

**Charts:**
- Cumulative return curve
- Premium/discount rate trend (with entry/exit markers)
- Per-trade P&L distribution histogram

**Trade Log Table:**
- Entry time, exit time, direction, premium rate at entry, premium rate at exit, P&L

#### Block 5: Feasibility Conclusion

- Auto-generated text conclusion
- Traffic light rating (Red/Yellow/Green):
  - Green: Sharpe > 1.5, Win Rate > 60%, Max Drawdown < 10%
  - Yellow: Sharpe 0.5-1.5 or Win Rate 40-60%
  - Red: Sharpe < 0.5 or Max Drawdown > 20%
- Key risk factors identified
- Suggested optimal threshold based on data

## Trading Time Windows

| Window | Time (UTC+8) | Markets Active | Arbitrage Opportunity |
|--------|-------------|----------------|----------------------|
| A | 07:00-09:30 | Next Trade only | Hynix moves, HK ETF hasn't opened yet |
| B | 09:30-14:30 | All three | Real-time spread monitoring |
| C | 14:30-16:10 | HK ETF + Next Trade | KRX closed, ETF may lag or lead |
| D | 16:10-19:00 | Next Trade only | Post-HK session, position for next day |

## Risks & Considerations

1. **Leverage Decay** — 2x daily leverage compounds negatively over time; holding period matters
2. **FX Risk** — KRW/HKD movements can erode or amplify spreads
3. **Liquidity Risk** — ETF bid-ask spread may be wide during off-peak hours
4. **Execution Risk** — Time lag between two markets when executing both legs
5. **Next Trade Data Availability** — Bloomberg coverage of Next Trade platform needs verification

## V2 Strategy Enhancement: 14:30-16:10 Shadow iNAV Window

### Background

- KRX main board closes at 14:30 → iNAV (7709IV HK Equity) stops updating
- HK ETF continues trading until 16:10
- SK Hynix continues trading on Next Trade platform until 19:00
- Between 14:30-16:10, most participants lose their iNAV reference

### Shadow iNAV Logic

After 14:30, calculate a "shadow iNAV" using Next Trade Hynix price:
```
Shadow iNAV = Frozen iNAV × (1 + Next Trade Hynix change since 14:30 × 2 + FX change)
```

Compare shadow iNAV to ETF market price → information asymmetry = larger arbitrage opportunity.

### Position Management (No Close, Only Rebalance)

This is a hedged strategy, not directional:
- Always maintain: ETF position change = -Stock position change
- When premium appears: Buy more ETF + Sell equivalent stock
- When discount appears: Sell ETF + Buy equivalent stock
- No "close" concept — only rebalancing to capture spread

### V2 Backtest Changes Needed

1. Replace open/close with rebalance model (accumulate spread P&L)
2. Add 14:30 cutoff: switch from real iNAV to shadow iNAV
3. Integrate Next Trade as data source for post-14:30 Hynix price
4. Track cumulative hedge-adjusted P&L instead of per-trade P&L

## Data Source: Bloomberg

Key fields to export:
- ETF: `PX_LAST`, `NAV`, `PX_BID`, `PX_ASK`, `VOLUME`
- ETF iNAV: `7709IV HK Equity` → `PX_LAST` (via TICK → Quote, 1 Min interval)
- ETF Previous Close: `7709 HK Equity` → `PX_YEST_CLOSE`
- iNAV Previous Close: `7709IV HK Equity` → `PX_YEST_CLOSE`
- SK Hynix (000660 KS): `PX_LAST`, `PX_BID`, `PX_ASK`, `VOLUME`
- FX: `KRWHKD Curncy` → `PX_LAST`
