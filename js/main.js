// js/main.js

import { renderTable, renderBaseline, addRow, deleteLastRow, clearAll, parseData, validateData } from './data-input.js';
import { runBacktest, analyzeDivergence } from './backtest-engine.js';
import { calculateStatistics } from './statistics.js';
import { renderCharts, destroyCharts } from './charts.js';
import { generateConclusion } from './conclusion.js';
import { fetchAllData } from './yahoo-fetch.js';

function getCurrentMode() {
    const checked = document.querySelector('input[name="input-mode"]:checked');
    return checked ? checked.value : 'inav';
}

function getCurrentDataSource() {
    const checked = document.querySelector('input[name="data-source"]:checked');
    return checked ? checked.value : 'api';
}

function toggleDataSource(source) {
    const apiSection = document.getElementById('api-section');
    const manualSection = document.getElementById('manual-section');
    const tableSection = document.getElementById('data-table-section');

    if (source === 'api') {
        apiSection.classList.remove('hidden');
        manualSection.classList.add('hidden');
        // Hide table until data is fetched
        tableSection.classList.add('hidden');
    } else {
        apiSection.classList.add('hidden');
        manualSection.classList.remove('hidden');
        tableSection.classList.remove('hidden');
    }
}

function getParams() {
    return {
        threshold: parseFloat(document.getElementById('threshold').value) || 1.5,
        txCost: parseFloat(document.getElementById('tx-cost').value) || 0.2,
        tradeAmount: parseFloat(document.getElementById('trade-amount').value) || 100000,
    };
}

function init() {
    const container = document.getElementById('data-table-container');
    const baselineContainer = document.getElementById('baseline-inputs');
    const mode = getCurrentMode();
    const source = getCurrentDataSource();

    // Initial render
    renderTickerInputs(mode);
    renderBaseline(baselineContainer, mode);
    renderTable(container, mode);
    toggleDataSource(source);
    updateHints();

    // Data source switch (API vs Manual)
    document.querySelectorAll('input[name="data-source"]').forEach(radio => {
        radio.addEventListener('change', () => {
            toggleDataSource(getCurrentDataSource());
            updateHints();
            setFetchStatus('');
        });
    });

    // Calculation mode switch
    document.querySelectorAll('input[name="input-mode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const newMode = getCurrentMode();
            renderTickerInputs(newMode);
            renderBaseline(baselineContainer, newMode);
            renderTable(container, newMode);
            updateHints();
            setFetchStatus('');
        });
    });

    // Fetch data button
    document.getElementById('fetch-data-btn').addEventListener('click', () => {
        handleFetchData();
    });

    // Data source provider switch (Yahoo / Alpha Vantage / etc.)
    document.getElementById('data-source-provider').addEventListener('change', (e) => {
        const tokenInput = document.getElementById('api-token');
        if (e.target.value === 'yahoo') {
            tokenInput.classList.add('hidden');
        } else {
            tokenInput.classList.remove('hidden');
        }
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

    // Collapse toggle (smooth animation)
    const toggle = document.querySelector('.collapse-toggle');
    const content = document.getElementById('guide-content');
    if (toggle && content) {
        toggle.addEventListener('click', () => {
            const expanded = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', !expanded);
            content.classList.toggle('open');
        });
    }

    // Run backtest button
    document.getElementById('run-backtest-btn').addEventListener('click', () => {
        executeBacktest();
    });

    // === Price Monitor Section ===
    initMonitorTable();
    document.getElementById('mon-add-row').addEventListener('click', () => { addMonitorRow(); updateShadowColumn(); renderMonitorCharts(); });
    document.getElementById('mon-del-row').addEventListener('click', () => { delMonitorRow(); updateShadowColumn(); renderMonitorCharts(); });
    document.getElementById('mon-download-tpl').addEventListener('click', downloadMonitorTemplate);

    // Auto-update shadow column and charts on any input change in monitor table
    document.getElementById('monitor-table').addEventListener('input', () => {
        updateShadowColumn();
        renderMonitorCharts();
    });

    const fileInput = document.getElementById('mon-file-input');
    document.getElementById('mon-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importMonitorFile(e.target.files[0]);
            e.target.value = '';
        }
    });

    // Initial shadow calculation and chart render for demo data
    updateShadowColumn();
    renderMonitorCharts();
}

