/**
 * Embed block helpers — generate `//!js` code for NodeBlockQueryEmbed blocks
 * that query ledger transactions using SiYuan's embed block JS execution.
 *
 * See: https://github.com/siyuan-note/siyuan/issues/9648
 *
 * When SiYuan encounters an embed block whose content starts with `//!js`,
 * it executes the code via `new Function("fetchSyncPost", "item", "protyle", "top", code)`
 * and expects the return value to be `string[]` (block IDs) or `Promise<string[]>`.
 * SiYuan then calls `/api/search/getEmbedBlock` with those IDs to render the blocks.
 */

import {
    ATTR_TYPE, ATTR_DATE, ATTR_STATUS, ATTR_PAYEE, ATTR_NARRATION,
    ATTR_POSTINGS, ATTR_TAGS, ATTR_UUID,
    TRANSACTION_TYPE_VALUE,
    type ITransaction,
} from "./types";

// ─── Embed query types ───────────────────────────────────────────────────────

export type EmbedQueryType = "monthly" | "recent" | "byAccount" | "byPayee" | "all";

export interface IEmbedQueryOptions {
    type: EmbedQueryType;
    /** For "monthly": YYYY-MM string; for "byAccount": account path; for "byPayee": payee name */
    param?: string;
    /** For "recent": number of transactions to show (default 20) */
    limit?: number;
}

// ─── JS code generators ─────────────────────────────────────────────────────

/**
 * Build the JS code that will run inside a `//!js` embed block.
 * The code uses `fetchSyncPost` (injected by SiYuan) to query the
 * `attributes` table and return matching transaction block IDs.
 */
export function buildEmbedJsCode(opts: IEmbedQueryOptions): string {
    switch (opts.type) {
        case "monthly":
            return buildMonthlyQuery(opts.param || getCurrentMonth());
        case "recent":
            return buildRecentQuery(opts.limit || 20);
        case "byAccount":
            return buildByAccountQuery(opts.param || "Expenses:");
        case "byPayee":
            return buildByPayeeQuery(opts.param || "");
        case "all":
            return buildAllQuery();
        default:
            return buildAllQuery();
    }
}

function getCurrentMonth(): string {
    return new Date().toISOString().slice(0, 7);
}

/**
 * Escape a string value for safe embedding inside a SQL single-quoted literal
 * within JS code. Escapes single quotes and backslashes.
 */
function escapeSqlValue(value: string): string {
    return value
        .replace(/\\/g, "\\\\")   // escape backslash first
        .replace(/'/g, "''");     // escape single quote
}

/**
 * Escape a string value for safe use inside a SQL LIKE pattern.
 * In addition to standard SQL escaping, also escapes LIKE wildcards (%, _)
 * with a backslash ESCAPE character.
 */
function escapeSqlLikeValue(value: string): string {
    return value
        .replace(/\\/g, "\\\\")   // escape backslash first (also the ESCAPE char)
        .replace(/'/g, "''")      // escape single quote
        .replace(/%/g, "\\%")     // escape LIKE wildcard
        .replace(/_/g, "\\_");    // escape LIKE wildcard
}

function buildMonthlyQuery(yearMonth: string): string {
    const safe = escapeSqlLikeValue(yearMonth);
    return `//!js
const query = async () => {
    const res = await fetchSyncPost("/api/query/sql", {
        stmt: "SELECT DISTINCT a1.block_id FROM attributes a1 JOIN attributes a2 ON a1.block_id = a2.block_id WHERE a1.name = '${ATTR_TYPE}' AND a1.value = '${TRANSACTION_TYPE_VALUE}' AND a2.name = '${ATTR_DATE}' AND a2.value LIKE '${safe}%' ESCAPE '\\\\' ORDER BY a2.value DESC"
    });
    if (res.code !== 0) return [];
    return (res.data || []).map(r => r.block_id);
};
return query();`;
}

function buildRecentQuery(limit: number): string {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit || 20)));
    return `//!js
const query = async () => {
    const res = await fetchSyncPost("/api/query/sql", {
        stmt: "SELECT DISTINCT a1.block_id, a2.value as dt FROM attributes a1 JOIN attributes a2 ON a1.block_id = a2.block_id WHERE a1.name = '${ATTR_TYPE}' AND a1.value = '${TRANSACTION_TYPE_VALUE}' AND a2.name = '${ATTR_DATE}' ORDER BY a2.value DESC LIMIT ${safeLimit}"
    });
    if (res.code !== 0) return [];
    return (res.data || []).map(r => r.block_id);
};
return query();`;
}

function buildByAccountQuery(accountPath: string): string {
    const safe = escapeSqlLikeValue(accountPath);
    // Search for transactions whose ATTR_POSTINGS JSON contains the account path
    return `//!js
const query = async () => {
    const res = await fetchSyncPost("/api/query/sql", {
        stmt: "SELECT DISTINCT a1.block_id, a2.value as dt FROM attributes a1 JOIN attributes a2 ON a1.block_id = a2.block_id JOIN attributes a3 ON a1.block_id = a3.block_id WHERE a1.name = '${ATTR_TYPE}' AND a1.value = '${TRANSACTION_TYPE_VALUE}' AND a2.name = '${ATTR_DATE}' AND a3.name = 'custom-ledger-postings' AND a3.value LIKE '%${safe}%' ESCAPE '\\\\' ORDER BY a2.value DESC"
    });
    if (res.code !== 0) return [];
    return (res.data || []).map(r => r.block_id);
};
return query();`;
}

