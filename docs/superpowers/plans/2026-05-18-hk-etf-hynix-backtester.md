# HK ETF Hynix Arbitrage Backtester Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure frontend backtesting tool that validates cross-market arbitrage between a HK 2x leveraged Hynix ETF and SK Hynix stock.

**Architecture:** Single HTML page with vanilla JS. All computation runs client-side. Chart.js for visualizations. CSS Grid for layout. No build tools, no framework — open and use immediately.

**Tech Stack:** HTML5, Vanilla JavaScript (ES modules), Chart.js (CDN), CSS3

---

## File Structure

```
arbitrage/
├── index.html              # Main entry point, page layout structure
├── css/
│   └── style.css           # All styles (grid layout, cards, tables, forms)
├── js/
│   ├── main.js             # App initialization, event wiring, mode switching
│   ├── data-input.js       # Table rendering, row add/delete, data parsing
│   ├── backtest-engine.js  # Core backtest logic: signal detection, trade simulation
│   ├── statistics.js       # Calculate metrics: return, drawdown, Sharpe, win rate
│   ├── charts.js           # Chart.js rendering: equity curve, premium chart, P&L histogram
│   └── conclusion.js       # Generate feasibility verdict (green/yellow/red)
├── tests/
│   ├── test-runner.html    # In-browser test runner page
│   ├── backtest-engine.test.js
│   ├── statistics.test.js
│   └── conclusion.test.js
└── docs/
    └── superpowers/
        ├── specs/...
        └── plans/...
```

**Responsibilities:**
- `data-input.js` — manages the editable table UI, mode switching (iNAV / no-iNAV), parses user input into a normalized data array
- `backtest-engine.js` — takes normalized data + strategy params → produces trade list (entry/exit times, directions, P&L)
- `statistics.js` — takes trade list → produces metrics object (return, drawdown, Sharpe, win rate, profit/loss ratio)
- `charts.js` — takes trade list + data array → renders Chart.js canvases
- `conclusion.js` — takes metrics object → produces verdict text and traffic light color

---

## Task 1: Project Skeleton & HTML Layout

**Files:**
- Create: `index.html`
- Create: `css/style.css`

- [ ] **Step 1: Create index.html with all 5 blocks**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HK ETF Hynix Arbitrage Backtester</title>
    <link rel="stylesheet" href="css/style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
    <header>
        <h1>港股2倍做多海力士 ETF 套利回测</h1>
        <p class="subtitle">HK 2x Long Hynix ETF vs SK Hynix Cross-Market Arbitrage</p>
    </header>

    <main>
        <!-- Block 1: Indicator Guide -->
        <section id="indicator-guide" class="block">
            <h2>
                <button class="collapse-toggle" aria-expanded="false" aria-controls="guide-content">
                    指标计算说明 ▶
                </button>
            </h2>
            <div id="guide-content" class="collapsible hidden">
                <div class="guide-grid">
                    <div class="guide-card">
                        <h3>模式A：有 iNAV 数据</h3>
                        <table class="formula-table">
                            <thead><tr><th>指标</th><th>公式</th><th>说明</th></tr></thead>
                            <tbody>
                                <tr>
                                    <td>iNAV涨跌幅(%)</td>
                                    <td><code>(iNAV当前 - iNAV前值) / iNAV前值 × 100</code></td>
                                    <td>ETF理论价值变动（含2倍杠杆+汇率+费用）</td>
                                </tr>
                                <tr>
                                    <td>ETF市价涨跌幅(%)</td>
                                    <td><code>(ETF市价当前 - ETF市价前值) / ETF市价前值 × 100</code></td>
                                    <td>港股ETF实际交易涨跌</td>
                                </tr>
                                <tr>
                                    <td>溢价/折价率(%)</td>
                                    <td><code>(ETF市价 - iNAV) / iNAV × 100</code></td>
                                    <td>正=溢价(ETF贵), 负=折价(ETF便宜)</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="guide-card">
                        <h3>模式B：无 iNAV（自行计算）</h3>
                        <table class="formula-table">
                            <thead><tr><th>指标</th><th>公式</th><th>说明</th></tr></thead>
                            <tbody>
                                <tr>
                                    <td>海力士涨跌幅(%)</td>
                                    <td><code>(海力士当前 - 海力士前值) / 海力士前值 × 100</code></td>
                                    <td>SK海力士正股涨跌（KRX或Next Trade）</td>
                                </tr>
                                <tr>
                                    <td>汇率变动(%)</td>
                                    <td><code>(KRW/HKD当前 - KRW/HKD前值) / KRW/HKD前值 × 100</code></td>
                                    <td>韩元兑港币汇率变动</td>
                                </tr>
                                <tr>
                                    <td>ETF市价涨跌幅(%)</td>
                                    <td><code>(ETF市价当前 - ETF市价前值) / ETF市价前值 × 100</code></td>
                                    <td>港股ETF实际交易涨跌</td>
                                </tr>
                            </tbody>
                        </table>
                        <p class="note">系统将合成iNAV: 合成iNAV涨跌幅 = 海力士涨跌幅 × 2 + 汇率变动</p>
                    </div>
                    <div class="guide-card full-width">
                        <h3>Bloomberg 数据源参考</h3>
                        <ul>
                            <li>ETF: <code>PX_LAST</code>, <code>NAV</code>, <code>RT_INAV</code></li>
                            <li>SK Hynix (000660 KS): <code>PX_LAST</code></li>
                            <li>汇率: <code>KRWHKD Curncy</code> → <code>PX_LAST</code></li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>

        <!-- Block 2: Data Input -->
        <section id="data-input" class="block">
            <h2>数据输入</h2>
            <div class="mode-switch">
                <label><input type="radio" name="input-mode" value="inav" checked> 模式A：有 iNAV 数据</label>
                <label><input type="radio" name="input-mode" value="no-inav"> 模式B：无 iNAV（自行计算）</label>
            </div>
            <div id="data-table-container"></div>
            <div class="table-actions">
                <button id="add-row-btn" class="btn btn-secondary">+ 添加行</button>
                <button id="delete-row-btn" class="btn btn-danger">- 删除末行</button>
                <button id="clear-all-btn" class="btn btn-danger">清空全部</button>
            </div>
        </section>

        <!-- Block 3: Strategy Parameters -->
        <section id="strategy-params" class="block">
            <h2>策略参数</h2>
            <div class="params-grid">
                <div class="param-item">
                    <label for="open-threshold">开仓阈值 (%)</label>
                    <input type="number" id="open-threshold" value="1.5" step="0.1" min="0">
                    <span class="hint">溢价/折价率达到此值时触发开仓</span>
                </div>
                <div class="param-item">
                    <label for="close-threshold">平仓阈值 (%)</label>
                    <input type="number" id="close-threshold" value="0.3" step="0.1" min="0">
                    <span class="hint">价差回归至此值时平仓</span>
                </div>
                <div class="param-item">
                    <label for="stop-loss">止损线 (%)</label>
                    <input type="number" id="stop-loss" value="3.0" step="0.1" min="0">
                    <span class="hint">单笔最大亏损</span>
                </div>
                <div class="param-item">
                    <label for="tx-cost">交易成本 (%)</label>
                    <input type="number" id="tx-cost" value="0.2" step="0.01" min="0">
                    <span class="hint">单边费率（佣金+印花税）</span>
                </div>
                <div class="param-item">
                    <label for="position-size">仓位大小 (HKD)</label>
                    <input type="number" id="position-size" value="100000" step="10000" min="0">
                    <span class="hint">每次开仓金额</span>
                </div>
            </div>
        </section>

        <!-- Run Button -->
        <div class="run-section">
            <button id="run-backtest-btn" class="btn btn-primary btn-large">运行回测</button>
        </div>

        <!-- Block 4: Backtest Results -->
        <section id="backtest-results" class="block hidden">
            <h2>回测结果</h2>
            <div id="stats-panel" class="stats-grid"></div>
            <div class="charts-container">
                <div class="chart-wrapper"><canvas id="equity-chart"></canvas></div>
                <div class="chart-wrapper"><canvas id="premium-chart"></canvas></div>
                <div class="chart-wrapper"><canvas id="pnl-chart"></canvas></div>
            </div>
            <div id="trade-log-container"></div>
        </section>

        <!-- Block 5: Feasibility Conclusion -->
        <section id="conclusion" class="block hidden">
            <h2>可行性结论</h2>
            <div id="traffic-light"></div>
            <div id="conclusion-text"></div>
        </section>
    </main>

    <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create css/style.css with layout and component styles**

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

