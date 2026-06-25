/**
 * One-off analyzer: how long does each iNAV "jump" actually last?
 *
 * Definitions
 *   - jump tick = an iNAV tick whose |Δ/prev| > 1% on the 15s grid.
 *   - We restrict detection to ticks STRICTLY before 14:20 (KP_CUTOFF) —
 *     after that, Theo no longer uses live Published, so jumps don't
 *     matter for execution.
 *
 * For each jump we compute multiple windows so we can tell apart:
 *
 *   (a) "瞬时尖刺" (spike-and-revert) — iNAV pops out and snaps back
 *       within seconds/minutes.  →  episodeShortSec
 *
 *   (b) "持续偏离" (regime shift)   — iNAV pops to a new level and
 *       stays there for the rest of the morning.  →  episodeStrictSec
 *
 * Two revert criteria:
 *   - LOOSE (±0.5% of pre-jump baseline): captures broad mean-reversion.
 *   - STRICT (sign of (val − baseline) flips OR within ±0.1%): captures
 *     the moment iNAV first crosses back through baseline.
 *
 * Also reports time-to-first-sub-threshold-tick: when does the FOLLOWING
 * 15s tick |Δ/prev| drop back below 1%? (= duration of consecutive jumpy
 * ticks, regardless of absolute level)
 */
const XLSX = require('/tmp/probe/node_modules/xlsx');
const fs   = require('fs');

const SRC = '/data/workspace/arbitrage/7709 vs 2x ETF(1).xlsx';
const KP_CUTOFF = '14:20';
const JUMP_THRESHOLD = 0.01;     // 1%

const serialToMs = s => Math.round((s - 25569) * 86400 * 1000);
const tsToDate   = ts => new Date(ts).toISOString().slice(0, 10);
const tsToTime   = ts => {
    const d = new Date(ts);
    return String(d.getUTCHours()).padStart(2,'0') + ':' +
           String(d.getUTCMinutes()).padStart(2,'0') + ':' +
           String(d.getUTCSeconds()).padStart(2,'0');
};
const tsToHM = ts => tsToTime(ts).slice(0,5);
const fmtSec = sec => {
    if (sec < 60) return sec.toFixed(0) + 's';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec - m * 60);
    return `${m}m${String(s).padStart(2,'0')}s`;
};

function extractTickBlock(rows, startCol) {
    const out = [];
    let lastTs = -1, lastVal = NaN;
    for (const row of rows) {
        if (!row) continue;
        const dt  = row[startCol];
        const tag = row[startCol + 1];
        const val = row[startCol + 2];
        if (typeof dt !== 'number' || dt <= 40000) continue;
        if (String(tag ?? '').toUpperCase() !== 'TRADE') continue;
        if (typeof val !== 'number' || !isFinite(val)) continue;
        const ts = serialToMs(dt);
        if (ts === lastTs && val === lastVal) continue;
        out.push({ ts, val });
        lastTs = ts; lastVal = val;
    }
    return out;
}

function findInavBlock(rows) {
    const headerRows = rows.slice(0, 5);
    const cands = new Set();
    for (const row of headerRows) {
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
            if (/7709\s*IV/i.test(String(row[c] ?? ''))) cands.add(c);
        }
    }
    let best = { ticks: [], startCol: -1 };
    for (const c of cands) {
        for (const off of [0, -2, -1, 1, 2]) {
            const sc = c + off;
            if (sc < 0) continue;
            const ticks = extractTickBlock(rows, sc);
            if (ticks.length > best.ticks.length) best = { ticks, startCol: sc };
        }
    }
    best.ticks.sort((a,b) => a.ts - b.ts);
    return best.ticks;
}

console.error('Reading buffer...');
const buf = fs.readFileSync(SRC);
const wb1 = XLSX.read(buf, { type: 'buffer', bookSheets: true });

const allEpisodes = [];

