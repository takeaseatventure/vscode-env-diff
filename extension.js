'use strict';

const vscode = require('vscode');
const { parseEnvFile, diffEnvFiles, formatDiffText, sortEnvFile } = require('./lib/differ');
const { ProGate } = require('./shared/pro-gate');
const fs = require('fs');
const path = require('path');

let outputChannel;
let proGate;

function getOutputChannel() {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Env Diff');
  }
  return outputChannel;
}

/**
 * Compare two .env files.
 * Flow: user selects source file, then target file. Results shown in output panel.
 */
async function compareFiles() {
  const sourceUri = await pickEnvFile('Select the SOURCE .env file (e.g. .env)');
  if (!sourceUri) return;
  
  const targetUri = await pickEnvFile('Select the TARGET .env file (e.g. .env.production)');
  if (!targetUri) return;
  
  const config = vscode.workspace.getConfiguration('envdiff');
  
  try {
    const sourceContent = fs.readFileSync(sourceUri.fsPath, 'utf-8');
    const targetContent = fs.readFileSync(targetUri.fsPath, 'utf-8');
    
    const source = parseEnvFile(sourceContent);
    const target = parseEnvFile(targetContent);
    
    const diff = diffEnvFiles(source, target, {
      ignoreValues: config.get('ignoreValues', true),
      sortOutput: config.get('sortOutput', true)
    });
    
    const output = getOutputChannel();
    output.clear();
    output.appendLine(`Comparing: ${path.basename(sourceUri.fsPath)} → ${path.basename(targetUri.fsPath)}`);
    output.appendLine('');
    output.append(formatDiffText(diff));
    output.show(true);
    
    // Show warning if there are issues
    const totalIssues = diff.missing.length + diff.extra.length + diff.changed.length;
    if (totalIssues > 0) {
      const msg = `Found ${diff.missing.length} missing, ${diff.extra.length} extra, ${diff.changed.length} changed variables.`;
      vscode.window.showWarningMessage(msg, 'View Details').then(action => {
        if (action === 'View Details') {
          output.show(true);
        }
      });
    } else {
      vscode.window.showInformationMessage('✅ All variables match between the two files.');
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Env Diff error: ${err.message}`);
  }
}

/**
 * Check the current workspace's .env against .env.example for missing variables.
 */
async function checkMissing() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage('Open a workspace folder first.');
    return;
  }
  
  const root = workspaceFolders[0].uri.fsPath;
  
  // Try to find .env and .env.example
  const envPath = path.join(root, '.env');
  const examplePath = path.join(root, '.env.example');
  
  if (!fs.existsSync(envPath)) {
    vscode.window.showErrorMessage('No .env file found in workspace root.');
    return;
  }
  
  if (!fs.existsSync(examplePath)) {
    vscode.window.showErrorMessage('No .env.example file found in workspace root.');
    return;
  }
  
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const exampleContent = fs.readFileSync(examplePath, 'utf-8');
  
  const envParsed = parseEnvFile(envContent);
  const exampleParsed = parseEnvFile(exampleContent);
  
  // Check what's in .env.example but missing from .env
  const diff = diffEnvFiles(exampleParsed, envParsed, { ignoreValues: true, sortOutput: true });
  
  const output = getOutputChannel();
  output.clear();
  output.appendLine(`Checking .env against .env.example`);
  output.appendLine('');
  output.append(formatDiffText(diff));
  output.show(true);
  
  if (diff.missing.length > 0) {
    vscode.window.showWarningMessage(
      `${diff.missing.length} variable(s) from .env.example are missing in .env: ${diff.missing.slice(0, 5).join(', ')}${diff.missing.length > 5 ? '...' : ''}`
    );
  } else {
    vscode.window.showInformationMessage('✅ .env has all variables defined in .env.example.');
  }
}

/**
 * Sort the currently open .env file alphabetically.
 */
async function sortCurrentFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('Open a .env file first.');
    return;
  }
  
  const content = editor.document.getText();
  const sorted = sortEnvFile(content);
  
  if (content === sorted) {
    vscode.window.showInformationMessage('File is already sorted.');
    return;
  }
  
  const fullRange = new vscode.Range(
    editor.document.positionAt(0),
    editor.document.positionAt(content.length)
  );
  
  await editor.edit(editBuilder => {
    editBuilder.replace(fullRange, sorted);
  });
  
  vscode.window.showInformationMessage('✅ .env file sorted alphabetically.');
}

/**
 * Show a QuickPick to select a .env file from the workspace.
 */
async function pickEnvFile(placeHolder) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  
  // If there's a workspace, list .env files
  if (workspaceFolders) {
    const files = await vscode.workspace.findFiles('**/.env*', '**/node_modules/**');
    const envFiles = files.map(f => ({
      label: vscode.workspace.asRelativePath(f),
      description: f.fsPath,
      uri: f
    }));
    
    if (envFiles.length > 0) {
      // Add a "Browse..." option
      envFiles.push({
        label: '📁 Browse for file...',
        description: '',
        uri: null
      });
      
      const selected = await vscode.window.showQuickPick(envFiles, { placeHolder });
      if (!selected) return null;
      
      if (selected.uri) return selected.uri;
      // Fall through to browse
    }
  }
  
  // Browse dialog
  const uri = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'Environment Files': ['env', 'env.*', 'env.*.*'], 'All Files': ['*'] },
    title: placeHolder
  });
  
  return uri && uri.length > 0 ? uri[0] : null;
}

/**
 * PRO: Compare all .env files in the workspace at once.
 */
async function compareAll() {
  await proGate.guard(async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage('Open a workspace folder first.');
      return;
    }

    // Find all .env files
    const envFiles = await vscode.workspace.findFiles('**/.env*', '**/node_modules/**');
    if (envFiles.length < 2) {
      vscode.window.showWarningMessage('Found fewer than 2 .env files. Need at least 2 to compare.');
      return;
    }

    // Parse all files
    const parsed = {};
    for (const uri of envFiles) {
      try {
        const content = fs.readFileSync(uri.fsPath, 'utf-8');
        parsed[vscode.workspace.asRelativePath(uri)] = parseEnvFile(content);
      } catch { /* skip unreadable */ }
    }

    // Collect all variable names
    const allVars = new Set();
    for (const file of Object.keys(parsed)) {
      for (const key of Object.keys(parsed[file])) {
        allVars.add(key);
      }
    }

    // Build comparison matrix
    const files = Object.keys(parsed).sort();
    const vars = [...allVars].sort();
    const matrix = {};
    for (const v of vars) {
      matrix[v] = {};
      for (const f of files) {
        if (parsed[f][v]) {
          matrix[v][f] = parsed[f][v].value || '(empty)';
        } else {
          matrix[v][f] = '— MISSING —';
        }
      }
    }

    // Show in webview
    const panel = vscode.window.createWebviewPanel(
      'envDiffMatrix',
      'Env Variable Matrix (Pro)',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    let tableHtml = '';
    const headerCells = files.map(f => `<th>${f}</th>`).join('');
    for (const v of vars) {
      const cells = files.map(f => {
        const val = matrix[v][f];
        const isMissing = val === '— MISSING —';
        return `<td class="${isMissing ? 'missing' : ''}">${isMissing ? val : '<span class="masked">•••••</span>'}</td>`;
      }).join('');
      tableHtml += `<tr><td class="var-name">${v}</td>${cells}</tr>`;
    }

    panel.webview.html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body { font-family: -apple-system, sans-serif; padding: 16px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { border: 1px solid #ddd; padding: 4px 8px; text-align: left; }
th { background: var(--vscode-editor-inactiveSelectionBackground); }
.var-name { font-family: monospace; font-weight: bold; }
.missing { color: var(--vscode-errorForeground); font-style: italic; }
.masked { font-family: monospace; color: #888; }
</style>
</head><body>
<h2>Env Variable Matrix</h2>
<p>${vars.length} variables across ${files.length} .env files. Values masked for security.</p>
<table>
<thead><tr><th>Variable</th>${headerCells}</tr></thead>
<tbody>${tableHtml}</tbody>
</table>
</body></html>`;
  }, { featureName: 'Batch Compare All .env Files (Pro)' });
}

function activate(context) {
  // Initialize Pro gate
  proGate = new ProGate(context, {
    productId: 'env-diff',
    displayName: 'Env Diff',
  });
  proGate.registerCommands(context);
  proGate.init();

  context.subscriptions.push(
    vscode.commands.registerCommand('envdiff.compare', compareFiles),
    vscode.commands.registerCommand('envdiff.checkMissing', checkMissing),
    vscode.commands.registerCommand('envdiff.sort', sortCurrentFile),
    vscode.commands.registerCommand('envdiff.compareAll', compareAll)
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
