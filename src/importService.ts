/**
 * Import service — parses Ledger CLI and Beancount files into ITransaction arrays.
 */
import {ITransaction, IPosting, IAccount, TransactionStatus} from "./types";
import {generateUUID} from "./dataService";

// ─── Ledger CLI parser ────────────────────────────────────────────────────────

/** Normalise date from "YYYY/MM/DD" → "YYYY-MM-DD" */
function normDate(raw: string): string {
    return raw.replace(/\//g, "-");
}

function parseLedgerAmount(raw: string): {amount: number; currency: string} | null {
    // e.g.  ¥258.00  $-32.50  258 CNY  -258.00 CNY
    const withSymbol = /^([¥$€£])([-\d.,]+)$/.exec(raw.trim());
    if (withSymbol) {
        const symMap: Record<string, string> = {"¥": "CNY", "$": "USD", "€": "EUR", "£": "GBP"};
        return {amount: parseFloat(withSymbol[2].replace(",", "")), currency: symMap[withSymbol[1]] || "CNY"};
    }
    const withCode = /^([-\d.,]+)\s+([A-Z]{3})$/.exec(raw.trim());
    if (withCode) {
        return {amount: parseFloat(withCode[1].replace(",", "")), currency: withCode[2]};
    }
    const plain = /^([-\d.,]+)$/.exec(raw.trim());
    if (plain) {
        return {amount: parseFloat(plain[1].replace(",", "")), currency: "CNY"};
    }
    return null;
}

/**
 * Parse a Ledger CLI file string into ITransaction array.
 * Handles: cleared (*), pending (!), uncleared (no mark)
 */
export function parseLedgerFile(content: string): {transactions: ITransaction[]; errors: string[]} {
    const lines = content.split("\n");
    const transactions: ITransaction[] = [];
    const errors: string[] = [];

    let current: Partial<ITransaction> | null = null;
    let currentPostings: IPosting[] = [];

    const flushCurrent = () => {
        if (current && currentPostings.length > 0) {
            // Auto-balance: if last posting has no amount, fill it in
            if (currentPostings.length >= 2) {
                const last = currentPostings[currentPostings.length - 1];
                if (last.amount === 0) {
                    const sum = currentPostings.slice(0, -1).reduce((s, p) => s + p.amount, 0);
                    last.amount = -sum;
                    last.currency = currentPostings[0].currency;
                }
            }
            transactions.push({
                ...current,
                blockId: "",
                uuid: generateUUID(),
                postings: currentPostings,
            } as ITransaction);
        }
        current = null;
        currentPostings = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Empty lines flush the current transaction
        if (!trimmed) {
            flushCurrent();
            continue;
        }

        // File-level `#` comments are always ignored
        if (trimmed.startsWith("#")) {
            continue;
        }

        // Transaction header: YYYY/MM/DD [*|!] payee
        const headerMatch = /^(\d{4}[\/\-]\d{2}[\/\-]\d{2})\s+([*!])?\s*(.*)$/.exec(trimmed);
        if (headerMatch) {
            flushCurrent();
            const statusChar = headerMatch[2];
            const status: TransactionStatus =
                statusChar === "*" ? "cleared" : statusChar === "!" ? "pending" : "uncleared";
            current = {
                date: normDate(headerMatch[1]),
                status,
                payee: headerMatch[3].trim(),
                narration: "",
                tags: [],
            };
            continue;
        }

        if (!current) continue;

        // Inline comment / narration (`;` inside a transaction body)
        if (trimmed.startsWith(";")) {
            const comment = trimmed.slice(1).trim();
            const tagsMatch = /^:(.+):$/.exec(comment);
            if (tagsMatch) {
                current.tags = tagsMatch[1].split(":").filter(Boolean);
            } else {
                current.narration = (current.narration ? current.narration + " " : "") + comment;
            }
            continue;
        }

        // File-level `;` comments are also ignored
        // (handled above when current is null via the `if (!current) continue` path)

        // Posting line: account  amount  (indented)
        if (line.startsWith("    ") || line.startsWith("\t")) {
            const parts = trimmed.split(/\s{2,}|\t/);
            const accountName = parts[0];
            const amountStr = parts[1];

            const parsed = amountStr ? parseLedgerAmount(amountStr) : null;
            currentPostings.push({
                account: accountName,
                amount: parsed?.amount ?? 0,
                currency: parsed?.currency ?? "CNY",
            });
        }
    }

    flushCurrent();

    return {transactions, errors};
}

// ─── Beancount parser ─────────────────────────────────────────────────────────

function parseBeancountAmount(raw: string): {amount: number; currency: string} | null {
    const m = /^([-\d.,]+)\s+([A-Z]{3})$/.exec(raw.trim());
    if (!m) return null;
    return {amount: parseFloat(m[1].replace(",", "")), currency: m[2]};
}

export interface IBeancountImportResult {
    transactions: ITransaction[];
    accounts: IAccount[];
    errors: string[];
}

/**
 * Parse a Beancount file string.
 * Handles: open directives, cleared/pending transactions.
 */
export function parseBeancountFile(content: string): IBeancountImportResult {
    const lines = content.split("\n");
    const transactions: ITransaction[] = [];
    const accounts: IAccount[] = [];
    const errors: string[] = [];

    let current: Partial<ITransaction> | null = null;
    let currentPostings: IPosting[] = [];

    const flushCurrent = () => {
        if (current && currentPostings.length > 0) {
            transactions.push({
                ...current,
                blockId: "",
                uuid: generateUUID(),
                postings: currentPostings,
            } as ITransaction);
        }
        current = null;
        currentPostings = [];
    };

    for (const rawLine of lines) {
        const line = rawLine;
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith(";")) {
            if (!trimmed) flushCurrent();
            continue;
        }

        // Open directive: YYYY-MM-DD open Account CURRENCY
        const openMatch = /^(\d{4}-\d{2}-\d{2})\s+open\s+(\S+)(?:\s+(.+))?$/.exec(trimmed);
        if (openMatch) {
            flushCurrent();
            const path = openMatch[2];
            const currencies = openMatch[3]
                ? openMatch[3].split(/,\s*/)
                : ["CNY"];
            const type = (path.split(":")[0] as IAccount["type"]) || "Expenses";
            accounts.push({
                path,
                type,
                currencies,
                openDate: openMatch[1],
            });
            continue;
        }

        // Transaction header: YYYY-MM-DD [*|!] "payee" "narration" [#tag …]
        const txMatch = /^(\d{4}-\d{2}-\d{2})\s+([*!])\s+"([^"]*)"(?:\s+"([^"]*)")?(.*)$/.exec(trimmed);
        if (txMatch) {
            flushCurrent();
            const status: TransactionStatus = txMatch[2] === "*" ? "cleared" : "pending";
            const tagsRaw = txMatch[5] || "";
            const tags = (tagsRaw.match(/#([^\s#]+)/gu) || []).map(t => t.slice(1));
            current = {
                date: txMatch[1],
                status,
                payee: txMatch[3],
                narration: txMatch[4] || "",
                tags,
            };
            continue;
        }

        if (!current) continue;

        // Posting line (indented): account  amount currency
        if (line.startsWith("  ") || line.startsWith("\t")) {
            const parts = trimmed.split(/\s{2,}|\t/);
            const accountName = parts[0];
            if (!accountName || accountName.startsWith(";")) continue;
            const amountStr = parts.slice(1).join(" ");
            const parsed = amountStr ? parseBeancountAmount(amountStr) : null;
            if (parsed) {
                currentPostings.push({
                    account: accountName,
                    amount: parsed.amount,
                    currency: parsed.currency,
                });
            }
        }
    }

    flushCurrent();

    return {transactions, accounts, errors};
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

/**
 * Parse a generic CSV with columns: Date,Status,Payee,Narration,Account,Amount,Currency,Tags
 */
export function parseCSV(content: string): ITransaction[] {
    const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    // Group rows by date+payee+narration
    const groups = new Map<string, ITransaction>();

    for (let i = 1; i < lines.length; i++) {
        const cols = splitCSVRow(lines[i]);
        if (cols.length < 7) continue;
        const [date, status, payee, narration, account, amountStr, currency, tags] = cols;
        const key = `${date}|${payee}|${narration}`;

        let tx = groups.get(key);
        if (!tx) {
            tx = {
                blockId: "",
                uuid: generateUUID(),
                date,
                status: status as TransactionStatus || "uncleared",
                payee,
                narration,
                postings: [],
                tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
            };
            groups.set(key, tx);
        }
        tx.postings.push({
            account,
            amount: parseFloat(amountStr) || 0,
            currency,
        });
    }

    return [...groups.values()];
}

function splitCSVRow(row: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '"') {
            if (inQuotes && row[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === "," && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

// Random string: xK9qL2mP5zR8tY3wV
