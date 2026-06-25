'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  parseEnvFile,
  diffEnvFiles,
  formatDiffText,
  formatDiffMarkdown,
  sortEnvFile,
  truncate,
  isValidKey,
  findClosingQuote,
  findInlineComment
} = require('../lib/differ');

// ─── Parser Tests ────────────────────────────────────────────────────

test('parseEnvFile parses simple key=value', () => {
  const result = parseEnvFile('DATABASE_URL=localhost');
  assert.strictEqual(result.keys.length, 1);
  assert.strictEqual(result.keys[0], 'DATABASE_URL');
  assert.strictEqual(result.values.DATABASE_URL, 'localhost');
});

test('parseEnvFile parses multiple lines', () => {
  const result = parseEnvFile('A=1\nB=2\nC=3');
  assert.strictEqual(result.keys.length, 3);
  assert.deepStrictEqual(result.keys, ['A', 'B', 'C']);
});

test('parseEnvFile skips blank lines', () => {
  const result = parseEnvFile('\n\nA=1\n\n\nB=2\n');
  assert.strictEqual(result.keys.length, 2);
  assert.deepStrictEqual(result.keys, ['A', 'B']);
});

test('parseEnvFile skips comment lines', () => {
  const result = parseEnvFile('# This is a comment\nA=1\n# Another\nB=2');
  assert.strictEqual(result.keys.length, 2);
});

test('parseEnvFile parses double-quoted values', () => {
  const result = parseEnvFile('NAME="John Doe"');
  assert.strictEqual(result.values.NAME, 'John Doe');
});

test('parseEnvFile parses single-quoted values', () => {
  const result = parseEnvFile("NAME='Jane Doe'");
  assert.strictEqual(result.values.NAME, 'Jane Doe');
});

test('parseEnvFile strips quotes from value', () => {
  const result = parseEnvFile('X="hello"');
  assert.strictEqual(result.values.X, 'hello');
});

test('parseEnvFile handles equals sign in quoted value', () => {
  const result = parseEnvFile('CONN="host=localhost port=5432"');
  assert.strictEqual(result.values.CONN, 'host=localhost port=5432');
});

test('parseEnvFile handles equals sign in single-quoted value', () => {
  const result = parseEnvFile("CONN='a=b'");
  assert.strictEqual(result.values.CONN, 'a=b');
});

test('parseEnvFile handles empty values', () => {
  const result = parseEnvFile('EMPTY=\nALSO=""');
  assert.strictEqual(result.values.EMPTY, '');
  assert.strictEqual(result.values.ALSO, '');
});

test('parseEnvFile handles export prefix', () => {
  const result = parseEnvFile('export NODE_ENV=production');
  assert.strictEqual(result.keys[0], 'NODE_ENV');
  assert.strictEqual(result.values.NODE_ENV, 'production');
});

test('parseEnvFile handles export prefix with spaces', () => {
  const result = parseEnvFile('export   PORT=3000');
  assert.strictEqual(result.keys[0], 'PORT');
  assert.strictEqual(result.values.PORT, '3000');
});

test('parseEnvFile handles inline comments on unquoted values', () => {
  const result = parseEnvFile('PORT=3000 # the port');
  assert.strictEqual(result.values.PORT, '3000');
});

test('parseEnvFile preserves # inside double quotes', () => {
  const result = parseEnvFile('HASH="abc#123"');
  assert.strictEqual(result.values.HASH, 'abc#123');
});

test('parseEnvFile preserves # inside single quotes', () => {
  const result = parseEnvFile("HASH='abc#123'");
  assert.strictEqual(result.values.HASH, 'abc#123');
});

test('parseEnvFile does NOT strip inline comments not preceded by space', () => {
  const result = parseEnvFile('URL=http://example.com#anchor');
  assert.strictEqual(result.values.URL, 'http://example.com#anchor');
});

test('parseEnvFile handles multi-line double-quoted values', () => {
  const content = 'CERT="-----BEGIN-----\nline2\nline3\n-----END-----"';
  const result = parseEnvFile(content);
  assert.strictEqual(result.keys[0], 'CERT');
  assert.ok(result.values.CERT.includes('line2'));
  assert.ok(result.values.CERT.includes('line3'));
});

test('parseEnvFile handles multi-line single-quoted values', () => {
  const content = "KEY='line1\nline2'";
  const result = parseEnvFile(content);
  assert.strictEqual(result.keys[0], 'KEY');
  assert.ok(result.values.KEY.includes('line1'));
  assert.ok(result.values.KEY.includes('line2'));
});

