function normalizeLabelPart(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function formatAccountLabel(config) {
    const indexLabel = Number.isInteger(config && config.index)
        ? `#${config.index + 1}`
        : '#?';
    const alias = normalizeLabelPart(config && config.alias);
    const description = normalizeLabelPart(config && config.description);
    const fallback = normalizeLabelPart(config && config.account_id) ||
        normalizeLabelPart(config && config.baseUrl) ||
        '未命名账号';

    if (alias && description && alias !== description) {
        return `${indexLabel} ${alias}（${description}）`;
    }

    return `${indexLabel} ${alias || description || fallback}`;
}

module.exports = {
    formatAccountLabel,
};
