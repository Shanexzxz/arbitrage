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
    // Placeholder — implemented in Task 7 after engine is built
    console.log('Backtest triggered');
}

document.addEventListener('DOMContentLoaded', init);
