// tests/conclusion.test.js

import { generateConclusion } from '../js/conclusion.js';

const results = document.getElementById('results');

function assert(condition, message) {
    const div = document.createElement('div');
    div.className = condition ? 'pass' : 'fail';
    div.textContent = (condition ? '✓ ' : '✗ ') + message;
    results.appendChild(div);
    if (!condition) console.error('FAIL:', message);
}

// Test 1: Green light — strong strategy
(function testGreenLight() {
    const stats = {
        sharpeRatio: 2.0,
        winRate: 70,
        maxDrawdown: 5,
        totalReturn: 15,
        totalTrades: 20,
        profitLossRatio: 2.5,
    };
    const conclusion = generateConclusion(stats);
    assert(conclusion.light === 'green', 'Green light for strong stats');
    assert(conclusion.verdict.includes('可行'), 'Verdict says feasible');
})();

// Test 2: Yellow light — mediocre strategy
(function testYellowLight() {
    const stats = {
        sharpeRatio: 1.0,
        winRate: 50,
        maxDrawdown: 12,
        totalReturn: 5,
        totalTrades: 10,
        profitLossRatio: 1.2,
    };
    const conclusion = generateConclusion(stats);
    assert(conclusion.light === 'yellow', 'Yellow light for mediocre stats');
    assert(conclusion.verdict.includes('谨慎'), 'Verdict says cautious');
})();

// Test 3: Red light — poor strategy
(function testRedLight() {
    const stats = {
        sharpeRatio: 0.3,
        winRate: 35,
        maxDrawdown: 25,
        totalReturn: -5,
        totalTrades: 15,
        profitLossRatio: 0.6,
    };
    const conclusion = generateConclusion(stats);
    assert(conclusion.light === 'red', 'Red light for poor stats');
    assert(conclusion.verdict.includes('不建议'), 'Verdict says not recommended');
})();

// Test 4: No trades
(function testNoTrades() {
    const stats = {
        sharpeRatio: 0,
        winRate: 0,
        maxDrawdown: 0,
        totalReturn: 0,
        totalTrades: 0,
        profitLossRatio: 0,
    };
    const conclusion = generateConclusion(stats);
    assert(conclusion.light === 'red', 'Red light for no trades');
    assert(conclusion.verdict.includes('无交易'), 'Verdict mentions no trades');
})();

// Test 5: Risks array is non-empty
(function testRisksPresent() {
    const stats = {
        sharpeRatio: 1.0,
        winRate: 55,
        maxDrawdown: 15,
        totalReturn: 8,
        totalTrades: 12,
        profitLossRatio: 1.5,
    };
    const conclusion = generateConclusion(stats);
    assert(conclusion.risks.length > 0, 'At least one risk identified');
})();