:root {
    --color-primary: #2563eb;
    --color-danger: #dc2626;
    --color-success: #16a34a;
    --color-warning: #ca8a04;
    --color-bg: #f8fafc;
    --color-card: #ffffff;
    --color-border: #e2e8f0;
    --color-text: #1e293b;
    --color-text-muted: #64748b;
    --radius: 8px;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--color-bg);
    color: var(--color-text);
    line-height: 1.6;
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
}

header {
    text-align: center;
    margin-bottom: 2rem;
}

header h1 {
    font-size: 1.75rem;
    margin-bottom: 0.25rem;
}

.subtitle {
    color: var(--color-text-muted);
    font-size: 0.9rem;
}

.block {
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 1.5rem;
    margin-bottom: 1.5rem;
}

.block h2 {
    font-size: 1.25rem;
    margin-bottom: 1rem;
}

.hidden {
    display: none;
}

/* Collapse Toggle */
.collapse-toggle {
    background: none;
    border: none;
    font-size: 1.25rem;
    font-weight: bold;
    cursor: pointer;
    color: var(--color-text);
}

/* Guide Grid */
.guide-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
}

.guide-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 1rem;
}

.guide-card.full-width {
    grid-column: 1 / -1;
}

.formula-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    margin-top: 0.5rem;
}

.formula-table th,
.formula-table td {
    border: 1px solid var(--color-border);
    padding: 0.4rem 0.6rem;
    text-align: left;
}

.formula-table th {
    background: var(--color-bg);
}

.formula-table code {
    background: #f1f5f9;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.8rem;
}

.note {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: var(--color-text-muted);
    font-style: italic;
}

/* Mode Switch */
.mode-switch {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 1rem;
}

.mode-switch label {
    cursor: pointer;
    font-size: 0.9rem;
}

/* Data Table */
#data-table-container table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
}

#data-table-container th,
#data-table-container td {
    border: 1px solid var(--color-border);
    padding: 0.4rem;
    text-align: center;
}

#data-table-container th {
    background: var(--color-bg);
    font-weight: 600;
}

#data-table-container input {
    width: 100%;
    border: none;
    text-align: center;
    padding: 0.2rem;
    font-size: 0.85rem;
}

.table-actions {
    margin-top: 0.75rem;
    display: flex;
    gap: 0.5rem;
}

/* Params Grid */
.params-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
}

.param-item label {
    display: block;
    font-weight: 600;
    font-size: 0.85rem;
    margin-bottom: 0.25rem;
}

.param-item input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    font-size: 0.9rem;
}

.param-item .hint {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: 0.25rem;
}

/* Buttons */
.btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
}

.btn-primary {
    background: var(--color-primary);
    color: white;
}