function executeBacktest() {
    const mode = getCurrentMode();
    const data = parseData(mode);

    if (data.length === 0) {
        alert('请先输入数据（至少需要一行有效数据）');
        return;
    }

    const errors = validateData(data, mode);
    if (errors.length > 0) {
        alert('数据校验失败:\n' + errors.join('\n'));
        return;
    }

    const params = getParams();

    // Show and render dashboard
    renderDashboard(data, params.threshold);

    // Run backtest engine
    const trades = runBacktest(data, params);

    // Calculate results
    const totalProfitHKD = trades.reduce((s, t) => s + t.profitHKD, 0);
    const profitableTrades = trades.filter(t => t.netProfit > 0);
    const beforeTrades = trades.filter(t => t.entryTime && t.entryTime <= '14:30');
    const afterTrades = trades.filter(t => t.entryTime && t.entryTime > '14:30');

    // Show results section
    const resultsSection = document.getElementById('backtest-results');
    resultsSection.classList.remove('hidden');

    // Render simplified stats
    renderStatsPanel({
        totalProfitHKD,
        totalTrades: trades.length,
        profitableTrades: profitableTrades.length,
        avgProfit: trades.length > 0 ? totalProfitHKD / trades.length : 0,
        beforeCount: beforeTrades.length,
        afterCount: afterTrades.length,
    });

    // Render charts
    destroyCharts();
    renderCharts(data, trades);

    // Render trade log
    renderTradeLog(trades);

    // Generate and show conclusion
    const stats = calculateStatistics(trades.map(t => ({ pnl: t.netProfit })));
    const conclusion = generateConclusion(stats);
    renderConclusion(conclusion);
}

