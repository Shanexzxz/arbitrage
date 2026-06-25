// js/charts.js

import { findChartMarkers } from './backtest-engine.js';
import { getDataQualityFlags } from './data-input.js';

let equityChart = null;
let premiumChart = null;
let pnlChart = null;
// Heatmap is rendered with native canvas instead of Chart.js to keep deps
// minimal. We still hold a reference to the cleanup function so destroyCharts
// can detach event listeners.
let heatmapCleanup = null;

/**
 * Render all charts.
 *
 * @param {Array} data - normalized input data array
 * @param {Array} trades - trade results from backtest engine
 * @param {Object} params - strategy params (used by heatmap to grey out
 *                          rows outside the trading window)
 */
export function renderCharts(data, trades, params) {
    renderEquityChart(data, trades);
    renderPremiumChart(data, trades);
    renderTriggerHeatmap(data, trades, params);
}

export function destroyCharts() {
    if (equityChart) { equityChart.destroy(); equityChart = null; }
    if (premiumChart) { premiumChart.destroy(); premiumChart = null; }
    if (pnlChart) { pnlChart.destroy(); pnlChart = null; }
    if (heatmapCleanup) { heatmapCleanup(); heatmapCleanup = null; }
}

/**
 * Build axis labels for chart 2 (per-row premium chart).
 * Single day -> 'HH:MM'; multi day -> 'MM-DD HH:MM'.
 */
function buildAxisLabels(data) {
    const dates = new Set(data.map(d => d.date || '').filter(Boolean));
    const multiDay = dates.size > 1;
    return data.map(d => {
        const time = d.time || '';
        if (!multiDay || !d.date) return time;
        const md = d.date.length >= 10 ? d.date.slice(5) : d.date;
        return `${md} ${time}`;
    });
}

function renderEquityChart(data, trades) {
    const ctx = document.getElementById('equity-chart').getContext('2d');
    if (equityChart) equityChart.destroy();

    // Build full timeline labels from data
    const labels = buildAxisLabels(data);

    // Build cumulative equity curve on the full timeline.
    // Value steps at each swap's index; flat between swaps.
    const cumulative = new Array(data.length).fill(null);
    cumulative[0] = 0;

    let sum = 0;
    for (const trade of trades) {
        sum += (trade.netProfit !== undefined ? trade.netProfit : trade.pnl) || 0;
        const idx = trade.swapIndex !== undefined ? trade.swapIndex : trade.exitIndex;
        if (idx != null && idx < data.length) {
            cumulative[idx] = sum;
        }
    }

    // Fill forward: hold last known value between trade exits
    let lastVal = 0;
    for (let i = 0; i < cumulative.length; i++) {
        if (cumulative[i] !== null) {
            lastVal = cumulative[i];
        } else {
            cumulative[i] = lastVal;
        }
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
                tension: 0,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHitRadius: 8,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: { display: true, text: '累计收益曲线' },
                legend: { labels: { usePointStyle: true, pointStyle: 'line' } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `累计: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(3) : 0}%`
                    }
                }
            },
            scales: {
                y: { title: { display: true, text: '收益 (%)' } },
            },
        },
    });
}