test('parseEnvFile handles escaped quotes in double-quoted values', () => {
  const result = parseEnvFile('MSG="He said \\"hello\\""');
  assert.ok(result.values.MSG.includes('hello'));
});

test('parseEnvFile handles CRLF line endings', () => {
  const result = parseEnvFile('A=1\r\nB=2\r\n');
  assert.strictEqual(result.keys.length, 2);
});

test('parseEnvFile preserves key order', () => {
  const result = parseEnvFile('Z=1\nA=2\nM=3');
  assert.deepStrictEqual(result.keys, ['Z', 'A', 'M']);
});

test('parseEnvFile handles last key without trailing newline', () => {
  const result = parseEnvFile('A=1');
  assert.strictEqual(result.keys.length, 1);
  assert.strictEqual(result.values.A, '1');
});

test('parseEnvFile handles duplicate keys (last wins)', () => {
  const result = parseEnvFile('A=1\nA=2');
  assert.strictEqual(result.keys.length, 1);
  assert.strictEqual(result.values.A, '2');
});

test('parseEnvFile skips lines without = sign', () => {
  const result = parseEnvFile('NOTANASSIGNMENT\nA=1');
  assert.strictEqual(result.keys.length, 1);
  assert.strictEqual(result.keys[0], 'A');
});

test('parseEnvFile handles keys with underscores and numbers', () => {
  const result = parseEnvFile('API_KEY_V2=secret123');
  assert.strictEqual(result.keys[0], 'API_KEY_V2');
});

test('parseEnvFile rejects keys starting with digit', () => {
  const result = parseEnvFile('1INVALID=foo\nVALID=bar');
  assert.strictEqual(result.keys.length, 1);
  assert.strictEqual(result.keys[0], 'VALID');
});

test('parseEnvFile throws on non-string input', () => {
  assert.throws(() => parseEnvFile(123), /string/);
  assert.throws(() => parseEnvFile(null), /string/);
  assert.throws(() => parseEnvFile(undefined), /string/);
});

// ─── Helper Function Tests ───────────────────────────────────────────

test('isValidKey accepts valid keys', () => {
  assert.strictEqual(isValidKey('A'), true);
  assert.strictEqual(isValidKey('API_KEY'), true);
  assert.strictEqual(isValidKey('_PRIVATE'), true);
  assert.strictEqual(isValidKey('KEY_V2'), true);
  assert.strictEqual(isValidKey('lowercase'), true);
});

test('isValidKey rejects invalid keys', () => {
  assert.strictEqual(isValidKey('1FOO'), false);
  assert.strictEqual(isValidKey('KEY-WITH-DASH'), false);
  assert.strictEqual(isValidKey(''), false);
  assert.strictEqual(isValidKey('KEY.WITH.DOT'), false);
  assert.strictEqual(isValidKey('KEY WITH SPACE'), false);
});

test('findClosingQuote finds closing double quote', () => {
  // Input is the full string starting with opening quote; search starts at index 1
  assert.strictEqual(findClosingQuote('"hello"world', '"'), 6);
  assert.strictEqual(findClosingQuote('"hello"', '"'), 6);
  assert.strictEqual(findClosingQuote('"ab"cd"', '"'), 3); // finds first closing at index 3
});

test('findClosingQuote handles escaped quotes', () => {
  // "a\"b" — backslash at 2 escapes the quote at 3, closing quote is at 5
  assert.strictEqual(findClosingQuote('"a\\"b"', '"'), 5);
});

test('findClosingQuote returns -1 when not found', () => {
  assert.strictEqual(findClosingQuote('"unclosed', '"'), -1);
});

test('findInlineComment finds # preceded by space', () => {
  assert.strictEqual(findInlineComment('value # comment'), 6);
});

test('findInlineComment returns -1 when # not preceded by space', () => {
  assert.strictEqual(findInlineComment('http://x.com#anchor'), -1);
});

test('findInlineComment returns -1 when no #', () => {
  assert.strictEqual(findInlineComment('just a value'), -1);
});

test('truncate shortens long strings', () => {
  assert.strictEqual(truncate('hello world this is long', 10), 'hello w...');
});

test('truncate returns full string if under limit', () => {
  assert.strictEqual(truncate('short', 10), 'short');
});