.btn-secondary {
    background: #e2e8f0;
    color: var(--color-text);
}

.btn-danger {
    background: #fee2e2;
    color: var(--color-danger);
}

.btn-large {
    padding: 0.75rem 2rem;
    font-size: 1rem;
}

.run-section {
    text-align: center;
    margin-bottom: 1.5rem;
}

/* Stats Grid */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.stat-card {
    text-align: center;
    padding: 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
}

.stat-card .value {
    font-size: 1.5rem;
    font-weight: 700;
}

.stat-card .label {
    font-size: 0.8rem;
    color: var(--color-text-muted);
}

/* Charts */
.charts-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.chart-wrapper {
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 1rem;
}

.chart-wrapper:first-child {
    grid-column: 1 / -1;
}

/* Trade Log */
#trade-log-container table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
}

#trade-log-container th,
#trade-log-container td {
    border: 1px solid var(--color-border);
    padding: 0.4rem 0.6rem;
    text-align: center;
}

#trade-log-container th {
    background: var(--color-bg);
}

/* Traffic Light */
#traffic-light {
    text-align: center;
    margin-bottom: 1rem;
}

.light {
    display: inline-block;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    margin: 0 0.5rem;
    opacity: 0.2;
}

.light.active {
    opacity: 1;
    box-shadow: 0 0 12px currentColor;
}

.light.red { background: var(--color-danger); color: var(--color-danger); }
.light.yellow { background: var(--color-warning); color: var(--color-warning); }
.light.green { background: var(--color-success); color: var(--color-success); }

#conclusion-text {
    padding: 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    line-height: 1.8;
}
```

- [ ] **Step 3: Open index.html in browser, verify layout renders**

Open `index.html` in a browser. Verify:
- Header shows title
- All 5 blocks are visible (results and conclusion hidden initially)
- Indicator guide collapse button visible
- Mode switch radio buttons rendered
- Parameter inputs rendered with defaults

- [ ] **Step 4: Commit**

```bash
git add index.html css/style.css
git commit -m "feat: add project skeleton with HTML layout and CSS styles"
```

---

## Task 2: Data Input Module

**Files:**
- Create: `js/data-input.js`
- Create: `js/main.js`

- [ ] **Step 1: Create js/data-input.js**

```javascript
// js/data-input.js

const COLUMNS_INAV = [
    { key: 'time', label: '时间', type: 'text', placeholder: 'e.g. 09:30' },
    { key: 'inavChange', label: 'iNAV涨跌幅(%)', type: 'number', placeholder: '0.00' },
    { key: 'etfChange', label: 'ETF市价涨跌幅(%)', type: 'number', placeholder: '0.00' },
];

const COLUMNS_NO_INAV = [
    { key: 'time', label: '时间', type: 'text', placeholder: 'e.g. 09:30' },
    { key: 'hynixChange', label: '海力士涨跌幅(%)', type: 'number', placeholder: '0.00' },
    { key: 'fxChange', label: '汇率变动(%)', type: 'number', placeholder: '0.00' },
    { key: 'etfChange', label: 'ETF市价涨跌幅(%)', type: 'number', placeholder: '0.00' },
];

const DEFAULT_ROW_COUNT = 5;

export function getColumns(mode) {
    return mode === 'inav' ? COLUMNS_INAV : COLUMNS_NO_INAV;
}

export function renderTable(container, mode) {
    const columns = getColumns(mode);
    const html = `
        <table>
            <thead>
                <tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr>
            </thead>
            <tbody id="data-tbody">
                ${generateRows(columns, DEFAULT_ROW_COUNT)}
            </tbody>
        </table>
    `;
    container.innerHTML = html;
}

function generateRows(columns, count) {
    let rows = '';
    for (let i = 0; i < count; i++) {
        rows += generateRow(columns);
    }
    return rows;
}

function generateRow(columns) {
    const cells = columns.map(c =>
        `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="0.01"></td>`
    ).join('');
    return `<tr>${cells}</tr>`;
}

export function addRow(mode) {
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return;
    const columns = getColumns(mode);
    tbody.insertAdjacentHTML('beforeend', generateRow(columns));
}

export function deleteLastRow() {
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    if (rows.length > 1) {
        rows[rows.length - 1].remove();
    }
}

export function clearAll(mode) {
    const container = document.getElementById('data-table-container');
    if (container) {
        renderTable(container, mode);
    }
}

export function parseData(mode) {
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return [];

    const columns = getColumns(mode);
    const rows = tbody.querySelectorAll('tr');
    const data = [];

    for (const row of rows) {
        const inputs = row.querySelectorAll('input');
        const entry = {};
        let hasValue = false;

        inputs.forEach((input, i) => {
            const key = columns[i].key;
            if (columns[i].type === 'number') {
                const val = parseFloat(input.value);
                entry[key] = isNaN(val) ? null : val;
                if (!isNaN(val)) hasValue = true;
            } else {
                entry[key] = input.value.trim();
            }
        });

        if (hasValue) {
            // Mode B: synthesize premium/discount
            if (mode === 'no-inav' && entry.hynixChange !== null && entry.fxChange !== null && entry.etfChange !== null) {
                const syntheticInav = entry.hynixChange * 2 + entry.fxChange;
                entry.inavChange = syntheticInav;
                entry.premiumDiscount = entry.etfChange - syntheticInav;
            }
            // Mode A: calculate premium/discount
            if (mode === 'inav' && entry.inavChange !== null && entry.etfChange !== null) {
                entry.premiumDiscount = entry.etfChange - entry.inavChange;
            }
            data.push(entry);
        }
    }

    return data;
}
```

- [ ] **Step 2: Create js/main.js**

```javascript
// js/main.js

