'use strict';

/**
 * Env Diff — Parser and Comparator
 * 
 * Parses .env files into structured key/value maps, then compares them
 * to find missing, extra, and changed variables.
 * 
 * Design: pure functions, no I/O, zero dependencies. Every function
 * is independently testable.
 */

// ─── Parser ──────────────────────────────────────────────────────────

/**
 * Parse a single .env file's content into an ordered map of key → value.
 * 
 * Supports:
 * - KEY=value
 * - KEY="value" (double-quoted, value is inner content)
 * - KEY='value' (single-quoted, value is inner content)
 * - export KEY=value (shell-style export prefix)
 * - Lines starting with # are comments
 * - Blank lines are skipped
 * - Inline comments after unquoted values: KEY=value # comment
 * - Multiline values in quotes
 * - = sign inside quoted values preserved
 * - Empty values: KEY= and KEY="" are valid
 * 
 * @param {string} content - Raw .env file content
 * @returns {{keys: string[], values: Object<string,string>}} Ordered keys + values
 */
function parseEnvFile(content) {
  if (typeof content !== 'string') {
    throw new Error('Content must be a string');
  }

  const keys = [];
  const values = {};
  
  // Normalize line endings
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  
  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    
    // Skip blank lines
    if (line === '') { i++; continue; }
    
    // Skip comments (but not lines that start with # inside a value)
    if (line.startsWith('#')) { i++; continue; }
    
    // Handle export prefix
    let processed = line;
    if (/^export\s+/.test(processed)) {
      processed = processed.replace(/^export\s+/, '');
    }
    
    // Must contain = to be a valid assignment
    const eqIdx = processed.indexOf('=');
    if (eqIdx === -1) { i++; continue; }
    
    const key = processed.substring(0, eqIdx).trim();
    if (!key || !isValidKey(key)) { i++; continue; }
    
    let value = processed.substring(eqIdx + 1);
    
    // Check if value starts with a quote
    const firstChar = value.charAt(0);
    let actualValue;
    let needsMultiline = false;
    
    if (firstChar === '"') {
      // Double-quoted value
      const closing = findClosingQuote(value, '"');
      if (closing === -1) {
        // Multiline value
        needsMultiline = true;
      } else {
        actualValue = value.substring(1, closing);
      }
    } else if (firstChar === "'") {
      // Single-quoted value
      const closing = findClosingQuote(value, "'");
      if (closing === -1) {
        needsMultiline = true;
      } else {
        actualValue = value.substring(1, closing);
      }
    } else {
      // Unquoted: strip inline comment, then trim
      const commentIdx = findInlineComment(value);
      if (commentIdx !== -1) {
        value = value.substring(0, commentIdx);
      }
      actualValue = value.trim();
    }
    
    if (needsMultiline) {
      // Collect continuation lines until closing quote
      const quoteChar = firstChar;
      let collected = value.substring(1); // skip opening quote
      i++;
      let found = false;
      while (i < lines.length) {
        collected += '\n' + lines[i];
        const closeIdx = lines[i].indexOf(quoteChar);
        if (closeIdx !== -1) {
          actualValue = collected.substring(0, collected.length - (lines[i].length - closeIdx));
          found = true;
          break;
        }
        i++;
      }
      if (!found) {
        // Unterminated quote — take everything
        actualValue = collected;
      }
    }
    
    if (!keys.includes(key)) {
      keys.push(key);
    }
    values[key] = actualValue !== undefined ? actualValue : '';
    
    i++;
  }
  
  return { keys, values };
}

/**
 * Check if a key is valid (alphanumeric + underscore, doesn't start with digit)
 */
function isValidKey(key) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

/**
 * Find the index of the closing quote (respecting escaped chars for double quotes)
 */
function findClosingQuote(value, quoteChar) {
  for (let i = 1; i < value.length; i++) {
    if (quoteChar === '"' && value[i] === '\\' && i + 1 < value.length) {
      i++; // skip escaped char
      continue;
    }
    if (value[i] === quoteChar) {
      return i;
    }
  }
  return -1;
}

/**
 * Find the index of an inline comment (# preceded by whitespace) in unquoted text
 */
