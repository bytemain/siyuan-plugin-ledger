[中文](./README_zh_CN.md)

# SiYuan Ledger Plugin

A native double-entry bookkeeping plugin for SiYuan Note, designed to help you manage your finances directly within your knowledge base.

## Features

- **Double-Entry Bookkeeping:** All transactions are stored as standard SiYuan blocks with custom attributes (IAL) for metadata.
- **Visual Dashboard:** Built-in dashboard with monthly income/expense bar charts and category expense pie charts (no external chart libraries required).
- **Multiple Entry Modes:** 
  - Forms for expenses, income, and transfers.
  - Quick Entry mode supporting natural language parsing (e.g., `lunch 58 wechat`).
- **Account Management:** Complete account tree system for creating, editing, configuring icons, and closing five main account types.
- **Data Export:** Export your local ledger data to Ledger, Beancount, or CSV formats for further analysis.
- **Deep Integration:** 
  - Slash commands (`/ledger`, `/income`, `/transfer`, `/quick`) to open panels anywhere.
  - Global shortcut mapping (e.g., `⇧⌘E` for expense).
  - Block right-click menu for quick editing or deletion of existing entries.
- **Dock Panel:** Always-on sidebar panel to monitor monthly core expenses and real-time balances of major assets.
- **Multi-Currency & Auto-Balancing:** Set a default currency and let the plugin auto-calculate balancing entries when you only input one side of the transaction.

## Get Started

1. Install the plugin from the SiYuan marketplace.
2. Go to the plugin settings to configure your default currency (e.g., USD, CNY) and default payment account (e.g., Assets:Cash).
3. Click the plugin icon in the top bar to open the account management interface and initialize your asset structure and income/expense categories.
4. In your daily notes, type `/quick` to enter a single-line transaction like `lunch 15 cash`.
5. Open the top bar menu or press `⇧⌘L` to open the data dashboard and review your monthly financial reports and transaction history.
6. Periodically backup your data using the import/export functionality.

> 📖 For a detailed tutorial, read the [Quick Start Guide](./docs/quick-start.md).

## 📖 Documentation

### 🚀 Getting Started

- [Quick Start (5 minutes)](./docs/quick-start.md) — Install, configure, and record your first transaction
- [Daily Expense Scenarios](./docs/daily-expense.md) — Expenses, income, split bills, tags, and more
- [Account Setup](./docs/account-setup.md) — Customize your account categories

### 💡 Advanced Scenarios

- [Credit Card & Reimbursement](./docs/credit-card-and-reimbursement.md) — Credit card spending, payments, expense reimbursement
- [Transfers & Reconciliation](./docs/transfer-and-reconciliation.md) — Account transfers, balance verification, opening balances
- [Dashboard & Reports](./docs/dashboard-and-reports.md) — Charts, reports, sidebar usage

### 🔧 Power Features

- [Import & Export](./docs/import-export.md) — Data backup, format migration
- [Embed Blocks](./docs/embed-blocks.md) — Embed transaction queries in your notes

## Shortcuts

| Action | Mac | Windows/Linux |
|--------|-----|---------------|
| Record Expense | `⇧⌘E` | `⇧Ctrl+E` |
| Record Income | `⇧⌘I` | `⇧Ctrl+I` |
| Record Transfer | `⇧⌘T` | `⇧Ctrl+T` |
| Open Dashboard | `⇧⌘L` | `⇧Ctrl+L` |
| Open Dock Panel | `⌥⌘L` | `Alt+Ctrl+L` |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/quick` `/q` | One-line quick entry |
| `/expense` `/e` | Expense dialog |
| `/income` `/i` | Income dialog |
| `/transfer` `/t` | Transfer dialog |
| `/creditcard` | Credit card payment |
| `/reimbursement` | Reimbursement income |

## Development

* [Frontend API](https://github.com/siyuan-note/petal)
* [Backend API](https://github.com/siyuan-note/siyuan/blob/master/API.md)
