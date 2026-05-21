// js/main.js

import { renderTable, renderBaseline, addRow, deleteLastRow, clearAll, parseData, validateData, getColumns } from './data-input.js';
import { runBacktest, analyzeDivergence, findChartMarkers } from './backtest-engine.js';
import { calculateStatistics } from './statistics.js';
import { renderCharts, destroyCharts } from './charts.js';
import { generateConclusion } from './conclusion.js';

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

    // Initial render
    renderBaseline(baselineContainer);
    renderTable(container);

    // Table action buttons
    document.getElementById('add-row-btn').addEventListener('click', () => {
        addRow();
    });

    document.getElementById('delete-row-btn').addEventListener('click', () => {
        deleteLastRow();
    });

    document.getElementById('clear-all-btn').addEventListener('click', () => {
        if (confirm('确认清空所有数据？')) {
            clearAll();
            setBtImportStatus('');
        }
    });

    // Backtest Excel import / template download
    document.getElementById('bt-download-tpl').addEventListener('click', () => {
        downloadBacktestTemplate();
    });
    const btFileInput = document.getElementById('bt-file-input');
    document.getElementById('bt-import').addEventListener('click', () => btFileInput.click());
    btFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importBacktestFile(e.target.files[0]);
            e.target.value = '';
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
    const data = parseData();

    if (data.length === 0) {
        alert('请先输入数据（至少需要一行有效数据）');
        return;
    }

    const errors = validateData(data);
    if (errors.length > 0) {
        alert('数据校验失败:\n' + errors.join('\n'));
        return;
    }

    const params = getParams();

    // Analyze divergence (used by both dashboard and stats panel)
    const analysis = analyzeDivergence(data, params.threshold);

    // Show and render dashboard
    renderDashboard(data, params.threshold, analysis);

    // Run backtest engine
    const trades = runBacktest(data, params);

    // Calculate results
    const totalProfitHKD = trades.reduce((s, t) => s + t.profitHKD, 0);
    const profitableTrades = trades.filter(t => t.netProfit > 0);
    const dayCount = analysis.byDate.length;

    // Show results section
    const resultsSection = document.getElementById('backtest-results');
    resultsSection.classList.remove('hidden');

    // Render simplified stats
    renderStatsPanel({
        totalProfitHKD,
        totalTrades: trades.length,
        profitableTrades: profitableTrades.length,
        avgProfit: trades.length > 0 ? totalProfitHKD / trades.length : 0,
        beforeCount: analysis.before.signalCount,
        afterCount: analysis.after.signalCount,
        dayCount,
    });

    // Render charts
    destroyCharts();
    renderCharts(data, trades);

    // Render trade log
    renderByDate(trades, analysis);
    renderTradeLog(trades);

    // Generate and show conclusion
    const stats = calculateStatistics(trades.map(t => ({ pnl: t.netProfit })));
    const conclusion = generateConclusion(stats);
    renderConclusion(conclusion);
}

function renderStatsPanel(stats) {
    const panel = document.getElementById('stats-panel');
    const items = [
        { label: '覆盖天数', value: `${stats.dayCount} 天`, hint: '回测数据涉及的交易日数' },
        { label: '总套利收益', value: `${stats.totalProfitHKD.toFixed(0)} HKD`, hint: '所有调仓交易的累计净收益' },
        { label: '信号触发', value: `${stats.totalTrades} 次`, hint: '背离超阈值的调仓次数' },
        { label: '有效交易', value: `${stats.profitableTrades} 次`, hint: '扣除费用后仍盈利的交易' },
        { label: '平均单次收益', value: `${stats.avgProfit.toFixed(0)} HKD`, hint: '总收益 / 交易次数' },
        { label: '14:30前信号', value: `${stats.beforeCount} 次`, hint: '韩国主板交易时段的信号（多日累计）' },
        { label: '14:30后信号', value: `${stats.afterCount} 次`, hint: '韩国主板收盘后的信号（多日累计）' },
    ];

    panel.innerHTML = items.map(item => `
        <div class="stat-card">
            <div class="value">${item.value}</div>
            <div class="label">${item.label}</div>
            <div class="stat-hint">${item.hint}</div>
        </div>
    `).join('');
}

