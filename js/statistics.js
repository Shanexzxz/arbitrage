// js/statistics.js

/**
 * Statistics for the position-swap arbitrage strategy.
 *
 * Why so few metrics?
 *   The策略 fires only when |premium| ≥ threshold AND immediately locks in
 *   |premium| − swapCost as realized PnL (delta-neutral, no holding period,
 *   no exit). Several traditional metrics therefore degenerate:
 *
 *     - Win rate    → ~100% by construction (a swap "wins" iff |premium| >
 *                     swapCost, which is a precondition for triggering).
 *     - Max drawdown → 0 (equity curve is monotonically non-decreasing).
 *     - Profit/loss ratio → undefined (no losing trades).
 *     - Sharpe ratio → degrades into "spread of locked-in opportunity sizes",
 *                      which is not a risk-adjusted return.
 *
 *   We therefore drop those and report only the metrics that carry meaning
 *   for this strategy.
 *
 * Inputs:  trades = [{ pnl }]  where pnl is the per-swap netProfit (%).
 * Output:  flat object with the following fields used by conclusion.js
 *          and the UI:
 *
 *   totalTrades   number of swaps
 *   totalReturn   sum of net PnL (%)
 *   avgWin        mean per-swap net PnL (%)
 *   bestTrade     largest single-swap net PnL (%)
 *   worstTrade    smallest single-swap net PnL (%)
 */
export function calculateStatistics(trades) {
    if (trades.length === 0) {
        return {
            totalTrades: 0,
            totalReturn: 0,
            avgWin: 0,
            bestTrade: 0,
            worstTrade: 0,
        };
    }

    const pnls = trades.map(t => t.pnl);
    const totalTrades = trades.length;
    const totalReturn = pnls.reduce((s, p) => s + p, 0);
    const avgWin = totalReturn / totalTrades;
    const bestTrade = Math.max(...pnls);
    const worstTrade = Math.min(...pnls);

    return {
        totalTrades,
        totalReturn,
        avgWin,
        bestTrade,
        worstTrade,
    };
}
