// js/charts.js

import { findChartMarkers } from './backtest-engine.js';

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

function renderEquityChart(trades) {
    const ctx = document.getElementById('equity-chart').getContext('2d');
    if (equityChart) equityChart.destroy();

    // Use 'date time' for label when multi-day so the curve is readable.
    const dates = new Set(trades.map(t => t.date || '').filter(d => d && d !== '__single__'));
    const multiDay = dates.size > 1;
    const labels = ['Start', ...trades.map((t, i) => {
        if (!t.exitTime) return `Trade ${i + 1}`;
        if (!multiDay || !t.date || t.date === '__single__') return t.exitTime;
        const md = t.date.length >= 10 ? t.date.slice(5) : t.date;
        return `${md} ${t.exitTime}`;
    })];
    const cumulative = [0];
    let sum = 0;
    for (const trade of trades) {
        sum += (trade.netProfit !== undefined ? trade.netProfit : trade.pnl) || 0;
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
            plugins: { title: { display: true, text: '累计收益曲线' }, legend: { labels: { usePointStyle: true, pointStyle: 'line' } } },
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

                // Per-day 14:30 cutoffs (dashed amber)
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

function renderPnlHistogram(trades) {
    const ctx = document.getElementById('pnl-chart').getContext('2d');
    if (pnlChart) pnlChart.destroy();

    const labels = trades.map((t, i) => `#${i + 1}`);
    const pnls = trades.map(t => (t.netProfit !== undefined ? t.netProfit : t.pnl) || 0);
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
            plugins: { title: { display: true, text: '单笔盈亏分布' }, legend: { labels: { usePointStyle: true, pointStyle: 'line' } } },
            scales: {
                y: { title: { display: true, text: '盈亏 (%)' } },
            },
        },
    });
}