for (const name of wb1.SheetNames) {
    const wb = XLSX.read(buf, { type: 'buffer', sheets: [name] });
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    const inavTicks = findInavBlock(rows);
    if (inavTicks.length === 0) continue;

    const byDate = new Map();
    for (const t of inavTicks) {
        const d = tsToDate(t.ts);
        if (!byDate.has(d)) byDate.set(d, []);
        byDate.get(d).push(t);
    }

    for (const [date, dayTicks] of byDate) {
        // STRICTLY before cutoff (< not <=); 14:20:00 itself is the boundary.
        const pre = dayTicks.filter(t => tsToHM(t.ts) < KP_CUTOFF);
        if (pre.length < 2) continue;

        for (let i = 1; i < pre.length; i++) {
            const prev = pre[i-1].val, cur = pre[i].val;
            if (prev <= 0) continue;
            const ch = (cur - prev) / prev;
            if (Math.abs(ch) <= JUMP_THRESHOLD) continue;

            const baseline = prev;
            const jumpTs   = pre[i].ts;
            const cutoffTs = pre[pre.length - 1].ts;

            // ---- 1. Time until consecutive |Δ/prev| ticks calm down (<1%) ----
            // i.e. how long does the "jumpy" tick sequence last?
            let calmIdx = i; // first index where Δ from PREVIOUS tick is < threshold again
            for (let j = i + 1; j < pre.length; j++) {
                const dch = Math.abs((pre[j].val - pre[j-1].val) / pre[j-1].val);
                if (dch <= JUMP_THRESHOLD) { calmIdx = j; break; }
                calmIdx = j;
            }
            const calmSec = (pre[calmIdx].ts - jumpTs) / 1000;

            // ---- 2. Loose revert window (±0.5% around baseline) ----
            let looseIdx = -1;
            for (let j = i; j < pre.length; j++) {
                if (Math.abs((pre[j].val - baseline) / baseline) <= 0.005) {
                    looseIdx = j; break;
                }
            }
            const looseSec = looseIdx >= 0 ? (pre[looseIdx].ts - jumpTs) / 1000 : null;

            // ---- 3. Strict revert: first crossing back through baseline ----
            // Sign of (val - baseline) at jump tick:
            const jumpSign = Math.sign(cur - baseline);
            let strictIdx = -1;
            for (let j = i + 1; j < pre.length; j++) {
                const cmp = Math.sign(pre[j].val - baseline);
                if (cmp === 0 || cmp !== jumpSign) { strictIdx = j; break; }
            }
            const strictSec = strictIdx >= 0 ? (pre[strictIdx].ts - jumpTs) / 1000 : null;

            // Peak displacement during the longest of the windows
            const scanEnd = Math.max(i, looseIdx, strictIdx, calmIdx);
            let peakAbsPct = Math.abs(ch);
            for (let j = i; j <= scanEnd; j++) {
                const dev = Math.abs((pre[j].val - baseline) / baseline);
                if (dev > peakAbsPct) peakAbsPct = dev;
            }

            allEpisodes.push({
                date,
                jumpTime: tsToTime(jumpTs),
                jumpPct:   ch,
                peakPct:   peakAbsPct,
                calmSec,
                looseSec,
                strictSec,
                untilCutoffSec: (cutoffTs - jumpTs) / 1000,
            });

            // Skip past calm point so consecutive jumpy ticks within ONE
            // episode aren't reported as separate jumps.
            i = Math.max(i, calmIdx);
        }
    }
}

// ---------- Output ----------
console.log('\n=== Per-jump episodes (1% tick threshold, pre-14:20 only) ===\n');
console.log(
    'date'.padEnd(12) +
    'jump@'.padEnd(11) +
    'Δ%'.padStart(8) +
    'peak%'.padStart(9) +
    '  calm  '.padStart(10) +    // 跳变 tick 序列结束
    '  ±0.5%'.padStart(10) +     // 回到基准 ±0.5%
    '  cross-back'.padStart(13) + // 第一次穿回基准
    '  till14:20'.padStart(12)
);
console.log('-'.repeat(80));
for (const e of allEpisodes) {
    console.log(
        e.date.padEnd(12) +
        e.jumpTime.padEnd(11) +
        (e.jumpPct * 100).toFixed(2).padStart(7) + '%' +
        (e.peakPct * 100).toFixed(2).padStart(8) + '%' +
        fmtSec(e.calmSec).padStart(10) +
        (e.looseSec  != null ? fmtSec(e.looseSec)  : '  —  ').padStart(10) +
        (e.strictSec != null ? fmtSec(e.strictSec) : '  —  ').padStart(13) +
        fmtSec(e.untilCutoffSec).padStart(12)
    );
}

console.log('\n=== Summary ===');
console.log(`Total jumps detected (pre-14:20): ${allEpisodes.length}`);
const looseSamples  = allEpisodes.filter(e => e.looseSec  != null).map(e => e.looseSec);
const strictSamples = allEpisodes.filter(e => e.strictSec != null).map(e => e.strictSec);
console.log(`  reverted within ±0.5% by EOD-pre-cutoff: ${looseSamples.length}/${allEpisodes.length}`);
console.log(`  ever crossed back through baseline    : ${strictSamples.length}/${allEpisodes.length}`);

console.log('\n=== Calm duration (consecutive >1% ticks stop) ===');
const calm = allEpisodes.map(e => e.calmSec).sort((a,b)=>a-b);
const pct = (arr, p) => arr.length === 0 ? null : arr[Math.min(arr.length-1, Math.floor(arr.length*p))];
if (calm.length > 0) {
    console.log(`  min : ${fmtSec(calm[0])}`);
    console.log(`  p50 : ${fmtSec(pct(calm, 0.5))}`);
    console.log(`  max : ${fmtSec(calm[calm.length-1])}`);
}

console.log('\nReading guide:');
console.log('  · "calm"      = jumpy 15s ticks 停下，回到正常波动幅度 (<1%/tick)。');
console.log('  · "±0.5%"     = iNAV 价位回到跳前基准的 ±0.5% 区间。');
console.log('  · "cross-back" = iNAV 第一次穿回跳前基准价（不要求精度）。');
console.log('  · "—" 表示在 14:20 之前没有发生该事件。');
