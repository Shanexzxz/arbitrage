// tests/statistics.test.js

import { calculateStatistics } from '../js/statistics.js';

const results = document.getElementById('results');

function assert(condition, message) {
    const div = document.createElement('div');
    div.className = condition ? 'pass' : 'fail';
    div.textContent = (condition ? '✓ ' : '✗ ') + message;
    results.appendChild(div);
    if (!condition) console.error('FAIL:', message);
}

function approxEqual(a, b, tolerance = 0.01) {
    return Math.abs(a - b) < tolerance;
}

// Test 1: Basic statistics from trade list
(function testBasicStats() {
    const trades = [
        { pnl: 1.2 },
        { pnl: -0.5 },
        { pnl: 0.8 },
        { pnl: 1.5 },
        { pnl: -0.3 },
    ];
    const stats = calculateStatistics(trades);

    assert(stats.totalTrades === 5, 'Total trades = 5');
    assert(stats.winCount === 3, 'Win count = 3');
    assert(approxEqual(stats.winRate, 60), 'Win rate = 60%');
    assert(approxEqual(stats.totalReturn, 2.7), 'Total return = 2.7%');
})();

// Test 2: Max drawdown calculation
(function testMaxDrawdown() {
    const trades = [
        { pnl: 2.0 },
        { pnl: -1.0 },
        { pnl: -1.5 },
        { pnl: 3.0 },
    ];
    const stats = calculateStatistics(trades);
    // Cumulative: 2.0, 1.0, -0.5, 2.5
    // Peak at 2.0, trough at -0.5, drawdown = 2.5
    assert(approxEqual(stats.maxDrawdown, 2.5), 'Max drawdown = 2.5%');
})();

// Test 3: Profit/Loss ratio
(function testProfitLossRatio() {
    const trades = [
        { pnl: 2.0 },
        { pnl: 3.0 },
        { pnl: -1.0 },
    ];
    const stats = calculateStatistics(trades);
    // Avg win = 2.5, Avg loss = 1.0, ratio = 2.5
    assert(approxEqual(stats.profitLossRatio, 2.5), 'Profit/Loss ratio = 2.5');
})();

// Test 4: Empty trades
(function testEmptyTrades() {
    const stats = calculateStatistics([]);
    assert(stats.totalTrades === 0, 'Zero trades');
    assert(stats.totalReturn === 0, 'Zero return');
    assert(stats.maxDrawdown === 0, 'Zero drawdown');
    assert(stats.winRate === 0, 'Zero win rate');
    assert(stats.sharpeRatio === 0, 'Zero Sharpe');
})();

// Test 5: Sharpe ratio
(function testSharpe() {
    const trades = [
        { pnl: 1.0 },
        { pnl: 1.0 },
        { pnl: 1.0 },
        { pnl: 1.0 },
    ];
    const stats = calculateStatistics(trades);
    // All same return → std = 0 → Sharpe = Infinity or capped
    // We cap at 99 when std is 0
    assert(stats.sharpeRatio > 10, 'Sharpe very high when no variance');
})();
