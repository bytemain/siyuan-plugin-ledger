[中文](README_zh_CN.md)

# SiYuan Ledger

A **double-entry bookkeeping** plugin for [SiYuan Notes](https://b3log.org/siyuan) — record transactions anywhere, data stays yours.

![preview](preview.png)

## ✨ Features

- **Quick Entry** — record expenses, income, and transfers through a dialog or a one-line shorthand (e.g. `Lunch 58` or `2024-03-15 Hotpot 258 CreditCard`)
- **Double-Entry Bookkeeping** — every transaction generates balanced debit / credit postings, following standard accounting principles
- **Slash Commands** — type `/expense`, `/income`, `/transfer`, or `/quick` in any document to open the entry dialog instantly
- **Keyboard Shortcuts** — `⇧⌘E` record expense, `⇧⌘I` record income, `⇧⌘L` open dashboard
- **Dashboard** — a dedicated tab showing monthly income & expenses, net balance, expense category pie chart, monthly trend bar chart, and recent transactions
- **Dock Panel** — an overview panel displaying asset / liability balances and net assets at a glance
- **Account Manager** — add, edit, close, or reopen accounts organised by type (Assets, Liabilities, Income, Expenses, Equity)
- **Import / Export** — import from and export to **Ledger CLI**, **Beancount**, and **CSV** formats
- **Split Bill** — split a single transaction across multiple expense categories
- **Multi-Currency** — supports CNY, USD, EUR, GBP, JPY, HKD with configurable currency symbols
- **Data Ownership** — all data is stored as SiYuan block attributes; nothing leaves your notebook
- **i18n** — full English and Simplified Chinese support

## 📦 Installation

1. Open SiYuan → **Marketplace** → **Plugins**
2. Search for **SiYuan Ledger** and click **Install**

Or download the latest `package.zip` from [Releases](https://github.com/bytemain/siyuan-plugin-ledger/releases) and extract it to `{workspace}/data/plugins/siyuan-plugin-ledger/`.

## 🚀 Quick Start

1. Open any document in SiYuan
2. Click the 💰 icon in the top bar, or use the keyboard shortcut `⇧⌘E`
3. Fill in the payee, amount, and accounts, then click **Record**
4. Open the dashboard with `⇧⌘L` to view your financial summary

### One-Line Quick Entry

Use the quick entry mode to record transactions in a single line:

```
Lunch 58
Taxi 32 WeChat
2024-03-15 Hotpot 258 CreditCard
```

## ⚙️ Configuration

Open plugin **Settings** to configure:

| Option | Description |
|--------|-------------|
| Default currency | The currency used for new transactions (default: CNY) |
| Default debit account | The account used when no account is specified |
| Display mode | Detailed or compact transaction block rendering |
| Auto balance | Automatically calculate the last posting amount |

## 🔗 Compatibility

- SiYuan ≥ 3.0.0
- Platforms: Windows, macOS, Linux, iOS, Android, HarmonyOS, Docker, Browser
