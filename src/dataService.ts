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
    ATTR_ACCOUNT,
    ATTR_AMOUNT,
    ATTR_CURRENCY,
    ATTR_TX_ID,
    TRANSACTION_TYPE_VALUE,
    POSTING_TYPE_VALUE,
    DEFAULT_CONFIG,
} from "./types";
import {DEFAULT_ACCOUNTS} from "./defaultAccounts";
import {buildTransactionEmbedCode, buildEmbedBlockMarkdown} from "./embedBlock";

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

/** Row shape for block queries that include parent_id */
export interface IBlockRow {
    id: string;
    parent_id: string;
}

/**
 * Convert an attribute name→value map (already structured) into an ITransaction.
 * Values come from the `attributes` table and are NOT IAL-escaped.
 *
 * Supports both the legacy JSON-blob model (ATTR_POSTINGS) and the new
 * child-block model (postings supplied externally via `childPostings`).
 */
export function attributeMapToTransaction(
    blockId: string,
    attrs: Record<string, string>,
    childPostings?: IPosting[],
): ITransaction | null {
    try {
        if (attrs[ATTR_TYPE] !== TRANSACTION_TYPE_VALUE) return null;

        // Prefer child-block postings; fall back to legacy JSON blob
        let postings: IPosting[];
        if (childPostings && childPostings.length > 0) {
            postings = childPostings;
        } else {
            postings = JSON.parse(attrs[ATTR_POSTINGS] || "[]");
        }
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
 * Convert a posting child block's attribute map into an IPosting.
 */
export function attributeMapToPosting(
    attrs: Record<string, string>,
): IPosting | null {
    if (attrs[ATTR_TYPE] !== POSTING_TYPE_VALUE) return null;
    const account = attrs[ATTR_ACCOUNT];
    if (!account) return null;
    return {
        account,
        amount: parseFloat(attrs[ATTR_AMOUNT] || "0"),
        currency: attrs[ATTR_CURRENCY] || "CNY",
    };
}

/**
 * Group flat attribute rows by block_id and convert each group into an ITransaction.
 * This is the legacy path that reads postings from the ATTR_POSTINGS JSON blob.
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
    const postings = tx.postings || [];
    const amount = postings
        .filter(p => p.amount > 0)
        .reduce((s, p) => s + p.amount, 0);
    const currency = postings[0]?.currency || config.defaultCurrency;

    if (config.displayMode === "compact") {
        const from = postings.find(p => p.amount < 0)?.account.split(":").pop() || "";
        const to = postings.find(p => p.amount > 0)?.account.split(":").pop() || "";
        return `💰 ${tx.date} ${tx.payee} ${sym(currency)}${amount.toFixed(2)} (${to} ← ${from})`;
    }

    const lines: string[] = [
        `💰 ${tx.date} [${statusMark}] | ${tx.payee}${tx.narration ? " | " + tx.narration : ""} | ${sym(currency)}${amount.toFixed(2)}`,
    ];
    for (const p of postings) {
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
    private cache: ILedgerCache = {
        lastQueryTime: 0,
        accountBalances: {},
        monthlyExpenses: {},
        monthlyIncome: {},
        recentPayees: [],
        recentAccounts: [],
        payeeHistory: {},
        narrationHistory: {},
        tagHistory: {},
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
     * Insert a NodeBlockQueryEmbed block containing `//!js` code that
     * queries transaction blocks at runtime.
     *
     * @see https://github.com/siyuan-note/siyuan/issues/9648
     */
    async insertEmbedBlock(
        markdown: string,
        parentID: string,
        previousID: string,
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            fetchPost(
                "/api/block/insertBlock",
                {
                    dataType: "markdown",
                    data: markdown,
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
                    resolve(blockId);
                },
            );
        });
    }

    /**
     * Insert a new transaction as an embed block with child posting blocks.
     *
     * Creates a parent embed block for the transaction header, then creates
     * one child block per posting.  Each block has its own IAL attributes
     * so SiYuan's `attributes` table can be queried relationally using
     * `blocks.parent_id` for the 1:N join.
     */
    async insertTransaction(
        tx: Omit<ITransaction, "blockId">,
        parentID: string,
        previousID: string,
    ): Promise<string> {
        // Assign UUID if not provided
        const uuid = tx.uuid || generateUUID();
        const fullTx: ITransaction = {...tx, blockId: "", uuid};

        const jsCode = buildTransactionEmbedCode(fullTx);
        const markdown = buildEmbedBlockMarkdown(jsCode);

        const blockId: string = await new Promise((resolve, reject) => {
            fetchPost(
                "/api/block/insertBlock",
                {
                    dataType: "markdown",
                    data: markdown,
                    parentID,
                    previousID,
                },
                (res) => {
                    if (res.code !== 0) {
                        reject(new Error(res.msg));
                        return;
                    }
                    const id: string = res.data[0]?.doOperations[0]?.id;
                    if (!id) {
                        reject(new Error("No block ID returned"));
                        return;
                    }
                    resolve(id);
                },
            );
        });

        fullTx.blockId = blockId;
        await this.setTransactionAttrs(blockId, fullTx);
        await this.insertPostingChildBlocks(blockId, fullTx.postings);
        this.updateCacheAfterInsert(fullTx);
        return blockId;
    }

    /**
     * Update an existing transaction embed block.
     *
     * Regenerates the `//!js` code, updates the IAL attributes, then
     * replaces all child posting blocks (delete old, insert new).
     */
    async updateTransaction(tx: ITransaction): Promise<void> {
        const jsCode = buildTransactionEmbedCode(tx);
        const markdown = buildEmbedBlockMarkdown(jsCode);

        await new Promise<void>((resolve, reject) => {
            fetchPost(
                "/api/block/updateBlock",
                {
                    dataType: "markdown",
                    data: markdown,
                    id: tx.blockId,
                },
                (res) => (res.code === 0 ? resolve() : reject(new Error(res.msg))),
            );
        });
        await this.setTransactionAttrs(tx.blockId, tx);

        // Replace posting child blocks
        await this.deleteChildBlocks(tx.blockId);
        await this.insertPostingChildBlocks(tx.blockId, tx.postings);
    }

    /**
     * Delete a transaction and all its child posting blocks.
     */
    async deleteTransaction(blockId: string): Promise<void> {
        // Delete child posting blocks first
        await this.deleteChildBlocks(blockId);
        // Delete the parent transaction block
        return new Promise((resolve, reject) => {
            fetchPost(
                "/api/block/deleteBlock",
                {id: blockId},
                (res) => (res.code === 0 ? resolve() : reject(new Error(res.msg))),
            );
        });
    }

    // ─── Attributes ──────────────────────────────────────────────────────

    /**
     * Set transaction-level attributes on the parent block.
     * No longer writes the JSON blob — postings live in child blocks.
     */
    private async setTransactionAttrs(blockId: string, tx: ITransaction): Promise<void> {
        const attrs: Record<string, string> = {
            [ATTR_TYPE]: TRANSACTION_TYPE_VALUE,
            [ATTR_DATE]: tx.date,
            [ATTR_STATUS]: tx.status,
            [ATTR_PAYEE]: tx.payee,
            [ATTR_NARRATION]: tx.narration || "",
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

    // ─── Posting child block helpers ─────────────────────────────────────

    /**
     * Insert one hidden paragraph child block per posting under the
     * transaction block and set posting-level attributes on each.
     */
    private async insertPostingChildBlocks(
        txBlockId: string,
        postings: IPosting[],
    ): Promise<void> {
        let previousID = "";
        for (const posting of postings) {
            // Insert a minimal paragraph block as a child
            const childId: string = await new Promise((resolve, reject) => {
                fetchPost(
                    "/api/block/insertBlock",
                    {
                        dataType: "markdown",
                        data: " ",  // minimal non-empty content
                        parentID: txBlockId,
                        previousID: previousID,
                    },
                    (res) => {
                        if (res.code !== 0) {
                            reject(new Error(res.msg));
                            return;
                        }
                        const id: string = res.data[0]?.doOperations[0]?.id;
                        if (!id) {
                            reject(new Error("No child block ID returned"));
                            return;
                        }
                        resolve(id);
                    },
                );
            });
            await this.setPostingAttrs(childId, txBlockId, posting);
            previousID = childId;
        }
    }

    /**
     * Set posting-level attributes on a child block.
     */
    private async setPostingAttrs(
        childBlockId: string,
        txBlockId: string,
        posting: IPosting,
    ): Promise<void> {
        const attrs: Record<string, string> = {
            [ATTR_TYPE]: POSTING_TYPE_VALUE,
            [ATTR_ACCOUNT]: posting.account,
            [ATTR_AMOUNT]: String(posting.amount),
            [ATTR_CURRENCY]: posting.currency,
            [ATTR_TX_ID]: txBlockId,
        };
        return new Promise((resolve, reject) => {
            fetchPost(
                "/api/attr/setBlockAttrs",
                {id: childBlockId, attrs},
                (res) => (res.code === 0 ? resolve() : reject(new Error(res.msg))),
            );
        });
    }

    /**
     * Delete all child blocks of a given parent block (posting blocks).
     * Uses SQL query on `blocks.parent_id` to find children.
     */
    private async deleteChildBlocks(parentBlockId: string): Promise<void> {
        const childIds = await this.queryChildBlockIds(parentBlockId);
        for (const id of childIds) {
            await new Promise<void>((resolve, reject) => {
                fetchPost(
                    "/api/block/deleteBlock",
                    {id},
                    (res) => (res.code === 0 ? resolve() : reject(new Error(res.msg))),
                );
            });
        }
    }

    /**
     * Query all direct child block IDs of a parent block.
     */
    private queryChildBlockIds(parentBlockId: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            fetchPost(
                "/api/query/sql",
                {
                    stmt: `SELECT id FROM blocks WHERE parent_id = '${parentBlockId}'`,
                },
                (res) => {
                    if (res.code !== 0) {
                        reject(new Error(res.msg));
                        return;
                    }
                    const ids = (res.data || []).map((r: { id: string }) => r.id);
                    resolve(ids);
                },
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

    /**
     * Assemble ITransaction objects from transaction-level attribute rows
     * by fetching child posting blocks via `blocks.parent_id`.
     *
     * Step 1: Group tx-level attrs by block_id.
     * Step 2: For each tx block, query child posting blocks and their attrs.
     * Step 3: Combine into ITransaction with proper postings array.
     *
     * Falls back to legacy ATTR_POSTINGS JSON blob when no child postings exist.
     */
    private async assembleTransactionsWithPostings(
        txAttrRows: IAttributeRow[],
    ): Promise<ITransaction[]> {
        // Group transaction-level attributes by block_id
        const txGroups = new Map<string, Record<string, string>>();
        for (const row of txAttrRows) {
            let map = txGroups.get(row.block_id);
            if (!map) {
                map = {};
                txGroups.set(row.block_id, map);
            }
            map[row.name] = row.value;
        }

        if (txGroups.size === 0) return [];

        // Batch-query all posting child blocks for all tx blocks at once.
        // Uses: blocks.parent_id IN (...txBlockIds...)
        const txBlockIds = [...txGroups.keys()];
        const postingRows = await this.queryPostingAttributesByTxIds(txBlockIds);

        // Group posting attrs by parent tx block_id → child block_id → attrs
        const postingsByTx = new Map<string, Map<string, Record<string, string>>>();
        for (const row of postingRows) {
            const parentId = row.parent_id;
            let childMap = postingsByTx.get(parentId);
            if (!childMap) {
                childMap = new Map();
                postingsByTx.set(parentId, childMap);
            }
            let attrMap = childMap.get(row.block_id);
            if (!attrMap) {
                attrMap = {};
                childMap.set(row.block_id, attrMap);
            }
            attrMap[row.name] = row.value;
        }

        const txns: ITransaction[] = [];
        for (const [blockId, attrs] of txGroups) {
            // Build postings from child blocks
            const childMap = postingsByTx.get(blockId);
            const childPostings: IPosting[] = [];
            if (childMap) {
                for (const [, childAttrs] of childMap) {
                    const p = attributeMapToPosting(childAttrs);
                    if (p) childPostings.push(p);
                }
            }
            const tx = attributeMapToTransaction(blockId, attrs, childPostings);
            if (tx) txns.push(tx);
        }
        return txns;
    }

    /**
     * Batch-query all posting child block attributes for a set of transaction block IDs.
     * Returns rows with { block_id, parent_id, name, value }.
     */
    private queryPostingAttributesByTxIds(
        txBlockIds: string[],
    ): Promise<Array<{ block_id: string; parent_id: string; name: string; value: string }>> {
        if (txBlockIds.length === 0) return Promise.resolve([]);

        // Build a safe IN clause — block IDs are system-generated hex strings
        const inClause = txBlockIds.map(id => `'${id}'`).join(",");

        return new Promise((resolve, reject) => {
            fetchPost(
                "/api/query/sql",
                {
                    stmt: `SELECT a.block_id, b.parent_id, a.name, a.value FROM attributes a JOIN blocks b ON a.block_id = b.id WHERE b.parent_id IN (${inClause}) AND a.name LIKE 'custom-ledger-%'`,
                },
                (res) => {
                    if (res.code !== 0) {
                        reject(new Error(res.msg));
                        return;
                    }
                    resolve(res.data || []);
                },
            );
        });
    }

    async queryAllTransactions(): Promise<ITransaction[]> {
        const txAttrRows: IAttributeRow[] = await new Promise((resolve, reject) => {
            fetchPost(
                "/api/query/sql",
                {
                    stmt: `SELECT block_id, name, value FROM attributes WHERE block_id IN (SELECT block_id FROM attributes WHERE name = '${ATTR_TYPE}' AND value = '${TRANSACTION_TYPE_VALUE}') ORDER BY block_id DESC`,
                },
                (res) => {
                    if (res.code !== 0) {
                        reject(new Error(res.msg));
                        return;
                    }
                    resolve(res.data || []);
                },
            );
        });
        return this.assembleTransactionsWithPostings(txAttrRows);
    }

    async queryTransactionsByMonth(yearMonth: string): Promise<ITransaction[]> {
        // Validate yearMonth format (YYYY-MM) to prevent injection
        if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
            return Promise.reject(new Error(`Invalid yearMonth format: ${yearMonth}`));
        }
        const safeYearMonth = this.sanitizeLikeParam(yearMonth);
        const txAttrRows: IAttributeRow[] = await new Promise((resolve, reject) => {
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
                    resolve(res.data || []);
                },
            );
        });
        return this.assembleTransactionsWithPostings(txAttrRows);
    }

    async queryTransactionsByPayee(payee: string): Promise<ITransaction[]> {
        const safePayee = this.sanitizeLikeParam(payee);
        const txAttrRows: IAttributeRow[] = await new Promise((resolve, reject) => {
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
                    resolve(res.data || []);
                },
            );
        });
        return this.assembleTransactionsWithPostings(txAttrRows);
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
        // Update narration history
        const narration = tx.narration?.trim();
        if (narration) {
            if (!this.cache.narrationHistory) this.cache.narrationHistory = {};
            this.cache.narrationHistory[narration] = (this.cache.narrationHistory[narration] || 0) + 1;
        }
        // Update tag history
        if (tx.tags && tx.tags.length > 0) {
            if (!this.cache.tagHistory) this.cache.tagHistory = {};
            for (const tag of tx.tags) {
                const t = tag.trim();
                if (t) this.cache.tagHistory[t] = (this.cache.tagHistory[t] || 0) + 1;
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

        // Build narration and tag history
        this.cache.narrationHistory = this.buildNarrationHistory(all);
        this.cache.tagHistory = this.buildTagHistory(all);
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

    // ─── Narration history ──────────────────────────────────────────────

    /** Build narration usage counts from a list of transactions. */
    buildNarrationHistory(transactions: ITransaction[]): Record<string, number> {
        const history: Record<string, number> = {};
        for (const tx of transactions) {
            const n = tx.narration?.trim();
            if (!n) continue;
            history[n] = (history[n] || 0) + 1;
        }
        return history;
    }

    /**
     * Search narrations matching a query string (prefix or substring, case-insensitive).
     * Returns results sorted by usage count (most used first), limited to `limit`.
     */
    searchNarrations(query: string, limit = 8): string[] {
        const q = query.toLowerCase();
        const history = this.cache.narrationHistory ?? {};
        const all = Object.keys(history);
        if (!q) {
            return all
                .sort((a, b) => history[b] - history[a])
                .slice(0, limit);
        }
        return all
            .filter(n => n.toLowerCase().includes(q))
            .sort((a, b) => {
                const aPrefix = a.toLowerCase().startsWith(q) ? 0 : 1;
                const bPrefix = b.toLowerCase().startsWith(q) ? 0 : 1;
                if (aPrefix !== bPrefix) return aPrefix - bPrefix;
                return history[b] - history[a];
            })
            .slice(0, limit);
    }

    // ─── Tag history ────────────────────────────────────────────────────

    /** Build tag usage counts from a list of transactions. */
    buildTagHistory(transactions: ITransaction[]): Record<string, number> {
        const history: Record<string, number> = {};
        for (const tx of transactions) {
            if (!tx.tags) continue;
            for (const tag of tx.tags) {
                const t = tag.trim();
                if (!t) continue;
                history[t] = (history[t] || 0) + 1;
            }
        }
        return history;
    }

    /**
     * Search tags matching a query string (prefix or substring, case-insensitive).
     * Returns results sorted by usage count (most used first), limited to `limit`.
     */
    searchTags(query: string, limit = 8): string[] {
        const q = query.toLowerCase();
        const history = this.cache.tagHistory ?? {};
        const all = Object.keys(history);
        if (!q) {
            return all
                .sort((a, b) => history[b] - history[a])
                .slice(0, limit);
        }
        return all
            .filter(t => t.toLowerCase().includes(q))
            .sort((a, b) => {
                const aPrefix = a.toLowerCase().startsWith(q) ? 0 : 1;
                const bPrefix = b.toLowerCase().startsWith(q) ? 0 : 1;
                if (aPrefix !== bPrefix) return aPrefix - bPrefix;
                return history[b] - history[a];
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

    // ─── Migration ──────────────────────────────────────────────────────

    /**
     * Migrate legacy transactions that store postings as a JSON blob
     * (`custom-ledger-postings`) to the new child-block model.
     *
     * For each transaction block that has ATTR_POSTINGS but no child
     * posting blocks, this method creates child blocks and removes the
     * legacy attribute.
     *
     * @returns The number of transactions migrated.
     */
    async migrateJsonBlobToChildBlocks(): Promise<number> {
        // Find all transaction blocks that still have the legacy ATTR_POSTINGS
        const legacyRows: IAttributeRow[] = await new Promise((resolve, reject) => {
            fetchPost(
                "/api/query/sql",
                {
                    stmt: `SELECT block_id, name, value FROM attributes WHERE block_id IN (SELECT a1.block_id FROM attributes a1 JOIN attributes a2 ON a1.block_id = a2.block_id WHERE a1.name = '${ATTR_TYPE}' AND a1.value = '${TRANSACTION_TYPE_VALUE}' AND a2.name = '${ATTR_POSTINGS}') ORDER BY block_id`,
                },
                (res) => {
                    if (res.code !== 0) {
                        reject(new Error(res.msg));
                        return;
                    }
                    resolve(res.data || []);
                },
            );
        });

        // Build legacy transactions using JSON blob
        const legacyTxns = attributeRowsToTransactions(legacyRows);
        let migrated = 0;

        for (const tx of legacyTxns) {
            // Check if child posting blocks already exist
            const childIds = await this.queryChildBlockIds(tx.blockId);
            if (childIds.length > 0) continue; // already migrated

            // Create child posting blocks
            await this.insertPostingChildBlocks(tx.blockId, tx.postings);

            // Remove the legacy ATTR_POSTINGS attribute by setting it to empty
            await new Promise<void>((resolve, reject) => {
                fetchPost(
                    "/api/attr/setBlockAttrs",
                    {id: tx.blockId, attrs: {[ATTR_POSTINGS]: ""}},
                    (res) => (res.code === 0 ? resolve() : reject(new Error(res.msg))),
                );
            });

            migrated++;
        }

        return migrated;
    }
}
