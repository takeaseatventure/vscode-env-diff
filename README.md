# 🔀 Env Diff

### Never deploy with a missing environment variable again.


**Env Diff** lets you instantly compare `.env` files to spot missing, extra, and changed variables between environments — right inside VS Code. The fastest way to catch config drift before it breaks production.

> ⚡ **Zero runtime dependencies.** Pure Node.js — fast, lightweight, and secure.

---

## ✨ Features

- ✅ **Compare Two `.env` Files** — Instant structured diff showing missing, extra, changed, and matching variables
- ✅ **Check `.env` vs `.env.example`** — One-command verification that your local config has every required variable
- ✅ **Sort `.env` Files** — Alphabetically sort any `.env` file in-place, preserving comments and structure
- ✅ **Smart Parsing** — Handles quoted values, `export` prefixes, inline comments, multiline values, and empty vars
- ✅ **Configurable Highlighting** — Toggle value comparison, output sorting, and change highlighting

---

## 📸 Screenshots

![Compare Two .env Files](images/compare.png)

![Missing Variables Check](images/check-missing.png)

![Sort .env File](images/sort.png)

---

## 📥 Installation

1. Open **VS Code**
2. Go to the **Extensions** view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **Env Diff**
4. Click **Install**

Or install from the command line:

```bash
code --install-extension devforge.env-diff
```

---

## 🚀 Usage

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

| Command | Shortcut | Description |
|---------|----------|-------------|
| **Env Diff: Compare Two .env Files** | `Ctrl+Alt+D` / `Cmd+Alt+D` | Pick source + target and get an instant diff |
| **Env Diff: Check for Missing Variables** | `Ctrl+Alt+M` / `Cmd+Alt+M` | Checks `.env` against `.env.example` |
| **Env Diff: Sort .env File** | `Ctrl+Alt+S` / `Cmd+Alt+S` | Sorts the currently open file alphabetically |

---

## 📋 Use Cases

- 🚀 **Pre-deployment checklist** — *"Did we add all new env vars to staging?"*
- 👋 **Onboarding** — *"What does the new dev need in their `.env`?"*
- 🐛 **Debugging** — *"Why does this work locally but fail in production?"*
- 📊 **Config drift** — *"How has production config diverged from what we committed?"*
- 👥 **Team sync** — *"Everyone's `.env` should match `.env.example`"*

---

## ⚙️ Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `envdiff.ignoreValues` | `true` | Only compare keys, not values (useful when values legitimately differ between environments) |
| `envdiff.sortOutput` | `true` | Sort variables alphabetically in diff output |
| `envdiff.highlightChanges` | `true` | Highlight value differences with arrows |

---

## 🔍 What It Parses

The parser handles all standard `.env` formats:

```bash
# Comments are skipped
DATABASE_URL=postgres://localhost/db

# Quoted values (quotes stripped)
NAME="My App"
SECRET='don\'t tell'

# Export prefix (shell-style)
export NODE_ENV=production

# Inline comments on unquoted values
PORT=3000 # the application port

# Multiline values
PRIVATE_KEY="-----BEGIN KEY-----..."

# Empty values are valid
EMPTY_VAR=
```

---

## 💎 Pro Features

Upgrade to **Pro** for advanced environment management:

- 📁 **Multi-file comparison** — Diff 3+ `.env` files at once (dev, staging, prod, CI)
- 🏷️ **Variable grouping** — Organize variables into custom categories (database, auth, features)
- 📤 **Export diffs** — Save comparison reports as Markdown or JSON for team sharing
- 🔔 **Pre-commit hooks** — Get alerted when `.env` and `.env.example` drift apart
- 🎨 **Visual diff view** — Side-by-side colored comparison with merge controls

**Upgrade to Pro for multi-file comparison, variable grouping, diff exporting, and visual merge tools — $4/month (or $12/month for teams). Visit [https://devforge.dev](https://devforge.dev) to get your license key.**

---

## 📄 License

MIT — free for personal and commercial use.

---

**Built by [DevForge](https://devforge.dev)** — developer tools that solve real daily pain.
