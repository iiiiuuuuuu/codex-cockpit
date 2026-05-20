const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PRIMARY_QUOTA_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const WEEKLY_QUOTA_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function clampPercent(value) {
    return Math.max(0, Math.min(100, value));
}

function getQuotaHistoryAccountKey(config) {
    if (!config || typeof config !== 'object') {
        return '';
    }

    const baseUrl = config.baseUrl || '';

    if (config.type === 'token') {
        if (config.account_id) {
            return ['token', baseUrl, config.account_id].join(':');
        }

        const tokenHash = crypto
            .createHash('sha256')
            .update(String(config.access_token || ''))
            .digest('hex')
            .slice(0, 16);
        return ['token', baseUrl, tokenHash].join(':');
    }

    if (config.type === 'apikey') {
        const apiKeyHash = crypto
            .createHash('sha256')
            .update(String(config.apiKey || ''))
            .digest('hex')
            .slice(0, 16);
        return [
            'apikey',
            baseUrl,
            apiKeyHash,
            Array.isArray(config.support) ? config.support.join(',') : ''
        ].join(':');
    }

    return '';
}

function normalizeHistorySample(sample) {
    if (!sample || typeof sample !== 'object') {
        return null;
    }

    const at = Number(sample.at);
    const remainingPercent = Number(
        sample.remainingPercent ?? sample.remaining_percent
    );

    if (!Number.isFinite(at) || !Number.isFinite(remainingPercent)) {
        return null;
    }

    const resetAt = Number(sample.resetAt ?? sample.reset_at);

    return {
        at,
        remainingPercent: clampPercent(remainingPercent),
        resetAt: Number.isFinite(resetAt) ? resetAt : null,
        reason: typeof sample.reason === 'string' ? sample.reason : null,
        available: typeof sample.available === 'boolean' ? sample.available : null,
    };
}

function normalizeHistory(history, windowMs, now) {
    if (!Array.isArray(history)) {
        return [];
    }

    const cutoff = now - windowMs;
    return history
        .map(normalizeHistorySample)
        .filter(Boolean)
        .filter(sample => sample.at >= cutoff)
        .sort((left, right) => left.at - right.at);
}

function readQuotaHistoryFile(filePath, options = {}) {
    const warn = options.warn || (() => {});

    if (!filePath || !fs.existsSync(filePath)) {
        return { version: 1, accounts: {} };
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!parsed || typeof parsed !== 'object' || typeof parsed.accounts !== 'object' || Array.isArray(parsed.accounts)) {
            return { version: 1, accounts: {} };
        }

        return parsed;
    } catch (err) {
        warn(`读取额度历史文件失败: ${err.message}`);
        return { version: 1, accounts: {} };
    }
}

function hydrateQuotaHistories(configs, persisted, options = {}) {
    const now = typeof options.now === 'function' ? options.now() : Date.now();
    const accounts = persisted && typeof persisted.accounts === 'object'
        ? persisted.accounts
        : {};

    for (const config of configs || []) {
        if (!config || !config.runtime) {
            continue;
        }

        const key = getQuotaHistoryAccountKey(config);
        const entry = key ? accounts[key] : null;
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        config.runtime.quotaHistory = normalizeHistory(
            entry.primary,
            PRIMARY_QUOTA_HISTORY_WINDOW_MS,
            now
        );
        config.runtime.weeklyQuotaHistory = normalizeHistory(
            entry.weekly,
            WEEKLY_QUOTA_HISTORY_WINDOW_MS,
            now
        );
    }

    return configs;
}

function collectQuotaHistories(configs, options = {}) {
    const now = typeof options.now === 'function' ? options.now() : Date.now();
    const accounts = {};

    for (const config of configs || []) {
        if (!config || !config.runtime) {
            continue;
        }

        const key = getQuotaHistoryAccountKey(config);
        if (!key) {
            continue;
        }

        const primary = normalizeHistory(
            config.runtime.quotaHistory,
            PRIMARY_QUOTA_HISTORY_WINDOW_MS,
            now
        );
        const weekly = normalizeHistory(
            config.runtime.weeklyQuotaHistory,
            WEEKLY_QUOTA_HISTORY_WINDOW_MS,
            now
        );

        if (!primary.length && !weekly.length) {
            continue;
        }

        accounts[key] = { primary, weekly };
    }

    return { version: 1, accounts };
}

function writeQuotaHistoryFile(filePath, configs, options = {}) {
    if (!filePath) {
        return;
    }

    const state = collectQuotaHistories(configs, options);
    const directory = path.dirname(filePath);
    const tempPath = `${filePath}.tmp`;

    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, filePath);
}

module.exports = {
    PRIMARY_QUOTA_HISTORY_WINDOW_MS,
    WEEKLY_QUOTA_HISTORY_WINDOW_MS,
    collectQuotaHistories,
    getQuotaHistoryAccountKey,
    hydrateQuotaHistories,
    normalizeHistory,
    readQuotaHistoryFile,
    writeQuotaHistoryFile,
};