function findInlineComment(value) {
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '#') {
      // Must be preceded by whitespace or be at start
      if (i === 0 || /\s/.test(value[i - 1])) {
        return i;
      }
    }
  }
  return -1;
}

// ─── Comparator ──────────────────────────────────────────────────────

/**
 * Compare two parsed env files and return a structured diff.
 * 
 * @param {{keys: string[], values: Object}} source - First file (e.g. .env)
 * @param {{keys: string[], values: Object}} target - Second file (e.g. .env.production)
 * @param {Object} options - { ignoreValues: bool, sortOutput: bool }
 * @returns {{missing: string[], extra: string[], changed: Array, same: string[], allKeys: string[]}}
 */
function diffEnvFiles(source, target, options) {
  const opts = options || {};
  const ignoreValues = opts.ignoreValues !== undefined ? opts.ignoreValues : false;
  
  const sourceKeys = new Set(source.keys);
  const targetKeys = new Set(target.keys);
  
  // Missing: in source but not target
  const missing = [...sourceKeys].filter(k => !targetKeys.has(k));
  
  // Extra: in target but not source
  const extra = [...targetKeys].filter(k => !sourceKeys.has(k));
  
  // Changed: in both but different values (if comparing values)
  const changed = [];
  const same = [];
  
  if (!ignoreValues) {
    for (const key of sourceKeys) {
      if (targetKeys.has(key)) {
        if (source.values[key] !== target.values[key]) {
          changed.push({
            key,
            sourceValue: source.values[key],
            targetValue: target.values[key]
          });
        } else {
          same.push(key);
        }
      }
    }
  } else {
    // When ignoring values, "same" = keys present in both
    for (const key of sourceKeys) {
      if (targetKeys.has(key)) {
        same.push(key);
      }
    }
  }
  
  // All keys (for reference)
  let allKeys = [...new Set([...sourceKeys, ...targetKeys])];
  
  if (opts.sortOutput) {
    missing.sort();
    extra.sort();
    changed.sort((a, b) => a.key.localeCompare(b.key));
    same.sort();
    allKeys.sort();
  }
  
  return { missing, extra, changed, same, allKeys };
}

// ─── Formatter ───────────────────────────────────────────────────────

/**
 * Format a diff result as human-readable Markdown for VS Code output.
 * 
 * @param {Object} diff - Result from diffEnvFiles
 * @param {Object} options - { highlightChanges: bool }
 * @returns {string} Markdown-formatted diff report
 */
function formatDiffMarkdown(diff, options) {
  const opts = options || {};
  const highlight = opts.highlightChanges !== undefined ? opts.highlightChanges : true;
  const parts = [];
  
  parts.push('# Env Diff Report\n');
  
  // Summary
  const totalIssues = diff.missing.length + diff.extra.length + diff.changed.length;
  if (totalIssues === 0) {
    parts.push('✅ **All variables match.** No differences found.\n');
    return parts.join('\n');
  }
  
  parts.push(`Found **${totalIssues}** difference(s):\n`);
  
  // Missing (in source, not in target)
  if (diff.missing.length > 0) {
    parts.push(`## ⚠️ Missing in target (${diff.missing.length})\n`);
    parts.push('These variables exist in the source but are **absent** in the target:\n');
    for (const key of diff.missing) {
      parts.push(`- \`${key}\``);
    }
    parts.push('');
  }
  
  // Extra (in target, not in source)
  if (diff.extra.length > 0) {
    parts.push(`## ➕ Extra in target (${diff.extra.length})\n`);
    parts.push('These variables exist in the target but are **not in** the source:\n');
    for (const key of diff.extra) {
      parts.push(`- \`${key}\``);
    }
    parts.push('');
  }
  
  // Changed values
  if (diff.changed.length > 0) {
    parts.push(`## 🔄 Changed values (${diff.changed.length})\n`);
    parts.push('| Variable | Source | Target |');
    parts.push('|----------|--------|--------|');
    for (const c of diff.changed) {
      const src = highlight ? truncate(c.sourceValue, 40) : truncate(c.sourceValue, 40);
      const tgt = highlight ? truncate(c.targetValue, 40) : truncate(c.targetValue, 40);
      parts.push(`| \`${c.key}\` | \`${src}\` | \`${tgt}\` |`);
    }
    parts.push('');
  }
  
  // Same
  if (diff.same.length > 0) {
    parts.push(`## ✅ Matching (${diff.same.length})\n`);
    parts.push(`Variables present in both: ${diff.same.map(k => '`' + k + '`').join(', ')}\n`);
  }
  
  return parts.join('\n');
}

