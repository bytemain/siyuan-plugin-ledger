/**
 * Export service — converts SiYuan ledger transactions to external formats.
 * Supported formats: Ledger CLI, Beancount, CSV
 */
import {ITransaction, IAccount, ILedgerConfig} from "./types";

// ─── Ledger CLI ───────────────────────────────────────────────────────────────

/**
 * Converts a date string from "YYYY-MM-DD" to "YYYY/MM/DD" (Ledger format).
 */
function toLedgerDate(iso: string): string {
    return iso.replace(/-/g, "/");
}

/**
 * Map status to Ledger state mark.
 */
function ledgerStatusMark(status: ITransaction["status"]): string {
    if (status === "cleared") return "* ";
    if (status === "pending") return "! ";
    return "";
}

export function exportToLedger(transactions: ITransaction[], config: ILedgerConfig): string {
    const sym = (currency: string) => config.currencySymbols[currency] || currency;
    const lines: string[] = [];

    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

    for (const tx of sorted) {
        const mark = ledgerStatusMark(tx.status);
        lines.push(`${toLedgerDate(tx.date)} ${mark}${tx.payee}`);
        if (tx.narration) lines.push(`    ; ${tx.narration}`);
        if (tx.tags && tx.tags.length > 0) {
            lines.push(`    ; :${tx.tags.join(":")}:`);
        }

        // All postings — omit amount on last if it can be inferred
        for (let i = 0; i < tx.postings.length; i++) {
            const p = tx.postings[i];
            const isLast = i === tx.postings.length - 1;
            if (isLast && tx.postings.length > 1) {
                // Ledger can infer the last posting's amount
                lines.push(`    ${p.account}`);
            } else {
                lines.push(`    ${p.account}    ${sym(p.currency)}${p.amount.toFixed(2)}`);
            }
        }
        lines.push("");
    }

    return lines.join("\n");
}

// ─── Beancount ────────────────────────────────────────────────────────────────

function beancountStatusMark(status: ITransaction["status"]): string {
    if (status === "cleared") return "*";
    return "!";
}

export function exportToBeancount(
    transactions: ITransaction[],
    accounts: IAccount[],
    config: ILedgerConfig,
): string {
    const lines: string[] = [
        "option \"title\" \"SiYuan Ledger\"",
        `option "operating_currency" "${config.defaultCurrency}"`,
        "",
    ];

    // Account open directives
    const usedPaths = new Set<string>();
    for (const tx of transactions) {
        for (const p of tx.postings) usedPaths.add(p.account);
    }
    const accountMap = new Map(accounts.map(a => [a.path, a]));

    const openDate = config.currencySymbols ? "2020-01-01" : "2020-01-01";
    for (const path of [...usedPaths].sort()) {
        const acc = accountMap.get(path);
        const currencies = acc?.currencies?.join(", ") || config.defaultCurrency;
        const date = acc?.openDate || openDate;
        lines.push(`${date} open ${path} ${currencies}`);
    }
    lines.push("");

    // Transactions
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    for (const tx of sorted) {
        const mark = beancountStatusMark(tx.status);
        const payee = tx.payee ? `"${tx.payee}"` : '""';
        const narration = tx.narration ? `"${tx.narration}"` : '""';
        const tags = tx.tags && tx.tags.length > 0
            ? " " + tx.tags.map(t => `#${t}`).join(" ")
            : "";
        lines.push(`${tx.date} ${mark} ${payee} ${narration}${tags}`);
        for (const p of tx.postings) {
            lines.push(`    ${p.account}    ${p.amount.toFixed(2)} ${p.currency}`);
        }
        lines.push("");
    }

    return lines.join("\n");
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

export function exportToCSV(transactions: ITransaction[]): string {
    const header = "Date,Status,Payee,Narration,Account,Amount,Currency,Tags";
    const rows: string[] = [header];

    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    for (const tx of sorted) {
        const tags = (tx.tags || []).join(",");
        for (const p of tx.postings) {
            rows.push([
                csvEscape(tx.date),
                csvEscape(tx.status),
                csvEscape(tx.payee),
                csvEscape(tx.narration || ""),
                csvEscape(p.account),
                p.amount.toFixed(2),
                csvEscape(p.currency),
                csvEscape(tags),
            ].join(","));
        }
    }

    return rows.join("\n");
}

// ─── Trigger download in browser ─────────────────────────────────────────────

export function downloadFile(filename: string, content: string, mimeType = "text/plain"): void {
    const blob = new Blob([content], {type: mimeType});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
