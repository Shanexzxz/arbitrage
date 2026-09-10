/**
 * Strip the changelog feature from the public build.
 *
 * The changelog stays in the GitHub repo — this only removes it from the built
 * dist/ that ships to Cloudflare Pages, so external viewers don't see the
 * commit history. Operates on the dist directory passed as argv[2].
 *
 * Removes three things (all of them matter):
 *   1. the sidebar nav link       <a href="#changelog">更新日志</a>
 *   2. the whole <section id="changelog"> block (plus its leading comment)
 *   3. functions/api/changelog.js — otherwise /api/changelog still serves the
 *      full commit list to anyone who requests it directly.
 *
 * js/main.js needs no patch: loadChangelog() bails via `if (!list) return;`
 * when #changelog-list is absent, so no request is ever made.
 *
 * Idempotent. Exits non-zero if the marker survives, so a broken strip fails
 * the deploy instead of silently leaking.
 *
 * Usage: node deploy/strip-changelog.cjs <dist-dir>
 */
const fs = require('fs');
const path = require('path');

const DIST = process.argv[2];
if (!DIST) {
    console.error('usage: node strip-changelog.cjs <dist-dir>');
    process.exit(2);
}
const htmlPath = path.join(DIST, 'index.html');
const fnPath = path.join(DIST, 'functions/api/changelog.js');

let html = fs.readFileSync(htmlPath, 'utf8');
const before = html.length;
const done = [];

// 1. nav link
const navLink = html.match(/^[ \t]*<a href="#changelog">[^<]*<\/a>[ \t]*\r?\n/m);
if (navLink) {
    html = html.replace(navLink[0], '');
    done.push('nav link');
}

// 2. <section id="changelog"> ... </section>, including the HTML comment above it
const startTag = html.indexOf('<section id="changelog"');
if (startTag !== -1) {
    const endTag = html.indexOf('</section>', startTag);
    if (endTag === -1) {
        console.error('ERROR: found <section id="changelog"> but no closing </section>');
        process.exit(1);
    }
    let from = startTag;
    const commentIdx = html.lastIndexOf('<!--', startTag);
    if (commentIdx !== -1 && startTag - commentIdx < 200 &&
        html.slice(commentIdx, startTag).includes('Changelog')) {
        from = commentIdx;
    }
    const lineStart = html.lastIndexOf('\n', from) + 1;
    let to = endTag + '</section>'.length;
    while (to < html.length && (html[to] === '\n' || html[to] === '\r')) to++;
    html = html.slice(0, lineStart) + html.slice(to);
    done.push('section block');
}

// Fail loudly rather than shipping a build that still leaks the changelog.
if (html.includes('changelog')) {
    console.error('ERROR: "changelog" still present in index.html after stripping');
    process.exit(1);
}

fs.writeFileSync(htmlPath, html);

// 3. the Pages Function
if (fs.existsSync(fnPath)) {
    fs.unlinkSync(fnPath);
    done.push('functions/api/changelog.js');
    const apiDir = path.dirname(fnPath);
    if (fs.existsSync(apiDir) && fs.readdirSync(apiDir).length === 0) fs.rmdirSync(apiDir);
}

console.log('strip-changelog:', done.length ? done.join(', ') : '(nothing — already clean)');
// NOTE: .length is UTF-16 code units, not bytes. Don't compare to `wc -c`.
console.log(`  index.html: ${before} -> ${html.length} chars`);