function renderStatsPanel(stats) {
    const panel = document.getElementById('stats-panel');
    const items = [
        { label: '总套利收益', value: `${stats.totalProfitHKD.toFixed(0)} HKD`, hint: '所有调仓交易的累计净收益' },
        { label: '信号触发', value: `${stats.totalTrades} 次`, hint: '背离超阈值的调仓次数' },
        { label: '有效交易', value: `${stats.profitableTrades} 次`, hint: '扣除费用后仍盈利的交易' },
        { label: '平均单次收益', value: `${stats.avgProfit.toFixed(0)} HKD`, hint: '总收益 / 交易次数' },
        { label: '14:30前信号', value: `${stats.beforeCount} 次`, hint: 'iNAV实时更新期间的信号' },
        { label: '14:30后信号', value: `${stats.afterCount} 次`, hint: 'iNAV冻结后的信号（信息优势窗口）' },
    ];

    panel.innerHTML = items.map(item => `
        <div class="stat-card">
            <div class="value">${item.value}</div>
            <div class="label">${item.label}</div>
            <div class="stat-hint">${item.hint}</div>
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
            <td style="color:${t.netProfit >= 0 ? '#16a34a' : '#dc2626'}">${t.profitHKD.toFixed(0)} HKD</td>
            <td>${formatExitReason(t.exitReason)}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>调仓时间</th>
                    <th>回归时间</th>
                    <th>方向</th>
                    <th>入场背离</th>
                    <th>出场背离</th>
                    <th>收益</th>
                    <th>退出原因</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function formatExitReason(reason) {
    const map = {
        'reversion': '背离回归',
        'cross_zero': '穿越零轴',
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

// ===== Yahoo Finance Ticker Config =====

const TICKER_FIELDS_INAV = [
    { key: 'etf', label: 'ETF代码（港股）', placeholder: '7709.HK', defaultValue: '7709.HK' },
    { key: 'hynix', label: '海力士股票代码', placeholder: '000660.KS', defaultValue: '000660.KS' },
];

const TICKER_FIELDS_NO_INAV = [
    { key: 'etf', label: 'ETF代码（港股）', placeholder: '7709.HK', defaultValue: '7709.HK' },
    { key: 'hynix', label: '海力士股票代码', placeholder: '000660.KS', defaultValue: '000660.KS' },
    { key: 'fx', label: '汇率', placeholder: 'KRWHKD=X', defaultValue: 'KRWHKD=X' },
];

function renderTickerInputs(mode) {
    const container = document.getElementById('ticker-inputs');
    const fields = mode === 'inav' ? TICKER_FIELDS_INAV : TICKER_FIELDS_NO_INAV;

    container.innerHTML = fields.map(f => `
        <div class="ticker-item">
            <label for="ticker-${f.key}">${f.label}</label>
            <input type="text" id="ticker-${f.key}" placeholder="${f.placeholder}" value="${f.defaultValue}">
        </div>
    `).join('');
}

function getTickerValues(mode) {
    const fields = mode === 'inav' ? TICKER_FIELDS_INAV : TICKER_FIELDS_NO_INAV;
    const tickers = {};
    for (const f of fields) {
        const input = document.getElementById(`ticker-${f.key}`);
        tickers[f.key] = input ? input.value.trim() : '';
    }
    return tickers;
}

function setFetchStatus(text, type = '') {
    const el = document.getElementById('fetch-status');
    el.textContent = text;
    el.className = 'fetch-status ' + type;
}

async function handleFetchData() {
    const mode = getCurrentMode();
    const tickers = getTickerValues(mode);
    const provider = document.getElementById('data-source-provider').value;

    // Validate tickers
    const requiredKeys = mode === 'inav' ? ['etf', 'hynix'] : ['etf', 'hynix', 'fx'];
    const emptyFields = requiredKeys.filter(k => !tickers[k]);
    if (emptyFields.length > 0) {
        setFetchStatus('请填写所有代码', 'error');
        return;
    }

    // Check provider + mode compatibility
    if (mode === 'inav' && provider === 'yahoo') {
        setFetchStatus('Yahoo Finance 不提供 iNAV 数据，请切换为「系统计算 iNAV」或更换数据源', 'error');
        return;
    }

    setFetchStatus('正在获取数据...', 'loading');

    try {
        // Build fetch tickers based on mode
        const fetchTickers = {
            hynix: tickers.hynix,
            fx: tickers.fx || 'KRWHKD=X',
            etf: tickers.etf,
        };

        const { baseline, rows } = await fetchAllData(fetchTickers, 'no-inav');

        // Fill baseline inputs
        for (const [key, value] of Object.entries(baseline)) {
            const input = document.getElementById(key);
            if (input && value != null) {
                input.value = value;
            }
        }

        // Fill table with fetched rows
        fillTableWithFetchedData(mode, rows);

        // Show table section after successful fetch
        document.getElementById('data-table-section').classList.remove('hidden');

        setFetchStatus(`已获取 ${rows.length} 条数据`, 'success');
    } catch (error) {
        setFetchStatus(`获取失败: ${error.message}`, 'error');
        console.error('Fetch error:', error);
    }
}

function fillTableWithFetchedData(mode, rows) {
    const container = document.getElementById('data-table-container');
    const columns = mode === 'inav'
        ? [{ key: 'time' }, { key: 'inavPrice' }, { key: 'etfPrice' }]
        : [{ key: 'time' }, { key: 'hynixPrice' }, { key: 'fxPrice' }, { key: 'etfPrice' }];

    // Map fxPrice to fxRate for table compatibility
    const mappedRows = rows.map(row => ({
        ...row,
        fxRate: row.fxPrice || row.fxRate,
    }));

    // Rebuild table with fetched data
    const { getColumns } = { getColumns: (m) => m === 'inav'
        ? [
            { key: 'time', label: '时间', type: 'text', placeholder: 'e.g. 09:30' },
            { key: 'inavPrice', label: 'iNAV', type: 'number', placeholder: '10.12' },
            { key: 'etfPrice', label: 'ETF市价', type: 'number', placeholder: '10.15' },
          ]
        : [
            { key: 'time', label: '时间', type: 'text', placeholder: 'e.g. 09:30' },
            { key: 'hynixPrice', label: '海力士股价', type: 'number', placeholder: '201000' },
            { key: 'fxRate', label: 'KRW/HKD汇率', type: 'number', placeholder: '0.00600' },
            { key: 'etfPrice', label: 'ETF市价', type: 'number', placeholder: '10.15' },
          ]
    };

    const cols = getColumns(mode);
    const tableRows = mappedRows.map(row => {
        const cells = cols.map(c => {
            const val = row[c.key] !== undefined ? row[c.key] : '';
            return `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="any" value="${val}"></td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr>
            </thead>
            <tbody id="data-tbody">
                ${tableRows}
            </tbody>
        </table>
    `;
}

// ===== Price Monitor Section =====

const MONITOR_DEMO_ROWS = [
    { time: '09:30', inav: '90.50', etf: '90.55', hynix: '200500', krwhkd: '0.0058' },
    { time: '09:45', inav: '90.80', etf: '90.85', hynix: '201000', krwhkd: '0.0058' },
    { time: '10:00', inav: '91.20', etf: '91.50', hynix: '201500', krwhkd: '0.0058' },
    { time: '10:30', inav: '91.00', etf: '91.10', hynix: '201200', krwhkd: '0.0058' },
    { time: '11:00', inav: '91.50', etf: '91.45', hynix: '201800', krwhkd: '0.0058' },
    { time: '11:30', inav: '91.80', etf: '92.00', hynix: '202000', krwhkd: '0.0058' },
    { time: '13:00', inav: '91.60', etf: '91.70', hynix: '201700', krwhkd: '0.0058' },
    { time: '13:30', inav: '92.00', etf: '91.90', hynix: '202200', krwhkd: '0.0058' },
    { time: '14:00', inav: '92.30', etf: '92.25', hynix: '202500', krwhkd: '0.0058' },
    { time: '14:30', inav: '92.50', etf: '92.45', hynix: '202800', krwhkd: '0.0058' },
    { time: '14:45', inav: '', etf: '92.80', hynix: '203200', krwhkd: '0.0058' },
    { time: '15:00', inav: '', etf: '93.10', hynix: '203500', krwhkd: '0.0058' },
    { time: '15:30', inav: '', etf: '92.60', hynix: '203000', krwhkd: '0.0058' },
    { time: '16:00', inav: '', etf: '92.90', hynix: '203300', krwhkd: '0.0058' },
];

function initMonitorTable() {
    const tbody = document.getElementById('monitor-tbody');
    tbody.innerHTML = MONITOR_DEMO_ROWS.map(row => monitorRow(row)).join('');
}

function monitorRow(data = {}) {
    return `<tr>
        <td><input type="text" placeholder="HH:MM" value="${data.time || ''}"></td>
        <td><input type="number" step="any" class="inav-cell" placeholder="" value="${data.inav || ''}"></td>
        <td><input type="number" step="any" class="shadow-cell" placeholder="自动计算" readonly tabindex="-1" value="${data.shadow || ''}"></td>
        <td><input type="number" step="any" placeholder="ETF价" value="${data.etf || ''}"></td>
        <td><input type="number" step="any" placeholder="海力士" value="${data.hynix || ''}"></td>
        <td><input type="number" step="any" placeholder="KRW/HKD" value="${data.krwhkd || ''}"></td>
    </tr>`;
}

function addMonitorRow() {
    document.getElementById('monitor-tbody').insertAdjacentHTML('beforeend', monitorRow());
}

function delMonitorRow() {
    const tbody = document.getElementById('monitor-tbody');
    const rows = tbody.querySelectorAll('tr');
    if (rows.length > 1) rows[rows.length - 1].remove();
}

/**
 * Recalculate shadow iNAV for all rows based on first row as baseline.
 * Called on every input change — no button needed.
 */
function updateShadowColumn() {
    const tbody = document.getElementById('monitor-tbody');
    const rows = tbody.querySelectorAll('tr');
    if (rows.length < 1) return;

    // Read first row as baseline
    const firstInputs = rows[0].querySelectorAll('input');
    const baseInav = parseFloat(firstInputs[1].value) || null;
    const baseHynix = parseFloat(firstInputs[4].value) || null;
    const baseKrwhkd = parseFloat(firstInputs[5].value) || null;

    let lastEtf = null;
    let lastShadow = null;
    let lastInav = null;
    let lastTime = '';

    for (const row of rows) {
        const inputs = row.querySelectorAll('input');
        const shadowCell = inputs[2];
        const time = inputs[0].value.trim();
        const inav = parseFloat(inputs[1].value) || null;
        const etf = parseFloat(inputs[3].value) || null;
        const hynix = parseFloat(inputs[4].value) || null;
        const krwhkd = parseFloat(inputs[5].value) || null;

        if (baseInav && baseHynix && baseKrwhkd && hynix && krwhkd) {
            const hynixChange = (hynix - baseHynix) / baseHynix;
            const fxChange = (krwhkd - baseKrwhkd) / baseKrwhkd;
            const shadow = baseInav * (1 + hynixChange * 2) * (1 + fxChange);
            shadowCell.value = shadow.toFixed(2);
            lastShadow = shadow;
        } else {
            shadowCell.value = '';
        }

        if (etf) lastEtf = etf;
        if (inav) lastInav = inav;
        if (time) lastTime = time;
    }

    // Update divergence indicator with latest row data
    updateDivergenceIndicator(lastEtf, lastInav, lastShadow, lastTime);
}

function updateDivergenceIndicator(etf, officialInav, shadowInav, time) {
    const container = document.getElementById('divergence-indicator');
    if (!etf || !shadowInav) {
        container.innerHTML = '';
        return;
    }

    const CUTOFF = '14:30';
    const isPostCutoff = time > CUTOFF;
    const referenceInav = (!isPostCutoff && officialInav) ? officialInav : shadowInav;
    const inavSource = (!isPostCutoff && officialInav) ? '官方iNAV' : '影子iNAV';

    // Calculate divergence
    const divergence = ((etf - referenceInav) / referenceInav * 100);
    const absDivergence = Math.abs(divergence);

    // Determine signal strength
    let signalClass = '';
    let actionText = '';
    let actionClass = 'hold';

    if (absDivergence >= 2.0) {
        signalClass = 'signal-strong';
        actionText = divergence > 0 ? '强烈卖出ETF / 买入股票' : '强烈买入ETF / 卖出股票';
        actionClass = divergence > 0 ? 'sell' : 'buy';
    } else if (absDivergence >= 1.0) {
        signalClass = 'signal';
        actionText = divergence > 0 ? '考虑卖出ETF / 买入股票' : '考虑买入ETF / 卖出股票';
        actionClass = divergence > 0 ? 'sell' : 'buy';
    } else {
        actionText = '偏离不足，暂不交易';
    }

    const valueClass = divergence > 0.1 ? 'positive' : (divergence < -0.1 ? 'negative' : 'neutral');

    container.innerHTML = `
        <div class="div-card">
            <div class="div-value neutral">${etf.toFixed(2)}</div>
            <div class="div-label">ETF成交价 (HKD)</div>
        </div>
        <div class="div-card">
            <div class="div-value neutral">${referenceInav.toFixed(2)}</div>
            <div class="div-label">${inavSource} (HKD)</div>
        </div>
        <div class="div-card ${signalClass}">
            <div class="div-value ${valueClass}">${divergence >= 0 ? '+' : ''}${divergence.toFixed(3)}%</div>
            <div class="div-label">偏离度（ETF vs ${inavSource}）</div>
            <div class="div-action ${actionClass}">${actionText}</div>
        </div>
        <div class="div-card">
            <div class="div-value neutral">${time}</div>
            <div class="div-label">最新数据时间${isPostCutoff ? '（iNAV已停更）' : ''}</div>
        </div>
    `;
}

function downloadMonitorTemplate() {
    const header = ['时间', 'iNAV(HKD)', '影子iNAV(系统计算)', 'ETF成交价(HKD)', '海力士股价(KRW)', 'KRW/HKD汇率'];
    const sampleRows = [
        ['09:30', '90.50', '', '90.55', '200500', '0.0058'],
        ['09:45', '90.80', '', '90.85', '201000', '0.0058'],
        ['10:00', '91.20', '', '91.50', '201500', '0.0058'],
        ['14:30', '92.50', '', '92.45', '202800', '0.0058'],
        ['14:45', '', '', '92.80', '203200', '0.0058'],
        ['15:00', '', '', '93.10', '203500', '0.0058'],
    ];

    const ws = XLSX.utils.aoa_to_sheet([header, ...sampleRows]);
    ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '价格数据');
    XLSX.writeFile(wb, 'price_monitor_template.xlsx');
}

function importMonitorFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

            // Skip header row
            const dataRows = rows.slice(1).filter(row => row.length > 0 && row[0]);

            if (dataRows.length === 0) {
                alert('文件中没有有效数据');
                return;
            }

            // Fill table - columns: 时间, iNAV, (影子iNAV跳过), ETF, 海力士, KRW/HKD
            const tbody = document.getElementById('monitor-tbody');
            tbody.innerHTML = dataRows.map(row => {
                const time = String(row[0] || '').trim();
                const inav = row[1] != null && row[1] !== '' ? String(row[1]) : '';
                // row[2] is shadow column - skip on import
                const etf = row[3] != null && row[3] !== '' ? String(row[3]) : '';
                const hynix = row[4] != null && row[4] !== '' ? String(row[4]) : '';
                const krwhkd = row[5] != null && row[5] !== '' ? String(row[5]) : '';
                return monitorRow({ time, inav, etf, hynix, krwhkd });
            }).join('');

            alert(`已导入 ${dataRows.length} 行数据`);
            updateShadowColumn();
            renderMonitorCharts();
        } catch (err) {
            alert('文件解析失败: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

let chartPriceVsInav = null;
let chartShadowValidation = null;

function renderMonitorCharts() {
    // Parse table data
    const tbody = document.getElementById('monitor-tbody');
    const rows = tbody.querySelectorAll('tr');
    const data = [];

    for (const row of rows) {
        const inputs = row.querySelectorAll('input');
        const time = inputs[0].value.trim();
        const inav = parseFloat(inputs[1].value) || null;
        // inputs[2] is shadow column (readonly, skip for input)
        const etf = parseFloat(inputs[3].value) || null;
        const hynix = parseFloat(inputs[4].value) || null;
        const krwhkd = parseFloat(inputs[5].value) || null;
        if (time && (etf || inav || hynix)) {
            data.push({ time, inav, etf, hynix, krwhkd });
        }
    }

    if (data.length < 2) return;

    // Use first row as baseline (opening values)
    const baseRow = data[0];
    const baseInav = baseRow.inav;
    const baseHynix = baseRow.hynix;
    const baseKrwhkd = baseRow.krwhkd;

    if (!baseInav || !baseHynix || !baseKrwhkd) return;

    // Calculate shadow iNAV for all rows
    const CUTOFF = '14:30';
    const labels = data.map(d => d.time);
    const officialInav = [];
    const etfPrices = [];
    const shadowInav = [];

    for (const d of data) {
        etfPrices.push(d.etf);
        officialInav.push(d.inav); // null after 14:30

        // Shadow iNAV(HKD) = baseInav(HKD) × (1 + hynix_change × 2) × (1 + krwhkd_change)
        // hynix_change captures stock movement, krwhkd_change captures FX impact on HKD pricing
        if (d.hynix && d.krwhkd) {
            const hynixChange = (d.hynix - baseHynix) / baseHynix;
            const fxChange = (d.krwhkd - baseKrwhkd) / baseKrwhkd;
            const shadowHkd = baseInav * (1 + hynixChange * 2) * (1 + fxChange);
            shadowInav.push(parseFloat(shadowHkd.toFixed(4)));
        } else {
            shadowInav.push(null);
        }
    }

    // Chart 1: iNAV + Shadow iNAV vs ETF Price (full day)
    const ctx1 = document.getElementById('chart-price-vs-inav').getContext('2d');
    if (chartPriceVsInav) chartPriceVsInav.destroy();

    // Build combined iNAV line: official before 14:30, shadow after
    const combinedInav = data.map((d, i) => {
        if (d.time <= CUTOFF && officialInav[i] !== null) {
            return officialInav[i];
        }
        return shadowInav[i];
    });

    // Find cutoff index for annotation
    const cutoffIdx = data.findIndex(d => d.time > CUTOFF);

    chartPriceVsInav = new Chart(ctx1, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'ETF 成交价 (HKD)',
                    data: etfPrices,
                    borderColor: '#2563eb',
                    borderWidth: 2,
                    pointRadius: 2,
                    fill: false,
                },
                {
                    label: '官方 iNAV (09:30-14:30)',
                    data: officialInav,
                    borderColor: '#16a34a',
                    borderWidth: 2,
                    pointRadius: 2,
                    borderDash: [],
                    fill: false,
                    spanGaps: false,
                },
                {
                    label: '影子 iNAV (14:30后)',
                    data: data.map((d, i) => d.time > CUTOFF ? shadowInav[i] : null),
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    pointRadius: 2,
                    borderDash: [5, 3],
                    fill: false,
                    spanGaps: false,
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: 'ETF成交价 vs iNAV（含影子iNAV续接）' },
                legend: {
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'line',
                    },
                },
            },
            scales: { y: { title: { display: true, text: '价格 (HKD)' } } },
        },
        plugins: [{
            id: 'cutoffLine',
            afterDraw(chart) {
                if (cutoffIdx <= 0) return;
                const { ctx, chartArea, scales } = chart;
                const xPos = scales.x.getPixelForValue(cutoffIdx);
                ctx.save();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#dc2626';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(xPos, chartArea.top);
                ctx.lineTo(xPos, chartArea.bottom);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = '#dc2626';
                ctx.font = '11px sans-serif';
                ctx.fillText('14:30 iNAV停更', xPos + 4, chartArea.top + 14);
                ctx.restore();
            }
        }],
    });

    // Chart 2: Shadow iNAV vs Official iNAV (09:30-14:30 only, validation)
    const ctx2 = document.getElementById('chart-shadow-validation').getContext('2d');
    if (chartShadowValidation) chartShadowValidation.destroy();

    // Filter only rows where both official and shadow exist (before 14:30)
    const validationLabels = [];
    const officialLine = [];
    const shadowLine = [];
    const errorLine = [];

    for (let i = 0; i < data.length; i++) {
        if (data[i].time <= CUTOFF && officialInav[i] !== null && shadowInav[i] !== null) {
            validationLabels.push(data[i].time);
            officialLine.push(officialInav[i]);
            shadowLine.push(shadowInav[i]);
            errorLine.push(((shadowInav[i] - officialInav[i]) / officialInav[i] * 100));
        }
    }

    chartShadowValidation = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: validationLabels,
            datasets: [
                {
                    label: '官方 iNAV (HKD)',
                    data: officialLine,
                    borderColor: '#16a34a',
                    borderWidth: 2,
                    pointRadius: 2,
                    yAxisID: 'y',
                    fill: false,
                },
                {
                    label: '影子 iNAV (HKD)',
                    data: shadowLine,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    pointRadius: 2,
                    borderDash: [5, 3],
                    yAxisID: 'y',
                    fill: false,
                },
                {
                    label: '误差 (%)',
                    data: errorLine,
                    type: 'bar',
                    backgroundColor: errorLine.map(e => e >= 0 ? 'rgba(220, 38, 38, 0.3)' : 'rgba(37, 99, 235, 0.3)'),
                    borderColor: errorLine.map(e => e >= 0 ? 'rgba(220, 38, 38, 0.7)' : 'rgba(37, 99, 235, 0.7)'),
                    borderWidth: 1,
                    yAxisID: 'y1',
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: '影子iNAV校验（09:30-14:30 对比官方）' },
                legend: {
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'line',
                    },
                },
            },
            scales: {
                y: { position: 'left', title: { display: true, text: '价格 (HKD)' } },
                y1: { position: 'right', title: { display: true, text: '误差 (%)' }, grid: { drawOnChartArea: false } },
            },
        },
    });
}

// ===== Dashboard Rendering =====

let divergenceChart = null;

function renderDashboard(data, threshold) {
    const dashboard = document.getElementById('dashboard');
    dashboard.classList.remove('hidden');

    const analysis = analyzeDivergence(data, threshold);

    // Render divergence chart
    renderDivergenceChart(data, threshold);

    // Render before/after stats
    renderPeriodStats('before-stats', analysis.before, threshold);
    renderPeriodStats('after-stats', analysis.after, threshold);
}

function renderDivergenceChart(data, threshold) {
    const ctx = document.getElementById('divergence-chart').getContext('2d');
    if (divergenceChart) divergenceChart.destroy();

    const labels = data.map((d, i) => d.time || `${i}`);
    const premiums = data.map(d => d.premiumDiscount);

    // Find 14:30 cutoff index
    const cutoffIndex = data.findIndex(d => d.time && d.time > '14:30');

    divergenceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '溢价/折价率 (%)',
                data: premiums,
                borderColor: '#2563eb',
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
            }],
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: 'ETF与iNAV偏离走势' },
                legend: {
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'line',
                    },
                },
                annotation: undefined,
            },
            scales: {
                y: {
                    title: { display: true, text: '偏离率 (%)' },
                },
            },
        },
        plugins: [{
            id: 'thresholdLines',
            afterDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                const yScale = scales.y;
                const xScale = scales.x;

                // Draw threshold lines
                ctx.save();
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = '#dc2626';
                ctx.lineWidth = 1;

                const yTop = yScale.getPixelForValue(threshold);
                const yBottom = yScale.getPixelForValue(-threshold);

                ctx.beginPath();
                ctx.moveTo(chartArea.left, yTop);
                ctx.lineTo(chartArea.right, yTop);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(chartArea.left, yBottom);
                ctx.lineTo(chartArea.right, yBottom);
                ctx.stroke();

                // Draw 14:30 vertical line
                if (cutoffIndex > 0) {
                    ctx.setLineDash([4, 4]);
                    ctx.strokeStyle = '#ca8a04';
                    ctx.lineWidth = 1.5;
                    const xPos = xScale.getPixelForValue(cutoffIndex);
                    ctx.beginPath();
                    ctx.moveTo(xPos, chartArea.top);
                    ctx.lineTo(xPos, chartArea.bottom);
                    ctx.stroke();

                    // Label
                    ctx.setLineDash([]);
                    ctx.fillStyle = '#ca8a04';
                    ctx.font = '11px sans-serif';
                    ctx.fillText('14:30 iNAV冻结', xPos + 4, chartArea.top + 14);
                }

                ctx.restore();
            }
        }],
    });
}

function renderPeriodStats(containerId, stats, threshold) {
    const container = document.getElementById(containerId);
    container.innerHTML = `
        <div class="mini-stat"><div class="val" style="color:#dc2626">${stats.maxPremium.toFixed(2)}%</div><div class="lbl">最大溢价</div></div>
        <div class="mini-stat"><div class="val" style="color:#2563eb">${stats.maxDiscount.toFixed(2)}%</div><div class="lbl">最大折价</div></div>
        <div class="mini-stat"><div class="val">${stats.signalCount}</div><div class="lbl">超阈值次数</div></div>
        <div class="mini-stat"><div class="val">${stats.avgAbs.toFixed(2)}%</div><div class="lbl">平均|偏离|</div></div>
    `;
}

function updateHints() {
    const mode = getCurrentMode();
    const source = getCurrentDataSource();

    const modeHint = document.getElementById('mode-hint');
    const sourceHint = document.getElementById('source-hint');

    if (mode === 'inav') {
        modeHint.textContent = '数据源直接提供 iNAV 时选此项（如 Bloomberg 7709IV Index），系统仅对比 iNAV 与 ETF 市价';
    } else {
        modeHint.textContent = '无 iNAV 数据源时选此项，系统用海力士股价×2 + 汇率变动自动合成 iNAV';
    }

    if (source === 'api') {
        sourceHint.textContent = '通过 API 自动获取实时行情数据';
    } else {
        sourceHint.textContent = '手动填入基准价格（昨收）和当日实时价格数据';
    }

    // Disable/enable Yahoo Finance based on mode
    updateProviderAvailability(mode);
}

function updateProviderAvailability(mode) {
    const select = document.getElementById('data-source-provider');
    const tokenInput = document.getElementById('api-token');
    if (!select) return;

    const yahooOption = select.querySelector('option[value="yahoo"]');
    if (mode === 'inav') {
        yahooOption.disabled = true;
        yahooOption.textContent = 'Yahoo Finance（不支持 iNAV，请选其他数据源）';
        // If yahoo is currently selected, auto-switch to first available alternative
        if (select.value === 'yahoo') {
            select.value = 'alphavantage';
            tokenInput.classList.remove('hidden');
        }
    } else {
        yahooOption.disabled = false;
        yahooOption.textContent = 'Yahoo Finance（免费，无需Token）';
        // Auto-switch back to Yahoo when switching to system-calculated mode
        select.value = 'yahoo';
        tokenInput.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', init);

// Navbar active link tracking on scroll
(function() {
    const navLinks = document.querySelectorAll('.nav-links a');
    const sections = Array.from(navLinks).map(link => {
        const id = link.getAttribute('href').slice(1);
        return document.getElementById(id);
    }).filter(Boolean);

    function updateActiveLink() {
        const scrollPos = window.scrollY + 80;
        let activeIndex = 0;

        for (let i = 0; i < sections.length; i++) {
            if (sections[i].offsetTop <= scrollPos) {
                activeIndex = i;
            }
        }

        navLinks.forEach((link, i) => {
            link.classList.toggle('active', i === activeIndex);
        });
    }

    window.addEventListener('scroll', updateActiveLink);
    updateActiveLink();
})();