import { renderTable, addRow, deleteLastRow, clearAll, parseData } from './data-input.js';

function getCurrentMode() {
    const checked = document.querySelector('input[name="input-mode"]:checked');
    return checked ? checked.value : 'inav';
}

function init() {
    const container = document.getElementById('data-table-container');
    const mode = getCurrentMode();

    // Initial render
    renderTable(container, mode);

    // Mode switch
    document.querySelectorAll('input[name="input-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            renderTable(container, getCurrentMode());
        });
    });

    // Table action buttons
    document.getElementById('add-row-btn').addEventListener('click', () => {
        addRow(getCurrentMode());
    });

    document.getElementById('delete-row-btn').addEventListener('click', () => {
        deleteLastRow();
    });

    document.getElementById('clear-all-btn').addEventListener('click', () => {
        if (confirm('确认清空所有数据？')) {
            clearAll(getCurrentMode());
        }
    });

    // Collapse toggle
    const toggle = document.querySelector('.collapse-toggle');
    const content = document.getElementById('guide-content');
    toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', !expanded);
        toggle.textContent = expanded ? '指标计算说明 ▶' : '指标计算说明 ▼';
        content.classList.toggle('hidden');
    });

    // Run backtest button (wired in later tasks)
    document.getElementById('run-backtest-btn').addEventListener('click', () => {
        runBacktest();
    });
}

function runBacktest() {
    // Placeholder — implemented in Task 4 after engine is built
    console.log('Backtest triggered');
}

document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 3: Open in browser, verify table renders and interactions work**

Open `index.html`. Verify:
- Mode A table shows 3 columns: 时间, iNAV涨跌幅, ETF市价涨跌幅
- Switching to Mode B shows 4 columns: 时间, 海力士涨跌幅, 汇率变动, ETF市价涨跌幅
- Add row button adds a row
- Delete row button removes last row (minimum 1 row)
- Clear all resets the table
- Collapse toggle shows/hides indicator guide

- [ ] **Step 4: Commit**

```bash
git add js/data-input.js js/main.js
git commit -m "feat: add data input module with mode switching and table management"
```

---

## Task 3: Backtest Engine (TDD)

**Files:**
- Create: `js/backtest-engine.js`
- Create: `tests/test-runner.html`
- Create: `tests/backtest-engine.test.js`