function renderPremiumChart(data, trades) {
    const ctx = document.getElementById('premium-chart').getContext('2d');
    if (premiumChart) premiumChart.destroy();

    const labels = buildAxisLabels(data);
    const premiums = data.map(d => d.premiumDiscount);
    const { dayBoundaries, cutoffIndices } = findChartMarkers(data);

    // Mark swap points — split by direction so colors carry meaning.
    const sellEtfPoints = new Array(data.length).fill(null);  // premium > 0 (高估)
    const buyEtfPoints  = new Array(data.length).fill(null);  // premium < 0 (折价)
    for (const t of trades) {
        const idx = t.swapIndex !== undefined ? t.swapIndex : t.entryIndex;
        if (idx == null || idx >= data.length) continue;
        if (t.direction === 'sell_etf_buy_stock') sellEtfPoints[idx] = premiums[idx];
        else                                       buyEtfPoints[idx]  = premiums[idx];
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
                    label: '卖ETF换仓',
                    data: sellEtfPoints,
                    borderColor: 'transparent',
                    backgroundColor: '#dc2626',
                    pointRadius: 7,
                    pointStyle: 'triangle',
                    showLine: false,
                },
                {
                    label: '买ETF换仓',
                    data: buyEtfPoints,
                    borderColor: 'transparent',
                    backgroundColor: '#2563eb',
                    pointRadius: 7,
                    pointStyle: 'rectRot',
                    showLine: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: '溢价/折价率走势' }, legend: { labels: { usePointStyle: true, pointStyle: 'line' } } },
            scales: {
                y: { title: { display: true, text: '溢价率 (%)' } },
            },
        },
        plugins: [{
            id: 'premiumDayMarkers',
            afterDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                const xScale = scales.x;
                ctx.save();

                // Per-day 14:20 cutoffs (dashed amber)
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = 'rgba(202, 138, 4, 0.7)';
                ctx.lineWidth = 1;
                for (const idx of cutoffIndices) {
                    const xPos = xScale.getPixelForValue(idx);
                    ctx.beginPath();
                    ctx.moveTo(xPos, chartArea.top);
                    ctx.lineTo(xPos, chartArea.bottom);
                    ctx.stroke();
                }

                // Day boundaries (light grey solid)
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

                ctx.restore();
            }
        }],
    });
}

/**
 * Render a "Day × Time-bin" heatmap of |premium| with trigger markers.
 *
 * Grid:
 *   - Y axis: one row per trading day in the dataset (top = earliest).
 *   - X axis: 5-minute time bins covering the full HKEX session 09:30–16:30
 *     (84 bins). Each bin's color encodes the largest |premium| seen in
 *     that bin for that day; cells with no data render transparent.
 *   - Cells outside [windowStart, windowEnd] (HKT) are tinted grey so the
 *     user can see the trade-window scope visually.
 *   - Each actual swap fires a black-bordered cell with a direction glyph
 *     (▲ for sell-ETF, ▼ for buy-ETF).
 *
 * Why native canvas (not Chart.js matrix plugin)?
 *   - The grid is regular and small (≤ 84×N), trivial to draw by hand.
 *   - Avoids adding another CDN dep and the matrix plugin's bundle weight.
 *   - Lets us put bespoke trigger glyphs and grey-window overlay in one
 *     paint pass without fighting Chart.js's draw order.
 */
