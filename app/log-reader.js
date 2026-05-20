const fs = require('node:fs');

function normalizeLineLimit(value, fallback = 100) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.min(parsed, 1000);
}

function readRecentLogContent(filePath, limit = 100) {
    const lineCount = normalizeLineLimit(limit);
    if (!fs.existsSync(filePath)) {
        return {
            content: '',
            lineCount: 0,
            truncated: false,
            exists: false,
        };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const trimmedContent = content.endsWith('\n') ? content.slice(0, -1) : content;
    if (!trimmedContent) {
        return {
            content: '',
            lineCount: 0,
            truncated: false,
            exists: true,
        };
    }

    const lines = trimmedContent.split('\n');
    const recentLines = lines.slice(-lineCount);

    return {
        content: recentLines.join('\n'),
        lineCount: recentLines.length,
        truncated: lines.length > recentLines.length,
        exists: true,
    };
}

module.exports = {
    normalizeLineLimit,
    readRecentLogContent,
};