- [ ] **Step 1: Create tests/test-runner.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Arbitrage Backtest Tests</title>
    <style>
        body { font-family: monospace; padding: 1rem; }
        .pass { color: green; }
        .fail { color: red; }
        .summary { font-weight: bold; margin-top: 1rem; border-top: 1px solid #ccc; padding-top: 0.5rem; }
    </style>
</head>
<body>
    <h1>Test Results</h1>
    <div id="results"></div>
    <script type="module" src="backtest-engine.test.js"></script>
    <script type="module" src="statistics.test.js"></script>
    <script type="module" src="conclusion.test.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write failing tests for backtest engine**

```javascript
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
```

- [ ] **Step 3: Run tests in browser — verify all fail**

Open `tests/test-runner.html` in browser. All 5 tests should show red ✗ (module import fails).

- [ ] **Step 4: Implement backtest engine**

```javascript
// js/backtest-engine.js

/**
 * Run backtest on normalized data with strategy parameters.
 *
 * @param {Array} data - Array of { time, inavChange, etfChange, premiumDiscount }
 * @param {Object} params - { openThreshold, closeThreshold, stopLoss, txCost }
 * @returns {Array} trades - Array of trade objects
 */
export function runBacktest(data, params) {
    const { openThreshold, closeThreshold, stopLoss, txCost } = params;
    const trades = [];
    let position = null; // current open position

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const premium = row.premiumDiscount;

        if (premium === null || premium === undefined) continue;

        if (position === null) {
            // Check for entry signal
            if (premium >= openThreshold) {
                // ETF is expensive → sell ETF, buy stock
                position = {
                    direction: 'sell_etf_buy_stock',
                    entryIndex: i,
                    entryTime: row.time,
                    entryPremium: premium,
                };
            } else if (premium <= -openThreshold) {
                // ETF is cheap → buy ETF, sell stock
                position = {
                    direction: 'buy_etf_sell_stock',
                    entryIndex: i,
                    entryTime: row.time,
                    entryPremium: premium,
                };
            }
        } else {
            // Check for exit signal
            const entryPremium = position.entryPremium;
            const pnl = calculatePnL(position.direction, entryPremium, premium, txCost);
            const absPremium = Math.abs(premium);
            const isLastRow = i === data.length - 1;

            let exitReason = null;

            if (pnl <= -stopLoss) {
                exitReason = 'stop_loss';
            } else if (absPremium <= closeThreshold) {
                exitReason = 'mean_reversion';
            } else if (isLastRow) {
                exitReason = 'end_of_data';
            }

            if (exitReason) {
                trades.push({
                    ...position,
                    exitIndex: i,
                    exitTime: row.time,
                    exitPremium: premium,
                    pnl: pnl,
                    exitReason: exitReason,
                });
                position = null;
            }
        }
    }

    return trades;
}

/**
 * Calculate P&L for a trade.
 * When we sell ETF on premium: we profit as premium shrinks.
 * When we buy ETF on discount: we profit as discount shrinks.
 */
function calculatePnL(direction, entryPremium, exitPremium, txCost) {
    let raw;
    if (direction === 'sell_etf_buy_stock') {
        // Entered on premium, profit when premium decreases
        raw = entryPremium - exitPremium;
    } else {
        // Entered on discount (negative premium), profit when premium increases
        raw = exitPremium - entryPremium;
    }
    // Subtract round-trip transaction cost (2 × one-way)
    return raw - (txCost * 2);
}
```

- [ ] **Step 5: Run tests in browser — verify all pass**

Open `tests/test-runner.html`. All 5 tests should show green ✓.

- [ ] **Step 6: Commit**

```bash
git add js/backtest-engine.js tests/test-runner.html tests/backtest-engine.test.js
git commit -m "feat: add backtest engine with TDD tests"
```

---

## Task 4: Statistics Module (TDD)

**Files:**
- Create: `js/statistics.js`
- Create: `tests/statistics.test.js`

- [ ] **Step 1: Write failing tests for statistics**

```javascript
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
```

- [ ] **Step 2: Run tests — verify all fail**

Open `tests/test-runner.html`. Statistics tests should fail.

- [ ] **Step 3: Implement statistics module**

```javascript
// js/statistics.js

/**
 * Calculate backtest performance statistics.
 *
 * @param {Array} trades - Array of { pnl, ... }
 * @returns {Object} stats
 */
export function calculateStatistics(trades) {
    if (trades.length === 0) {
        return {
            totalTrades: 0,
            winCount: 0,
            lossCount: 0,
            winRate: 0,
            totalReturn: 0,
            maxDrawdown: 0,
            profitLossRatio: 0,
            sharpeRatio: 0,
            avgWin: 0,
            avgLoss: 0,
        };
    }

    const pnls = trades.map(t => t.pnl);
    const totalTrades = trades.length;
    const wins = pnls.filter(p => p > 0);
    const losses = pnls.filter(p => p <= 0);
    const winCount = wins.length;
    const lossCount = losses.length;
    const winRate = (winCount / totalTrades) * 100;
    const totalReturn = pnls.reduce((sum, p) => sum + p, 0);

    // Average win / loss
    const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + p, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, p) => s + p, 0) / losses.length) : 0;
    const profitLossRatio = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 99 : 0);

    // Max drawdown (from cumulative P&L curve)
    const maxDrawdown = calculateMaxDrawdown(pnls);

    // Sharpe ratio (simplified: mean / std of per-trade returns)
    const sharpeRatio = calculateSharpe(pnls);

    return {
        totalTrades,
        winCount,
        lossCount,
        winRate,
        totalReturn,
        maxDrawdown,
        profitLossRatio,
        sharpeRatio,
        avgWin,
        avgLoss,
    };
}

function calculateMaxDrawdown(pnls) {
    let cumulative = 0;
    let peak = 0;
    let maxDD = 0;

    for (const pnl of pnls) {
        cumulative += pnl;
        if (cumulative > peak) {
            peak = cumulative;
        }
        const drawdown = peak - cumulative;
        if (drawdown > maxDD) {
            maxDD = drawdown;
        }
    }

    return maxDD;
}

function calculateSharpe(pnls) {
    const n = pnls.length;
    if (n < 2) return 0;

    const mean = pnls.reduce((s, p) => s + p, 0) / n;
    const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / (n - 1);
    const std = Math.sqrt(variance);

    if (std === 0) return mean > 0 ? 99 : 0;
    return mean / std;
}
```

- [ ] **Step 4: Run tests — verify all pass**

Open `tests/test-runner.html`. All statistics tests should show green ✓.

- [ ] **Step 5: Commit**

```bash
git add js/statistics.js tests/statistics.test.js
git commit -m "feat: add statistics module with performance metrics"
```

---

## Task 5: Conclusion Module (TDD)

**Files:**
- Create: `js/conclusion.js`
- Create: `tests/conclusion.test.js`

- [ ] **Step 1: Write failing tests for conclusion**

```javascript
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
```

- [ ] **Step 2: Run tests — verify all fail**

Open `tests/test-runner.html`. Conclusion tests should fail.

- [ ] **Step 3: Implement conclusion module**

```javascript
// js/conclusion.js

/**
 * Generate feasibility conclusion from statistics.
 *
 * @param {Object} stats - from calculateStatistics
 * @returns {Object} { light, verdict, risks, suggestion }
 */
export function generateConclusion(stats) {
    const { sharpeRatio, winRate, maxDrawdown, totalReturn, totalTrades, profitLossRatio } = stats;

    if (totalTrades === 0) {
        return {
            light: 'red',
            verdict: '无交易信号触发。当前参数下无套利机会，建议降低开仓阈值或检查数据覆盖时段。',
            risks: ['数据量不足或阈值过高'],
            suggestion: '尝试将开仓阈值降低 0.5% 重新回测。',
        };
    }

    // Determine traffic light
    const light = determineLight(sharpeRatio, winRate, maxDrawdown);

    // Generate verdict
    const verdict = generateVerdict(light, stats);

    // Identify risks
    const risks = identifyRisks(stats);

    // Generate suggestion
    const suggestion = generateSuggestion(light, stats);

    return { light, verdict, risks, suggestion };
}

function determineLight(sharpeRatio, winRate, maxDrawdown) {
    // Red conditions (any one triggers)
    if (sharpeRatio < 0.5 || maxDrawdown > 20) {
        return 'red';
    }
    // Green conditions (all must be met)
    if (sharpeRatio > 1.5 && winRate > 60 && maxDrawdown < 10) {
        return 'green';
    }
    // Otherwise yellow
    return 'yellow';
}

function generateVerdict(light, stats) {
    const { totalReturn, totalTrades, winRate, sharpeRatio, maxDrawdown } = stats;

    if (light === 'green') {
        return `策略可行。共 ${totalTrades} 笔交易，胜率 ${winRate.toFixed(1)}%，累计收益 ${totalReturn.toFixed(2)}%，夏普比率 ${sharpeRatio.toFixed(2)}，最大回撤 ${maxDrawdown.toFixed(2)}%。策略表现优异，建议实盘验证。`;
    }
    if (light === 'yellow') {
        return `策略需谨慎评估。共 ${totalTrades} 笔交易，胜率 ${winRate.toFixed(1)}%，累计收益 ${totalReturn.toFixed(2)}%，夏普比率 ${sharpeRatio.toFixed(2)}，最大回撤 ${maxDrawdown.toFixed(2)}%。策略有盈利潜力但风险收益比一般，建议优化参数后再评估。`;
    }
    return `不建议执行该策略。共 ${totalTrades} 笔交易，胜率 ${winRate.toFixed(1)}%，累计收益 ${totalReturn.toFixed(2)}%，夏普比率 ${sharpeRatio.toFixed(2)}，最大回撤 ${maxDrawdown.toFixed(2)}%。当前参数下策略风险过高或收益不足。`;
}

function identifyRisks(stats) {
    const risks = [];
    const { maxDrawdown, winRate, totalTrades, profitLossRatio, sharpeRatio } = stats;

    if (maxDrawdown > 15) risks.push(`最大回撤达 ${maxDrawdown.toFixed(1)}%，资金风险较高`);
    if (maxDrawdown > 10 && maxDrawdown <= 15) risks.push(`最大回撤 ${maxDrawdown.toFixed(1)}%，需注意仓位控制`);
    if (winRate < 50) risks.push(`胜率仅 ${winRate.toFixed(1)}%，低于50%，需靠大盈利覆盖频繁小亏损`);
    if (totalTrades < 5) risks.push('交易样本过少，统计结果不够可靠');
    if (profitLossRatio < 1) risks.push('盈亏比 < 1，平均亏损大于平均盈利');
    if (sharpeRatio < 1) risks.push('夏普比率偏低，风险调整收益不佳');

    // Always mention structural risks
    risks.push('杠杆ETF存在每日复利衰减，长期持仓需注意');
    risks.push('跨市场执行存在时间差和汇率波动风险');

    return risks;
}

function generateSuggestion(light, stats) {
    const { winRate, maxDrawdown, totalTrades } = stats;

    if (light === 'green') {
        return '建议以小仓位实盘验证1-2周，确认滑点和执行延迟对策略的实际影响。';
    }
    if (light === 'yellow') {
        if (maxDrawdown > 10) return '建议提高开仓阈值以减少回撤，或缩小单笔仓位。';
        if (winRate < 55) return '建议调整平仓阈值，尝试更宽松的止盈条件提升胜率。';
        return '建议微调参数并增加回测数据量以验证稳定性。';
    }
    if (totalTrades < 3) return '数据样本不足，建议扩大回测时间范围。';
    return '当前参数组合不适合实盘，建议重新评估策略假设或更换阈值。';
}
```

- [ ] **Step 4: Run tests — verify all pass**

Open `tests/test-runner.html`. All conclusion tests should show green ✓.

- [ ] **Step 5: Commit**

```bash
git add js/conclusion.js tests/conclusion.test.js
git commit -m "feat: add conclusion module with traffic light verdict"
```

---

## Task 6: Charts Module

**Files:**
- Create: `js/charts.js`

- [ ] **Step 1: Implement charts module**

```javascript
// js/charts.js

let equityChart = null;
let premiumChart = null;
let pnlChart = null;

/**
 * Render all charts.
 *
 * @param {Array} data - normalized input data array
 * @param {Array} trades - trade results from backtest engine
 */
export function renderCharts(data, trades) {
    renderEquityChart(trades);
    renderPremiumChart(data, trades);
    renderPnlHistogram(trades);
}

export function destroyCharts() {
    if (equityChart) { equityChart.destroy(); equityChart = null; }
    if (premiumChart) { premiumChart.destroy(); premiumChart = null; }
    if (pnlChart) { pnlChart.destroy(); pnlChart = null; }
}

function renderEquityChart(trades) {
    const ctx = document.getElementById('equity-chart').getContext('2d');
    if (equityChart) equityChart.destroy();

    const labels = ['Start', ...trades.map((t, i) => t.exitTime || `Trade ${i + 1}`)];
    const cumulative = [0];
    let sum = 0;
    for (const trade of trades) {
        sum += trade.pnl;
        cumulative.push(sum);
    }

    equityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '累计收益 (%)',
                data: cumulative,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.2,
            }],
        },
        options: {
            responsive: true,
            plugins: { title: { display: true, text: '累计收益曲线' } },
            scales: {
                y: { title: { display: true, text: '收益 (%)' } },
            },
        },
    });
}

function renderPremiumChart(data, trades) {
    const ctx = document.getElementById('premium-chart').getContext('2d');
    if (premiumChart) premiumChart.destroy();

    const labels = data.map((d, i) => d.time || `${i}`);
    const premiums = data.map(d => d.premiumDiscount);

    // Mark entry/exit points
    const entryPoints = new Array(data.length).fill(null);
    const exitPoints = new Array(data.length).fill(null);
    for (const trade of trades) {
        if (trade.entryIndex < data.length) entryPoints[trade.entryIndex] = premiums[trade.entryIndex];
        if (trade.exitIndex < data.length) exitPoints[trade.exitIndex] = premiums[trade.exitIndex];
    }

    premiumChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '溢价/折价率 (%)',
                    data: premiums,
                    borderColor: '#64748b',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                },
                {
                    label: '开仓点',
                    data: entryPoints,
                    borderColor: 'transparent',
                    backgroundColor: '#16a34a',
                    pointRadius: 6,
                    pointStyle: 'triangle',
                    showLine: false,
                },
                {
                    label: '平仓点',
                    data: exitPoints,
                    borderColor: 'transparent',
                    backgroundColor: '#dc2626',
                    pointRadius: 6,
                    pointStyle: 'rectRot',
                    showLine: false,
                },
            ],
        },
        options: {
            responsive: true,
            plugins: { title: { display: true, text: '溢价/折价率走势' } },
            scales: {
                y: { title: { display: true, text: '溢价率 (%)' } },
            },
        },
    });
}

function renderPnlHistogram(trades) {
    const ctx = document.getElementById('pnl-chart').getContext('2d');
    if (pnlChart) pnlChart.destroy();

    const labels = trades.map((t, i) => `#${i + 1}`);
    const pnls = trades.map(t => t.pnl);
    const colors = pnls.map(p => p >= 0 ? 'rgba(22, 163, 74, 0.7)' : 'rgba(220, 38, 38, 0.7)');

    pnlChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '单笔盈亏 (%)',
                data: pnls,
                backgroundColor: colors,
            }],
        },
        options: {
            responsive: true,
            plugins: { title: { display: true, text: '单笔盈亏分布' } },
            scales: {
                y: { title: { display: true, text: '盈亏 (%)' } },
            },
        },
    });
}
```

- [ ] **Step 2: Open index.html, input some test data, verify charts render (after Task 7 wires it up)**

Charts will be tested visually in Task 7 integration step.

- [ ] **Step 3: Commit**

```bash
git add js/charts.js
git commit -m "feat: add charts module with equity curve, premium trend, and P&L histogram"
```

---

## Task 7: Wire Everything Together in main.js

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: Update main.js to integrate all modules**

Replace the entire content of `js/main.js`:

```javascript
// js/main.js

