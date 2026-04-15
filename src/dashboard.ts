/**
 * Dashboard HTML builder — generates the full dashboard tab content.
 * Uses plain HTML/CSS (no external charting lib dependency at runtime).
 */
import {DataService} from "./dataService";
import {ITransaction} from "./types";

function escapeHtml(s: string): string {
    if (!s) return "";
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** Render a simple SVG grouped bar chart for monthly income & expenses */
function buildBarChart(
    monthlyExpenses: Record<string, number>,
    monthlyIncome: Record<string, number>,
    currency: string,
    sym: string,
    i18n: Record<string, string>,
): string {
    const allMonths = new Set([
        ...Object.keys(monthlyExpenses),
        ...Object.keys(monthlyIncome),
    ]);
    const months = [...allMonths].sort().slice(-12);
    if (months.length === 0) return `<div class="ledger-empty">${i18n.noData}</div>`;

    const maxVal = Math.max(
        ...months.map(m => monthlyExpenses[m] || 0),
        ...months.map(m => monthlyIncome[m] || 0),
        1,
    );
    const halfBar = 14;
    const groupWidth = halfBar * 2 + 6; // two bars + inner gap
    const gap = 10;
    const svgHeight = 120;
    const totalWidth = months.length * (groupWidth + gap);

    const bars = months.map((m, i) => {
        const exp = monthlyExpenses[m] || 0;
        const inc = monthlyIncome[m] || 0;
        const hExp = Math.round((exp / maxVal) * 90);
        const hInc = Math.round((inc / maxVal) * 90);
        const groupX = i * (groupWidth + gap);
        const label = m.slice(5); // MM
        return `
      <rect x="${groupX}" y="${svgHeight - hInc - 20}" width="${halfBar}" height="${hInc}" class="ledger-bar ledger-bar-income" rx="2"/>
      <title>${m} income: ${sym}${inc.toFixed(0)}</title>
      <rect x="${groupX + halfBar + 2}" y="${svgHeight - hExp - 20}" width="${halfBar}" height="${hExp}" class="ledger-bar ledger-bar-expense" rx="2"/>
      <title>${m} expense: ${sym}${exp.toFixed(0)}</title>
      <text x="${groupX + halfBar}" y="${svgHeight - 5}" text-anchor="middle" class="ledger-bar-label">${label}</text>`;
    }).join("");

    return `<svg viewBox="0 0 ${totalWidth} ${svgHeight}" class="ledger-chart">
    ${bars}
  </svg>`;
}

/** Render a simple SVG pie chart for categories */
function buildPieChart(categories: Record<string, number>, sym: string, i18n: Record<string, string>): string {
    const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (entries.length === 0) return `<div class="ledger-empty">${i18n.noData}</div>`;

    const total = entries.reduce((s, [, v]) => s + v, 0);
    const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];

    let startAngle = 0;
    let paths = "";
    const cx = 80, cy = 80, r = 70;

    for (let i = 0; i < entries.length; i++) {
        const [name, val] = entries[i];
        const angle = (val / total) * 2 * Math.PI;
        const x1 = cx + r * Math.sin(startAngle);
        const y1 = cy - r * Math.cos(startAngle);
        const x2 = cx + r * Math.sin(startAngle + angle);
        const y2 = cy - r * Math.cos(startAngle + angle);
        const largeArc = angle > Math.PI ? 1 : 0;
        const pct = ((val / total) * 100).toFixed(0);
        paths += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${largeArc},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z"
      fill="${colors[i % colors.length]}" opacity="0.85">
      <title>${escapeHtml(name)}: ${sym}${val.toFixed(0)} (${pct}%)</title></path>`;
        startAngle += angle;
    }

    const legend = entries.map(([name, val], i) => {
        const shortName = name.split(":").pop() || name;
        const pct = ((val / total) * 100).toFixed(0);
        return `<div class="ledger-legend-item">
      <span class="ledger-legend-dot" style="background:${colors[i % colors.length]}"></span>
      <span>${escapeHtml(shortName)} ${pct}%</span>
    </div>`;
    }).join("");

    return `<div class="ledger-pie-wrapper">
    <svg viewBox="0 0 160 160" class="ledger-pie">${paths}</svg>
    <div class="ledger-legend">${legend}</div>
  </div>`;
}

function formatTx(tx: ITransaction, sym: (c: string) => string): string {
    const mainPosting = tx.postings.find(p => p.amount > 0);
    const fromPosting = tx.postings.find(p => p.amount < 0);
    const amount = mainPosting?.amount || 0;
    const currency = mainPosting?.currency || "CNY";
    const toAccShort = (mainPosting?.account || "").split(":").pop() || "";
    const fromAccShort = (fromPosting?.account || "").split(":").pop() || "";
    const dateShort = tx.date.slice(5); // MM-DD

    return `<div class="ledger-tx-row">
    <span class="ledger-tx-date">${escapeHtml(dateShort)}</span>
    <span class="ledger-tx-payee">${escapeHtml(tx.payee)}</span>
    <span class="ledger-tx-category">${escapeHtml(toAccShort)}</span>
    <span class="ledger-tx-from">${escapeHtml(fromAccShort)}</span>
    <span class="ledger-tx-amount ${amount > 0 ? "ledger-expense" : "ledger-income"}">${sym(currency)}${amount.toFixed(2)}</span>
  </div>`;
}

export interface IDashboardRenderOptions {
    transactions: ITransaction[];
    allTransactions: ITransaction[];
    dataService: DataService;
    i18n: Record<string, string>;
    selectedMonth: string;   // "YYYY-MM"
    availableMonths: string[];
    budgetUsage: {account: string; used: number; total: number; currency: string}[];
}

export function buildDashboardHTML(opts: IDashboardRenderOptions): string {
    const {transactions, allTransactions, dataService: ds, i18n, selectedMonth, availableMonths} = opts;
    const config = ds.getConfig();
    const sym = (c: string) => ds.getCurrencySymbol(c);
    const currency = config.defaultCurrency;
    const symDef = sym(currency);

    // ── Summary ──────────────────────────────────────────────────────────
    const {income, expenses, net} = ds.summarize(transactions, currency);

    // ── Monthly income & expenses chart ─────────────────────────────────
    const monthlyExpenseData: Record<string, number> = {};
    const monthlyIncomeData: Record<string, number> = {};
    for (const tx of allTransactions) {
        const ym = tx.date.slice(0, 7);
        for (const p of tx.postings) {
            if (p.account.startsWith("Expenses:") && p.amount > 0) {
                monthlyExpenseData[ym] = (monthlyExpenseData[ym] || 0) + p.amount;
            } else if (p.account.startsWith("Income:") && p.amount < 0) {
                monthlyIncomeData[ym] = (monthlyIncomeData[ym] || 0) + Math.abs(p.amount);
            }
        }
    }
    const barChart = buildBarChart(monthlyExpenseData, monthlyIncomeData, currency, symDef, i18n);

    // ── Expense by category ──────────────────────────────────────────────
    const catExpenses: Record<string, number> = {};
    for (const tx of transactions) {
        for (const p of tx.postings) {
            if (p.account.startsWith("Expenses:") && p.amount > 0 && p.currency === currency) {
                const cat = p.account.split(":").slice(0, 2).join(":");
                catExpenses[cat] = (catExpenses[cat] || 0) + p.amount;
            }
        }
    }
    const pieChart = buildPieChart(catExpenses, symDef, i18n);

    // ── Income by category ──────────────────────────────────────────────
    const catIncome: Record<string, number> = {};
    for (const tx of transactions) {
        for (const p of tx.postings) {
            if (p.account.startsWith("Income:") && p.amount < 0 && p.currency === currency) {
                const cat = p.account.split(":").slice(0, 2).join(":");
                catIncome[cat] = (catIncome[cat] || 0) + Math.abs(p.amount);
            }
        }
    }
    const incomePieChart = buildPieChart(catIncome, symDef, i18n);

    // ── Asset balances ────────────────────────────────────────────────────
    const balances = ds.calculateBalances(allTransactions);
    const assetRows = ds.getAccountsByPrefix("Assets")
        .map(a => {
            const bal = balances[a.path]?.[currency] || 0;
            return `<div class="ledger-balance-row">
        <span>${a.icon || ""} ${a.note || a.path.split(":").pop()}</span>
        <span class="ledger-balance-amount">${symDef}${bal.toFixed(2)}</span>
      </div>`;
        }).join("");

    const liabilityRows = ds.getAccountsByPrefix("Liabilities")
        .map(a => {
            const bal = balances[a.path]?.[currency] || 0;
            if (bal === 0) return "";
            return `<div class="ledger-balance-row">
        <span>${a.icon || ""} ${a.note || a.path.split(":").pop()}</span>
        <span class="ledger-balance-amount ledger-expense">${symDef}${bal.toFixed(2)}</span>
      </div>`;
        }).join("");

    // ── Budget usage ──────────────────────────────────────────────────────
    const budgetRows = opts.budgetUsage.length > 0
        ? opts.budgetUsage.map(b => {
            const pct = b.total > 0 ? Math.round((b.used / b.total) * 100) : 0;
            const overBudget = pct > 100;
            const shortName = b.account.split(":").pop() || b.account;
            return `<div class="ledger-budget-row">
          <span>${escapeHtml(shortName)}</span>
          <div class="ledger-budget-bar-bg">
            <div class="ledger-budget-bar-fill ${overBudget ? "ledger-budget-over" : ""}" style="width:${Math.min(pct, 100)}%"></div>
          </div>
          <span class="ledger-budget-pct ${overBudget ? "ledger-expense" : ""}">${sym(b.currency)}${b.used.toFixed(0)}/${sym(b.currency)}${b.total.toFixed(0)} (${pct}%)</span>
        </div>`;
        }).join("")
        : "";

    // ── Chart legend ──────────────────────────────────────────────────────
    const chartLegend = `<div class="ledger-chart-legend">
    <span class="ledger-chart-legend-item"><span class="ledger-legend-dot" style="background:#2ecc71"></span> ${i18n.income}</span>
    <span class="ledger-chart-legend-item"><span class="ledger-legend-dot" style="background:#e74c3c"></span> ${i18n.expenses}</span>
  </div>`;

    // ── Recent transactions ───────────────────────────────────────────────
    const recentTxRows = transactions.slice(0, 20).map(tx => formatTx(tx, sym)).join("");

    // ── Month selector ─────────────────────────────────────────────────────
    const monthOptions = availableMonths.map(m =>
        `<option value="${m}" ${m === selectedMonth ? "selected" : ""}>${m}</option>`
    ).join("");

    return `<div class="ledger-dashboard">
  <div class="ledger-dashboard-header">
    <span class="ledger-dashboard-title">📊 SiYuan Ledger Dashboard</span>
    <select id="ledger-month-select" class="b3-select ledger-month-select">${monthOptions}</select>
    <button id="ledger-refresh" class="b3-button b3-button--outline ledger-refresh-btn">🔄 ${i18n.refresh}</button>
  </div>

  <div class="ledger-dashboard-body">
    <div class="ledger-sidebar">
      <div class="ledger-stat-card">
        <div class="ledger-stat-label">${i18n.monthlyIncome}</div>
        <div class="ledger-stat-value ledger-income">${symDef}${income.toFixed(2)}</div>
      </div>
      <div class="ledger-stat-card">
        <div class="ledger-stat-label">${i18n.monthlyExpenses}</div>
        <div class="ledger-stat-value ledger-expense">${symDef}${expenses.toFixed(2)}</div>
      </div>
      <div class="ledger-stat-card">
        <div class="ledger-stat-label">${i18n.netBalance}</div>
        <div class="ledger-stat-value ${net >= 0 ? "ledger-income" : "ledger-expense"}">${symDef}${net.toFixed(2)}</div>
      </div>

      <div class="ledger-section-title">${i18n.assets}</div>
      ${assetRows || `<div class="ledger-empty">${i18n.noData}</div>`}

      ${liabilityRows ? `<div class="ledger-section-title">${i18n.liabilities}</div>${liabilityRows}` : ""}
    </div>

    <div class="ledger-main">
      <div class="ledger-section-title">${i18n.monthlyTrend}</div>
      ${chartLegend}
      ${barChart}

      <div class="ledger-section-title" style="margin-top:20px;">${i18n.expenseCategories}</div>
      ${pieChart}

      ${income > 0 ? `<div class="ledger-section-title" style="margin-top:20px;">${i18n.incomeCategories}</div>
      ${incomePieChart}` : ""}

      ${budgetRows ? `<div class="ledger-section-title" style="margin-top:20px;">${i18n.budgetUsage}</div>
      ${budgetRows}` : ""}

      <div class="ledger-section-title" style="margin-top:20px;">${i18n.recentTransactions}</div>
      <div class="ledger-tx-header">
        <span>${i18n.date}</span>
        <span>${i18n.payee}</span>
        <span>${i18n.expenseCategory}</span>
        <span>${i18n.payAccount}</span>
        <span>${i18n.amount}</span>
      </div>
      <div class="ledger-tx-list">
        ${recentTxRows || `<div class="ledger-empty">${i18n.noTransactions}</div>`}
      </div>
    </div>
  </div>
</div>`;
}