function renderByDate(trades, analysis) {
    const container = document.getElementById('by-date-container');
    const title = document.getElementById('by-date-title');
    if (!container) return;

    // Single-day data: hide the by-date section entirely.
    const real = analysis.byDate.filter(d => d.date && d.date !== '__single__');
    if (real.length <= 1) {
        title?.classList.add('hidden');
        container.innerHTML = '';
        return;
    }
    title?.classList.remove('hidden');

    // Aggregate trades per date
    const tradesByDate = new Map();
    for (const t of trades) {
        const key = t.date || '__single__';
        if (!tradesByDate.has(key)) tradesByDate.set(key, []);
        tradesByDate.get(key).push(t);
    }

    const rows = real.map(day => {
        const tList = tradesByDate.get(day.date) || [];
        const dayPnl = tList.reduce((s, t) => s + t.profitHKD, 0);
        const wins = tList.filter(t => t.netProfit > 0).length;
        const winRate = tList.length > 0 ? (wins / tList.length) * 100 : 0;
        const pnlColor = dayPnl >= 0 ? '#16a34a' : '#dc2626';
        return `
            <tr>
                <td>${day.date}</td>
                <td>${day.count}</td>
                <td>${day.signalCount}</td>
                <td>${tList.length}</td>
                <td>${wins} / ${tList.length} (${winRate.toFixed(0)}%)</td>
                <td style="color:#dc2626">${day.maxPremium.toFixed(2)}%</td>
                <td style="color:#2563eb">${day.maxDiscount.toFixed(2)}%</td>
                <td>${day.avgAbs.toFixed(2)}%</td>
                <td style="color:${pnlColor}; font-weight:600">${dayPnl.toFixed(0)} HKD</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>日期</th>
                    <th>数据点</th>
                    <th>超阈值</th>
                    <th>交易数</th>
                    <th>胜率</th>
                    <th>最大溢价</th>
                    <th>最大折价</th>
                    <th>平均|偏离|</th>
                    <th>当日收益</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
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
            <td>${t.date && t.date !== '__single__' ? t.date : '-'}</td>
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
                    <th>日期</th>
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
        'end_of_day': '当日收盘',
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

// ===== Backtest: Excel/CSV import & template =====

function setBtImportStatus(text, type = '') {
    const el = document.getElementById('bt-import-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'fetch-status ' + type;
}

/**
 * Build the column definition used by the unified backtest data table.
 * 6 columns: 日期 | 时间 | iNAV(HKD) | 海力士股价(KRW) | KRW/HKD汇率 | ETF市价(HKD)
 *
 * Per-row iNAV resolution (truth → shadow → skip) happens in data-input.parseData.
 */
function getBacktestExportColumns() {
    return [
        { label: '日期',           placeholder: 'YYYY-MM-DD' },
        { label: '时间',           placeholder: 'HH:MM' },
        { label: 'iNAV(HKD)',      placeholder: '14:30前' },
        { label: '海力士股价(KRW)', placeholder: '201000' },
        { label: 'KRW/HKD汇率',    placeholder: '0.00600' },
        { label: 'ETF市价(HKD)',   placeholder: '10.15' },
    ];
}

function downloadBacktestTemplate() {
    const cols = getBacktestExportColumns();
    // Three consecutive trading-day-ish dates ending today.
    const dayStr = (offsetDays) => {
        const d = new Date();
        d.setDate(d.getDate() - offsetDays);
        return d.toISOString().slice(0, 10);
    };
    const d2 = dayStr(2), d1 = dayStr(1), d0 = dayStr(0);
    // Each day shows the recommended pattern:
    //   - 09:30 / 10:30 / 13:30 / 14:30 -> all columns filled (iNAV from BBG)
    //   - 15:30 / 16:00 -> iNAV blank, Hynix+FX filled (system uses shadow iNAV)
    const sampleRows = [
        [d2, '09:30', '10.00', '200000', '0.00600', '10.00'],
        [d2, '10:30', '10.10', '201000', '0.00600', '10.28'],
        [d2, '13:30', '10.15', '201500', '0.00601', '10.16'],
        [d2, '14:30', '10.20', '202000', '0.00601', '10.19'],
        [d2, '15:30', '',      '202200', '0.00600', '10.40'],
        [d2, '16:00', '',      '202300', '0.00601', '10.25'],
        [d1, '09:30', '10.25', '202500', '0.00600', '10.25'],
        [d1, '10:30', '10.32', '203200', '0.00601', '10.10'],
        [d1, '13:30', '10.30', '203000', '0.00600', '10.32'],
        [d1, '14:30', '10.31', '203100', '0.00601', '10.30'],
        [d1, '15:30', '',      '203300', '0.00601', '10.34'],
        [d1, '16:00', '',      '203400', '0.00600', '10.35'],
        [d0, '09:30', '10.35', '203500', '0.00600', '10.36'],
        [d0, '10:30', '10.40', '204000', '0.00601', '10.55'],
        [d0, '13:30', '10.42', '204200', '0.00600', '10.43'],
        [d0, '14:30', '10.45', '204500', '0.00601', '10.44'],
        [d0, '15:30', '',      '204600', '0.00600', '10.62'],
        [d0, '16:00', '',      '204800', '0.00601', '10.50'],
    ];

    const header = cols.map(c => c.label);
    const ws = XLSX.utils.aoa_to_sheet([header, ...sampleRows]);
    ws['!cols'] = cols.map(() => ({ wch: 15 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '回测数据');
    XLSX.writeFile(wb, 'backtest_template.xlsx');
}

/**
 * Import an Excel/CSV into the unified backtest data table.
 * Expected columns: 日期 | 时间 | iNAV(HKD) | 海力士股价(KRW) | KRW/HKD汇率 | ETF市价(HKD)
 *
 * - Multi-day is fully supported (engine groups by date and computes per-day baselines).
 * - Empty 日期 rows are bucketed into a synthetic single-day group.
 * - Empty iNAV cells are normal: parseData() falls back to shadow iNAV per row.
 * - Backward-compatible with the legacy 5-column "no-iNAV" template
 *   (日期 | 时间 | 海力士 | 汇率 | ETF) — detected by the header row.
 */
function importBacktestFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array', cellDates: false });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
            if (rows.length === 0) {
                setBtImportStatus('文件中没有数据', 'error');
                return;
            }

            // Detect legacy layout by inspecting header row.
            // Modern: 6 cols, header[2] contains "iNAV"
            // Legacy iNAV-only: header[2] contains "iNAV", header.length === 4
            // Legacy no-iNAV: header[2] contains "海力士", header.length === 5
            const header = rows[0].map(h => String(h ?? ''));
            const colCount = header.length;
            const headerHasInav = /iNAV/i.test(header[2] || '');
            const headerHasHynix = /海力士|hynix/i.test(header[2] || '');

            const dataRows = rows.slice(1).filter(r =>
                r && r.length > 1 && r[1] !== undefined && r[1] !== null && String(r[1]).trim() !== ''
            );
            if (dataRows.length === 0) {
                setBtImportStatus('文件中没有有效数据', 'error');
                return;
            }

            // Map each raw row to the 6-column entry shape used by the table.
            const mapRow = (r) => {
                const date = normalizeDate(r[0]);
                const time = normalizeTime(r[1]);
                const v = (i) => (r[i] != null && r[i] !== '' ? String(r[i]) : '');
                if (colCount >= 6 || (headerHasInav && colCount > 4)) {
                    // Modern 6-column layout
                    return { date, time, inavPrice: v(2), hynixPrice: v(3), fxRate: v(4), etfPrice: v(5) };
                }
                if (headerHasInav) {
                    // Legacy: 日期 | 时间 | iNAV | ETF
                    return { date, time, inavPrice: v(2), hynixPrice: '', fxRate: '', etfPrice: v(3) };
                }
                if (headerHasHynix) {
                    // Legacy: 日期 | 时间 | 海力士 | 汇率 | ETF
                    return { date, time, inavPrice: '', hynixPrice: v(2), fxRate: v(3), etfPrice: v(4) };
                }
                // Unknown: treat as modern layout best-effort
                return { date, time, inavPrice: v(2), hynixPrice: v(3), fxRate: v(4), etfPrice: v(5) };
            };

            const cols = getColumns();
            const tbody = document.getElementById('data-tbody');
            const html = dataRows.map(r => {
                const entry = mapRow(r);
                const cells = cols.map(c => {
                    const value = entry[c.key] !== undefined ? entry[c.key] : '';
                    return `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="any" value="${value}"></td>`;
                }).join('');
                return `<tr>${cells}</tr>`;
            }).join('');
            tbody.innerHTML = html;

            const uniqueDates = new Set(
                dataRows.map(r => normalizeDate(r[0])).filter(d => d !== '')
            );
            const dayCount = uniqueDates.size;
            const layoutHint = (colCount < 6 && (headerHasInav || headerHasHynix))
                ? '（旧版模板已自动适配）'
                : '';
            if (dayCount > 1) {
                setBtImportStatus(`已导入 ${dataRows.length} 行，覆盖 ${dayCount} 个交易日 ${layoutHint}`, 'success');
            } else if (dayCount === 1) {
                setBtImportStatus(`已导入 ${dataRows.length} 行（${[...uniqueDates][0]}）${layoutHint}`, 'success');
            } else {
                setBtImportStatus(`已导入 ${dataRows.length} 行（无日期列，按单日处理）${layoutHint}`, 'success');
            }
        } catch (err) {
            setBtImportStatus('文件解析失败: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

/**
 * Normalize a date cell into 'YYYY-MM-DD'.
 * Excel may give a date as a serial number (e.g. 45797), an ISO string, or
 * simply 'YYYY/MM/DD' / 'YYYY-MM-DD'. We coerce all three to ISO form.
 */
function normalizeDate(cell) {
    if (cell == null || cell === '') return '';
    if (typeof cell === 'number') {
        // SSF.format converts an Excel serial date to a string
        try {
            const formatted = XLSX.SSF.format('yyyy-mm-dd', cell);
            return String(formatted);
        } catch {
            return '';
        }
    }
    const s = String(cell).trim();
    // Convert '2026/05/13' -> '2026-05-13'; leave already-ISO strings intact.
    return s.replace(/\//g, '-');
}

function normalizeTime(cell) {
    if (cell == null || cell === '') return '';
    // Excel sometimes stores 'HH:MM' as a fraction of a day; coerce.
    if (typeof cell === 'number' && cell >= 0 && cell < 1) {
        try {
            return XLSX.SSF.format('hh:mm', cell);
        } catch {
            // fall through
        }
    }
    return String(cell).trim();
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
    { time: '14:45', inav: '92.85', etf: '92.80', hynix: '203200', krwhkd: '0.0058' },
    { time: '15:00', inav: '92.55', etf: '93.10', hynix: '203500', krwhkd: '0.0058' },
    { time: '15:30', inav: '92.52', etf: '92.60', hynix: '203000', krwhkd: '0.0058' },
    { time: '16:00', inav: '92.58', etf: '92.90', hynix: '203300', krwhkd: '0.0058' },
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

    // Always prefer official iNAV (available all day from BBG)
    const referenceInav = officialInav || shadowInav;
    const inavSource = officialInav ? '官方iNAV' : '影子iNAV';

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
            <div class="div-label">最新数据时间</div>
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
    const labels = data.map(d => d.time);
    const officialInav = [];
    const etfPrices = [];
    const shadowInav = [];

    for (const d of data) {
        etfPrices.push(d.etf);
        officialInav.push(d.inav);

        if (d.hynix && d.krwhkd) {
            const hynixChange = (d.hynix - baseHynix) / baseHynix;
            const fxChange = (d.krwhkd - baseKrwhkd) / baseKrwhkd;
            const shadowHkd = baseInav * (1 + hynixChange * 2) * (1 + fxChange);
            shadowInav.push(parseFloat(shadowHkd.toFixed(4)));
        } else {
            shadowInav.push(null);
        }
    }

    // Chart 1: iNAV vs ETF Price (full day direct comparison)
    const ctx1 = document.getElementById('chart-price-vs-inav').getContext('2d');
    if (chartPriceVsInav) chartPriceVsInav.destroy();

    chartPriceVsInav = new Chart(ctx1, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'ETF 成交价',
                    data: etfPrices,
                    borderColor: '#2563eb',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                },
                {
                    label: 'iNAV（官方）',
                    data: officialInav,
                    borderColor: '#16a34a',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    spanGaps: true,
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: 'ETF成交价 vs 官方iNAV（全天对比）' },
                legend: { labels: { usePointStyle: true, pointStyle: 'line' } },
            },
            scales: { y: { title: { display: true, text: '价格 (HKD)' } } },
        },
    });

    // Chart 2: Shadow iNAV vs Official iNAV (full day validation)
    const ctx2 = document.getElementById('chart-shadow-validation').getContext('2d');
    if (chartShadowValidation) chartShadowValidation.destroy();

    const validationLabels = [];
    const officialLine = [];
    const shadowLine = [];
    const errorLine = [];

    for (let i = 0; i < data.length; i++) {
        if (officialInav[i] !== null && shadowInav[i] !== null) {
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
                title: { display: true, text: '影子iNAV校验（全天对比官方）' },
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

function renderDashboard(data, threshold, analysis) {
    const dashboard = document.getElementById('dashboard');
    dashboard.classList.remove('hidden');

    if (!analysis) {
        analysis = analyzeDivergence(data, threshold);
    }

    // Render divergence chart
    renderDivergenceChart(data, threshold);

    // Render before/after stats
    renderPeriodStats('before-stats', analysis.before, threshold);
    renderPeriodStats('after-stats', analysis.after, threshold);
}

/**
 * Build human-friendly X-axis labels for chart.
 * - Single day: 'HH:MM'
 * - Multi day:  'MM-DD HH:MM'
 */
function buildAxisLabels(data) {
    const dates = new Set(data.map(d => d.date || '').filter(Boolean));
    const multiDay = dates.size > 1;
    return data.map(d => {
        const time = d.time || '';
        if (!multiDay || !d.date) return time;
        // 'YYYY-MM-DD' -> 'MM-DD'
        const md = d.date.length >= 10 ? d.date.slice(5) : d.date;
        return `${md} ${time}`;
    });
}

function renderDivergenceChart(data, threshold) {
    const ctx = document.getElementById('divergence-chart').getContext('2d');
    if (divergenceChart) divergenceChart.destroy();

    const labels = buildAxisLabels(data);
    const premiums = data.map(d => d.premiumDiscount);
    const { dayBoundaries, cutoffIndices } = findChartMarkers(data);

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
            id: 'thresholdAndMarkers',
            afterDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                const yScale = scales.y;
                const xScale = scales.x;

                ctx.save();

                // Threshold horizontal lines
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

                // Per-day cutoff (14:30) lines
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#ca8a04';
                ctx.lineWidth = 1.5;
                for (const idx of cutoffIndices) {
                    const xPos = xScale.getPixelForValue(idx);
                    ctx.beginPath();
                    ctx.moveTo(xPos, chartArea.top);
                    ctx.lineTo(xPos, chartArea.bottom);
                    ctx.stroke();
                }

                // Day boundary solid lines (multi-day only)
                ctx.setLineDash([]);
                ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
                ctx.lineWidth = 1;
                for (const idx of dayBoundaries) {
                    const xPos = xScale.getPixelForValue(idx);
                    ctx.beginPath();
                    ctx.moveTo(xPos, chartArea.top);
                    ctx.lineTo(xPos, chartArea.bottom);
                    ctx.stroke();
                }

                // Label the first cutoff (avoid clutter when many days)
                if (cutoffIndices.length > 0) {
                    ctx.fillStyle = '#ca8a04';
                    ctx.font = '11px sans-serif';
                    const xPos = xScale.getPixelForValue(cutoffIndices[0]);
                    const labelText = cutoffIndices.length > 1
                        ? `14:30 韩国收盘 (×${cutoffIndices.length})`
                        : '14:30 韩国收盘';
                    ctx.fillText(labelText, xPos + 4, chartArea.top + 14);
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
