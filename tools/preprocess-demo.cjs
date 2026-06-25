/**
 * Offline preprocessor: read the 62 MB BBG export (6 sheets) and emit
 * a compact JSON of 1-minute downsampled rows ready to feed the
 * backtest table.
 *
 * Output schema: array of { date, time, inavPrice, hynixKP, hynixKT, etfPrice }
 *
 * Pipeline (per sheet, identical to js/main.js parseBBGBacktestData):
 *   1. Extract 4 ticker tick lists: 7709IV / 7709 HK / 000660 KP / 000660 KT
 *      Each block is [datetime_serial, "TRADE", value] in 3 consecutive cols.
 *   2. Use 7709IV ticks as the master 15s grid.
 *   3. LOCF-fill ETF/KP/KT onto each iNAV timestamp.
 *   4. Downsample to 1 minute: keep the FIRST tick of each minute.
 *   5. Drop leading rows where ETF still null (engine needs an ETF baseline).
 *   6. After 14:20 HKT (= 14:20 KST since BBG export timezone is set), null
 *      out KP — that's the "main board closed" semantic.
 *
 * Multi-sheet handling:
 *   - All 6 sheets are processed independently then concatenated.
 *   - Rows are deduped by `${date} ${time}` after concatenation (BBG Page
 *     is a duplicate of 20260609 in this dataset; rows with the same key
 *     are kept once, preferring whichever appears first in iteration).
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const SRC = '/data/workspace/arbitrage/7709 vs 2x ETF(1).xlsx';
const OUT = '/data/workspace/arbitrage/data/demo-multi-day.json';
const KP_CUTOFF = '14:20';

console.error('Reading buffer...');
const buf = fs.readFileSync(SRC);
const wb1 = XLSX.read(buf, { type: 'buffer', bookSheets: true });

// ---------- helpers ----------
const serialToMs = s => Math.round((s - 25569) * 86400 * 1000);
const tsToDateStr = ts => new Date(ts).toISOString().slice(0, 10);
const tsToTimeStr = ts => {
    const d = new Date(ts);
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
};

function extractTickBlock(rows, startCol, field = 'TRADE') {
    const target = field.toUpperCase();
    const out = [];
    let lastTs = -1, lastVal = NaN;
    for (const row of rows) {
        if (!row) continue;
        const dt = row[startCol], tag = row[startCol + 1], val = row[startCol + 2];
        if (typeof dt !== 'number' || dt <= 40000) continue;
        if (String(tag ?? '').toUpperCase() !== target) continue;
        if (typeof val !== 'number' || !isFinite(val)) continue;
        const ts = serialToMs(dt);
        if (ts === lastTs && val === lastVal) continue;
        out.push({ ts, val });
        lastTs = ts; lastVal = val;
    }
    return out;
}

function detectBlocks(rows) {
    const TICKERS = [
        { key: 'inav', re: /7709\s*IV/i },
        { key: 'etf',  re: /7709\s*HK/i },
        { key: 'kp',   re: /000660\s*KP/i },
        { key: 'kt',   re: /000660\s*KT/i },
        { key: 'fx',   re: /KRW.*Curncy/i },   // KRW per 1 USD (BBG 'KRW Curncy')
    ];
    const headerRows = rows.slice(0, 5);
    const candidates = {};
    for (const t of TICKERS) {
        const cands = new Set();
        for (const row of headerRows) {
            if (!row) continue;
            for (let c = 0; c < row.length; c++) {
                if (t.re.test(String(row[c] ?? ''))) cands.add(c);
            }
        }
        candidates[t.key] = [...cands];
    }
    const used = new Set();
    const result = {};
    for (const t of TICKERS) {
        let best = { ticks: [], startCol: -1 };
        for (const c of candidates[t.key]) {
            for (const off of [0, -2, -1, 1, 2]) {
                const startCol = c + off;
                if (startCol < 0 || used.has(startCol)) continue;
                const ticks = extractTickBlock(rows, startCol, 'TRADE');
                if (ticks.length > best.ticks.length) best = { ticks, startCol };
            }
        }
        if (best.ticks.length > 0) {
            best.ticks.sort((a, b) => a.ts - b.ts);
            result[t.key] = best;
            used.add(best.startCol);
        }
    }
    return result;
}

function ffCursor(ticks) {
    let i = 0;
    return ts => {
        while (i + 1 < ticks.length && ticks[i + 1].ts <= ts) i++;
        if (ticks.length === 0) return null;
        return ticks[i].ts <= ts ? ticks[i].val : null;
    };
}

// ---------- process all sheets ----------
const allRows = [];
const stats = [];

for (const name of wb1.SheetNames) {
    console.error(`\nProcessing sheet [${name}]...`);
    const t0 = Date.now();
    const wb = XLSX.read(buf, { type: 'buffer', sheets: [name] });
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    console.error(`  read ${rows.length} raw rows in ${((Date.now()-t0)/1000).toFixed(1)}s`);

    const blocks = detectBlocks(rows);
    if (!blocks.inav || blocks.inav.ticks.length === 0) {
        console.error('  no 7709IV block, skip');
        continue;
    }
    const inavTicks = blocks.inav.ticks;
    const etfTicks  = blocks.etf?.ticks  || [];
    const kpTicks   = blocks.kp?.ticks   || [];
    const ktTicks   = blocks.kt?.ticks   || [];
    const fxTicks   = blocks.fx?.ticks   || [];

    const ffEtf = ffCursor(etfTicks);
    const ffKp  = ffCursor(kpTicks);
    const ffKt  = ffCursor(ktTicks);
    const ffFx  = ffCursor(fxTicks);

    // ---- Detect intraday NAV jumps in the PRE-CUTOFF segment only ----
    // After 14:20 HKT (KRX main-board close) BBG-published 7709 IV becomes
    // unreliable and the front-end already replaces it with our own
    // KT-driven Theo (see js/data-input.js KP_CUTOFF_HKT). Therefore
    // post-14:20 jumps in Published carry no information about
    // tradeability and shouldn't pollute the suspect mask.
    //
    // A jump = consecutive iNAV ticks whose pct change |Δ/prev| > 1%.
    // We mark every aligned row at-or-after the first PRE-CUTOFF jump as
    // `inavSuspect: true` (stops at 14:20 — past that, Theo is computed
    // off the 14:20 frozen Published anyway, so jumps don't matter).
    const JUMP_THRESHOLD = 0.01;
    const jumps = [];
    for (let i = 1; i < inavTicks.length; i++) {
        const t = inavTicks[i];
        const time = tsToTimeStr(t.ts);
        if (time > KP_CUTOFF) break;   // ignore post-cutoff Published volatility
        const prev = inavTicks[i - 1].val, cur = t.val;
        if (prev > 0 && Math.abs((cur - prev) / prev) > JUMP_THRESHOLD) {
            jumps.push({ ts: t.ts, time, prev, cur, change: (cur - prev) / prev });
        }
    }
    // Suspect window: from first pre-cutoff jump to the cutoff itself.
    // Past the cutoff, all rows are "trustable" again because Theo no
    // longer uses live Published.
    const cutoffTs = (() => {
        if (inavTicks.length === 0) return Infinity;
        // pick the last tick whose time <= KP_CUTOFF; fall back to last tick.
        let edge = inavTicks[inavTicks.length - 1].ts;
        for (const t of inavTicks) {
            if (tsToTimeStr(t.ts) > KP_CUTOFF) { edge = t.ts; break; }
        }
        return edge;
    })();
    const firstSuspectTs = jumps.length > 0 ? jumps[0].ts : Infinity;

    // 15s grid from inav
    const aligned = inavTicks.map(t => {
        const time = tsToTimeStr(t.ts);
        return {
            ts: t.ts,
            date: tsToDateStr(t.ts),
            time,
            inav: t.val,
            etf: ffEtf(t.ts),
            kp:  time > KP_CUTOFF ? null : ffKp(t.ts),
            kt:  ffKt(t.ts),
            fx:  ffFx(t.ts),
            // Suspect window is [firstJump, cutoff). Past cutoff Theo is
            // recomputed against the frozen pre-cutoff Published, so those
            // rows are clean even if BBG keeps publishing weird values.
            inavSuspect: t.ts >= firstSuspectTs && t.ts < cutoffTs,
        };
    });

    // downsample to 1 minute, first wins
    const byMinute = new Map();
    for (const a of aligned) {
        const key = `${a.date} ${a.time}`;
        if (!byMinute.has(key)) byMinute.set(key, a);
    }
    let finalRows = [...byMinute.values()].sort((x, y) => x.ts - y.ts);

    // trim leading no-etf per day
    const seenEtf = new Set();
    finalRows = finalRows.filter(r => {
        if (r.etf != null) seenEtf.add(r.date);
        return seenEtf.has(r.date);
    });

    stats.push({
        sheet: name,
        rawRows: rows.length,
        finalRows: finalRows.length,
        suspectRows: finalRows.filter(r => r.inavSuspect).length,
        dates: [...new Set(finalRows.map(r => r.date))],
        inavTicks: inavTicks.length, etfTicks: etfTicks.length,
        kpTicks: kpTicks.length, ktTicks: ktTicks.length,
        fxTicks: fxTicks.length,
        jumps: jumps.map(j => `${j.time}:${(j.change * 100).toFixed(2)}%`),
    });

    for (const r of finalRows) {
        allRows.push({
            date: r.date,
            time: r.time,
            inavPrice: r.inav != null ? +r.inav.toFixed(4) : null,
            hynixKP: r.kp != null ? Math.round(r.kp) : null,
            hynixKT: r.kt != null ? Math.round(r.kt) : null,
            etfPrice: r.etf != null ? +r.etf.toFixed(3) : null,
            fxRate: r.fx != null ? +r.fx.toFixed(3) : null,
            inavSuspect: r.inavSuspect ? 1 : 0,
        });
    }
}

// dedup across sheets by (date,time); first wins
console.error('\nDedup across sheets...');
const seen = new Set();
const dedup = [];
for (const r of allRows) {
    const k = `${r.date} ${r.time}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(r);
}
dedup.sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));

console.error('\n=== Per-sheet stats ===');
for (const s of stats) {
    console.error(`  [${s.sheet}] raw=${s.rawRows}  final=${s.finalRows}  suspect=${s.suspectRows}  dates=${s.dates.join(',')}  ` +
                  `iNAV=${s.inavTicks}/ETF=${s.etfTicks}/KP=${s.kpTicks}/KT=${s.ktTicks}/FX=${s.fxTicks}` +
                  (s.jumps.length ? `  jumps=[${s.jumps.join(', ')}]` : ''));
}
console.error('\n=== Final ===');
console.error(`Total rows (before dedup): ${allRows.length}`);
console.error(`Total rows (after dedup):  ${dedup.length}`);
const byDate = new Map();
for (const r of dedup) byDate.set(r.date, (byDate.get(r.date) || 0) + 1);
for (const [d, c] of [...byDate.entries()].sort()) {
    console.error(`  ${d}: ${c} rows`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(dedup));
const outSize = fs.statSync(OUT).size;
console.error(`\nWrote ${OUT} (${(outSize / 1024).toFixed(1)} KB)`);