import { renderTable, addRow, deleteLastRow, clearAll, parseData } from './data-input.js';
import { runBacktest } from './backtest-engine.js';
import { calculateStatistics } from './statistics.js';
import { renderCharts, destroyCharts } from './charts.js';
import { generateConclusion } from './conclusion.js';

function getCurrentMode() {
    const checked = document.querySelector('input[name="input-mode"]:checked');
    return checked ? checked.value : 'inav';
}

function getParams() {
    return {
        openThreshold: parseFloat(document.getElementById('open-threshold').value) || 1.5,
        closeThreshold: parseFloat(document.getElementById('close-threshold').value) || 0.3,
        stopLoss: parseFloat(document.getElementById('stop-loss').value) || 3.0,
        txCost: parseFloat(document.getElementById('tx-cost').value) || 0.2,
        positionSize: parseFloat(document.getElementById('position-size').value) || 100000,
    };
}

function init() {
    const container = document.getElementById('data-table-container');
    const mode = getCurrentMode();

    // Initial render
    renderTable(container, mode);

    // Mode switch
    document.querySelectorAll('input[name="input-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            renderTable(container, getCurrentMode());
        });
    });

    // Table action buttons
    document.getElementById('add-row-btn').addEventListener('click', () => {
        addRow(getCurrentMode());
    });

    document.getElementById('delete-row-btn').addEventListener('click', () => {
        deleteLastRow();
    });

    document.getElementById('clear-all-btn').addEventListener('click', () => {
        if (confirm('确认清空所有数据？')) {
            clearAll(getCurrentMode());
        }
    });

    // Collapse toggle
    const toggle = document.querySelector('.collapse-toggle');
    const content = document.getElementById('guide-content');
    toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', !expanded);
        toggle.textContent = expanded ? '指标计算说明 ▶' : '指标计算说明 ▼';
        content.classList.toggle('hidden');
    });

    // Run backtest button
    document.getElementById('run-backtest-btn').addEventListener('click', () => {
        executeBacktest();
    });
}

