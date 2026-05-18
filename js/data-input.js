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

// Demo data: simulates a trading session with arbitrage opportunities
const DEMO_DATA_INAV = [
    { time: '09:30', inavChange: '0.5', etfChange: '0.6' },
    { time: '09:35', inavChange: '1.2', etfChange: '1.0' },
    { time: '09:40', inavChange: '1.8', etfChange: '3.5' },
    { time: '09:45', inavChange: '2.1', etfChange: '2.3' },
    { time: '09:50', inavChange: '2.5', etfChange: '2.4' },
    { time: '09:55', inavChange: '1.9', etfChange: '0.2' },
    { time: '10:00', inavChange: '2.3', etfChange: '2.2' },
    { time: '10:05', inavChange: '3.0', etfChange: '4.8' },
    { time: '10:10', inavChange: '3.2', etfChange: '3.3' },
    { time: '10:15', inavChange: '2.8', etfChange: '2.9' },
];

const DEMO_DATA_NO_INAV = [
    { time: '09:30', hynixChange: '0.3', fxChange: '0.0', etfChange: '0.6' },
    { time: '09:35', hynixChange: '0.6', fxChange: '-0.1', etfChange: '1.0' },
    { time: '09:40', hynixChange: '0.9', fxChange: '0.1', etfChange: '3.5' },
    { time: '09:45', hynixChange: '1.1', fxChange: '0.0', etfChange: '2.3' },
    { time: '09:50', hynixChange: '1.3', fxChange: '-0.1', etfChange: '2.4' },
    { time: '09:55', hynixChange: '1.0', fxChange: '0.0', etfChange: '0.2' },
    { time: '10:00', hynixChange: '1.2', fxChange: '0.1', etfChange: '2.5' },
    { time: '10:05', hynixChange: '1.5', fxChange: '0.0', etfChange: '4.8' },
    { time: '10:10', hynixChange: '1.6', fxChange: '0.1', etfChange: '3.3' },
    { time: '10:15', hynixChange: '1.4', fxChange: '0.0', etfChange: '2.9' },
];

export function getColumns(mode) {
    return mode === 'inav' ? COLUMNS_INAV : COLUMNS_NO_INAV;
}

function getDemoData(mode) {
    return mode === 'inav' ? DEMO_DATA_INAV : DEMO_DATA_NO_INAV;
}

export function renderTable(container, mode) {
    const columns = getColumns(mode);
    const demoData = getDemoData(mode);
    const html = `
        <table>
            <thead>
                <tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr>
            </thead>
            <tbody id="data-tbody">
                ${generateRowsWithData(columns, demoData)}
            </tbody>
        </table>
    `;
    container.innerHTML = html;
}

function generateRowsWithData(columns, dataRows) {
    let rows = '';
    for (const rowData of dataRows) {
        rows += generateRowWithData(columns, rowData);
    }
    return rows;
}

function generateRowWithData(columns, rowData) {
    const cells = columns.map(c => {
        const value = rowData && rowData[c.key] !== undefined ? rowData[c.key] : '';
        return `<td><input type="${c.type}" data-key="${c.key}" placeholder="${c.placeholder}" step="0.01" value="${value}"></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
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
