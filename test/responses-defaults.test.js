const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeResponsesRequestBody } = require('../app/responses-defaults');

test('normalizeResponsesRequestBody upgrades responses models using configured aliases case-insensitively', () => {
  const normalized = normalizeResponsesRequestBody('/v1/responses', {
    model: 'GPT-5.4-MINI',
    input: 'hello',
  }, {
    modelAliases: {
      'gpt-5.4-mini': 'gpt-5.5',
    },
  });

  assert.equal(normalized.model, 'gpt-5.5');
});

test('normalizeResponsesRequestBody leaves the model unchanged when no configured alias matches', () => {
  const normalized = normalizeResponsesRequestBody('/v1/responses', {
    model: 'gpt-5.4-mini',
    input: 'hello',
  }, {
    modelAliases: {
      'gpt-5-mini': 'gpt-5.5',
    },
  });

  assert.equal(normalized.model, 'gpt-5.4-mini');
});

test('normalizeResponsesRequestBody preserves client-provided store true for responses compatibility', () => {
  const normalized = normalizeResponsesRequestBody('/v1/responses', {
    model: 'gpt-5.4-mini',
    input: 'hello',
    store: true,
  });

  assert.equal(normalized.store, true);
});

test('normalizeResponsesRequestBody forces store false when the upstream requires it', () => {
  const normalized = normalizeResponsesRequestBody('/v1/responses', {
    model: 'gpt-5.4-mini',
    input: 'hello',
    store: true,
  }, {
    forceStoreFalse: true,
  });

  assert.equal(normalized.store, false);
});

test('normalizeResponsesRequestBody maps Codex speed mode to service tier', () => {
  const normalized = normalizeResponsesRequestBody('/v1/responses', {
    model: 'gpt-5.5',
    input: 'hello',
    reasoning: {
      effort: 'high',
      summary: 'auto',
    },
  }, {
    codexSpeedMode: 'fast',
  });

  assert.equal(normalized.service_tier, 'priority');
  assert.deepEqual(normalized.reasoning, {
    effort: 'high',
    summary: 'auto',
  });
});

test('normalizeResponsesRequestBody clears service tier in Codex standard mode', () => {
  const normalized = normalizeResponsesRequestBody('/v1/responses', {
    model: 'gpt-5.5',
    input: 'hello',
    service_tier: 'priority',
    reasoning: {
      effort: 'high',
    },
  }, {
    codexSpeedMode: 'standard',
  });

  assert.equal(normalized.service_tier, undefined);
  assert.deepEqual(normalized.reasoning, {
    effort: 'high',
  });
});

test('normalizeResponsesRequestBody leaves the model unchanged outside responses paths', () => {
  const normalized = normalizeResponsesRequestBody('/v1/chat/completions', {
    model: 'gpt-5.4-mini',
    input: 'hello',
  }, {
    modelAliases: {
      'gpt-5.4-mini': 'gpt-5.5',
    },
  });

  assert.equal(normalized.model, 'gpt-5.4-mini');
});
