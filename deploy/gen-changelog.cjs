/**
 * Build-time snapshot generator for the /api/changelog Pages Function.
 *
 * The original server/proxy.js served /api/changelog by shelling out to `git log`.
 * Cloudflare's edge runtime has no git / child_process, so we bake the history
 * into the Function source at build time here.
 *
 * Portable: no absolute paths. Resolves everything relative to this file, and
 * reads git history from the repo root (two levels up: deploy/ -> repo root).
 *
 * Usage: node deploy/gen-changelog.cjs
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'functions/api/changelog.js');

const tsv = execFileSync('git',
    ['-C', REPO_ROOT, 'log', '-50', '--pretty=format:%h%x09%ad%x09%s', '--date=short'],
    { encoding: 'utf8' });
const total = parseInt(
    execFileSync('git', ['-C', REPO_ROOT, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim(),
    10) || 0;

const entries = tsv.split('\n').filter(Boolean).map(line => {
    const [hash, date, ...rest] = line.split('\t');
    return { hash, date, subject: rest.join('\t') };
});

const header = [
    '/**',
    ' * Cloudflare Pages Function - /api/changelog',
    ' *',
    ' * Build-time snapshot of git history (the edge has no git).',
    ' * Regenerate with: node deploy/gen-changelog.cjs',
    ' * Snapshot taken: ' + new Date().toISOString(),
    ' */',
].join('\n');

const body = [
    'const ENTRIES = ' + JSON.stringify(entries, null, 4) + ';',
    '',
    'const TOTAL = ' + total + ';',
    '',
    'export async function onRequestGet(context) {',
    '    const { searchParams } = new URL(context.request.url);',
    '    const raw = parseInt(searchParams.get(\'limit\'), 10);',
    '    const limit = Math.max(1, Math.min(50, Number.isNaN(raw) ? 15 : raw));',
    '',
    '    return new Response(JSON.stringify({ entries: ENTRIES.slice(0, limit), total: TOTAL }), {',
    '        headers: {',
    '            \'Content-Type\': \'application/json; charset=utf-8\',',
    '            \'Cache-Control\': \'public, max-age=300\',',
    '        },',
    '    });',
    '}',
    '',
].join('\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, header + '\n' + body);
// NOTE: .length is UTF-16 code units, not bytes (CJK = 1 unit, 3 bytes). Don't compare to `wc -c`.
console.log(`gen-changelog: ${entries.length} entries, total ${total} -> ${path.relative(REPO_ROOT, OUT)}`);