function executeBacktest() {
    const mode = getCurrentMode();
    const data = parseData(mode);

    if (data.length === 0) {
        alert('请先输入数据（至少需要一行有效数据）');
        return;
    }

    const params = getParams();

    // Run engine
    const trades = runBacktest(data, params);

    // Calculate statistics
    const stats = calculateStatistics(trades);

    // Show results section
    const resultsSection = document.getElementById('backtest-results');
    resultsSection.classList.remove('hidden');

    // Render stats panel
    renderStatsPanel(stats);

    // Render charts
    destroyCharts();
    renderCharts(data, trades);

    // Render trade log
    renderTradeLog(trades);

    // Generate and show conclusion
    const conclusion = generateConclusion(stats);
    renderConclusion(conclusion);
}

function renderStatsPanel(stats) {
    const panel = document.getElementById('stats-panel');
    const items = [
        { label: '总收益率', value: `${stats.totalReturn.toFixed(2)}%` },
        { label: '最大回撤', value: `${stats.maxDrawdown.toFixed(2)}%` },
        { label: '胜率', value: `${stats.winRate.toFixed(1)}%` },
        { label: '盈亏比', value: stats.profitLossRatio.toFixed(2) },
        { label: '夏普比率', value: stats.sharpeRatio.toFixed(2) },
        { label: '交易次数', value: stats.totalTrades },
    ];

    panel.innerHTML = items.map(item => `
        <div class="stat-card">
            <div class="value">${item.value}</div>
            <div class="label">${item.label}</div>
        </div>
    `).join('');
}