test('truncate handles empty/undefined', () => {
  assert.strictEqual(truncate('', 10), '');
  assert.strictEqual(truncate(undefined, 10), '');
  assert.strictEqual(truncate(null, 10), '');
});

// ─── Diff Comparator Tests ───────────────────────────────────────────

test('diffEnvFiles finds missing variables', () => {
  const source = parseEnvFile('A=1\nB=2\nC=3');
  const target = parseEnvFile('A=1\nB=2');
  const diff = diffEnvFiles(source, target);
  assert.deepStrictEqual(diff.missing, ['C']);
});

test('diffEnvFiles finds extra variables', () => {
  const source = parseEnvFile('A=1\nB=2');
  const target = parseEnvFile('A=1\nB=2\nD=4');
  const diff = diffEnvFiles(source, target);
  assert.deepStrictEqual(diff.extra, ['D']);
});

test('diffEnvFiles finds changed values when not ignoring', () => {
  const source = parseEnvFile('A=1\nB=2');
  const target = parseEnvFile('A=1\nB=99');
  const diff = diffEnvFiles(source, target, { ignoreValues: false });
  assert.strictEqual(diff.changed.length, 1);
  assert.strictEqual(diff.changed[0].key, 'B');
  assert.strictEqual(diff.changed[0].sourceValue, '2');
  assert.strictEqual(diff.changed[0].targetValue, '99');
});

test('diffEnvFiles ignores value differences when ignoreValues is true', () => {
  const source = parseEnvFile('A=1\nB=2');
  const target = parseEnvFile('A=1\nB=99');
  const diff = diffEnvFiles(source, target, { ignoreValues: true });
  assert.strictEqual(diff.changed.length, 0);
});

test('diffEnvFiles identifies matching variables', () => {
  const source = parseEnvFile('A=1\nB=2');
  const target = parseEnvFile('A=1\nB=2');
  const diff = diffEnvFiles(source, target, { ignoreValues: false });
  assert.deepStrictEqual(diff.missing, []);
  assert.deepStrictEqual(diff.extra, []);
  assert.deepStrictEqual(diff.changed, []);
  assert.strictEqual(diff.same.length, 2);
});

test('diffEnvFiles returns empty diff for identical files', () => {
  const source = parseEnvFile('A=1\nB=2');
  const diff = diffEnvFiles(source, source);
  assert.strictEqual(diff.missing.length, 0);
  assert.strictEqual(diff.extra.length, 0);
  assert.strictEqual(diff.changed.length, 0);
});

test('diffEnvFiles sorts output when sortOutput is true', () => {
  const source = parseEnvFile('Z=1\nA=2\nM=3');
  const target = parseEnvFile('');
  const diff = diffEnvFiles(source, target, { sortOutput: true });
  assert.deepStrictEqual(diff.missing, ['A', 'M', 'Z']);
});

test('diffEnvFiles does not sort when sortOutput is false', () => {
  const source = parseEnvFile('Z=1\nA=2\nM=3');
  const target = parseEnvFile('');
  const diff = diffEnvFiles(source, target, { sortOutput: false });
  assert.deepStrictEqual(diff.missing, ['Z', 'A', 'M']);
});

test('diffEnvFiles combines missing, extra, and changed', () => {
  const source = parseEnvFile('A=1\nB=2\nC=3');
  const target = parseEnvFile('A=1\nB=99\nD=4');
  const diff = diffEnvFiles(source, target, { ignoreValues: false });
  assert.deepStrictEqual(diff.missing, ['C']);
  assert.deepStrictEqual(diff.extra, ['D']);
  assert.strictEqual(diff.changed.length, 1);
  assert.strictEqual(diff.changed[0].key, 'B');
});

test('diffEnvFiles handles empty source', () => {
  const source = parseEnvFile('');
  const target = parseEnvFile('A=1\nB=2');
  const diff = diffEnvFiles(source, target);
  assert.deepStrictEqual(diff.missing, []);
  assert.deepStrictEqual(diff.extra, ['A', 'B']);
});

test('diffEnvFiles handles empty target', () => {
  const source = parseEnvFile('A=1\nB=2');
  const target = parseEnvFile('');
  const diff = diffEnvFiles(source, target);
  assert.deepStrictEqual(diff.missing, ['A', 'B']);
  assert.deepStrictEqual(diff.extra, []);
});