/**
 * Format diff as plain text for terminal/output channel
 */
function formatDiffText(diff) {
  const lines = [];
  
  if (diff.missing.length === 0 && diff.extra.length === 0 && diff.changed.length === 0) {
    lines.push('✅ All variables match. No differences found.');
    return lines.join('\n');
  }
  
  lines.push('═══════════════════════════════════════════');
  lines.push('  ENV DIFF REPORT');
  lines.push('═══════════════════════════════════════════');
  lines.push('');
  
  if (diff.missing.length > 0) {
    lines.push(`⚠️  MISSING IN TARGET (${diff.missing.length}):`);
    for (const key of diff.missing) {
      lines.push(`    - ${key}`);
    }
    lines.push('');
  }
  
  if (diff.extra.length > 0) {
    lines.push(`➕  EXTRA IN TARGET (${diff.extra.length}):`);
    for (const key of diff.extra) {
      lines.push(`    + ${key}`);
    }
    lines.push('');
  }
  
  if (diff.changed.length > 0) {
    lines.push(`🔄  CHANGED VALUES (${diff.changed.length}):`);
    for (const c of diff.changed) {
      const arrow = c.sourceValue !== c.targetValue ? ' → ' : ' = ';
      lines.push(`    ~ ${c.key}: "${truncate(c.sourceValue, 30)}"${arrow}"${truncate(c.targetValue, 30)}"`);
    }
    lines.push('');
  }
  
  lines.push(`Summary: ${diff.missing.length} missing, ${diff.extra.length} extra, ${diff.changed.length} changed, ${diff.same.length} matching`);
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Truncate a value string to maxLen, adding ellipsis if truncated
 */
function truncate(value, maxLen) {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

// ─── Sorter ──────────────────────────────────────────────────────────

/**
 * Sort an .env file content alphabetically by key, preserving comments and blank lines
 * in their relative positions. Comments at the top are preserved.
 * 
 * @param {string} content - Raw .env file content
 * @returns {string} Sorted content
 */
function sortEnvFile(content) {
  if (typeof content !== 'string') {
    throw new Error('Content must be a string');
  }
  
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  
  // Separate into blocks: preserve leading comments/blank lines, sort the rest
  const leadingComments = [];
  const entries = [];
  let inLeadingComments = true;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (inLeadingComments) {
      if (trimmed === '' || trimmed.startsWith('#')) {
        leadingComments.push(line);
        continue;
      } else {
        inLeadingComments = false;
      }
    }
    
    if (trimmed === '' || trimmed.startsWith('#')) {
      // Inline comments and blanks go with the entries section
      entries.push({ type: 'meta', line });
      continue;
    }
    
    const parsed = parseEnvFile(trimmed);
    if (parsed.keys.length > 0) {
      const key = parsed.keys[0];
      entries.push({ type: 'entry', key, line });
    } else {
      entries.push({ type: 'meta', line });
    }
  }
  
  // Sort entries by key (stably)
  entries.sort((a, b) => {
    if (a.type === 'entry' && b.type === 'entry') {
      return a.key.localeCompare(b.key);
    }
    return 0;
  });
  
  // Reconstruct
  const result = [...leadingComments];
  for (const entry of entries) {
    result.push(entry.line);
  }
  
  return result.join('\n');
}

// ─── Exports ─────────────────────────────────────────────────────────

module.exports = {
  parseEnvFile,
  diffEnvFiles,
  formatDiffMarkdown,
  formatDiffText,
  sortEnvFile,
  truncate,
  isValidKey,
  findClosingQuote,
  findInlineComment
};
