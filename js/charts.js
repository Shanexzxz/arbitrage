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