test('diffEnvFiles handles both empty', () => {
  const diff = diffEnvFiles(parseEnvFile(''), parseEnvFile(''));
  assert.strictEqual(diff.missing.length, 0);
  assert.strictEqual(diff.extra.length, 0);
  assert.strictEqual(diff.changed.length, 0);
  assert.strictEqual(diff.same.length, 0);
});

test('diffEnvFiles allKeys includes union of both files', () => {
  const source = parseEnvFile('A=1\nB=2');
  const target = parseEnvFile('B=2\nC=3');
  const diff = diffEnvFiles(source, target);
  assert.ok(diff.allKeys.includes('A'));
  assert.ok(diff.allKeys.includes('B'));
  assert.ok(diff.allKeys.includes('C'));
});

// ─── Formatter Tests ─────────────────────────────────────────────────

test('formatDiffText returns no-diff message when clean', () => {
  const diff = { missing: [], extra: [], changed: [], same: ['A', 'B'], allKeys: ['A', 'B'] };
  const text = formatDiffText(diff);
  assert.ok(text.includes('All variables match'));
});

test('formatDiffText shows missing section', () => {
  const diff = { missing: ['SECRET_KEY'], extra: [], changed: [], same: [], allKeys: ['SECRET_KEY'] };
  const text = formatDiffText(diff);
  assert.ok(text.includes('MISSING'));
  assert.ok(text.includes('SECRET_KEY'));
});

test('formatDiffText shows extra section', () => {
  const diff = { missing: [], extra: ['OLD_VAR'], changed: [], same: [], allKeys: ['OLD_VAR'] };
  const text = formatDiffText(diff);
  assert.ok(text.includes('EXTRA'));
  assert.ok(text.includes('OLD_VAR'));
});

test('formatDiffText shows changed section', () => {
  const diff = {
    missing: [],
    extra: [],
    changed: [{ key: 'PORT', sourceValue: '3000', targetValue: '8080' }],
    same: [],
    allKeys: ['PORT']
  };
  const text = formatDiffText(diff);
  assert.ok(text.includes('CHANGED'));
  assert.ok(text.includes('PORT'));
  assert.ok(text.includes('3000'));
  assert.ok(text.includes('8080'));
});

test('formatDiffText includes summary line', () => {
  const diff = {
    missing: ['A'],
    extra: ['B'],
    changed: [{ key: 'C', sourceValue: '1', targetValue: '2' }],
    same: ['D'],
    allKeys: ['A', 'B', 'C', 'D']
  };
  const text = formatDiffText(diff);
  assert.ok(text.includes('Summary:'));
  assert.ok(text.includes('1 missing'));
  assert.ok(text.includes('1 extra'));
  assert.ok(text.includes('1 changed'));
  assert.ok(text.includes('1 matching'));
});

test('formatDiffMarkdown returns clean message when no differences', () => {
  const diff = { missing: [], extra: [], changed: [], same: ['A'], allKeys: ['A'] };
  const md = formatDiffMarkdown(diff);
  assert.ok(md.includes('All variables match'));
});

test('formatDiffMarkdown includes headers and counts', () => {
  const diff = {
    missing: ['X'],
    extra: ['Y'],
    changed: [{ key: 'Z', sourceValue: '1', targetValue: '2' }],
    same: [],
    allKeys: ['X', 'Y', 'Z']
  };
  const md = formatDiffMarkdown(diff);
  assert.ok(md.includes('# Env Diff'));
  assert.ok(md.includes('Missing'));
  assert.ok(md.includes('Extra'));
  assert.ok(md.includes('Changed'));
  assert.ok(md.includes('`X`'));
});

test('formatDiffMarkdown renders changed values as table', () => {
  const diff = {
    missing: [],
    extra: [],
    changed: [{ key: 'PORT', sourceValue: '3000', targetValue: '8080' }],
    same: [],
    allKeys: ['PORT']
  };
  const md = formatDiffMarkdown(diff);
  assert.ok(md.includes('| Variable |'));
  assert.ok(md.includes('PORT'));
  assert.ok(md.includes('3000'));
  assert.ok(md.includes('8080'));
});

// ─── Sorter Tests ────────────────────────────────────────────────────

test('sortEnvFile sorts entries alphabetically', () => {
  const result = sortEnvFile('ZEBRA=1\nAPPLE=2\nMANGO=3');
  const lines = result.split('\n');
  assert.ok(lines.indexOf('APPLE=2') < lines.indexOf('MANGO=3'));
  assert.ok(lines.indexOf('MANGO=3') < lines.indexOf('ZEBRA=1'));
});

