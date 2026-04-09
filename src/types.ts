/**
 * SiYuan Ledger — core TypeScript type definitions
 */

// ─── Posting / Transaction ───────────────────────────────────────────────────

export interface IPosting {
    account: string;
    amount: number;
    currency: string;
    price?: number;
    priceCurrency?: string;
    cost?: number;
    costCurrency?: string;
}

export type TransactionStatus = "cleared" | "pending" | "uncleared";

export interface ITransaction {
    /** Block ID in SiYuan */
    blockId: string;
    /** Global unique identifier (used for idempotent import/export) */
    uuid: string;
    date: string;          // ISO 8601 date string, e.g. "2024-03-15"
    status: TransactionStatus;
    payee: string;
    narration?: string;
    postings: IPosting[];
    tags?: string[];       // comma-separated in IAL, array in memory
}

// ─── Account ─────────────────────────────────────────────────────────────────

export type AccountType = "Assets" | "Liabilities" | "Income" | "Expenses" | "Equity";

export interface IAccount {
    path: string;          // e.g. "Expenses:Food:Dining"
    type: AccountType;
    currencies: string[];
    openDate: string;
    closeDate?: string;
    note?: string;
    icon?: string;
    hidden?: boolean;
}

// ─── Budget ──────────────────────────────────────────────────────────────────

export interface IBudget {
    account: string;
    period: "monthly" | "quarterly" | "yearly";
    amount: number;
    currency: string;
    startDate: string;
    endDate?: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

export interface ILedgerConfig {
    version: number;
    defaultCurrency: string;
    defaultDebitAccount: string;
    dateFormat: "YYYY-MM-DD" | "YYYY/MM/DD" | "MM/DD/YYYY";
    displayMode: "detailed" | "compact";
    currencySymbols: Record<string, string>;
    ledgerNotebookId?: string;
    autoBalance: boolean;
}

// ─── Payee statistics (for autocomplete inference) ──────────────────────────

export interface IPayeeStats {
    /** Number of historical transactions with this payee */
    count: number;
    /** Sum of positive posting amounts (used for average calculation) */
    totalAmount: number;
    /** Most recently used expense/income account for this payee */
    lastAccount: string;
    /** Date of the most recent transaction */
    lastDate: string;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

export interface ILedgerCache {
    lastQueryTime: number;
    accountBalances: Record<string, Record<string, number>>;
    monthlyExpenses: Record<string, number>;
    recentPayees: string[];
    recentAccounts: string[];
    /** Per-payee statistics built from transaction history */
    payeeHistory: Record<string, IPayeeStats>;
}

// ─── Storage keys ────────────────────────────────────────────────────────────

export const STORAGE_CONFIG = "config";
export const STORAGE_ACCOUNTS = "accounts";
export const STORAGE_BUDGETS = "budgets";
export const STORAGE_CACHE = "cache";

// ─── IAL attribute names ─────────────────────────────────────────────────────

export const ATTR_TYPE = "custom-ledger-type";
export const ATTR_DATE = "custom-ledger-date";
export const ATTR_STATUS = "custom-ledger-status";
export const ATTR_PAYEE = "custom-ledger-payee";
export const ATTR_NARRATION = "custom-ledger-narration";
export const ATTR_POSTINGS = "custom-ledger-postings";
export const ATTR_TAGS = "custom-ledger-tags";
export const ATTR_UUID = "custom-ledger-uuid";

export const TRANSACTION_TYPE_VALUE = "transaction";

// ─── Tab / Dock type identifiers ─────────────────────────────────────────────

export const TAB_DASHBOARD = "ledger-dashboard";
export const DOCK_OVERVIEW = "ledger-overview";

// ─── Default configuration ───────────────────────────────────────────────────

export const DEFAULT_CONFIG: ILedgerConfig = {
    version: 1,
    defaultCurrency: "CNY",
    defaultDebitAccount: "Assets:Alipay",
    dateFormat: "YYYY-MM-DD",
    displayMode: "detailed",
    currencySymbols: {
        CNY: "¥",
        USD: "$",
        EUR: "€",
        GBP: "£",
        JPY: "¥",
        HKD: "HK$",
    },
    autoBalance: true,
};
