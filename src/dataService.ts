/**
 * Data service — all interactions with SiYuan's block/attribute APIs.
 */
import {fetchPost} from "siyuan";
import {
    ITransaction,
    IPosting,
    ILedgerConfig,
    ILedgerCache,
    IPayeeStats,
    IAccount,
    ATTR_TYPE,
    ATTR_DATE,
    ATTR_STATUS,
    ATTR_PAYEE,
    ATTR_NARRATION,
    ATTR_POSTINGS,
    ATTR_TAGS,
    ATTR_UUID,
    TRANSACTION_TYPE_VALUE,
    DEFAULT_CONFIG,
} from "./types";
import {DEFAULT_ACCOUNTS} from "./defaultAccounts";
import {buildHTMLBlockContent} from "./blockRenderer";

// ─── IAL helper ──────────────────────────────────────────────────────────────

/**
 * Parse a SiYuan IAL string into a key→value map.
 * IAL format example:  custom-foo="bar" custom-baz="qux"
 */
export function parseIAL(ial: string): Record<string, string> {
    const result: Record<string, string> = {};
    // Matches:  key="value"  (value may contain escaped quotes)
    const re = /([a-zA-Z0-9\-_]+)="((?:[^"\\]|\\.)*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ial)) !== null) {
        result[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    return result;
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

/** Row shape returned by `SELECT block_id, name, value FROM attributes …` */
export interface IAttributeRow {
    block_id: string;
    name: string;
    value: string;
}

/**
 * Convert an attribute name→value map (already structured) into an ITransaction.
 * Values come from the `attributes` table and are NOT IAL-escaped.
 */
export function attributeMapToTransaction(
    blockId: string,
    attrs: Record<string, string>,
): ITransaction | null {
    try {
        if (attrs[ATTR_TYPE] !== TRANSACTION_TYPE_VALUE) return null;

        const postings: IPosting[] = JSON.parse(attrs[ATTR_POSTINGS] || "[]");
        const tagsRaw = attrs[ATTR_TAGS] || "";

        return {
            blockId,
            uuid: attrs[ATTR_UUID] || blockId,
            date: attrs[ATTR_DATE] || "",
            status: (attrs[ATTR_STATUS] as ITransaction["status"]) || "uncleared",
            payee: attrs[ATTR_PAYEE] || "",
            narration: attrs[ATTR_NARRATION] || "",
            postings,
            tags: tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [],
        };
    } catch {
        return null;
    }
}

/**
 * Group flat attribute rows by block_id and convert each group into an ITransaction.
 */
export function attributeRowsToTransactions(rows: IAttributeRow[]): ITransaction[] {
    const groups = new Map<string, Record<string, string>>();
    for (const row of rows) {
        let map = groups.get(row.block_id);
        if (!map) {
            map = {};
            groups.set(row.block_id, map);
        }
        map[row.name] = row.value;
    }

    const txns: ITransaction[] = [];
    for (const [blockId, attrs] of groups) {
        const tx = attributeMapToTransaction(blockId, attrs);
        if (tx) txns.push(tx);
    }
    return txns;
}

/**
 * @deprecated Use {@link attributeMapToTransaction} instead.
 * Kept for backward compatibility — converts a blocks-table row (with IAL string) to ITransaction.
 */
export function blockRowToTransaction(row: Record<string, string>): ITransaction | null {
    try {
        const ial = parseIAL(row.ial || "");
        if (ial[ATTR_TYPE] !== TRANSACTION_TYPE_VALUE) return null;

        const postings: IPosting[] = JSON.parse(ial[ATTR_POSTINGS] || "[]");
        const tagsRaw = ial[ATTR_TAGS] || "";

        return {
            blockId: row.id,
            uuid: ial[ATTR_UUID] || row.id,
            date: ial[ATTR_DATE] || "",
            status: (ial[ATTR_STATUS] as ITransaction["status"]) || "uncleared",
            payee: ial[ATTR_PAYEE] || "",
            narration: ial[ATTR_NARRATION] || "",
            postings,
            tags: tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [],
        };
    } catch {
        return null;
    }
}

// ─── Block content builder ───────────────────────────────────────────────────

export function buildBlockContent(tx: ITransaction, config: ILedgerConfig): string {
    const sym = (currency: string) => config.currencySymbols[currency] || currency;
    const statusMark = tx.status === "cleared" ? "✓" : tx.status === "pending" ? "?" : "~";
    const amount = tx.postings
        .filter(p => p.amount > 0)
        .reduce((s, p) => s + p.amount, 0);
    const currency = tx.postings[0]?.currency || config.defaultCurrency;

    if (config.displayMode === "compact") {
        const from = tx.postings.find(p => p.amount < 0)?.account.split(":").pop() || "";
        const to = tx.postings.find(p => p.amount > 0)?.account.split(":").pop() || "";
        return `💰 ${tx.date} ${tx.payee} ${sym(currency)}${amount.toFixed(2)} (${to} ← ${from})`;
    }

    const lines: string[] = [
        `💰 ${tx.date} [${statusMark}] | ${tx.payee}${tx.narration ? " | " + tx.narration : ""} | ${sym(currency)}${amount.toFixed(2)}`,
    ];
    for (const p of tx.postings) {
        const arrow = p.amount >= 0 ? "📤" : "📥";
        lines.push(`  ${arrow} ${p.account} ${sym(p.currency)}${p.amount.toFixed(2)}`);
    }
    if (tx.tags && tx.tags.length > 0) {
        lines.push(`  🏷️ ${tx.tags.join(", ")}`);
    }
    return lines.join("\n");
}

// ─── UUID helper ─────────────────────────────────────────────────────────────

export function generateUUID(): string {
    // Use crypto.getRandomValues for cryptographically secure random numbers
    const bytes = new Uint8Array(16);
    (globalThis.crypto || window.crypto).getRandomValues(bytes);
    // Set version 4 (random)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // Set variant (10xx)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ─── DataService ─────────────────────────────────────────────────────────────

export class DataService {
    private config: ILedgerConfig = DEFAULT_CONFIG;
    private accounts: IAccount[] = DEFAULT_ACCOUNTS;
    private i18n: Record<string, string> = {};
    private cache: ILedgerCache = {
        lastQueryTime: 0,
        accountBalances: {},
        monthlyExpenses: {},
        monthlyIncome: {},
        recentPayees: [],
        recentAccounts: [],
        payeeHistory: {},
    };

    // ─── Configuration ──────────────────────────────────────────────────

    getConfig(): ILedgerConfig {
        return this.config;
    }

    setConfig(cfg: ILedgerConfig) {
        this.config = cfg;
    }

    getAccounts(): IAccount[] {
        return this.accounts;
    }

    setAccounts(accounts: IAccount[]) {
        this.accounts = accounts;
    }

    getCache(): ILedgerCache {
        return this.cache;
    }

    setCache(c: ILedgerCache) {
        this.cache = c;
    }

    setI18n(i18n: Record<string, string>) {
        this.i18n = i18n;
    }

    // ─── Validation ─────────────────────────────────────────────────────

    /**
     * Returns true when all posting amounts sum to zero (double-entry balance).
     */
    isBalanced(postings: IPosting[]): boolean {
        const totals: Record<string, number> = {};
        for (const p of postings) {
            totals[p.currency] = (totals[p.currency] || 0) + p.amount;
        }
        return Object.values(totals).every(v => Math.abs(v) < 0.001);
    }

    /**
     * If autoBalance is enabled and there are exactly two postings where the
     * second amount is 0, fill it in as the negative of the first.
     */
    autoBalancePostings(postings: IPosting[]): IPosting[] {
        if (!this.config.autoBalance) return postings;
        if (postings.length === 2 && postings[1].amount === 0) {
            postings[1].amount = -postings[0].amount;
            postings[1].currency = postings[0].currency;
        }
        return postings;
    }

    // ─── Insert / Update / Delete ────────────────────────────────────────

    /**
     * Insert a new transaction block as a native SiYuan HTML block.
     * parentID   – the parent block to insert into
     * previousID – block ID after which to insert (or empty for end)
     */
    async insertTransaction(
        tx: Omit<ITransaction, "blockId">,
        parentID: string,
        previousID: string,
    ): Promise<string> {
        // Assign UUID if not provided
        const uuid = tx.uuid || generateUUID();
        const fullTx: ITransaction = {...tx, blockId: "", uuid};

        const htmlContent = buildHTMLBlockContent(fullTx, this.config, this.i18n);

        return new Promise((resolve, reject) => {
            fetchPost(
                "/api/block/insertBlock",
                {
                    dataType: "markdown",
                    data: htmlContent,
                    parentID,
                    previousID,
                },
                (res) => {
                    if (res.code !== 0) {
                        reject(new Error(res.msg));
                        return;
                    }
                    const blockId: string = res.data[0]?.doOperations[0]?.id;
                    if (!blockId) {
                        reject(new Error("No block ID returned"));
                        return;
                    }
                    fullTx.blockId = blockId;
                    this.setTransactionAttrs(blockId, fullTx).then(() => {
                        this.updateCacheAfterInsert(fullTx);
                        resolve(blockId);
                    }).catch(reject);
                },
            );
        });
    }

    async updateTransaction(tx: ITransaction): Promise<void> {
        const htmlContent = buildHTMLBlockContent(tx, this.config, this.i18n);

        await new Promise<void>((resolve, reject) => {
            fetchPost(
                "/api/block/updateBlock",
                {
                    dataType: "markdown",
                    data: htmlContent,
                    id: tx.blockId,
                },
                (res) => (res.code === 0 ? resolve() : reject(new Error(res.msg))),
            );
        });
        await this.setTransactionAttrs(tx.blockId, tx);
    }

    async deleteTransaction(blockId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            fetchPost(
                "/api/block/deleteBlock",
                {id: blockId},
                (res) => (res.code === 0 ? resolve() : reject(new Error(res.msg))),
            );
        });
    }

    // ─── Attributes ──────────────────────────────────────────────────────

    private async setTransactionAttrs(blockId: string, tx: ITransaction): Promise<void> {
        const attrs: Record<string, string> = {
            [ATTR_TYPE]: TRANSACTION_TYPE_VALUE,
            [ATTR_DATE]: tx.date,
            [ATTR_STATUS]: tx.status,
            [ATTR_PAYEE]: tx.payee,
            [ATTR_NARRATION]: tx.narration || "",
            [ATTR_POSTINGS]: JSON.stringify(tx.postings),
            [ATTR_TAGS]: (tx.tags || []).join(","),
            [ATTR_UUID]: tx.uuid,
        };
        return new Promise((resolve, reject) => {
            fetchPost(
                "/api/attr/setBlockAttrs",
                {id: blockId, attrs},
                (res) => (res.code === 0 ? resolve() : reject(new Error(res.msg))),
            );
        });
    }

    // ─── Query ───────────────────────────────────────────────────────────

    /**
     * Sanitize a user-supplied value for embedding inside a SQLite single-quoted
     * LIKE expression.  Escapes:
     *   - Single quotes (SQL string delimiter): ' → ''
     *   - LIKE wildcards (with ESCAPE '\'): % → \%, _ → \_
     *   - The escape character itself: \ → \\
     *
     * Note: SiYuan's /api/query/sql does not support parameterised queries,
     * so explicit escaping is the only available defence.
     */
    private sanitizeLikeParam(value: string): string {
        return value
            .replace(/\\/g, "\\\\")   // escape the ESCAPE char first
            .replace(/'/g, "''")      // escape SQLite string delimiter
            .replace(/%/g, "\\%")     // escape LIKE wildcard
            .replace(/_/g, "\\_");    // escape LIKE wildcard
    }

    async queryAllTransactions(): Promise<ITransaction[]> {
        return new Promise((resolve, reject) => {
            fetchPost(
                "/api/query/sql",
                {
                    // Use the `attributes` table which stores structured key-value pairs
                    // (no IAL escaping issues). ATTR_TYPE and TRANSACTION_TYPE_VALUE are
                    // compile-time constants, safe to interpolate.
                    stmt: `SELECT block_id, name, value FROM attributes WHERE block_id IN (SELECT block_id FROM attributes WHERE name = '${ATTR_TYPE}' AND value = '${TRANSACTION_TYPE_VALUE}') ORDER BY block_id DESC`,
                },
                (res) => {
                    if (res.code !== 0) {
                        reject(new Error(res.msg));
                        return;
                    }
                    const rows: IAttributeRow[] = res.data || [];
                    resolve(attributeRowsToTransactions(rows));
                },
            );
        });
    }

    async queryTransactionsByMonth(yearMonth: string): Promise<ITransaction[]> {
        // Validate yearMonth format (YYYY-MM) to prevent injection
        if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
            return Promise.reject(new Error(`Invalid yearMonth format: ${yearMonth}`));
        }
        const safeYearMonth = this.sanitizeLikeParam(yearMonth);
        return new Promise((resolve, reject) => {
            fetchPost(
                "/api/query/sql",
                {
                    stmt: `SELECT block_id, name, value FROM attributes WHERE block_id IN (SELECT a1.block_id FROM attributes a1 JOIN attributes a2 ON a1.block_id = a2.block_id WHERE a1.name = '${ATTR_TYPE}' AND a1.value = '${TRANSACTION_TYPE_VALUE}' AND a2.name = '${ATTR_DATE}' AND a2.value LIKE '${safeYearMonth}%' ESCAPE '\\') ORDER BY block_id DESC`,
                },
                (res) => {
                    if (res.code !== 0) {
                        reject(new Error(res.msg));
                        return;
                    }
                    const rows: IAttributeRow[] = res.data || [];
                    resolve(attributeRowsToTransactions(rows));
                },
            );
        });
    }

    async queryTransactionsByPayee(payee: string): Promise<ITransaction[]> {
        const safePayee = this.sanitizeLikeParam(payee);
        return new Promise((resolve, reject) => {
            fetchPost(
                "/api/query/sql",
                {
                    stmt: `SELECT block_id, name, value FROM attributes WHERE block_id IN (SELECT a1.block_id FROM attributes a1 JOIN attributes a2 ON a1.block_id = a2.block_id WHERE a1.name = '${ATTR_TYPE}' AND a1.value = '${TRANSACTION_TYPE_VALUE}' AND a2.name = '${ATTR_PAYEE}' AND a2.value LIKE '${safePayee}%' ESCAPE '\\') ORDER BY block_id DESC`,
                },
                (res) => {
                    if (res.code !== 0) {
                        reject(new Error(res.msg));
                        return;
                    }
                    const rows: IAttributeRow[] = res.data || [];
                    resolve(attributeRowsToTransactions(rows));
                },
            );
        });
    }

    // ─── Balance calculation ──────────────────────────────────────────────

    calculateBalances(transactions: ITransaction[]): Record<string, Record<string, number>> {
        const balances: Record<string, Record<string, number>> = {};
        for (const tx of transactions) {
            for (const p of tx.postings) {
                if (!balances[p.account]) balances[p.account] = {};
                balances[p.account][p.currency] = (balances[p.account][p.currency] || 0) + p.amount;
            }
        }
        return balances;
    }

    /** Returns {income, expenses, net} for the given transactions */
    summarize(transactions: ITransaction[], currency: string): {income: number; expenses: number; net: number} {
        let income = 0;
        let expenses = 0;
        for (const tx of transactions) {
            for (const p of tx.postings) {
                if (p.currency !== currency) continue;
                if (p.account.startsWith("Income:") && p.amount < 0) {
                    income += Math.abs(p.amount);
                } else if (p.account.startsWith("Expenses:") && p.amount > 0) {
                    expenses += p.amount;
                }
            }
        }
        return {income, expenses, net: income - expenses};
    }

    // ─── Cache maintenance ───────────────────────────────────────────────

    /** Extract the positive-amount sum and the first Expenses/Income posting from a transaction. */
    private extractTxStats(postings: IPosting[]): { positiveAmount: number; categoryAccount: string } {
        const positiveAmount = postings
            .filter(p => p.amount > 0)
            .reduce((sum, p) => sum + p.amount, 0);
        const categoryPosting = postings.find(
            p => p.account.startsWith("Expenses:") || p.account.startsWith("Income:"),
        );
        return { positiveAmount, categoryAccount: categoryPosting?.account || "" };
    }

    private updateCacheAfterInsert(tx: ITransaction) {
        // Update recent payees
        if (tx.payee && !this.cache.recentPayees.includes(tx.payee)) {
            this.cache.recentPayees.unshift(tx.payee);
            this.cache.recentPayees = this.cache.recentPayees.slice(0, 20);
        }
        // Update recent accounts
        for (const p of tx.postings) {
            if (!this.cache.recentAccounts.includes(p.account)) {
                this.cache.recentAccounts.unshift(p.account);
                this.cache.recentAccounts = this.cache.recentAccounts.slice(0, 20);
            }
        }
        // Update payee history
        if (tx.payee) {
            const { positiveAmount, categoryAccount } = this.extractTxStats(tx.postings);
            const existing = this.cache.payeeHistory[tx.payee];
            if (existing) {
                existing.count++;
                existing.totalAmount += positiveAmount;
                if (categoryAccount) existing.lastAccount = categoryAccount;
                existing.lastDate = tx.date;
            } else {
                this.cache.payeeHistory[tx.payee] = {
                    count: 1,
                    totalAmount: positiveAmount,
                    lastAccount: categoryAccount,
                    lastDate: tx.date,
                };
            }
        }
        // Invalidate balance cache
        this.cache.accountBalances = {};
        this.cache.monthlyExpenses = {};
        this.cache.monthlyIncome = {};
        this.cache.lastQueryTime = 0;
    }

    async refreshCache(): Promise<void> {
        const all = await this.queryAllTransactions();
        this.cache.accountBalances = this.calculateBalances(all);
        this.cache.lastQueryTime = Date.now();

        // Monthly expenses & income
        const monthlyExp: Record<string, number> = {};
        const monthlyInc: Record<string, number> = {};
        for (const tx of all) {
            const ym = tx.date.slice(0, 7);
            for (const p of tx.postings) {
                if (p.account.startsWith("Expenses:") && p.amount > 0) {
                    monthlyExp[ym] = (monthlyExp[ym] || 0) + p.amount;
                } else if (p.account.startsWith("Income:") && p.amount < 0) {
                    monthlyInc[ym] = (monthlyInc[ym] || 0) + Math.abs(p.amount);
                }
            }
        }
        this.cache.monthlyExpenses = monthlyExp;
        this.cache.monthlyIncome = monthlyInc;

        // Build payee history
        this.cache.payeeHistory = this.buildPayeeHistory(all);
    }

    /** Build per-payee statistics from a list of transactions. */
    buildPayeeHistory(transactions: ITransaction[]): Record<string, IPayeeStats> {
        const history: Record<string, IPayeeStats> = {};
        for (const tx of transactions) {
            if (!tx.payee) continue;
            const { positiveAmount, categoryAccount } = this.extractTxStats(tx.postings);
            const existing = history[tx.payee];
            if (existing) {
                existing.count++;
                existing.totalAmount += positiveAmount;
                if (categoryAccount) existing.lastAccount = categoryAccount;
                if (tx.date > existing.lastDate) existing.lastDate = tx.date;
            } else {
                history[tx.payee] = {
                    count: 1,
                    totalAmount: positiveAmount,
                    lastAccount: categoryAccount,
                    lastDate: tx.date,
                };
            }
        }
        return history;
    }

    /** Get stats for a specific payee, or undefined if not found. */
    getPayeeStats(payee: string): IPayeeStats | undefined {
        return this.cache.payeeHistory[payee];
    }

    /**
     * Search payees matching a query string (prefix or substring, case-insensitive).
     * Returns results sorted by usage count (most used first), limited to `limit`.
     */
    searchPayees(query: string, limit = 10): string[] {
        const q = query.toLowerCase();
        const history = this.cache.payeeHistory;
        const all = Object.keys(history);
        if (!q) {
            // Return most frequently used payees
            return all
                .sort((a, b) => history[b].count - history[a].count)
                .slice(0, limit);
        }
        return all
            .filter(p => p.toLowerCase().includes(q))
            .sort((a, b) => {
                // Prefer prefix matches
                const aPrefix = a.toLowerCase().startsWith(q) ? 0 : 1;
                const bPrefix = b.toLowerCase().startsWith(q) ? 0 : 1;
                if (aPrefix !== bPrefix) return aPrefix - bPrefix;
                return history[b].count - history[a].count;
            })
            .slice(0, limit);
    }

    // ─── Account helpers ─────────────────────────────────────────────────

    getAccountBalance(accountPath: string, currency: string): number {
        return this.cache.accountBalances[accountPath]?.[currency] || 0;
    }

    /** Returns all accounts whose path starts with prefix */
    getAccountsByPrefix(prefix: string): IAccount[] {
        return this.accounts.filter(a => a.path.startsWith(prefix) && !a.hidden && !a.closeDate);
    }

    findAccount(path: string): IAccount | undefined {
        return this.accounts.find(a => a.path === path);
    }

    getCurrencySymbol(currency: string): string {
        return this.config.currencySymbols[currency] || currency;
    }

    today(): string {
        return new Date().toISOString().slice(0, 10);
    }
}