test('sortEnvFile preserves leading comments', () => {
  const result = sortEnvFile('# Header comment\nZEBRA=1\nAPPLE=2');
  assert.ok(result.startsWith('# Header comment'));
});

test('sortEnvFile preserves blank lines in content', () => {
  const result = sortEnvFile('B=2\n\nA=1');
  // Should still have both entries
  assert.ok(result.includes('A=1'));
  assert.ok(result.includes('B=2'));
});

test('sortEnvFile handles already sorted file', () => {
  const input = 'A=1\nB=2\nC=3';
  const result = sortEnvFile(input);
  // Should be same or very similar
  assert.ok(result.includes('A=1'));
  assert.ok(result.includes('B=2'));
  assert.ok(result.includes('C=3'));
});

test('sortEnvFile handles empty content', () => {
  const result = sortEnvFile('');
  assert.strictEqual(typeof result, 'string');
});

test('sortEnvFile handles comments-only file', () => {
  const result = sortEnvFile('# Just\n# comments');
  assert.ok(result.includes('# Just'));
  assert.ok(result.includes('# comments'));
});

test('sortEnvFile throws on non-string input', () => {
  assert.throws(() => sortEnvFile(123), /string/);
});

// ─── Integration / Real-world Scenario Tests ─────────────────────────

test('Real-world: compare dev .env vs production .env', () => {
  const devEnv = parseEnvFile([
    '# Development',
    'NODE_ENV=development',
    'PORT=3000',
    'DATABASE_URL=postgres://localhost:5432/devdb',
    'REDIS_URL=redis://localhost:6379',
    'JWT_SECRET=dev-secret-key',
    'STRIPE_SECRET_KEY=sk_test_dev123',
    'LOG_LEVEL=debug'
  ].join('\n'));
  
  const prodEnv = parseEnvFile([
    '# Production',
    'NODE_ENV=production',
    'PORT=80',
    'DATABASE_URL=postgres://prod-host:5432/proddb',
    'REDIS_URL=redis://prod-redis:6379',
    'JWT_SECRET=prod-super-secret',
    'SENTRY_DSN=https://abc@sentry.io/123',
    'LOG_LEVEL=info'
  ].join('\n'));
  
  // Comparing keys only (ignoreValues=true)
  const keyDiff = diffEnvFiles(devEnv, prodEnv, { ignoreValues: true, sortOutput: true });
  
  assert.ok(keyDiff.missing.includes('STRIPE_SECRET_KEY'));
  assert.ok(keyDiff.extra.includes('SENTRY_DSN'));
  assert.ok(keyDiff.same.includes('NODE_ENV'));
  assert.ok(keyDiff.same.includes('DATABASE_URL'));
});

test('Real-world: compare .env.example vs .env (find unconfigured)', () => {
  const example = parseEnvFile([
    '# Required environment variables',
    'DATABASE_URL=',
    'REDIS_URL=',
    'JWT_SECRET=',
    'STRIPE_SECRET_KEY=',
    'PORT=3000'
  ].join('\n'));
  
  const env = parseEnvFile([
    'DATABASE_URL=postgres://localhost/db',
    'JWT_SECRET=my-secret',
    'PORT=3000'
  ].join('\n'));
  
  const diff = diffEnvFiles(example, env, { ignoreValues: true, sortOutput: true });
  
  // REDIS_URL and STRIPE_SECRET_KEY are in example but missing from .env
  assert.ok(diff.missing.includes('REDIS_URL'));
  assert.ok(diff.missing.includes('STRIPE_SECRET_KEY'));
});

test('Real-world: multiline private key comparison', () => {
  const env1 = parseEnvFile('PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----"');
  const env2 = parseEnvFile('PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----"');
  
  const diff = diffEnvFiles(env1, env2, { ignoreValues: false });
  assert.strictEqual(diff.changed.length, 0);
});

test('formatDiffText handles large diff gracefully', () => {
  const manyMissing = Array.from({ length: 50 }, (_, i) => `VAR_${i}`);
  const diff = {
    missing: manyMissing,
    extra: [],
    changed: [],
    same: [],
    allKeys: manyMissing
  };
  const text = formatDiffText(diff);
  assert.ok(text.includes('50'));
  assert.ok(text.includes('VAR_0'));
  assert.ok(text.includes('VAR_49'));
});