function renderTriggerHeatmap(data, trades, params) {
    const canvas = document.getElementById('pnl-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // ----- Build the day list (in calendar order). Empty-date rows fall
    // into a single synthetic '__single__' bucket. -----
    const dayMap = new Map();   // date -> [rows]
    for (const r of data) {
        const key = r.date || '__single__';
        if (!dayMap.has(key)) dayMap.set(key, []);
        dayMap.get(key).push(r);
    }
    const days = [...dayMap.keys()];
    const nDays = days.length;
    if (nDays === 0) {
        // Clear canvas if there's nothing to draw.
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    // ----- Time grid: 09:30 → 16:30 in 5-minute bins (84 bins). -----
    const BIN_MIN = 5;
    const START_MIN = 9 * 60 + 30;
    const END_MIN   = 16 * 60 + 30;
    const nBins = Math.ceil((END_MIN - START_MIN) / BIN_MIN);

    const timeToBin = (hhmm) => {
        if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return -1;
        const [h, m] = hhmm.split(':').map(Number);
        const tot = h * 60 + m;
        if (tot < START_MIN || tot >= END_MIN) return -1;
        return Math.floor((tot - START_MIN) / BIN_MIN);
    };

    // ----- Fill the cells with max |premium| per (day, bin). -----
    // cells[dayIdx][binIdx] = { absPrem, signedPrem }
    const cells = Array.from({ length: nDays }, () =>
        Array.from({ length: nBins }, () => null)
    );
    for (let d = 0; d < nDays; d++) {
        for (const r of dayMap.get(days[d])) {
            const b = timeToBin(r.time);
            if (b < 0 || r.premiumDiscount == null) continue;
            const p = r.premiumDiscount;
            const ap = Math.abs(p);
            const cur = cells[d][b];
            if (cur == null || ap > cur.absPrem) {
                cells[d][b] = { absPrem: ap, signedPrem: p };
            }
        }
    }

    // ----- Trigger markers: { dayIdx, binIdx, direction } -----
    const markers = [];
    for (const t of trades) {
        const dKey = t.date || '__single__';
        const dayIdx = days.indexOf(dKey);
        if (dayIdx < 0) continue;
        const bIdx = timeToBin(t.swapTime);
        if (bIdx < 0) continue;
        markers.push({ dayIdx, binIdx: bIdx, direction: t.direction });
    }

    // ----- Diverging color scale (BLUE ← white → RED) for SIGNED premium.
    // Premium > 0 (ETF over Theo, sell-ETF setup) maps to RED; premium < 0
    // (ETF under Theo, buy-ETF setup) maps to BLUE; near-zero → near-white.
    // Symmetric scale capped at PREM_CAP so extreme outliers saturate
    // instead of compressing the rest. Threshold band (where the engine
    // would actually fire) gets a deeper, more saturated tail.
    const PREM_CAP = 4.0;            // saturation point (≈ data p90)
    const userThreshold = params?.threshold ?? 2.0;

    // Map normalized |x| in [0,1] to a (r,g,b) tuple along the chosen
    // hue. We use 3 stops: white (0) → mid color (threshold) → deep
    // color (cap). This gives an obvious visual jump right at the
    // user's trigger threshold.
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const colorFor = (signedPrem) => {
        const sign = signedPrem >= 0 ? 1 : -1;
        const norm = Math.min(Math.abs(signedPrem) / PREM_CAP, 1);
        // Sub-threshold (calm zone): white → pale tint
        // Above-threshold (action zone): pale → deep
        const tFrac = userThreshold / PREM_CAP;       // where threshold sits in [0,1]
        let r, g, b;
        if (sign > 0) {
            // RED side: white(255,255,255) → light red(254,224,210) → deep red(165,15,21)
            if (norm <= tFrac) {
                const k = tFrac > 0 ? norm / tFrac : 0;
                r = lerp(255, 254, k); g = lerp(255, 224, k); b = lerp(255, 210, k);
            } else {
                const k = (norm - tFrac) / (1 - tFrac);
                r = lerp(254, 165, k); g = lerp(224,  15, k); b = lerp(210,  21, k);
            }
        } else {
            // BLUE side: white → light blue(208,225,242) → deep blue(33,69,148)
            if (norm <= tFrac) {
                const k = tFrac > 0 ? norm / tFrac : 0;
                r = lerp(255, 208, k); g = lerp(255, 225, k); b = lerp(255, 242, k);
            } else {
                const k = (norm - tFrac) / (1 - tFrac);
                r = lerp(208,  33, k); g = lerp(225,  69, k); b = lerp(242, 148, k);
            }
        }
        return `rgb(${r},${g},${b})`;
    };

    // ----- Trading-window grey overlay -----
    const winStart = params?.windowStart || '13:00';
    const winEnd   = params?.windowEnd   || '15:55';
    const inWindow = (binIdx) => {
        const min = START_MIN + binIdx * BIN_MIN;
        const startMin = (() => { const [h, m] = winStart.split(':').map(Number); return h * 60 + m; })();
        const endMin   = (() => { const [h, m] = winEnd.split(':').map(Number);   return h * 60 + m; })();
        // Bin counts as in-window if its left edge is within [startMin, endMin].
        return min >= startMin && min <= endMin;
    };

    // ----- Layout: device-pixel-aware sizing -----
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Padding. After axis swap (X = days, Y = time bins) we no longer need
    // a wide left gutter for date labels — they fit under the X axis. We
    // do need a wider left gutter for "HH:MM" time labels, though, so
    // padL stays around 50. padB increases slightly for the date row.
    // padT bumped to 56 to make room for the colorbar legend below the
    // header text.
    const padL = 52, padT = 56, padR = 12, padB = 28;
    const gridW = cssW - padL - padR;
    const gridH = cssH - padT - padB;
    // X = days, Y = time bins.
    const cellW = gridW / Math.max(nDays, 1);
    const cellH = gridH / nBins;

    ctx.clearRect(0, 0, cssW, cssH);

    // ----- Title -----
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 13px -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('按日 × 时段 触发热力图', padL, 6);
    ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`■ 红 = Premium (ETF>Theo)　■ 蓝 = Discount (ETF<Theo)　▲▼ 触发　灰底 窗口外　斜纹 NAV 跳点存疑`, padL, 22);

    // ----- Color legend bar -----
    // Horizontal gradient from -CAP (deep blue) → 0 (white) → +CAP (deep red)
    // with vertical tick marks at -CAP / -threshold / 0 / +threshold / +CAP.
    {
        const barX = padL, barY = 38, barW = Math.min(360, gridW * 0.5), barH = 8;
        const N = Math.round(barW);
        for (let i = 0; i < N; i++) {
            const t = i / (N - 1);                       // 0..1
            const signedPrem = (t * 2 - 1) * PREM_CAP;   // -CAP..+CAP
            ctx.fillStyle = colorFor(signedPrem);
            ctx.fillRect(barX + i, barY, 1, barH);
        }
        // Border
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 0.6;
        ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);
        // Tick marks + labels
        const tick = (signedPrem, label, weight = 'normal') => {
            const t = (signedPrem / PREM_CAP + 1) / 2;
            const x = barX + t * barW;
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, barY - 2);
            ctx.lineTo(x, barY + barH + 2);
            ctx.stroke();
            ctx.fillStyle = '#475569';
            ctx.font = `${weight === 'bold' ? 'bold ' : ''}9px -apple-system, "Segoe UI", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(label, x, barY + barH + 3);
        };
        tick(-PREM_CAP, `−${PREM_CAP}%`);
        tick(-userThreshold, `−${userThreshold}%`, 'bold');
        tick(0, '0');
        tick(+userThreshold, `+${userThreshold}%`, 'bold');
        tick(+PREM_CAP, `+${PREM_CAP}%`);
        // Label "color = signed premium %"
        ctx.fillStyle = '#64748b';
        ctx.font = '9px -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('色阶 = ETF − Theo (%)', barX + barW + 10, barY + barH / 2);
    }

    // ----- Suspect-cell precomputation -----
    // For each (day, bin) check whether ANY underlying minute in that bin
    // carries the suspect flag. If yes, draw diagonal hatching overlay
    // after the color fill so the user sees the cell value but is warned
    // the iNAV used to derive it came from a post-jump regime.
    const suspectFlags = getDataQualityFlags();
    const suspectCell = Array.from({ length: nDays }, () => new Array(nBins).fill(false));
    if (suspectFlags && suspectFlags.size > 0) {
        for (let d = 0; d < nDays; d++) {
            const dayKey = days[d];
            const dayRows = dayMap.get(dayKey);
            for (const r of dayRows) {
                if (suspectFlags.get(`${dayKey}|${r.time}`)) {
                    const b = timeToBin(r.time);
                    if (b >= 0) suspectCell[d][b] = true;
                }
            }
        }
    }

    // ----- Cells (X = day index, Y = time bin index) -----
    for (let d = 0; d < nDays; d++) {
        for (let b = 0; b < nBins; b++) {
            const x = padL + d * cellW;
            const y = padT + b * cellH;
            // Draw window-out grey background for every cell first
            if (!inWindow(b)) {
                ctx.fillStyle = 'rgba(15, 23, 42, 0.06)';
                ctx.fillRect(x, y, cellW, cellH);
            }
            const cell = cells[d][b];
            if (cell != null) {
                ctx.fillStyle = colorFor(cell.signedPrem);
                ctx.fillRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
            }
            // Suspect overlay: diagonal hatching pattern
            if (suspectCell[d][b]) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
                ctx.clip();
                ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
                ctx.lineWidth = 0.8;
                const step = 4;
                const diag = cellW + cellH;
                for (let s = -cellH; s < diag; s += step) {
                    ctx.beginPath();
                    ctx.moveTo(x + s, y);
                    ctx.lineTo(x + s + cellH, y + cellH);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }
    }

    // ----- Trigger markers (drawn on top) -----
    ctx.font = `bold ${Math.max(9, Math.min(13, cellH - 4))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const m of markers) {
        const x = padL + m.dayIdx * cellW;
        const y = padT + m.binIdx * cellH;
        // Black border to highlight the swap cell
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
        // Direction glyph
        const glyph = m.direction === 'sell_etf_buy_stock' ? '▲' : '▼';
        ctx.fillStyle = m.direction === 'sell_etf_buy_stock' ? '#7f1d1d' : '#1e3a8a';
        ctx.fillText(glyph, x + cellW / 2, y + cellH / 2);
    }

    // ----- Y-axis: time labels (every hour, on the left) -----
    ctx.fillStyle = '#475569';
    ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let h = 10; h <= 16; h++) {
        const tot = h * 60;
        if (tot < START_MIN || tot > END_MIN) continue;
        const b = (tot - START_MIN) / BIN_MIN;
        const y = padT + b * cellH;
        ctx.fillText(`${String(h).padStart(2, '0')}:00`, padL - 6, y);
        // tick mark on the left edge
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL - 3, y);
        ctx.lineTo(padL, y);
        ctx.stroke();
    }

    // ----- X-axis: day labels (under the grid) -----
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#475569';
    for (let d = 0; d < nDays; d++) {
        const dayKey = days[d];
        const label = dayKey === '__single__'
            ? '(单日)'
            : (dayKey.length >= 10 ? dayKey.slice(5) : dayKey);  // MM-DD
        ctx.fillText(label, padL + d * cellW + cellW / 2, padT + gridH + 4);
    }

    // Trading-window edges as amber dashed HORIZONTAL lines (constant time
    // = horizontal line in the swapped layout).
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 1;
    for (const wm of [winStart, winEnd]) {
        const [h, m] = wm.split(':').map(Number);
        const tot = h * 60 + m;
        if (tot < START_MIN || tot > END_MIN) continue;
        const b = (tot - START_MIN) / BIN_MIN;
        const y = padT + b * cellH;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + gridW, y);
        ctx.stroke();
    }
    ctx.restore();

    // ----- Hover tooltip -----
    // Dispose any previous listener before attaching a new one.
    if (heatmapCleanup) { heatmapCleanup(); heatmapCleanup = null; }
    let tooltip = document.getElementById('heatmap-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'heatmap-tooltip';
        tooltip.className = 'heatmap-tooltip';
        document.body.appendChild(tooltip);
    }
    const onMove = (ev) => {
        const rect = canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;
        // X = day index, Y = time-bin index (axes were swapped).
        const d = Math.floor((mx - padL) / cellW);
        const b = Math.floor((my - padT) / cellH);
        if (b < 0 || b >= nBins || d < 0 || d >= nDays) {
            tooltip.style.display = 'none';
            return;
        }
        const binStart = START_MIN + b * BIN_MIN;
        const hh = Math.floor(binStart / 60), mm = binStart % 60;
        const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        const cell = cells[d][b];
        const dayKey = days[d];
        const dateLabel = dayKey === '__single__' ? '' : dayKey;
        const winNote = inWindow(b) ? '' : ' · 窗口外';
        const suspectNote = suspectCell[d][b] ? ' · ⚠ NAV 跳点后' : '';
        const fired = markers.find(m => m.dayIdx === d && m.binIdx === b);
        const swapNote = fired
            ? (fired.direction === 'sell_etf_buy_stock' ? ' · ▲ 卖 ETF 换仓' : ' · ▼ 买 ETF 换仓')
            : '';
        const premLine = cell
            ? `区间最大|偏离| = ${cell.absPrem.toFixed(3)}% (${cell.signedPrem >= 0 ? '+' : ''}${cell.signedPrem.toFixed(3)}%)`
            : '无数据';
        const suspectExplain = suspectCell[d][b]
            ? '<div style="color:#fbbf24;font-size:0.7rem;margin-top:0.15rem">数据存疑：本格涉及单 tick &gt;1% 的 iNAV 跳变之后区间</div>'
            : '';
        tooltip.innerHTML = `
            <div class="heatmap-tooltip-head">${dateLabel} ${timeStr}${winNote}${suspectNote}</div>
            <div>${premLine}</div>
            ${suspectExplain}
            ${swapNote ? `<div class="heatmap-tooltip-swap">${swapNote}</div>` : ''}
        `;
        tooltip.style.display = 'block';
        tooltip.style.left = (ev.clientX + 14) + 'px';
        tooltip.style.top  = (ev.clientY + 14) + 'px';
    };
    const onLeave = () => { tooltip.style.display = 'none'; };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    heatmapCleanup = () => {
        canvas.removeEventListener('mousemove', onMove);
        canvas.removeEventListener('mouseleave', onLeave);
        if (tooltip) tooltip.style.display = 'none';
    };
}