function renderTradeLog(trades) {
    const container = document.getElementById('trade-log-container');

    if (trades.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#64748b;">无交易记录</p>';
        return;
    }

    const rows = trades.map((t, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${t.entryTime || t.entryIndex}</td>
            <td>${t.exitTime || t.exitIndex}</td>
            <td>${t.direction === 'sell_etf_buy_stock' ? '卖ETF/买股票' : '买ETF/卖股票'}</td>
            <td>${t.entryPremium.toFixed(2)}%</td>
            <td>${t.exitPremium.toFixed(2)}%</td>
            <td style="color:${t.pnl >= 0 ? '#16a34a' : '#dc2626'}">${t.pnl.toFixed(2)}%</td>
            <td>${formatExitReason(t.exitReason)}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>开仓时间</th>
                    <th>平仓时间</th>
                    <th>方向</th>
                    <th>开仓溢价率</th>
                    <th>平仓溢价率</th>
                    <th>盈亏</th>
                    <th>退出原因</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function formatExitReason(reason) {
    const map = {
        'mean_reversion': '均值回归',
        'stop_loss': '止损',
        'end_of_data': '数据结束',
    };
    return map[reason] || reason;
}

function renderConclusion(conclusion) {
    const section = document.getElementById('conclusion');
    section.classList.remove('hidden');

    // Traffic light
    const lightContainer = document.getElementById('traffic-light');
    lightContainer.innerHTML = `
        <span class="light red ${conclusion.light === 'red' ? 'active' : ''}"></span>
        <span class="light yellow ${conclusion.light === 'yellow' ? 'active' : ''}"></span>
        <span class="light green ${conclusion.light === 'green' ? 'active' : ''}"></span>
    `;

    // Conclusion text
    const textContainer = document.getElementById('conclusion-text');
    textContainer.innerHTML = `
        <h3>判定结果</h3>
        <p><strong>${conclusion.verdict}</strong></p>

        <h3>风险提示</h3>
        <ul>${conclusion.risks.map(r => `<li>${r}</li>`).join('')}</ul>

        <h3>优化建议</h3>
        <p>${conclusion.suggestion}</p>
    `;
}

document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 2: Full integration test in browser**

Open `index.html`. Perform full workflow:

1. Switch to Mode A
2. Input test data:
   - Row 1: time=09:30, iNAV=1.0, ETF=1.0
   - Row 2: time=09:31, iNAV=1.5, ETF=3.5
   - Row 3: time=09:32, iNAV=2.0, ETF=2.2
   - Row 4: time=09:33, iNAV=2.5, ETF=2.4
3. Set parameters: open threshold=1.5, close threshold=0.5
4. Click "运行回测"
5. Verify: stats panel shows, charts render, trade log shows entries, conclusion appears with traffic light

- [ ] **Step 3: Test Mode B**

1. Switch to Mode B
2. Input:
   - Row 1: time=09:30, 海力士=0.5, 汇率=0.0, ETF=1.0
   - Row 2: time=09:31, 海力士=1.0, 汇率=0.1, ETF=4.5
   - Row 3: time=09:32, 海力士=1.5, 汇率=0.0, ETF=3.1
3. Click "运行回测"
4. Verify results render correctly

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat: wire all modules together with full backtest pipeline"
```

---

## Task 8: Final Polish & Edge Cases

**Files:**
- Modify: `index.html` (minor accessibility)
- Modify: `js/data-input.js` (validation)

- [ ] **Step 1: Add input validation in data-input.js**

Add this exported function at the end of `js/data-input.js`:

```javascript
export function validateData(data, mode) {
    const errors = [];

    if (data.length === 0) {
        errors.push('请至少输入一行有效数据');
        return errors;
    }

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (row.etfChange === null) {
            errors.push(`第 ${i + 1} 行：ETF市价涨跌幅为必填项`);
        }
        if (mode === 'inav' && row.inavChange === null) {
            errors.push(`第 ${i + 1} 行：iNAV涨跌幅为必填项`);
        }
        if (mode === 'no-inav') {
            if (row.hynixChange === null) errors.push(`第 ${i + 1} 行：海力士涨跌幅为必填项`);
            if (row.fxChange === null) errors.push(`第 ${i + 1} 行：汇率变动为必填项`);
        }
    }

    return errors;
}
```

- [ ] **Step 2: Use validation in main.js before running backtest**

In `js/main.js`, add the import and validation call. Add `validateData` to the import line:

```javascript
import { renderTable, addRow, deleteLastRow, clearAll, parseData, validateData } from './data-input.js';
```

In `executeBacktest()`, after parsing data, add:

```javascript
    const errors = validateData(data, mode);
    if (errors.length > 0) {
        alert('数据校验失败:\n' + errors.join('\n'));
        return;
    }
```

- [ ] **Step 3: Test edge cases in browser**

1. Click "运行回测" with empty table → should show "请先输入数据" alert
2. Input partial data (only ETF, leave iNAV empty) → should show validation error
3. Input valid data → should run successfully

- [ ] **Step 4: Commit**

```bash
git add js/data-input.js js/main.js
git commit -m "feat: add input validation with user-friendly error messages"
```

- [ ] **Step 5: Final commit — add .gitignore**

Create `.gitignore`:

```
.DS_Store
*.swp
*~
```

```bash
git add .gitignore
git commit -m "chore: add .gitignore"
```

---

## Summary

| Task | What It Builds | Files |
|------|---------------|-------|
| 1 | HTML skeleton + CSS | `index.html`, `css/style.css` |
| 2 | Data input module | `js/data-input.js`, `js/main.js` |
| 3 | Backtest engine (TDD) | `js/backtest-engine.js`, tests |
| 4 | Statistics module (TDD) | `js/statistics.js`, tests |
| 5 | Conclusion module (TDD) | `js/conclusion.js`, tests |
| 6 | Charts (Chart.js) | `js/charts.js` |
| 7 | Integration wiring | `js/main.js` update |
| 8 | Validation & polish | validation, .gitignore |
