const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());

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

app.listen(PORT, () => {
    console.log(`Yahoo Finance proxy running at http://localhost:${PORT}`);
    console.log(`Example: http://localhost:${PORT}/quote?symbol=000660.KS&interval=5m&range=1d`);
});
