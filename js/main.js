// js/main.js

import { renderTable, renderBaseline, addRow, deleteLastRow, clearAll, parseData, validateData, updateBacktestShadowColumn, renderRowHTML, loadAndPopulateDemoData, getDataQualityFlags } from './data-input.js';
import { runBacktest, analyzeDivergence, findChartMarkers } from './backtest-engine.js';
import { calculateStatistics } from './statistics.js';
import { renderCharts, destroyCharts } from './charts.js';
import { generateConclusion } from './conclusion.js';

// Tick size of 7709 HK Equity (HKD), used for "spread in ticks" diagnostics.
const TICK_SIZE = 0.005;

function getParams() {
    // Trading window (HKT). Defaults to afternoon-only:
    //   13:00 — earliest trade (skip morning + lunch break)
    //   15:55 — latest trade  (5-min buffer before HKEX 16:00 close so we
    //           don't try to fire when liquidity is already gone)
    // Both endpoints are inclusive. Falls back to a permissive default if
    // the user types garbage like ":xx".
    const validHM = s => /^\d{2}:\d{2}$/.test(s);
    const winStartRaw = document.getElementById('window-start')?.value.trim() || '13:00';
    const winEndRaw   = document.getElementById('window-end')?.value.trim()   || '15:55';
    return {
        threshold: parseFloat(document.getElementById('threshold').value) || 2.0,
        swapCost: parseFloat(document.getElementById('swap-cost').value) || 0.4,
        tradeAmount: parseFloat(document.getElementById('trade-amount').value) || 100000,
        windowStart: validHM(winStartRaw) ? winStartRaw : '13:00',
        windowEnd:   validHM(winEndRaw)   ? winEndRaw   : '15:55',
        // When true, rows tagged as "post-NAV-jump suspect" don't trigger
        // swaps (they remain visible in the table & charts but the engine
        // pretends they don't exist for execution-feasibility purposes).
        excludeSuspect: document.getElementById('exclude-suspect')?.checked ?? true,
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
            // The dashboard refresh is fired from inside importBacktestFile()
            // once the FileReader callback finishes — see post-render hook.
            importBacktestFile(e.target.files[0]);
            e.target.value = '';
        }
    });

    // Auto-refresh dashboard and shadow column when backtest table data changes
    const dataTableContainer = document.getElementById('data-table-container');
    if (dataTableContainer) {
        dataTableContainer.addEventListener('input', (e) => {
            // Don't re-trigger on shadow column changes (readonly)
            if (e.target.classList.contains('shadow-cell')) return;
            updateBacktestShadowColumn();
            refreshDashboard();
        });
    }

    // Collapse toggles (smooth animation) - handle all collapsible sections
    document.querySelectorAll('.collapse-toggle').forEach(toggle => {
        const contentId = toggle.getAttribute('aria-controls');
        const content = document.getElementById(contentId);
        if (content) {
            toggle.addEventListener('click', () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', !expanded);
                content.classList.toggle('open');
            });
        }
    });

    // Run backtest button
    document.getElementById('run-backtest-btn').addEventListener('click', () => {
        executeBacktest();
    });

    // Zoom toggle for the Theo-vs-Published comparison chart
    const zoomBtn = document.getElementById('zoom-toggle');
    if (zoomBtn) {
        zoomBtn.addEventListener('click', () => {
            inavZoomEnabled = !inavZoomEnabled;
            zoomBtn.setAttribute('aria-pressed', inavZoomEnabled ? 'true' : 'false');
            zoomBtn.textContent = inavZoomEnabled ? '恢复全天视角' : '放大主板时段';
            if (lastInavComparisonData) renderInavComparisonChart(lastInavComparisonData);
        });
    }

    // === Theo Premium Monitor (manual-input live snapshot) ===
    initTheoMonitor();

    // === Price Monitor Section (legacy minute-level table + charts) ===
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

    // Initial shadow column + dashboard render from demo data.
    // The default dataset is fetched async from /data/demo-multi-day.json
    // (5 BBG trading days preprocessed offline). The inline fallback
    // already rendered above stays visible until the fetch resolves —
    // typically <50ms on localhost but tolerant to slow/missing networks.
    (async () => {
        const result = await loadAndPopulateDemoData();
        if (result.ok) {
            console.info(`[demo] loaded multi-day dataset: ${result.rows} rows · ${result.dates.length} days (${result.dates.join(', ')})`);
        }
        // Always refresh dashboard from whatever rows are now in the DOM,
        // success or failure.
        updateBacktestShadowColumn();
        refreshDashboard();
    })();

    // Lazy-load the changelog from /api/changelog (auto-built from git log).
    loadChangelog();
}

/**
 * Pull recent commits from the backend and render them into the
 * #changelog-list panel. Failures are silent (just shows a fallback note).
 *
 * Commit subjects follow Conventional Commit-ish style, e.g.:
 *   "feat(strategy): rewrite backtest as position-swap arbitrage (底仓换仓套利)"
 * We strip the leading "type(scope):" prefix when present, since end users
 * don't care about the technical type.
 */
