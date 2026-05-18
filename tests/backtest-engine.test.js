// tests/backtest-engine.test.js

import { runBacktest } from '../js/backtest-engine.js';

const results = document.getElementById('results');

function assert(condition, message) {
    const div = document.createElement('div');
    div.className = condition ? 'pass' : 'fail';
    div.textContent = (condition ? '✓ ' : '✗ ') + message;
    results.appendChild(div);
    if (!condition) console.error('FAIL:', message);
}

// Test 1: No trades when premium stays below threshold
(function testNoTradesBelowThreshold() {
    const data = [
        { time: '09:30', inavChange: 1.0, etfChange: 1.2, premiumDiscount: 0.2 },
        { time: '09:31', inavChange: 1.5, etfChange: 1.8, premiumDiscount: 0.3 },
        { time: '09:32', inavChange: 2.0, etfChange: 2.1, premiumDiscount: 0.1 },
    ];
    const params = { openThreshold: 1.5, closeThreshold: 0.3, stopLoss: 3.0, txCost: 0.2 };
    const trades = runBacktest(data, params);
    assert(trades.length === 0, 'No trades when premium < threshold');
})();

// Test 2: Opens trade when premium exceeds threshold
(function testOpensOnPremium() {
    const data = [
        { time: '09:30', inavChange: 1.0, etfChange: 1.0, premiumDiscount: 0.0 },
        { time: '09:31', inavChange: 1.5, etfChange: 3.2, premiumDiscount: 1.7 },
        { time: '09:32', inavChange: 2.0, etfChange: 2.1, premiumDiscount: 0.1 },
    ];
    const params = { openThreshold: 1.5, closeThreshold: 0.3, stopLoss: 3.0, txCost: 0.2 };
    const trades = runBacktest(data, params);
    assert(trades.length === 1, 'One trade opened on premium > 1.5%');
    assert(trades[0].direction === 'sell_etf_buy_stock', 'Direction: sell ETF when premium');
    assert(trades[0].entryIndex === 1, 'Entry at index 1');
    assert(trades[0].exitIndex === 2, 'Exit at index 2 when premium reverts below close threshold');
})();

// Test 3: Opens trade on discount (negative premium)
(function testOpensOnDiscount() {
    const data = [
        { time: '09:30', inavChange: 2.0, etfChange: 2.0, premiumDiscount: 0.0 },
        { time: '09:31', inavChange: 3.0, etfChange: 1.2, premiumDiscount: -1.8 },
        { time: '09:32', inavChange: 3.5, etfChange: 3.3, premiumDiscount: -0.2 },
    ];
    const params = { openThreshold: 1.5, closeThreshold: 0.3, stopLoss: 3.0, txCost: 0.2 };
    const trades = runBacktest(data, params);
    assert(trades.length === 1, 'One trade opened on discount < -1.5%');
    assert(trades[0].direction === 'buy_etf_sell_stock', 'Direction: buy ETF when discount');
})();

// Test 4: Stop loss triggers
(function testStopLoss() {
    const data = [
        { time: '09:30', inavChange: 0.0, etfChange: 0.0, premiumDiscount: 0.0 },
        { time: '09:31', inavChange: 1.0, etfChange: 2.8, premiumDiscount: 1.8 },
        { time: '09:32', inavChange: 1.5, etfChange: 5.0, premiumDiscount: 3.5 },
        { time: '09:33', inavChange: 2.0, etfChange: 2.1, premiumDiscount: 0.1 },
    ];
    const params = { openThreshold: 1.5, closeThreshold: 0.3, stopLoss: 3.0, txCost: 0.2 };
    const trades = runBacktest(data, params);
    assert(trades.length === 1, 'One trade with stop loss');
    assert(trades[0].exitIndex === 2, 'Exit at index 2 due to stop loss');
    assert(trades[0].exitReason === 'stop_loss', 'Exit reason is stop_loss');
})();

// Test 5: Unclosed trade at end of data
(function testUncloseTradeAtEnd() {
    const data = [
        { time: '09:30', inavChange: 0.0, etfChange: 0.0, premiumDiscount: 0.0 },
        { time: '09:31', inavChange: 1.0, etfChange: 2.8, premiumDiscount: 1.8 },
        { time: '09:32', inavChange: 1.5, etfChange: 3.0, premiumDiscount: 1.5 },
    ];
    const params = { openThreshold: 1.5, closeThreshold: 0.3, stopLoss: 3.0, txCost: 0.2 };
    const trades = runBacktest(data, params);
    assert(trades.length === 1, 'One trade open');
    assert(trades[0].exitIndex === 2, 'Force closed at last index');
    assert(trades[0].exitReason === 'end_of_data', 'Exit reason is end_of_data');
})();
