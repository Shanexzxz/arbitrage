const express = require('express');
const cors = require('cors');
const path = require('path');
const { execFile } = require('child_process');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());

// Serve the static frontend (index.html / css / js) from the project root.
const projectRoot = path.resolve(__dirname, '..');
app.use(express.static(projectRoot));

/**
 * Read recent commits from `git log` and return them as JSON.
 * Cached in-memory for 60s so we don't shell out on every page load.
 *
 * GET /api/changelog?limit=15  -> { entries: [{ hash, date, subject }, ...], total }
 */
let changelogCache = { ts: 0, payload: null };
const CHANGELOG_TTL_MS = 60 * 1000;

app.get('/api/changelog', (req, res) => {
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 15));
    const now = Date.now();

    // Re-build cache if expired or limit changed
    if (changelogCache.payload &&
        now - changelogCache.ts < CHANGELOG_TTL_MS &&
        changelogCache.limit === limit) {
        return res.json(changelogCache.payload);
    }

    // %h short hash, %ad author date (ISO short), %s subject — separated by tab
    const fmt = '%h%x09%ad%x09%s';
    execFile(
        'git',
        ['-C', projectRoot, 'log', `-${limit}`, `--pretty=format:${fmt}`, '--date=short'],
        { timeout: 5000 },
        (err, stdout) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            const entries = stdout.split('\n').filter(Boolean).map(line => {
                const [hash, date, subject] = line.split('\t');
                return { hash, date, subject };
            });

            // Total commit count (one extra cheap call; cached together)
            execFile('git', ['-C', projectRoot, 'rev-list', '--count', 'HEAD'],
                { timeout: 3000 },
                (err2, totalStdout) => {
                    const total = err2 ? entries.length : parseInt(totalStdout.trim(), 10) || entries.length;
                    const payload = { entries, total };
                    changelogCache = { ts: now, limit, payload };
                    res.json(payload);
                });
        }
    );
});

/**
 * Yahoo Finance Chart API proxy.
 * GET /quote?symbol=000660.KS&interval=5m&range=1d
 */
app.get('/quote', async (req, res) => {
    const { symbol, interval = '5m', range = '1d' } = req.query;

    if (!symbol) {
        return res.status(400).json({ error: 'Missing symbol parameter' });
    }

    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({
                error: `Yahoo Finance returned ${response.status}`,
                symbol
            });
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message, symbol });
    }
});

app.listen(PORT, HOST, () => {
    console.log(`Arbitrage app running at http://${HOST}:${PORT}`);
    console.log(`Frontend: http://${HOST}:${PORT}/`);
    console.log(`Proxy example: http://${HOST}:${PORT}/quote?symbol=000660.KS&interval=5m&range=1d`);
});
