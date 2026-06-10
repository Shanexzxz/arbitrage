// js/charts.js

import { findChartMarkers } from './backtest-engine.js';

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

    // ----- Color scale (white → yellow → orange → red) for |premium|. -----
    // Cap at 3% so 1.5%-2% triggers map to a strong but not maxed-out color.
    const PREM_CAP = 3.0;
    const colorFor = (absPrem) => {
        const t = Math.min(absPrem / PREM_CAP, 1);
        // Three-stop gradient
        if (t < 0.5) {
            // white → yellow
            const k = t / 0.5;
            return `rgb(${255}, ${Math.round(255 - k * 30)}, ${Math.round(255 - k * 200)})`;
        } else {
            // yellow → orange → red
            const k = (t - 0.5) / 0.5;
            const r = 255;
            const g = Math.round(225 - k * 187);
            const b = Math.round(55 - k * 55);
            return `rgb(${r}, ${g}, ${b})`;
        }
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

    // Padding (room for axis labels on left & top)
    const padL = 70, padT = 36, padR = 12, padB = 28;
    const gridW = cssW - padL - padR;
    const gridH = cssH - padT - padB;
    const cellW = gridW / nBins;
    const cellH = gridH / Math.max(nDays, 1);

    ctx.clearRect(0, 0, cssW, cssH);

    // ----- Title -----
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 13px -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('按日 × 时段 触发热力图', padL, 6);
    ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`颜色 = |premium|（封顶 ${PREM_CAP}%）　▲ 卖 ETF　▼ 买 ETF　灰底 = 窗口外`, padL, 22);

    // ----- Cells -----
    for (let d = 0; d < nDays; d++) {
        for (let b = 0; b < nBins; b++) {
            const x = padL + b * cellW;
            const y = padT + d * cellH;
            // Draw window-out grey background for every cell first
            if (!inWindow(b)) {
                ctx.fillStyle = 'rgba(15, 23, 42, 0.06)';
                ctx.fillRect(x, y, cellW, cellH);
            }
            const cell = cells[d][b];
            if (cell != null) {
                ctx.fillStyle = colorFor(cell.absPrem);
                ctx.fillRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
            }
        }
    }

    // ----- Trigger markers (drawn on top) -----
    ctx.font = `bold ${Math.max(9, Math.min(13, cellH - 4))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const m of markers) {
        const x = padL + m.binIdx * cellW;
        const y = padT + m.dayIdx * cellH;
        // Black border to highlight the swap cell
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
        // Direction glyph
        const glyph = m.direction === 'sell_etf_buy_stock' ? '▲' : '▼';
        ctx.fillStyle = m.direction === 'sell_etf_buy_stock' ? '#7f1d1d' : '#1e3a8a';
        ctx.fillText(glyph, x + cellW / 2, y + cellH / 2);
    }

    // ----- Y-axis: day labels -----
    ctx.fillStyle = '#475569';
    ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let d = 0; d < nDays; d++) {
        const dayKey = days[d];
        const label = dayKey === '__single__'
            ? '(单日)'
            : (dayKey.length >= 10 ? dayKey.slice(5) : dayKey);  // MM-DD
        ctx.fillText(label, padL - 6, padT + d * cellH + cellH / 2);
    }

    // ----- X-axis: time labels (every hour) -----
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#475569';
    for (let h = 10; h <= 16; h++) {
        const tot = h * 60;
        if (tot < START_MIN || tot > END_MIN) continue;
        const b = (tot - START_MIN) / BIN_MIN;
        const x = padL + b * cellW;
        ctx.fillText(`${String(h).padStart(2, '0')}:00`, x, padT + gridH + 4);
        // tick mark
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, padT + gridH);
        ctx.lineTo(x, padT + gridH + 3);
        ctx.stroke();
    }
    // Also mark the trading window edges with amber dashed lines
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#ca8a04';
    ctx.lineWidth = 1;
    for (const wm of [winStart, winEnd]) {
        const [h, m] = wm.split(':').map(Number);
        const tot = h * 60 + m;
        if (tot < START_MIN || tot > END_MIN) continue;
        const b = (tot - START_MIN) / BIN_MIN;
        const x = padL + b * cellW;
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + gridH);
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
        const b = Math.floor((mx - padL) / cellW);
        const d = Math.floor((my - padT) / cellH);
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
        const fired = markers.find(m => m.dayIdx === d && m.binIdx === b);
        const swapNote = fired
            ? (fired.direction === 'sell_etf_buy_stock' ? ' · ▲ 卖 ETF 换仓' : ' · ▼ 买 ETF 换仓')
            : '';
        const premLine = cell
            ? `|premium|<sub>max</sub> = ${cell.absPrem.toFixed(3)}% (${cell.signedPrem >= 0 ? '+' : ''}${cell.signedPrem.toFixed(3)}%)`
            : '无数据';
        tooltip.innerHTML = `
            <div class="heatmap-tooltip-head">${dateLabel} ${timeStr}${winNote}</div>
            <div>${premLine}</div>
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