function buildByPayeeQuery(payee: string): string {
    const safe = escapeSqlValue(payee);
    return `//!js
const query = async () => {
    const res = await fetchSyncPost("/api/query/sql", {
        stmt: "SELECT DISTINCT a1.block_id, a2.value as dt FROM attributes a1 JOIN attributes a2 ON a1.block_id = a2.block_id JOIN attributes a3 ON a1.block_id = a3.block_id WHERE a1.name = '${ATTR_TYPE}' AND a1.value = '${TRANSACTION_TYPE_VALUE}' AND a2.name = '${ATTR_DATE}' AND a3.name = '${ATTR_PAYEE}' AND a3.value = '${safe}' ORDER BY a2.value DESC"
    });
    if (res.code !== 0) return [];
    return (res.data || []).map(r => r.block_id);
};
return query();`;
}

function buildAllQuery(): string {
    return `//!js
const query = async () => {
    const res = await fetchSyncPost("/api/query/sql", {
        stmt: "SELECT DISTINCT a1.block_id, a2.value as dt FROM attributes a1 JOIN attributes a2 ON a1.block_id = a2.block_id WHERE a1.name = '${ATTR_TYPE}' AND a1.value = '${TRANSACTION_TYPE_VALUE}' AND a2.name = '${ATTR_DATE}' ORDER BY a2.value DESC"
    });
    if (res.code !== 0) return [];
    return (res.data || []).map(r => r.block_id);
};
return query();`;
}

// ─── Markdown builder ────────────────────────────────────────────────────────

/**
 * Build the markdown string for a NodeBlockQueryEmbed block.
 * SiYuan's Lute parser converts `{{ content }}` into a NodeBlockQueryEmbed.
 * Newlines inside the embed block content must be replaced with `_esc_newline_`
 * for proper storage in the block's `data-content` attribute.
 */
export function buildEmbedBlockMarkdown(jsCode: string): string {
    // Replace newlines with the SiYuan escape sequence for embed block content
    const escaped = jsCode.replace(/\n/g, "_esc_newline_");
    return `{{${escaped}}}`;
}

// ─── Transaction embed block ─────────────────────────────────────────────────

/**
 * Rendering-ready subset of a transaction, derived at runtime from the
 * block's IAL attributes.  `blockId` is intentionally omitted — the embed
 * block reads its own node-id from the DOM at render time.
 */
export interface ITransactionEmbedData {
    date: string;
    status: string;
    payee: string;
    narration: string;
    postings: Array<{
        account: string;
        amount: number;
        currency: string;
    }>;
    tags: string[];
    uuid: string;
}

/**
 * Convert raw IAL attributes (from `/api/attr/getBlockAttrs`) into the
 * rendering data structure.  Returns `null` when the attributes do not
 * describe a valid ledger transaction.
 */
export function attrsToTransactionData(
    attrs: Record<string, string>,
): ITransactionEmbedData | null {
    if (attrs[ATTR_TYPE] !== TRANSACTION_TYPE_VALUE) return null;

    let postings: ITransactionEmbedData["postings"] = [];
    try {
        postings = JSON.parse(attrs[ATTR_POSTINGS] || "[]");
    } catch {
        return null;
    }

    const tagsRaw = attrs[ATTR_TAGS] || "";

    return {
        date: attrs[ATTR_DATE] || "",
        status: attrs[ATTR_STATUS] || "uncleared",
        payee: attrs[ATTR_PAYEE] || "",
        narration: attrs[ATTR_NARRATION] || "",
        postings,
        tags: tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [],
        uuid: attrs[ATTR_UUID] || "",
    };
}

/**
 * Build the `//!js` code that renders a single transaction block.
 *
 * The embed block is **data-driven from IAL attributes** — it reads its
 * own block ID from the DOM, fetches the IAL attributes at render time,
 * and passes them to `Ledger.renderTransaction()`.  This means editing a
 * transaction only needs to update the attributes; the embed code is the
 * same for every transaction block.
 *
 * The `_tx` parameter is accepted for API compatibility but is no longer
 * serialised into the JS source.
 */
export function buildTransactionEmbedCode(
    _tx?: ITransaction | Omit<ITransaction, "blockId">,
): string {
    // After successful rendering, return undefined (not []) so that SiYuan's
    // blockRender skips its own embed rendering and does NOT show the yellow
    // "不存在符合条件的内容块" fallback message.
    // See: siyuan-note/siyuan app/src/protyle/render/blockRender.ts — when
    // the //!js Promise resolves to a non-array value, SiYuan simply returns
    // without calling renderEmbed(), preserving the plugin's custom DOM.
    return `//!js
const render = async () => {
    if (typeof Ledger === 'undefined' || !Ledger.renderTransaction) return [];
    const el = item.closest('[data-node-id]');
    if (!el) return [];
    const blockId = el.getAttribute('data-node-id');
    if (!blockId) return [];
    const res = await fetchSyncPost('/api/attr/getBlockAttrs', {id: blockId});
    if (res.code !== 0 || !res.data) return [];
    Ledger.renderTransaction(res.data, item);
    item.style.height = '';
    return undefined;
};
return render();`;
}