async function loadChangelog() {
    const list = document.getElementById('changelog-list');
    const summary = document.getElementById('changelog-summary');
    if (!list) return;

    try {
        const resp = await fetch('/api/changelog?limit=15', { cache: 'no-store' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const { entries, total } = await resp.json();

        if (!entries || entries.length === 0) {
            list.innerHTML = '<p class="note" style="margin:1rem 0;">暂无提交记录。</p>';
            return;
        }

        if (summary) {
            const latest = entries[0].date;
            summary.textContent = `共 ${total} 次更新 · 最新 ${latest}`;
        }

        // Group entries by date for a compact timeline-style render
        const byDate = new Map();
        for (const e of entries) {
            const subj = humanizeSubject(e.subject);
            if (!byDate.has(e.date)) byDate.set(e.date, []);
            byDate.get(e.date).push({ ...e, subject: subj });
        }

        const html = [...byDate.entries()].map(([date, items]) => `
            <div class="changelog-day">
                <div class="changelog-date">${date}</div>
                <ul class="changelog-items">
                    ${items.map(it => `
                        <li>
                            <span class="changelog-text">${escapeHtml(it.subject)}</span>
                            <code class="changelog-hash">${it.hash}</code>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `).join('');

        list.innerHTML = html;
    } catch (err) {
        list.innerHTML = `<p class="note" style="margin:1rem 0;color:#94a3b8;">无法获取更新日志（${escapeHtml(err.message)}）</p>`;
    }
}

/**
 * Strip Conventional-Commit prefix like "feat(scope): ..." down to the
 * human-friendly part. Keeps the subject as-is if no prefix matches.
 */
function humanizeSubject(s) {
    if (!s) return '';
    return s.replace(/^(feat|fix|tweak|refactor|chore|docs|style|perf|test|build|ci)(\([^)]*\))?:\s*/i, '');
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
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
    // Inject suspect-row flags into params so the engine can skip rows
    // where iNAV is post-jump (not executable). See backtest-engine.js
    // runBacktest() for the filtering semantics.
    params.suspectFlags = getDataQualityFlags();

    // Analyze divergence (used by both dashboard and stats panel)
    const analysis = analyzeDivergence(data, params.threshold);

    // Show and render dashboard
    renderDashboard(data, params.threshold, analysis, params);

    // Run swap engine
    const swaps = runBacktest(data, params);

    // Calculate results
    const totalProfitHKD = swaps.reduce((s, t) => s + t.profitHKD, 0);
    const profitableSwaps = swaps.filter(t => t.netProfit > 0);
    const dayCount = analysis.byDate.length;
    const upSwaps = swaps.filter(t => t.direction === 'sell_etf_buy_stock').length;
    const downSwaps = swaps.filter(t => t.direction === 'buy_etf_sell_stock').length;

    // Show results section
    const resultsSection = document.getElementById('backtest-results');
    resultsSection.classList.remove('hidden');

    // Per-swap spread distribution in ticks (how big the trigger moves are).
    // Used in "single-swap characteristics" group.
    const swapsWithTicks = swaps.filter(s => s.spreadTicks != null);
    const avgSpreadTicks = swapsWithTicks.length > 0
        ? swapsWithTicks.reduce((s, t) => s + Math.abs(t.spreadTicks), 0) / swapsWithTicks.length
        : 0;
    const maxSpreadTicks = swapsWithTicks.length > 0
        ? Math.max(...swapsWithTicks.map(t => Math.abs(t.spreadTicks)))
        : 0;

    // Direction split — used for the bias-distribution card.
    // upSwaps   = sell-ETF swaps (trader exits ETF when premium > 0)
    // downSwaps = buy-ETF swaps  (trader exits Hynix when premium < 0)
    const dominant = upSwaps === downSwaps ? '均衡'
                   : upSwaps  > downSwaps  ? 'Premium 主导'
                   :                         'Discount 主导';

    renderStatsPanel({
        totalProfitHKD,
        totalSwaps: swaps.length,
        avgProfit: swaps.length > 0 ? totalProfitHKD / swaps.length : 0,
        avgSpreadTicks,
        maxSpreadTicks,
        upSwaps,
        downSwaps,
        dominant,
        dayCount,
        // Threshold/swapCost so the panel can render the "threshold ≤ cost"
        // warning when configuration is degenerate.
        threshold: params.threshold,
        swapCost: params.swapCost,
        windowStart: params.windowStart,
        windowEnd: params.windowEnd,
    });

    // Render charts (heatmap needs trading-window params for the grey overlay)
    destroyCharts();
    renderCharts(data, swaps, params);

    // Render data-quality diagnostic + swap log
    renderDataQuality(data);
    renderByDate(swaps, analysis);
    renderTradeLog(swaps);

    // Generate and show conclusion. The conclusion engine needs dayCount and
    // swapCost on top of the per-trade pnl list to compute frequency-per-day
    // and the safety margin vs. swap cost.
    const stats = calculateStatistics(swaps.map(t => ({ pnl: t.netProfit })));
    const conclusion = generateConclusion(stats, {
        dayCount,
        swapCost: params.swapCost,
    });
    renderConclusion(conclusion);
}

/**
 * Render the result stats as 3 logical groups + an optional warning banner.
 *
 *   Group 1  汇总（4 cards）  : 覆盖天数 / 换仓次数 / 总锁定收益 / 平均单次收益
 *   Group 2  单笔特征（2 cards）: 平均触发幅度 / 最大触发幅度 (in ticks)
 *   Group 3  方向分布（1 card）: 卖 / 买 ETF 换仓数 + 主导偏向
 *
 * Removed (vs previous version):
 *   - 「盈利换仓」  恒等于换仓次数（threshold > swapCost 时必盈利），
 *                  退化为冗余信息。
 *   - 「14:20 前/后 信号」 信号 ≠ 换仓，且新理论 iNAV 模型下 14:20
 *                  分时段不再有 truth/shadow 切换的语义。每日机会分
 *                  布留给下面「按日汇总」表呈现。
 *
 * Replacement for "盈利换仓":
 *   - 当 threshold ≤ swapCost 时，配置已经退化（每笔都亏损），在面板
 *     顶部渲染一条红色警告条，明确指引用户调参。
 */
function renderStatsPanel(stats) {
    const panel = document.getElementById('stats-panel');

    // Optional warning: degenerate configuration
    const warningHtml = stats.threshold <= stats.swapCost
        ? `<div class="stats-warning">
             ⚠ 当前阈值 ${stats.threshold.toFixed(2)}% ≤ 换仓成本 ${stats.swapCost.toFixed(2)}%，
             所有触发都将亏损。请提高阈值，或确认成本输入是否高估。
           </div>`
        : '';

    // Info: trading-window scope (helps the user understand why they don't
    // see a 16:17 swap even when the divergence chart shows a wide premium).
    const winInfoHtml = (stats.windowStart && stats.windowEnd)
        ? `<div class="stats-info">
             ℹ 交易窗口：<strong>${stats.windowStart} – ${stats.windowEnd}</strong> (HKT) ·
             窗口外的偏离不会触发换仓（因 7709 HK 已不在连续竞价 / 港股已收盘）。
           </div>`
        : '';

    const card = (label, value, hint) => `
        <div class="stat-card">
            <div class="value">${value}</div>
            <div class="label">${label}</div>
            <div class="stat-hint">${hint}</div>
        </div>`;

    // Group 1: 汇总
    const summary = [
        card('覆盖天数',    `${stats.dayCount} 天`,
             '回测数据涉及的交易日数'),
        card('换仓次数',    `${stats.totalSwaps} 次`,
             '触发阈值且通过滞回检查的换仓总次数'),
        card('总锁定收益',  `${stats.totalProfitHKD.toFixed(0)} HKD`,
             '所有换仓累计净收益（按可执行偏离扣换仓成本）'),
        card('平均单次收益', `${stats.avgProfit.toFixed(0)} HKD`,
             '总锁定收益 / 换仓次数'),
    ].join('');

    // Group 2: 单笔特征
    const perSwap = [
        card('平均触发幅度', `${stats.avgSpreadTicks.toFixed(0)} ticks`,
             `换仓时 |ETF Last − 理论 iNAV| 的平均 tick 数 @ ${TICK_SIZE} HKD/tick`),
        card('最大触发幅度', `${stats.maxSpreadTicks.toFixed(0)} ticks`,
             '最显著的一次机会大小，用于判断尾部行情'),
    ].join('');

    // Group 3: 方向分布 (single combined card)
    const direction = `
        <div class="stat-card stat-card-wide">
            <div class="dir-split">
                <div class="dir-leg">
                    <span class="dir-label">卖 ETF</span>
                    <span class="dir-value sell">${stats.upSwaps}</span>
                </div>
                <div class="dir-divider"></div>
                <div class="dir-leg">
                    <span class="dir-label">买 ETF</span>
                    <span class="dir-value buy">${stats.downSwaps}</span>
                </div>
            </div>
            <div class="label">方向分布</div>
            <div class="stat-hint">${stats.dominant}（卖 ETF = Premium 时；买 ETF = Discount 时）</div>
        </div>`;

    // Row 2 combines "单笔特征" (2 cards) + "方向分布" (1 card) into a single
    // 3-column row to remove the large horizontal whitespace that appeared
    // when each group occupied its own full-width row.
    panel.innerHTML = `
        ${warningHtml}
        ${winInfoHtml}
        <div class="stats-section">
            <h4 class="stats-section-title">汇总</h4>
            <div class="stats-grid">${summary}</div>
        </div>
        <div class="stats-section">
            <h4 class="stats-section-title">单笔特征 · 方向分布</h4>
            <div class="stats-grid stats-grid-3">${perSwap}${direction}</div>
        </div>
    `;
}

/**
 * Render the per-day data-quality diagnostic table.
 *
 * For each trading day we report:
 *   - Rows           total normalized rows (1-min downsampled)
 *   - KP rows        rows with hynixKP not null (= pre-14:20 KP coverage)
 *   - FX coverage    fraction of rows with fxRate not null
 *   - KRX %          KP first-vs-last %-change (主板净涨跌)
 *   - iNAV %         Published iNAV first-vs-last %-change
 *   - 偏差           |iNAV% − 2×KRX%|  (核心指标——杠杆 ETF 应满足 iNAV ≈ 2×KRX)
 *   - 跳点           # of source 15s ticks where |Δ/prev| > 1% (suspect rows)
 *   - 评分           A / B / C based on jump count + leverage deviation
 *
 * 评分规则（保守）：
 *   A = 0 跳点 且 |偏差| ≤ 1%
 *   B = ≤ 2 跳点 且 |偏差| ≤ 3%
 *   C = 其余（数据建议谨慎使用）
 */
function renderDataQuality(data) {
    const container = document.getElementById('data-quality-container');
    const header = document.getElementById('data-quality-header');
    if (!container) return;

    // Group rows by date
    const byDate = new Map();
    for (const r of data) {
        const k = r.date || '__single__';
        if (!byDate.has(k)) byDate.set(k, []);
        byDate.get(k).push(r);
    }
    const real = [...byDate.entries()].filter(([d]) => d && d !== '__single__');
    if (real.length === 0) {
        header?.classList.add('hidden');
        container.innerHTML = '';
        return;
    }
    header?.classList.remove('hidden');

    const flags = getDataQualityFlags();   // Map<"date|time", 1>

    const rowsHtml = real.map(([date, rows]) => {
        const kpRows = rows.filter(r => r.hynixKP != null).length;
        const fxRows = rows.filter(r => r.fxRate != null).length;
        const fxPct = (fxRows / rows.length * 100).toFixed(0);

        // First/last KP and iNAV (published)
        const firstKp = rows.find(r => r.hynixKP != null)?.hynixKP;
        const lastKp = [...rows].reverse().find(r => r.hynixKP != null)?.hynixKP;
        const krxPct = (firstKp && lastKp) ? ((lastKp - firstKp) / firstKp * 100) : null;

        const firstInav = rows.find(r => r.inavPrice != null)?.inavPrice;
        const lastInav = [...rows].reverse().find(r => r.inavPrice != null)?.inavPrice;
        const inavPct = (firstInav && lastInav) ? ((lastInav - firstInav) / firstInav * 100) : null;

        // Deviation from 2× leverage expectation
        const deviation = (krxPct != null && inavPct != null) ? (inavPct - 2 * krxPct) : null;

        // Suspect rows (jump-tagged) for this date
        const suspectCount = rows.reduce((n, r) => n + (flags.get(`${date}|${r.time}`) ? 1 : 0), 0);

        // Score
        let score, scoreColor;
        const absDev = deviation != null ? Math.abs(deviation) : 0;
        if (suspectCount === 0 && absDev <= 1.0) { score = 'A'; scoreColor = '#16a34a'; }
        else if (suspectCount <= 2 && absDev <= 3.0) { score = 'B'; scoreColor = '#d97706'; }
        else { score = 'C'; scoreColor = '#dc2626'; }

        const fmt = (v, suffix = '') => v == null ? '—' : v.toFixed(2) + suffix;
        const devColor = deviation == null ? '#64748b'
                       : Math.abs(deviation) <= 1.0 ? '#16a34a'
                       : Math.abs(deviation) <= 3.0 ? '#d97706' : '#dc2626';
        const suspectColor = suspectCount === 0 ? '#64748b'
                           : suspectCount <= 2 ? '#d97706' : '#dc2626';

        return `
            <tr>
                <td>${date}</td>
                <td>${rows.length}</td>
                <td>${kpRows}</td>
                <td>${fxPct}%</td>
                <td>${fmt(krxPct, '%')}</td>
                <td>${fmt(inavPct, '%')}</td>
                <td style="color:${devColor};font-weight:600">${fmt(deviation, '%')}</td>
                <td style="color:${suspectColor};font-weight:600">${suspectCount}</td>
                <td style="color:${scoreColor};font-weight:700;text-align:center">${score}</td>
            </tr>`;
    }).join('');

    // Aggregate suspect totals for the footer line
    const totalRows = data.length;
    const totalSuspect = data.reduce(
        (n, r) => n + (flags.get(`${r.date}|${r.time}`) ? 1 : 0), 0);
    const excludeChecked = document.getElementById('exclude-suspect')?.checked ?? true;
    const filterStatus = excludeChecked
        ? `<span style="color:#16a34a;font-weight:600">已启用</span>：参与回测 <strong>${totalRows - totalSuspect}</strong> 行 · 排除 <strong>${totalSuspect}</strong> 行（NAV 跳点后）`
        : `<span style="color:#dc2626;font-weight:600">未启用</span>：${totalSuspect} 行可疑数据正在参与回测，PnL 可能虚高（可在策略参数中勾选「排除 NAV 跳点后区间」）`;

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>日期</th>
                    <th>分钟数</th>
                    <th>KP分钟</th>
                    <th>FX覆盖</th>
                    <th>KRX涨跌</th>
                    <th>iNAV涨跌</th>
                    <th title="iNAV% − 2×KRX%。理想杠杆 ETF 应≈0">杠杆偏差</th>
                    <th title="单 tick |Δ/prev|>1%（NAV重估/数据补丁）">跳点</th>
                    <th>评分</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
        <p style="font-size:0.72rem;color:#475569;margin:0.5rem 0 0.2rem;line-height:1.5">
            跳点过滤：${filterStatus}
        </p>
        <p style="font-size:0.7rem;color:#64748b;margin:0.2rem 0 0;line-height:1.5">
            <strong>评分规则</strong>：A = 0 跳点且|杠杆偏差|≤1%（数据干净）；
            B = ≤2 跳点且|杠杆偏差|≤3%（可用但需留意）；
            C = 跳点多或杠杆偏差 &gt;3%（建议剔除当日或谨慎使用，可能是 BBG NAV 重估 / 派息 / 数据补丁日）。
        </p>`;
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
        const pnlColor = dayPnl >= 0 ? '#16a34a' : '#dc2626';
        return `
            <tr>
                <td>${day.date}</td>
                <td>${day.count}</td>
                <td>${day.signalCount}</td>
                <td>${tList.length}</td>
                <td>${wins}</td>
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
                    <th>换仓数</th>
                    <th>盈利换仓</th>
                    <th>最大溢价</th>
                    <th>最大折价</th>
                    <th>平均|偏离|</th>
                    <th>当日净利</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function renderTradeLog(swaps) {
    const container = document.getElementById('trade-log-container');

    if (swaps.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#64748b;">无换仓记录</p>';
        return;
    }

    const rows = swaps.map((t, i) => {
        const dirText = t.direction === 'sell_etf_buy_stock'
            ? '<span style="color:#dc2626">卖 ETF / 买 Hynix</span>'
            : '<span style="color:#2563eb">买 ETF / 卖 Hynix 底仓</span>';
        const pnlColor = t.netProfit >= 0 ? '#16a34a' : '#dc2626';
        const refTag = t.refSide === 'bid' ? '<span class="ref-tag ref-bid">Bid</span>'
                     : t.refSide === 'ask' ? '<span class="ref-tag ref-ask">Ask</span>'
                     : '<span class="ref-tag ref-last">Last</span>';
        const ticksStr = t.spreadTicks != null ? `${t.spreadTicks.toFixed(0)}` : '-';
        const execStr = t.premiumExec != null
            ? `${t.premiumExec >= 0 ? '+' : ''}${t.premiumExec.toFixed(3)}%`
            : '-';
        return `
        <tr>
            <td>${i + 1}</td>
            <td>${t.date && t.date !== '__single__' ? t.date : '-'}</td>
            <td>${t.swapTime || t.swapIndex}</td>
            <td>${dirText}</td>
            <td>${t.premium >= 0 ? '+' : ''}${t.premium.toFixed(3)}%</td>
            <td>${execStr} ${refTag}</td>
            <td>${ticksStr}</td>
            <td>${t.rawProfit.toFixed(3)}%</td>
            <td style="color:#94a3b8">-${t.swapCost.toFixed(2)}%</td>
            <td style="color:${pnlColor}; font-weight:600">${t.netProfit.toFixed(3)}%</td>
            <td style="color:${pnlColor}; font-weight:600">${t.profitHKD.toFixed(0)} HKD</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>日期</th>
                    <th>换仓时间</th>
                    <th>方向</th>
                    <th>盘口偏离 (Last)</th>
                    <th>可执行偏离</th>
                    <th>价差 (ticks)</th>
                    <th>锁定毛利</th>
                    <th>换仓成本</th>
                    <th>净利%</th>
                    <th>净利 HKD</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
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

        <h3 style="margin-top:1rem;">指标说明</h3>
        <div class="conclusion-metrics-note">
            <p><strong>触发频率（次/天）</strong> = 换仓总数 / 覆盖天数；衡量套利机会密度。健康范围 ≥ 1。</p>
            <p><strong>平均锁定收益</strong> = 每笔换仓在扣除 swap_cost 后锁定的净利率（%）。</p>
            <p><strong>安全边际倍数</strong> = 平均锁定收益 / 单笔换仓成本。
                ≥ 1× 意味着即使滑点把成本翻倍仍能盈利。</p>
            <p style="color:var(--color-text-muted); font-size:0.8rem; margin-top:0.5rem;">
                注：本策略采用『偏离触发即锁定』模型（delta 中性，无平仓），传统的<strong>胜率 / 最大回撤 / 盈亏比 / 夏普比率</strong>
                在此场景下退化（胜率 ≈ 100%，回撤 ≈ 0），故已移除。
            </p>
        </div>
    `;
}

// ===== Theoretical iNAV Validation (currently dead code, kept for reference) =====

let shadowBacktestChart = null;

/**
 * Render the locally-computed theoretical iNAV vs the official Published
 * iNAV. Helps the user verify the formula reproduces Published values closely
 * during the morning session (when r ≈ 0).
 *
 * NOTE: not currently invoked from executeBacktest — left in place because the
 * dashboard charts (renderInavComparisonChart / renderInavValidationChart)
 * already cover the same diagnostic.
 */
function renderShadowValidation(data) {
    const section = document.getElementById('shadow-validation-section');
    const canvas = document.getElementById('shadow-backtest-chart');
    const statsPanel = document.getElementById('shadow-validation-stats');

    // Filter rows that have both official iNAV and shadow calculation
    const validRows = data.filter(r => r.officialInavChange !== null && r.shadowInavChange !== null);

    if (validRows.length < 2) {
        section.classList.add('hidden');
        if (shadowBacktestChart) { shadowBacktestChart.destroy(); shadowBacktestChart = null; }
        return;
    }

    section.classList.remove('hidden');

    // Calculate stats
    const errors = validRows.map(r => r.shadowInavChange - r.inavChange);
    const absErrors = errors.map(e => Math.abs(e));
    const maxError = Math.max(...absErrors);
    const avgError = absErrors.reduce((s, e) => s + e, 0) / absErrors.length;
    const maxErrorRow = validRows[absErrors.indexOf(maxError)];

    statsPanel.innerHTML = `
        <div class="stat-card">
            <div class="value">${validRows.length}</div>
            <div class="label">对比数据点</div>
            <div class="stat-hint">同时有官方iNAV和海力士+汇率的行数</div>
        </div>
        <div class="stat-card">
            <div class="value">${avgError.toFixed(4)}%</div>
            <div class="label">平均绝对误差</div>
            <div class="stat-hint">理论 iNAV 涨跌幅与官方 iNAV 涨跌幅的平均偏差</div>
        </div>
        <div class="stat-card">
            <div class="value">${maxError.toFixed(4)}%</div>
            <div class="label">最大误差</div>
            <div class="stat-hint">出现在 ${maxErrorRow.time || '-'}</div>
        </div>
        <div class="stat-card">
            <div class="value">${maxError < 0.1 ? '优秀' : maxError < 0.3 ? '良好' : '偏大'}</div>
            <div class="label">模型精度</div>
            <div class="stat-hint">${maxError < 0.1 ? '误差<0.1%，可放心使用' : maxError < 0.3 ? '误差<0.3%，基本可用' : '建议检查数据对齐'}</div>
        </div>
    `;

    // Render chart
    const ctx = canvas.getContext('2d');
    if (shadowBacktestChart) shadowBacktestChart.destroy();

    const labels = validRows.map(r => r.time || '');
    const officialLine = validRows.map(r => r.officialInavChange);
    const shadowLine = validRows.map(r => r.shadowInavChange);
    const errorBars = errors;

    shadowBacktestChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '官方 iNAV 涨跌幅 (%)',
                    data: officialLine,
                    borderColor: '#16a34a',
                    borderWidth: 2,
                    pointRadius: 0,
                    yAxisID: 'y',
                    fill: false,
                },
                {
                    label: '理论 iNAV 涨跌幅 (%)',
                    data: shadowLine,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    pointRadius: 0,
                    borderDash: [5, 3],
                    yAxisID: 'y',
                    fill: false,
                },
                {
                    label: '误差 (%)',
                    data: errorBars,
                    type: 'bar',
                    backgroundColor: errorBars.map(e => e >= 0 ? 'rgba(220, 38, 38, 0.25)' : 'rgba(37, 99, 235, 0.25)'),
                    borderColor: errorBars.map(e => e >= 0 ? 'rgba(220, 38, 38, 0.6)' : 'rgba(37, 99, 235, 0.6)'),
                    borderWidth: 1,
                    yAxisID: 'y1',
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: '理论 iNAV vs 官方 iNAV（涨跌幅对比）' },
                legend: { labels: { usePointStyle: true, pointStyle: 'line' } },
            },
            scales: {
                y: { position: 'left', title: { display: true, text: '涨跌幅 (%)' } },
                y1: { position: 'right', title: { display: true, text: '误差 (%)' }, grid: { drawOnChartArea: false } },
            },
        },
    });
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
 * 8 columns: 日期 | 时间 | iNAV | KP | KT | FX | ETF Last | ETF Bid | ETF Ask
 * (Bid/Ask are optional — leave blank to evaluate using Last only.)
 *
 * Per-row Theo iNAV resolution happens in data-input.parseData.
 */
function getBacktestExportColumns() {
    return [
        { label: '日期',            placeholder: 'YYYY-MM-DD' },
        { label: '时间',            placeholder: 'HH:MM' },
        { label: 'iNAV(HKD)',       placeholder: '官方Published' },
        { label: '海力士KP(KRW)',    placeholder: '主板' },
        { label: '海力士KT(KRW)',    placeholder: 'NextTrade' },
        { label: 'KRW/HKD汇率',     placeholder: '0.00520' },
        { label: 'ETF Last(HKD)',   placeholder: '93.62' },
        { label: 'ETF Bid(HKD)',    placeholder: '可空' },
        { label: 'ETF Ask(HKD)',    placeholder: '可空' },
    ];
}

function downloadBacktestTemplate() {
    const cols = getBacktestExportColumns();
    // Sample data — the same row carries Last + (optional) Bid/Ask.
    const sampleRows = [
        ['2026-05-21', '09:30', '93.80', '1897000', '1897000', '0.005199', '93.62', '93.60', '93.65'],
        ['2026-05-21', '09:45', '93.99', '1900000', '1901000', '0.005198', '94.12', '94.10', '94.15'],
        ['2026-05-21', '10:00', '93.59', '1901000', '1900000', '0.005189', '94.00', '93.95', '94.05'],
        ['2026-05-21', '10:30', '97.53', '1940000', '1940000', '0.005189', '97.78', '97.75', '97.80'],
        ['2026-05-21', '11:00', '97.04', '1935000', '1935500', '0.005181', '97.10', '97.05', '97.15'],
        ['2026-05-21', '14:30', '96.70', '',        '1941000', '0.005180', '96.78', '96.75', '96.80'],
        ['2026-05-21', '15:00', '96.04', '',        '1919000', '0.005180', '94.50', '94.45', '94.55'],
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
 * - Empty iNAV cells are normal: rows missing Published iNAV simply skip.
 * - Backward-compatible with the legacy 5-column "no-iNAV" template
 *   (日期 | 时间 | 海力士 | 汇率 | ETF) — detected by the header row.
 */
function importBacktestFile(file) {
    setBtImportStatus(`正在解析 ${(file.size/1024/1024).toFixed(1)} MB 文件…`, '');
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array', cellDates: false });

            // Auto-detect "Value Page" sheet (BBG BDH export) or use first sheet
            const sheetName = wb.SheetNames.includes('Value Page')
                ? 'Value Page'
                : wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
            if (rows.length === 0) {
                setBtImportStatus('文件中没有数据', 'error');
                return;
            }

            // Detect BBG BDH "Value Page" format.
            // BBG exports each ticker as a 3-column block:
            //   col 0: serial datetime, col 1: 'TRADE', col 2: numeric value
            // The first row usually carries the ticker name (e.g. '7709IV Index')
            // somewhere in the first few cells. We scan the first ~3 rows for any
            // recognized ticker token; if found, use the BBG parser.
            const TICKER_REGEX = /(7709IV|7709\s*HK|000660\s*KP|000660\s*KT|KRW(\s|HKD)*Curncy)/i;
            const isBBGFormat = (() => {
                // Sniff the first 3 rows for any ticker tag + at least one TRADE cell
                for (let r = 0; r < Math.min(3, rows.length); r++) {
                    const row = rows[r] || [];
                    const joined = row.map(c => String(c ?? '')).join(' | ');
                    if (TICKER_REGEX.test(joined)) return true;
                }
                // Fallback: legacy detection (col 1 is serial date + col 2 === 'TRADE')
                const firstRow = rows[0] || [];
                return typeof firstRow[1] === 'number' && firstRow[1] > 40000 &&
                    String(firstRow[2] || '').toUpperCase() === 'TRADE';
            })();

            if (isBBGFormat) {
                parseBBGBacktestData(rows);
                return;
            }

            // --- Standard format parsing (header + data rows) ---
            // Detect legacy layout by inspecting header row.
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

            // Map each raw row to the entry shape used by the table.
            // We support several historical layouts plus the new modern one
            // that splits Hynix into KP / KT and ETF into Last / Bid / Ask.
            //
            //   - Modern 9-col: 日期|时间|iNAV|KP|KT|FX|Last|Bid|Ask
            //   - Modern 7-col: 日期|时间|iNAV|KP|KT|FX|Last
            //   - Legacy 6-col: 日期|时间|iNAV|海力士(单列)|FX|ETF
            //   - Legacy 5-col: 日期|时间|海力士|FX|ETF (no iNAV)
            //   - Legacy 4-col: 日期|时间|iNAV|ETF       (no Hynix)
            const headerHasKp  = /KP/i.test(header[3] || '');
            const headerHasKt  = /KT/i.test(header[4] || '');
            const isModernSplit = headerHasInav && headerHasKp && headerHasKt;

            const mapRow = (r) => {
                const date = normalizeDate(r[0]);
                const time = normalizeTime(r[1]);
                const v = (i) => (r[i] != null && r[i] !== '' ? String(r[i]) : '');
                let hxKp = '', hxKt = '', fxRate = '', inavPrice = '';
                let etfPrice = '', etfBid = '', etfAsk = '';

                if (isModernSplit) {
                    // 日期|时间|iNAV|KP|KT|FX|Last|[Bid]|[Ask]
                    inavPrice = v(2);
                    hxKp = v(3);
                    hxKt = v(4);
                    fxRate = v(5);
                    etfPrice = v(6);
                    etfBid = v(7);
                    etfAsk = v(8);
                } else if (headerHasInav && colCount >= 6) {
                    // Legacy 6-col: 日期|时间|iNAV|海力士(单列)|FX|ETF
                    inavPrice = v(2); hxKp = v(3); hxKt = v(3); fxRate = v(4); etfPrice = v(5);
                } else if (headerHasInav && colCount === 4) {
                    inavPrice = v(2); etfPrice = v(3);
                } else if (headerHasHynix) {
                    hxKp = v(2); hxKt = v(2); fxRate = v(3); etfPrice = v(4);
                } else {
                    // Unknown: best-effort
                    inavPrice = v(2); hxKp = v(3); hxKt = v(3); fxRate = v(4); etfPrice = v(5);
                }
                return {
                    date, time, inavPrice,
                    hynixKP: hxKp, hynixKT: hxKt,
                    fxRate, etfPrice, etfBid, etfAsk,
                };
            };

            const tbody = document.getElementById('data-tbody');
            tbody.innerHTML = dataRows.map(r => renderRowHTML(mapRow(r))).join('');

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
            updateBacktestShadowColumn();
            refreshDashboard();
        } catch (err) {
            setBtImportStatus('文件解析失败: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

/**
 * Parse BBG BDH "Value Page" export.
 *
 * Column blocks (each ticker occupies 3 consecutive columns):
 *   [serial_datetime, "TRADE", numeric_value]
 *
 * The ticker name appears somewhere on the first row (or a header row)
 * inside its block — we auto-detect the role of each block by scanning
 * for ticker keywords:
 *   7709IV          -> iNAV (15-second grid)
 *   7709 HK Equity  -> ETF tick
 *   000660 KP       -> Hynix KOSPI tick (main board: 连续 09:00-14:20 + 收盘集合 14:20-14:30 KST)
 *   000660 KT       -> Hynix Next Trade tick (08:00-20:00 KST)
 *   KRW Curncy      -> KRW/HKD FX tick
 *
 * Workflow:
 *   1. Each ticker -> a sorted [{ts, val}] tick list (ts = ms-since-epoch).
 *   2. Use iNAV's 15s timestamps as the master time grid.
 *   3. For ETF/KP/KT/FX: forward-fill (LOCF) the latest tick at-or-before
 *      each iNAV timestamp.
 *   4. Downsample the master grid to 1 row/minute (keep the LAST 15s tick of
 *      each minute, so 09:30 row uses the 09:30:45 iNAV value).
 */
function parseBBGBacktestData(rows) {
    const blocks = detectBBGTickerBlocks(rows);

    if (!blocks.inav || blocks.inav.ticks.length === 0) {
        setBtImportStatus('未识别到 7709IV (iNAV) 列，无法以 iNAV 为主轴对齐', 'error');
        return;
    }

    const inavTicks = blocks.inav.ticks;            // 15s-grid master
    const etfTicks  = blocks.etf?.ticks  || [];
    const etfBidTicks = blocks.etfBid?.ticks || [];
    const etfAskTicks = blocks.etfAsk?.ticks || [];
    const kpTicks   = blocks.kp?.ticks   || [];
    const ktTicks   = blocks.kt?.ticks   || [];

    // BBG "KRW Curncy" returns KRW per USD (~1500), not KRW/HKD (~0.0052).
    // Convert to HKD per KRW using a flat USD/HKD = 7.8 constant — the HKD peg
    // band (7.75-7.85) keeps this within a few bps, well below the arbitrage
    // signal threshold. Downstream uses only the % change, so the multiplier
    // cancels in the ratio.
    const USD_HKD = 7.8;
    const fxTicksRaw = blocks.fx?.ticks || [];
    const fxTicks = fxTicksRaw.map(t => ({
        ts: t.ts,
        val: USD_HKD / t.val,    // HKD per KRW = USD/HKD ÷ KRW per USD
    }));

    // Pre-compute a forward-fill cursor per series
    const ffCursor = (ticks) => {
        let i = 0;
        return (ts) => {
            while (i + 1 < ticks.length && ticks[i + 1].ts <= ts) i++;
            if (ticks.length === 0) return null;
            return ticks[i].ts <= ts ? ticks[i].val : null;
        };
    };
    const ffEtf = ffCursor(etfTicks);
    const ffBid = ffCursor(etfBidTicks);
    const ffAsk = ffCursor(etfAskTicks);
    const ffKp  = ffCursor(kpTicks);
    const ffKt  = ffCursor(ktTicks);
    const ffFx  = ffCursor(fxTicks);

    // KP (KOSPI main board) closes after 14:20 — beyond that we deliberately
    // leave the cell blank instead of LOCF-filling, so the table makes it
    // visually clear that no further main-board trades happened. The backtest
    // engine handles missing KP by falling back to KT (Next Trade).
    const KP_CUTOFF = '14:20';

    // 1) Build aligned 15s-grid rows from iNAV
    const aligned = inavTicks.map(t => {
        const time = tsToTimeStr(t.ts);    // HH:MM
        return {
            ts: t.ts,
            date: tsToDateStr(t.ts),
            time,
            inav: t.val,
            etf: ffEtf(t.ts),
            bid: ffBid(t.ts),
            ask: ffAsk(t.ts),
            kp:  time > KP_CUTOFF ? null : ffKp(t.ts),
            kt:  ffKt(t.ts),
            fx:  ffFx(t.ts),
        };
    });

    // 2) Downsample to 1 row per minute — keep the FIRST tick of each minute
    //    (e.g. 09:30:00 snapshot, not 09:30:45). This makes the day's first
    //    row the true open-snapshot baseline; all change-vs-baseline % are
    //    measured against the actual 09:30:00 prices, with no 45-second
    //    look-ahead leakage.
    const byMinute = new Map();
    for (const a of aligned) {
        const key = `${a.date} ${a.time}`;
        if (!byMinute.has(key)) byMinute.set(key, a); // first wins
    }
    let finalRows = [...byMinute.values()].sort((x, y) => x.ts - y.ts);

    // 3) Trim per-day leading rows where ETF is still absent.
    //    Otherwise the day's first row (used as baseline by resolveDay) would
    //    have no ETF price, which the backtest engine treats as fatal.
    finalRows = trimLeadingNoEtfRowsPerDay(finalRows);

    // 4) Determine FX fallback (when no KRW Curncy block in this file)
    const hasFx = fxTicks.length > 0;
    const FX_FALLBACK = '0.00525';

    // 5) Render to the table (replace existing rows)
    const tbody = document.getElementById('data-tbody');
    tbody.innerHTML = finalRows.map(r => {
        const fxVal = (r.fx != null) ? r.fx.toFixed(6) : (hasFx ? '' : FX_FALLBACK);
        return renderRowHTML({
            date: r.date,
            time: r.time,
            inavPrice: r.inav != null ? r.inav.toFixed(4) : '',
            hynixKP: r.kp != null ? String(Math.round(r.kp)) : '',
            hynixKT: r.kt != null ? String(Math.round(r.kt)) : '',
            fxRate: fxVal,
            etfPrice: r.etf != null ? r.etf.toFixed(2) : '',
            etfBid: r.bid != null ? r.bid.toFixed(3) : '',
            etfAsk: r.ask != null ? r.ask.toFixed(3) : '',
        });
    }).join('');

    // 6) Status line — show coverage details
    const dateSet = new Set(finalRows.map(r => r.date));
    const dateInfo = dateSet.size === 1
        ? [...dateSet][0]
        : `${dateSet.size} 天`;
    const parts = [];
    parts.push(`iNAV ${inavTicks.length} ticks`);
    if (etfTicks.length) parts.push(`ETF Last ${etfTicks.length}`);
    if (etfBidTicks.length) parts.push(`Bid ${etfBidTicks.length}`);
    if (etfAskTicks.length) parts.push(`Ask ${etfAskTicks.length}`);
    if (kpTicks.length)  parts.push(`KP ${kpTicks.length}`);
    if (ktTicks.length)  parts.push(`KT ${ktTicks.length}`);
    if (fxTicks.length)  parts.push(`FX ${fxTicks.length}`);
    else                  parts.push(`FX(回退${FX_FALLBACK})`);

    setBtImportStatus(
        `BBG Value Page 已识别 — 导入 ${finalRows.length} 行（${dateInfo}，1分钟粒度）｜${parts.join(' / ')}`,
        'success'
    );

    // Recompute 理论 iNAV column + dashboard charts now that the table is filled
    updateBacktestShadowColumn();
    refreshDashboard();
}

/**
 * Drop rows from the front of each trading day until ETF has its first tick.
 * The backtest engine uses each day's first row as the baseline, and a missing
 * ETF baseline aborts the whole day.
 */
function trimLeadingNoEtfRowsPerDay(rows) {
    const seenEtfPerDay = new Set();
    const out = [];
    for (const r of rows) {
        if (r.etf != null) seenEtfPerDay.add(r.date);
        if (seenEtfPerDay.has(r.date)) out.push(r);
    }
    return out;
}

/**
 * Scan rows and return ticker -> { ticks: [{ts, val}] } blocks.
 *
 * Strategy: walk first ~5 rows looking for a cell that matches a ticker keyword,
 * then assume the ticker's data block starts at/near that column. Each block
 * is 3 columns: [datetime_serial, FIELD, value], where FIELD is typically
 * 'TRADE' but can also be 'BID' / 'ASK' for the same ticker.
 *
 * For 7709 HK we try to identify all three field-blocks (TRADE / BID / ASK)
 * separately; for the others (KP/KT/FX/iNAV) we only care about TRADE.
 *
 * To be robust we try the matched column AND its neighbors (+/-1, +/-2) and
 * pick the offset that yields the most valid (datetime, FIELD, number) rows.
 */
function detectBBGTickerBlocks(rows) {
    // Logical key → ticker keyword + field filter.
    // Same ticker (7709 HK) appears 3 times for Last/Bid/Ask.
    const TICKERS = [
        { key: 'inav',   re: /7709\s*IV/i,          field: 'TRADE' },
        { key: 'etf',    re: /7709\s*HK/i,          field: 'TRADE' },
        { key: 'etfBid', re: /7709\s*HK/i,          field: 'BID' },
        { key: 'etfAsk', re: /7709\s*HK/i,          field: 'ASK' },
        { key: 'kp',     re: /000660\s*KP/i,        field: 'TRADE' },
        { key: 'kt',     re: /000660\s*KT/i,        field: 'TRADE' },
        { key: 'fx',     re: /KRW(\s|HKD)*Curncy/i, field: 'TRADE' },
    ];

    // Candidate start columns per logical key.
    const headerRows = rows.slice(0, 5);
    const candidates = {};
    for (const t of TICKERS) {
        const cands = new Set();
        for (const row of headerRows) {
            if (!row) continue;
            for (let c = 0; c < row.length; c++) {
                const cell = String(row[c] ?? '');
                if (t.re.test(cell)) cands.add(c);
            }
        }
        candidates[t.key] = [...cands];
    }

    // Also: for 7709 HK BID/ASK blocks, the second column of each 3-column
    // block carries the field tag itself ("BID"/"ASK"/"TRADE"). So when
    // multiple 7709 HK blocks exist side by side, we additionally filter by
    // matching the FIELD cell to disambiguate which block belongs to which key.
    const usedCols = new Set();   // avoid two keys claiming the same start col

    const result = {};
    for (const t of TICKERS) {
        let best = { ticks: [], startCol: -1 };
        for (const c of candidates[t.key]) {
            for (const off of [0, -2, -1, 1, 2]) {
                const startCol = c + off;
                if (startCol < 0) continue;
                if (usedCols.has(startCol)) continue;
                const ticks = extractTickBlock(rows, startCol, t.field);
                if (ticks.length > best.ticks.length) {
                    best = { ticks, startCol };
                }
            }
        }
        if (best.ticks.length > 0) {
            best.ticks.sort((a, b) => a.ts - b.ts);
            result[t.key] = best;
            usedCols.add(best.startCol);
        }
    }
    return result;
}

/**
 * Extract a [datetime_serial, FIELD, numeric_value] block starting at column
 * `startCol`. Returns [{ts: ms, val: number}] for every valid row matching
 * the requested `field` (default 'TRADE'; can be 'BID' / 'ASK').
 *
 * BBG often forward-fills the same (ts, val) across thousands of consecutive
 * rows when aligning to a master grid (e.g. KP keeps repeating its last trade
 * once a minute). We collapse such immediate duplicates to keep tick lists
 * lean — the LOCF cursor downstream produces identical results either way.
 */
function extractTickBlock(rows, startCol, field = 'TRADE') {
    const targetField = String(field).toUpperCase();
    const out = [];
    let lastTs = -1;
    let lastVal = NaN;
    for (const row of rows) {
        if (!row) continue;
        const dtCell  = row[startCol];
        const tagCell = row[startCol + 1];
        const valCell = row[startCol + 2];
        if (typeof dtCell !== 'number' || dtCell <= 40000) continue;
        if (String(tagCell ?? '').toUpperCase() !== targetField) continue;
        if (typeof valCell !== 'number' || !isFinite(valCell)) continue;
        const ts = serialToMs(dtCell);
        if (ts === lastTs && valCell === lastVal) continue;       // exact dup
        out.push({ ts, val: valCell });
        lastTs = ts;
        lastVal = valCell;
    }
    return out;
}

/**
 * Excel serial datetime -> JS Date ms-since-epoch (UTC).
 * Excel epoch is 1899-12-30; serial uses 1-based days in local time. We treat
 * the serial as a UTC instant for ordering purposes (all tickers are exported
 * with the same TZ=Hong_Kong from BBG, so cross-ticker comparisons are valid).
 */
function serialToMs(serial) {
    return Math.round((serial - 25569) * 86400 * 1000);
}

function tsToDateStr(ts) {
    return new Date(ts).toISOString().slice(0, 10);
}

function tsToTimeStr(ts) {
    const d = new Date(ts);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
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

// ===== Theo Premium Monitor =====
//
// A live single-snapshot panel that mirrors the desk's Bloomberg Excel layout:
//
//   Block 1: Bloomberg Live Data        — 6 user-input fields
//   Block 2: Theoretical iNAV calc      — Theo = Published × (1 + L × r)
//   Block 3: Premium / Discount table   — 5 reference legs × 8 columns
//
// Implementation philosophy: deliberately decoupled from any API. The user
// pastes 6 numbers from BBG Terminal once and gets a complete read-out;
// we don't auto-poll anything. This keeps the surface predictable and avoids
// reliance on data sources that may not be available in every deployment.

const TM_LEVERAGE = 2;
const TM_SAMPLE = {
    published: 95.805,
    bid: 97.820,
    ask: 97.840,
    last: 97.920,
    kp: 1980000,
    kt: 1980000,
};

function initTheoMonitor() {
    const ids = ['tm-published', 'tm-bid', 'tm-ask', 'tm-last', 'tm-kp', 'tm-kt'];
    const inputs = ids.map(id => document.getElementById(id));
    if (inputs.some(el => !el)) return;  // panel HTML missing — fail silent

    inputs.forEach(el => el.addEventListener('input', recalcTheoMonitor));

    document.getElementById('tm-clear')?.addEventListener('click', () => {
        inputs.forEach(el => { el.value = ''; });
        recalcTheoMonitor();
    });
    document.getElementById('tm-load-sample')?.addEventListener('click', () => {
        document.getElementById('tm-published').value = TM_SAMPLE.published;
        document.getElementById('tm-bid').value = TM_SAMPLE.bid;
        document.getElementById('tm-ask').value = TM_SAMPLE.ask;
        document.getElementById('tm-last').value = TM_SAMPLE.last;
        document.getElementById('tm-kp').value = TM_SAMPLE.kp;
        document.getElementById('tm-kt').value = TM_SAMPLE.kt;
        recalcTheoMonitor();
    });

    recalcTheoMonitor();
}

function recalcTheoMonitor() {
    const num = id => {
        const v = parseFloat(document.getElementById(id).value);
        return isNaN(v) ? null : v;
    };
    const published = num('tm-published');
    const bid = num('tm-bid');
    const ask = num('tm-ask');
    const last = num('tm-last');
    const kp = num('tm-kp');
    const kt = num('tm-kt');
    const mid = (bid != null && ask != null) ? (bid + ask) / 2 : null;

    const rCell = document.getElementById('tm-r-cell');
    const multCell = document.getElementById('tm-mult-cell');
    const theoCell = document.getElementById('tm-theo-cell');
    const tbody = document.getElementById('tm-result-tbody');

    // Need Published + KP + KT to compute Theo.
    if (published == null || kp == null || kt == null || kp <= 0) {
        rCell.textContent = '—';
        multCell.textContent = '—';
        theoCell.innerHTML = '<strong>—</strong>';
        tbody.innerHTML = '<tr><td colspan="8" class="theo-mon-empty">填入 官方 iNAV / KP / KT 后自动计算…</td></tr>';
        return;
    }

    const r = kt / kp - 1;
    const mult = 1 + TM_LEVERAGE * r;
    const theo = published * mult;

    rCell.textContent = (r * 100).toFixed(4) + '%';
    multCell.textContent = mult.toFixed(6);
    theoCell.innerHTML = `<strong>${theo.toFixed(4)}</strong> HKD`;

    // Build the 5-row premium table. Each row reports Spread, Premium %,
    // Bias, Tick Size, Spread (in ticks). We render rows even when a leg's
    // input is missing — those rows just show "—" placeholders.
    const TICK = 0.005;
    const legs = [
        { label: 'Last',       value: last },
        { label: 'Bid',        value: bid },
        { label: 'Ask',        value: ask },
        { label: 'Mid',        value: mid, hint: '(Bid + Ask) / 2' },
        { label: '官方 iNAV',  value: published, hint: '与理论 iNAV 的差 = 杠杆漂移项' },
    ];

    const rowsHtml = legs.map(leg => {
        if (leg.value == null) {
            return `<tr>
                <td>${leg.label}${leg.hint ? `<span class="theo-mon-hint"> · ${leg.hint}</span>` : ''}</td>
                <td>—</td><td>${theo.toFixed(4)}</td><td>—</td><td>—</td><td>—</td>
                <td>${TICK.toFixed(3)}</td><td>—</td>
            </tr>`;
        }
        const spread = leg.value - theo;
        const premPct = spread / theo * 100;
        const ticks = spread / TICK;
        const bias = premPct >  0.05 ? 'premium'
                   : premPct < -0.05 ? 'discount'
                   :                   'flat';
        const biasTag = bias === 'premium'  ? '<span class="bias-tag bias-premium">溢价</span>'
                      : bias === 'discount' ? '<span class="bias-tag bias-discount">折价</span>'
                      :                       '<span class="bias-tag bias-flat">中性</span>';
        const sign = v => (v >= 0 ? '+' : '') + v;
        const premColor = premPct >  0.05 ? '#dc2626'
                        : premPct < -0.05 ? '#2563eb'
                        :                   '#64748b';
        return `<tr>
            <td>${leg.label}${leg.hint ? `<span class="theo-mon-hint"> · ${leg.hint}</span>` : ''}</td>
            <td>${leg.value.toFixed(3)}</td>
            <td>${theo.toFixed(4)}</td>
            <td style="color:${premColor}">${sign(spread.toFixed(3))}</td>
            <td style="color:${premColor}; font-weight:600">${sign(premPct.toFixed(3))}%</td>
            <td>${biasTag}</td>
            <td>${TICK.toFixed(3)}</td>
            <td style="color:${premColor}">${sign(ticks.toFixed(1))}</td>
        </tr>`;
    }).join('');

    tbody.innerHTML = rowsHtml;
}

// ===== Price Monitor Section (legacy minute-level table + charts) =====

const MONITOR_DEMO_ROWS = [
    { time: '09:30', inav: '93.8025', etf: '93.62' },
    { time: '09:35', inav: '94.5392', etf: '94.90' },
    { time: '09:40', inav: '94.5432', etf: '94.62' },
    { time: '09:45', inav: '93.9899', etf: '94.12' },
    { time: '09:50', inav: '93.8768', etf: '93.90' },
    { time: '09:55', inav: '92.7595', etf: '92.74' },
    { time: '10:00', inav: '93.5937', etf: '94.00' },
    { time: '10:05', inav: '94.4255', etf: '94.44' },
    { time: '10:10', inav: '94.9757', etf: '95.22' },
    { time: '10:15', inav: '94.7949', etf: '95.00' },
    { time: '10:20', inav: '95.6099', etf: '95.82' },
    { time: '10:25', inav: '96.4301', etf: '96.72' },
    { time: '10:30', inav: '97.5257', etf: '97.78' },
    { time: '10:35', inav: '97.3363', etf: '97.62' },
    { time: '10:40', inav: '98.3503', etf: '98.66' },
    { time: '10:45', inav: '97.8002', etf: '97.88' },
    { time: '10:50', inav: '97.2536', etf: '97.40' },
    { time: '10:55', inav: '97.4287', etf: '97.56' },
    { time: '11:00', inav: '97.0448', etf: '97.10' },
    { time: '11:05', inav: '97.1452', etf: '97.08' },
    { time: '11:10', inav: '97.5069', etf: '97.46' },
    { time: '11:15', inav: '97.6997', etf: '97.64' },
    { time: '11:20', inav: '97.8838', etf: '97.86' },
    { time: '11:25', inav: '98.3467', etf: '98.30' },
    { time: '11:30', inav: '98.2587', etf: '98.12' },
    { time: '11:35', inav: '98.1743', etf: '98.20' },
    { time: '11:40', inav: '98.1690', etf: '97.96' },
    { time: '11:45', inav: '97.7968', etf: '97.70' },
    { time: '11:50', inav: '96.9680', etf: '96.90' },
    { time: '11:55', inav: '96.9657', etf: '96.94' },
    { time: '13:00', inav: '97.6989', etf: '97.24' },
    { time: '13:05', inav: '97.4335', etf: '97.58' },
    { time: '13:10', inav: '97.3319', etf: '97.30' },
    { time: '13:15', inav: '97.5081', etf: '97.46' },
    { time: '13:20', inav: '97.5102', etf: '97.54' },
    { time: '13:25', inav: '98.0532', etf: '97.92' },
    { time: '13:30', inav: '97.4969', etf: '97.30' },
    { time: '13:35', inav: '97.4062', etf: '97.20' },
    { time: '13:40', inav: '97.4052', etf: '97.26' },
    { time: '13:45', inav: '97.4047', etf: '97.24' },
    { time: '13:50', inav: '97.7622', etf: '97.66' },
    { time: '13:55', inav: '98.2345', etf: '97.98' },
    { time: '14:00', inav: '98.4129', etf: '98.22' },
    { time: '14:05', inav: '98.5917', etf: '98.36' },
    { time: '14:10', inav: '98.8605', etf: '98.60' },
    { time: '14:15', inav: '98.3192', etf: '98.08' },
    { time: '14:20', inav: '97.3121', etf: '96.94' },
    { time: '14:25', inav: '95.4980', etf: '95.72' },
    { time: '14:30', inav: '96.6956', etf: '96.78' },
    { time: '14:35', inav: '96.6910', etf: '96.12' },
    { time: '14:40', inav: '96.7735', etf: '95.72' },
    { time: '14:45', inav: '96.7672', etf: '95.86' },
    { time: '14:50', inav: '96.0420', etf: '95.88' },
    { time: '14:55', inav: '96.0512', etf: '95.02' },
    { time: '15:00', inav: '96.0447', etf: '94.50' },
    { time: '15:05', inav: '96.0624', etf: '93.64' },
    { time: '15:10', inav: '96.0701', etf: '93.90' },
    { time: '15:15', inav: '96.0734', etf: '93.30' },
    { time: '15:20', inav: '96.0482', etf: '92.10' },
    { time: '15:25', inav: '96.0478', etf: '93.10' },
    { time: '15:30', inav: '96.0408', etf: '93.96' },
    { time: '15:35', inav: '96.0423', etf: '94.14' },
    { time: '15:40', inav: '96.0411', etf: '93.40' },
    { time: '15:45', inav: '96.0482', etf: '93.46' },
    { time: '15:50', inav: '96.0574', etf: '93.38' },
    { time: '15:55', inav: '96.0712', etf: '93.80' },
    { time: '16:00', inav: '96.0635' },
    { time: '16:05', inav: '96.0761' },
    { time: '16:10', inav: '96.0789' },
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
 * Recalculate the theoretical iNAV column (legacy "shadow" name kept in
 * function/CSS-class identifiers for backward compat) for all rows based on
 * the first row as baseline.
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

    // Prefer official iNAV when present; otherwise fall back to the locally-
    // computed theoretical iNAV (Hynix×2 + FX, baseline-relative).
    const referenceInav = officialInav || shadowInav;
    const inavSource = officialInav ? '官方 iNAV' : '理论 iNAV';

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
    const header = ['时间', 'iNAV(HKD)', '理论iNAV(系统计算)', 'ETF成交价(HKD)', '海力士股价(KRW)', 'KRW/HKD汇率'];
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

            // Fill table - columns: 时间, iNAV, (理论iNAV跳过), ETF, 海力士, KRW/HKD
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

    if (!baseInav) return; // At minimum need iNAV baseline

    // Compute theoretical iNAV for all rows (only when Hynix + FX available)
    const labels = data.map(d => d.time);
    const officialInav = [];
    const etfPrices = [];
    const shadowInav = [];
    const hasShadowData = baseHynix && baseKrwhkd;

    for (const d of data) {
        etfPrices.push(d.etf);
        officialInav.push(d.inav);

        if (hasShadowData && d.hynix && d.krwhkd) {
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

    // Chart 2: Theoretical iNAV vs Official iNAV (full day validation)
    // Only render when Hynix + FX data available for shadow calculation
    const canvas2 = document.getElementById('chart-shadow-validation');
    const ctx2 = canvas2.getContext('2d');
    if (chartShadowValidation) { chartShadowValidation.destroy(); chartShadowValidation = null; }

    if (!hasShadowData) {
        // No shadow data — hide the chart entirely
        canvas2.parentElement.style.display = 'none';
        return;
    }
    canvas2.parentElement.style.display = '';

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
                    label: '理论 iNAV (HKD)',
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
                title: { display: true, text: '理论 iNAV 校验（全天对比官方）' },
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

/**
 * Refresh the divergence dashboard independently from running backtest.
 * Parses the current data table and renders the dashboard if valid data exists.
 * Uses the current threshold from the params input for signal counting.
 */
function refreshDashboard() {
    const data = parseData();
    if (data.length < 2) return;

    const errors = validateData(data);
    if (errors.length > 0) return;

    const params = getParams();
    const analysis = analyzeDivergence(data, params.threshold);
    renderDashboard(data, params.threshold, analysis, params);

    // Render the last-row divergence indicator in the dashboard
    renderDashboardDivergenceIndicator(data, params);
}

/**
 * Show the latest divergence as a text indicator in the dashboard area.
 * Mirrors the layout of the desk's "Premium / Discount Monitor" sheet —
 * shows ETF Last + Theo iNAV + Bias + Spread-in-ticks + suggested action.
 */
function renderDashboardDivergenceIndicator(data, params) {
    const container = document.getElementById('dashboard-divergence-indicator');
    if (!container) return;

    const lastRow = [...data].reverse().find(r => r.premiumDiscount != null);
    if (!lastRow) { container.innerHTML = ''; return; }

    const divergence = lastRow.premiumDiscount;
    const absDivergence = Math.abs(divergence);
    const etf = lastRow.etfPrice;
    const theo = lastRow.theoInav;
    const time = lastRow.time || '';
    const bias = lastRow.bias || (divergence > 0.05 ? 'premium' : divergence < -0.05 ? 'discount' : 'flat');
    const ticks = (theo && etf) ? Math.round((etf - theo) / TICK_SIZE) : null;

    // Trading-window check — if the most recent row is outside the window,
    // any displayed divergence is purely informational; we can't actually
    // trade on it, so we override the action hint with that warning instead
    // of suggesting a direction.
    const winStart = params?.windowStart || '13:00';
    const winEnd   = params?.windowEnd   || '15:55';
    const inWindow = !time || (time >= winStart && time <= winEnd);

    let signalClass = '';
    let actionText = '';
    let actionClass = 'hold';

    if (!inWindow) {
        actionText = `非交易时段（窗口 ${winStart}–${winEnd}），不触发`;
    } else if (absDivergence >= 2.0) {
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
    const biasTag = bias === 'premium'  ? '<span class="bias-tag bias-premium">溢价</span>'
                  : bias === 'discount' ? '<span class="bias-tag bias-discount">折价</span>'
                  :                       '<span class="bias-tag bias-flat">中性</span>';
    const ticksStr = ticks != null ? `${ticks >= 0 ? '+' : ''}${ticks} ticks` : '-';

    container.innerHTML = `
        <div class="div-card">
            <div class="div-value neutral">${etf ? etf.toFixed(3) : '-'}</div>
            <div class="div-label">ETF Last (HKD)</div>
        </div>
        <div class="div-card">
            <div class="div-value neutral">${theo ? theo.toFixed(3) : '-'}</div>
            <div class="div-label">理论 iNAV (HKD)</div>
        </div>
        <div class="div-card ${signalClass}">
            <div class="div-value ${valueClass}">${divergence >= 0 ? '+' : ''}${divergence.toFixed(3)}%</div>
            <div class="div-label">偏离度 ${biasTag}</div>
            <div class="div-action ${actionClass}">${actionText}</div>
        </div>
        <div class="div-card">
            <div class="div-value neutral">${ticksStr}</div>
            <div class="div-label">Spread (ticks @ ${TICK_SIZE})</div>
        </div>
        <div class="div-card">
            <div class="div-value neutral">${time}</div>
            <div class="div-label">数据时间</div>
        </div>
    `;
}

function renderDashboard(data, threshold, analysis, params) {
    const dashboard = document.getElementById('dashboard');
    dashboard.classList.remove('hidden');

    if (!analysis) {
        analysis = analyzeDivergence(data, threshold);
    }

    // Render divergence chart (with optional trading-window overlay)
    renderDivergenceChart(data, threshold, params);

    // Render iNAV price comparison chart (official vs shadow HKD values)
    renderInavComparisonChart(data);

    // Render iNAV deviation chart (percentage difference)
    renderInavValidationChart(data);

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

function renderDivergenceChart(data, threshold, params) {
    const ctx = document.getElementById('divergence-chart').getContext('2d');
    if (divergenceChart) divergenceChart.destroy();

    const labels = buildAxisLabels(data);
    // Main series: ETF Last vs **Theoretical** iNAV — this is the engine's
    // actual decision input.
    const theoPremiums = data.map(d => d.premiumDiscount);
    // Reference series: ETF Last vs **Published** iNAV — same metric but
    // computed against the raw BBG-published value. Plotted as a faint
    // grey dashed line so the user can see:
    //   - Before 14:20 the two lines overlap almost exactly (Theo ≈ Published
    //     when r ≈ 0).
    //   - After 14:20, KP freezes and KT keeps moving, so Theo and Published
    //     diverge — Published premium becomes stale, Theo premium tracks
    //     reality. The visual gap directly shows why we use Theo as the
    //     trigger source.
    const publishedPremiums = data.map(d => {
        if (d.etfPrice == null || d.inavPrice == null) return null;
        return (d.etfPrice - d.inavPrice) / d.inavPrice * 100;
    });
    const { dayBoundaries, cutoffIndices } = findChartMarkers(data);

    // Compute the "untradable" index ranges per day so the chart can grey them
    // out. A row is untradable iff its time falls outside [windowStart, windowEnd].
    // For each contiguous untradable run we record [startIdx, endIdx] (inclusive
    // on both ends, in global-data indices).
    const winStart = params?.windowStart || '13:00';
    const winEnd   = params?.windowEnd   || '15:55';
    const untradableRanges = [];
    {
        let runStart = -1;
        for (let i = 0; i < data.length; i++) {
            const t = data[i].time || '';
            const inWin = t >= winStart && t <= winEnd;
            if (!inWin) {
                if (runStart < 0) runStart = i;
            } else if (runStart >= 0) {
                untradableRanges.push([runStart, i - 1]);
                runStart = -1;
            }
        }
        if (runStart >= 0) untradableRanges.push([runStart, data.length - 1]);
    }

    divergenceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                // Reference (drawn first so the main series sits on top)
                {
                    label: '相对官方 iNAV 偏离（对照）',
                    data: publishedPremiums,
                    borderColor: 'rgba(100, 116, 139, 0.55)',
                    borderWidth: 1.5,
                    borderDash: [4, 3],
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHitRadius: 10,
                    fill: false,
                    spanGaps: true,
                    order: 2,
                },
                // Main series (Theo-based premium, engine's actual input)
                {
                    label: '相对理论 iNAV 偏离（实际触发）',
                    data: theoPremiums,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    pointHitRadius: 10,
                    segment: {
                        borderColor: (ctx) => ctx.p1.parsed.y >= 0 ? '#dc2626' : '#2563eb',
                    },
                    fill: {
                        target: { value: 0 },
                        above: 'rgba(220, 38, 38, 0.08)',
                        below: 'rgba(37, 99, 235, 0.08)',
                    },
                    order: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // Reserve top padding so the per-day "MM-DD" labels drawn in
            // the afterDraw plugin are not clipped by the chart title.
            layout: { padding: { top: 18 } },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                title: { display: true, text: 'ETF 偏离走势（相对理论 iNAV · 灰线为相对官方 iNAV 的对照）' },
                legend: {
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'line',
                    },
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.y;
                            if (val == null) return '';
                            const sign = val >= 0 ? '+' : '';
                            const which = ctx.datasetIndex === 1 ? '相对理论 iNAV' : '相对官方 iNAV';
                            return `${which}: ${sign}${val.toFixed(3)}%`;
                        },
                        labelColor: (ctx) => {
                            // Reference series stays grey; main series shows premium/discount color.
                            if (ctx.datasetIndex === 0) {
                                return { borderColor: 'rgba(100, 116, 139, 0.55)', backgroundColor: 'rgba(100, 116, 139, 0.55)' };
                            }
                            const val = ctx.parsed.y;
                            const color = val >= 0 ? '#dc2626' : '#2563eb';
                            return { borderColor: color, backgroundColor: color };
                        }
                    }
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
            id: 'untradableOverlay',
            // Paint grey shading over time ranges outside [windowStart, windowEnd]
            // BEFORE the dataset is drawn so the line stays on top.
            beforeDatasetsDraw(chart) {
                if (!untradableRanges.length) return;
                const { ctx, chartArea, scales } = chart;
                const xScale = scales.x;
                ctx.save();
                ctx.fillStyle = 'rgba(15, 23, 42, 0.06)';
                for (const [s, e] of untradableRanges) {
                    const x1 = xScale.getPixelForValue(s);
                    const x2 = xScale.getPixelForValue(e);
                    const left = Math.min(x1, x2);
                    const right = Math.max(x1, x2);
                    ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
                }
                ctx.restore();
            }
        }, {
            id: 'thresholdAndMarkers',
            afterDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                const yScale = scales.y;
                const xScale = scales.x;

                ctx.save();

                // Threshold horizontal lines (only draw if within chart area)
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = '#dc2626';
                ctx.lineWidth = 1;
                const yTop = yScale.getPixelForValue(threshold);
                const yBottom = yScale.getPixelForValue(-threshold);
                if (yTop >= chartArea.top && yTop <= chartArea.bottom) {
                    ctx.beginPath();
                    ctx.moveTo(chartArea.left, yTop);
                    ctx.lineTo(chartArea.right, yTop);
                    ctx.stroke();
                }
                if (yBottom >= chartArea.top && yBottom <= chartArea.bottom) {
                    ctx.beginPath();
                    ctx.moveTo(chartArea.left, yBottom);
                    ctx.lineTo(chartArea.right, yBottom);
                    ctx.stroke();
                }

                // Per-day cutoff (14:20) lines
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

                // Day boundary solid lines + MM-DD label at top (multi-day only)
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

                // Per-day MM-DD labels above the chart area. Pick one anchor
                // per day (left edge of the day's index range), then write
                // the date there. This includes the first day, whose anchor
                // is index 0 (not in dayBoundaries which only marks transitions).
                if (dayBoundaries.length > 0) {
                    const anchors = [0, ...dayBoundaries];
                    ctx.fillStyle = '#0f172a';
                    ctx.font = 'bold 11px sans-serif';
                    ctx.textBaseline = 'bottom';
                    ctx.textAlign = 'left';
                    for (let i = 0; i < anchors.length; i++) {
                        const idx = anchors[i];
                        if (idx >= data.length) continue;
                        const dateStr = data[idx]?.date || '';
                        if (!dateStr) continue;
                        const md = dateStr.length >= 10 ? dateStr.slice(5) : dateStr;
                        const xPos = xScale.getPixelForValue(idx);
                        // Background pill so the label is readable over plot lines
                        const text = md;
                        const pad = 3;
                        const w = ctx.measureText(text).width + pad * 2;
                        ctx.fillStyle = 'rgba(241, 245, 249, 0.92)';
                        ctx.fillRect(xPos + 2, chartArea.top - 14, w, 13);
                        ctx.fillStyle = '#0f172a';
                        ctx.fillText(text, xPos + 2 + pad, chartArea.top - 2);
                    }
                }

                // Label the first cutoff (avoid clutter when many days)
                if (cutoffIndices.length > 0) {
                    ctx.fillStyle = '#ca8a04';
                    ctx.font = '11px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'alphabetic';
                    const xPos = xScale.getPixelForValue(cutoffIndices[0]);
                    const labelText = cutoffIndices.length > 1
                        ? `14:20 集合竞价 (×${cutoffIndices.length})`
                        : '14:20 集合竞价';
                    ctx.fillText(labelText, xPos + 4, chartArea.top + 14);
                }

                ctx.restore();
            }
        }],
    });
}

let inavComparisonChart = null;
// "Zoom" toggle for the morning-session detail view. When true, the chart's
// Y axis auto-scales to median ± 3·stdev of (Published, Theo) across the day,
// so the small pre-14:20 dispersion (typically ~0.1 HKD ≈ 20 ticks driven by
// KT/KP micro-spread) becomes visually obvious instead of being collapsed
// into a single visual line by the much larger afternoon move.
let inavZoomEnabled = false;
let lastInavComparisonData = null;

/**
 * Render chart showing official iNAV and theoretical iNAV actual HKD values over the full day.
 * Visually demonstrates that the official Published value freezes after 14:30
 * KRX close while the theoretical (KT-driven) value keeps tracking reality.
 *
 * `zoom` mode (toggled by the in-chart button) tightens the Y-axis so the
 * tiny morning-session theoretical-vs-published dispersion is visible.
 */
function renderInavComparisonChart(data) {
    const canvas = document.getElementById('inav-comparison-chart');
    if (!canvas) return;
    lastInavComparisonData = data;
    const ctx = canvas.getContext('2d');
    if (inavComparisonChart) inavComparisonChart.destroy();

    // Two lines compared:
    //   - 官方 iNAV  = row.inavPrice    (BBG-published 7709 IV)
    //   - 理论 iNAV  = row.theoInav     (engine's actual decision input)
    //
    // theoInav is computed by data-input.js resolveDay() per the all-day
    // formula:
    //     Theo(t) = inavBase × (1 + 2 × (KT(t) / KP_ref(t) − 1))
    //   where inavBase = row.inavPrice  for t ≤ 14:20
    //                  = inav frozen at 14:20  for t > 14:20
    //
    // Pre-cutoff the two lines should be near-identical (Theo just nudges
    // Published by KT/KP drift, ~bp-level). Post-cutoff the two diverge —
    // Theo follows KT, while Published often runs off in unrelated ways.
    // This divergence is exactly what the chart is designed to surface.
    const validRows = data.filter(r => r.inavPrice != null && r.theoInav != null);
    if (validRows.length < 2) {
        canvas.parentElement.style.display = 'none';
        inavComparisonChart = null;
        return;
    }
    canvas.parentElement.style.display = '';

    // Multi-day-aware labels: prefix with MM-DD when the dataset spans
    // multiple trading days, otherwise just HH:MM.
    const datesSet = new Set(validRows.map(r => r.date || '').filter(Boolean));
    const multiDay = datesSet.size > 1;
    const labels = validRows.map(r => {
        const time = r.time || '';
        if (!multiDay || !r.date) return time;
        const md = r.date.length >= 10 ? r.date.slice(5) : r.date;
        return `${md} ${time}`;
    });
    const officialLine = validRows.map(r => r.inavPrice);
    const shadowLine = validRows.map(r => r.theoInav);

    // 14:20 cutoff index per day (multi-day) + day-boundary indices for
    // drawing per-day "MM-DD" labels above the chart.
    const cutoffIndices = [];
    const dayBoundaries = [];
    let prevDate = null;
    for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i];
        if (r.date !== prevDate) {
            if (prevDate !== null) dayBoundaries.push(i);
            prevDate = r.date;
        }
    }
    // Per-day cutoff: walk each day's slice and find first row > 14:20.
    {
        const dayStarts = [0, ...dayBoundaries, validRows.length];
        for (let g = 0; g < dayStarts.length - 1; g++) {
            const s = dayStarts[g], e = dayStarts[g + 1];
            for (let i = s; i < e; i++) {
                if (validRows[i].time && validRows[i].time > '14:20') {
                    cutoffIndices.push(i);
                    break;
                }
            }
        }
    }
    // Backwards-compat single-cutoff (used by zoom-mode logic above which
    // computes "morningRows" via slice(0, cutoffIdx)).
    const cutoffIdx = cutoffIndices.length > 0 ? cutoffIndices[0] : -1;

    // Zoom-mode Y range: focus on the morning-session segment so the small
    // Theo-vs-Published dispersion (typically ~0.1 HKD ≈ 20 ticks) is visible.
    // Use median ± 3·MAD over the morning rows only (more robust than stdev
    // on multi-day data with regime shifts).
    let zoomY = null;
    if (inavZoomEnabled) {
        const morningRows = cutoffIdx > 0 ? validRows.slice(0, cutoffIdx) : validRows;
        const morningVals = [];
        for (let i = 0; i < morningRows.length; i++) {
            if (officialLine[i] != null) morningVals.push(officialLine[i]);
            if (shadowLine[i] != null) morningVals.push(shadowLine[i]);
        }
        if (morningVals.length > 4) {
            const sorted = [...morningVals].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            const absDev = morningVals.map(v => Math.abs(v - median)).sort((a, b) => a - b);
            const mad = absDev[Math.floor(absDev.length / 2)] || 0.05;
            // Pad by max(6×MAD, 0.5 HKD) so the band is never invisibly narrow.
            const pad = Math.max(6 * mad, 0.5);
            zoomY = { min: median - pad, max: median + pad };
        }
    }

    inavComparisonChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '官方 iNAV (HKD)',
                    data: officialLine,
                    borderColor: '#2563eb',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: false,
                },
                {
                    label: '理论 iNAV (HKD)',
                    data: shadowLine,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    borderDash: [5, 3],
                    fill: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 18 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: {
                    display: true,
                    text: inavZoomEnabled
                        ? '官方 iNAV vs 理论 iNAV（HKD 价格对比） · 主板时段放大'
                        : '官方 iNAV vs 理论 iNAV（HKD 价格对比）'
                },
                legend: { labels: { usePointStyle: true, pointStyle: 'line' } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.y;
                            return `${ctx.dataset.label}: ${val != null ? val.toFixed(3) : '-'}`;
                        }
                    }
                },
            },
            scales: {
                y: {
                    title: { display: true, text: '价格 (HKD)' },
                    ...(zoomY ? { min: zoomY.min, max: zoomY.max } : {}),
                },
            },
        },
        plugins: [{
            id: 'comparisonCutoff',
            afterDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                ctx.save();

                // Per-day 14:20 cutoff lines
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#ca8a04';
                ctx.lineWidth = 1.5;
                for (const idx of cutoffIndices) {
                    const xPos = scales.x.getPixelForValue(idx);
                    ctx.beginPath();
                    ctx.moveTo(xPos, chartArea.top);
                    ctx.lineTo(xPos, chartArea.bottom);
                    ctx.stroke();
                }
                if (cutoffIndices.length > 0) {
                    ctx.fillStyle = '#ca8a04';
                    ctx.font = '11px sans-serif';
                    ctx.textBaseline = 'alphabetic';
                    ctx.textAlign = 'left';
                    const xPos = scales.x.getPixelForValue(cutoffIndices[0]);
                    ctx.fillText('14:20', xPos + 4, chartArea.top + 14);
                }

                // Day-boundary solid lines + MM-DD labels at top
                if (dayBoundaries.length > 0) {
                    ctx.setLineDash([]);
                    ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
                    ctx.lineWidth = 1;
                    for (const idx of dayBoundaries) {
                        const xPos = scales.x.getPixelForValue(idx);
                        ctx.beginPath();
                        ctx.moveTo(xPos, chartArea.top);
                        ctx.lineTo(xPos, chartArea.bottom);
                        ctx.stroke();
                    }
                    // MM-DD labels: one per day, anchored at the day's left edge.
                    const anchors = [0, ...dayBoundaries];
                    ctx.font = 'bold 11px sans-serif';
                    ctx.textBaseline = 'bottom';
                    ctx.textAlign = 'left';
                    for (const idx of anchors) {
                        if (idx >= validRows.length) continue;
                        const dateStr = validRows[idx]?.date || '';
                        if (!dateStr) continue;
                        const md = dateStr.length >= 10 ? dateStr.slice(5) : dateStr;
                        const xPos = scales.x.getPixelForValue(idx);
                        const pad = 3;
                        const w = ctx.measureText(md).width + pad * 2;
                        ctx.fillStyle = 'rgba(241, 245, 249, 0.92)';
                        ctx.fillRect(xPos + 2, chartArea.top - 14, w, 13);
                        ctx.fillStyle = '#0f172a';
                        ctx.fillText(md, xPos + 2 + pad, chartArea.top - 2);
                    }
                }
                ctx.restore();
            }
        }],
    });
}

let inavValidationChart = null;

/**
 * Render chart comparing official iNAV vs the locally-recomputed theoretical
 * iNAV deviation over time. Shows how the official iNAV diverges from reality
 * (KT-based theoretical) — most visible after 14:20 when KP freezes.
 */
function renderInavValidationChart(data) {
    const canvas = document.getElementById('inav-validation-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (inavValidationChart) inavValidationChart.destroy();

    // Filter rows that have BOTH official Published iNAV and engine Theo.
    // Deviation series = (Theo − Published) / Published × 100, plotted in %.
    // Pre-cutoff (≤14:20) this is just the leverage drift term 2×(KT/KP−1).
    // Post-cutoff Theo is computed off the 14:20-frozen Published, so this
    // line shows how far BBG-published runs from a sensible KT-driven mark.
    const validRows = data.filter(r => r.inavPrice != null && r.theoInav != null);

    if (validRows.length < 2) {
        canvas.parentElement.style.display = 'none';
        inavValidationChart = null;
        return;
    }
    canvas.parentElement.style.display = '';

    // Multi-day-aware labels (MM-DD HH:MM when spanning multiple days)
    const datesSet = new Set(validRows.map(r => r.date || '').filter(Boolean));
    const multiDay = datesSet.size > 1;
    const labels = validRows.map(r => {
        const time = r.time || '';
        if (!multiDay || !r.date) return time;
        const md = r.date.length >= 10 ? r.date.slice(5) : r.date;
        return `${md} ${time}`;
    });
    const deviations = validRows.map(r => (r.theoInav - r.inavPrice) / r.inavPrice * 100);

    // Per-day 14:20 cutoff indices + day-boundary indices.
    const cutoffIndices = [];
    const dayBoundaries = [];
    let prevDate = null;
    for (let i = 0; i < validRows.length; i++) {
        if (validRows[i].date !== prevDate) {
            if (prevDate !== null) dayBoundaries.push(i);
            prevDate = validRows[i].date;
        }
    }
    {
        const dayStarts = [0, ...dayBoundaries, validRows.length];
        for (let g = 0; g < dayStarts.length - 1; g++) {
            const s = dayStarts[g], e = dayStarts[g + 1];
            for (let i = s; i < e; i++) {
                if (validRows[i].time && validRows[i].time > '14:20') {
                    cutoffIndices.push(i);
                    break;
                }
            }
        }
    }
    // Backwards-compat: segment.borderColor uses cutoffIdx (first day's
    // cutoff) to color the post-14:20 segment red. For multi-day, change
    // logic to "row's own time > 14:20" which is per-row aware.
    const cutoffIdx = cutoffIndices.length > 0 ? cutoffIndices[0] : -1;

    inavValidationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '理论 iNAV vs 官方 iNAV 偏差 (%)',
                data: deviations,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHitRadius: 10,
                segment: {
                    borderColor: (ctx) => {
                        // Color the segment red iff its right-end row is
                        // post-14:20 (per-day, multi-day-aware).
                        const idx = ctx.p1DataIndex;
                        const t = validRows[idx]?.time || '';
                        return t > '14:20' ? '#dc2626' : '#16a34a';
                    }
                },
                fill: {
                    target: { value: 0 },
                    above: 'rgba(220, 38, 38, 0.06)',
                    below: 'rgba(37, 99, 235, 0.06)',
                },
            }],
        },
        options: {
            responsive: true,
            layout: { padding: { top: 18 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: { display: true, text: '官方 iNAV vs 理论 iNAV 偏差（验证 iNAV 准确性）' },
                legend: { labels: { usePointStyle: true, pointStyle: 'line' } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.parsed.y;
                            if (val == null) return '';
                            return `偏差: ${val >= 0 ? '+' : ''}${val.toFixed(3)}%`;
                        }
                    }
                },
            },
            scales: {
                y: { title: { display: true, text: '偏差 (%)' } },
            },
        },
        plugins: [{
            id: 'inavCutoffLine',
            afterDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                const xScale = scales.x;
                ctx.save();

                // Per-day 14:20 cutoff dashed lines
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
                if (cutoffIndices.length > 0) {
                    ctx.fillStyle = '#ca8a04';
                    ctx.font = '11px sans-serif';
                    ctx.textBaseline = 'alphabetic';
                    ctx.textAlign = 'left';
                    const xPos = xScale.getPixelForValue(cutoffIndices[0]);
                    const labelText = cutoffIndices.length > 1
                        ? `14:20 集合竞价 (×${cutoffIndices.length})`
                        : '14:20 集合竞价';
                    ctx.fillText(labelText, xPos + 4, chartArea.top + 14);
                }

                // Day-boundary lines + MM-DD top labels
                if (dayBoundaries.length > 0) {
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
                    const anchors = [0, ...dayBoundaries];
                    ctx.font = 'bold 11px sans-serif';
                    ctx.textBaseline = 'bottom';
                    ctx.textAlign = 'left';
                    for (const idx of anchors) {
                        if (idx >= validRows.length) continue;
                        const dateStr = validRows[idx]?.date || '';
                        if (!dateStr) continue;
                        const md = dateStr.length >= 10 ? dateStr.slice(5) : dateStr;
                        const xPos = xScale.getPixelForValue(idx);
                        const pad = 3;
                        const w = ctx.measureText(md).width + pad * 2;
                        ctx.fillStyle = 'rgba(241, 245, 249, 0.92)';
                        ctx.fillRect(xPos + 2, chartArea.top - 14, w, 13);
                        ctx.fillStyle = '#0f172a';
                        ctx.fillText(md, xPos + 2 + pad, chartArea.top - 2);
                    }
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
