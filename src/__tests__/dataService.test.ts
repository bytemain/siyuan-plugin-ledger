import {describe, it, expect} from "vitest";
import {parseIAL, blockRowToTransaction, attributeMapToTransaction, attributeMapToPosting, attributeRowsToTransactions, generateUUID, sanitizeBlockId, buildBlockContent, DataService} from "../dataService";
import type {IAttributeRow} from "../dataService";
import {
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
} from "../types";
import {ITransaction} from "../types";

// ─── parseIAL ─────────────────────────────────────────────────────────────────

describe("parseIAL", () => {
    it("parses a single key=value pair", () => {
        const result = parseIAL('custom-foo="bar"');
        expect(result["custom-foo"]).toBe("bar");
    });

    it("parses multiple key=value pairs", () => {
        const result = parseIAL('custom-foo="bar" custom-baz="qux"');
        expect(result["custom-foo"]).toBe("bar");
        expect(result["custom-baz"]).toBe("qux");
    });

    it("returns an empty object for empty input", () => {
        expect(parseIAL("")).toEqual({});
    });

    it("handles values with escaped double quotes", () => {
        const result = parseIAL('custom-foo="say \\"hi\\""');
        expect(result["custom-foo"]).toBe('say "hi"');
    });

    it("handles values with escaped backslashes", () => {
        const result = parseIAL('custom-foo="a\\\\b"');
        expect(result["custom-foo"]).toBe("a\\b");
    });

    it("handles keys with hyphens", () => {
        const result = parseIAL('custom-ledger-date="2024-03-15"');
        expect(result["custom-ledger-date"]).toBe("2024-03-15");
    });

    it("ignores malformed entries (no quotes)", () => {
        const result = parseIAL("custom-foo=bar");
        expect(result["custom-foo"]).toBeUndefined();
    });
});

// ─── blockRowToTransaction ────────────────────────────────────────────────────

function buildIAL(fields: Record<string, string>): string {
    return Object.entries(fields)
        .map(([k, v]) => `${k}="${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
        .join(" ");
}

const SAMPLE_POSTINGS = JSON.stringify([
    {account: "Expenses:Food:Dining", amount: 258, currency: "CNY"},
    {account: "Assets:Alipay", amount: -258, currency: "CNY"},
]);

describe("blockRowToTransaction", () => {
    it("converts a valid block row to ITransaction", () => {
        const ial = buildIAL({
            [ATTR_TYPE]: TRANSACTION_TYPE_VALUE,
            [ATTR_DATE]: "2024-03-15",
            [ATTR_STATUS]: "cleared",
            [ATTR_PAYEE]: "海底捞",
            [ATTR_NARRATION]: "部门聚餐",
            [ATTR_POSTINGS]: SAMPLE_POSTINGS,
            [ATTR_TAGS]: "聚餐,报销",
            [ATTR_UUID]: "test-uuid-1",
        });
        const tx = blockRowToTransaction({id: "block-1", ial});
        expect(tx).not.toBeNull();
        expect(tx?.date).toBe("2024-03-15");
        expect(tx?.status).toBe("cleared");
        expect(tx?.payee).toBe("海底捞");
        expect(tx?.narration).toBe("部门聚餐");
        expect(tx?.postings).toHaveLength(2);
        expect(tx?.postings[0].amount).toBe(258);
        expect(tx?.tags).toContain("聚餐");
        expect(tx?.tags).toContain("报销");
    });

    it("returns null when custom-ledger-type is missing", () => {
        const ial = buildIAL({
            [ATTR_DATE]: "2024-03-15",
            [ATTR_PAYEE]: "Test",
            [ATTR_POSTINGS]: SAMPLE_POSTINGS,
        });
        const tx = blockRowToTransaction({id: "block-1", ial});
        expect(tx).toBeNull();
    });

    it("returns null when custom-ledger-type is not 'transaction'", () => {
        const ial = buildIAL({
            [ATTR_TYPE]: "balance",
            [ATTR_DATE]: "2024-03-15",
            [ATTR_POSTINGS]: SAMPLE_POSTINGS,
        });
        const tx = blockRowToTransaction({id: "block-1", ial});
        expect(tx).toBeNull();
    });

    it("returns null for completely empty row", () => {
        const tx = blockRowToTransaction({id: "block-1", ial: ""});
        expect(tx).toBeNull();
    });

    it("falls back to blockId when uuid is missing", () => {
        const ial = buildIAL({
            [ATTR_TYPE]: TRANSACTION_TYPE_VALUE,
            [ATTR_DATE]: "2024-03-15",
            [ATTR_STATUS]: "cleared",
            [ATTR_PAYEE]: "Test",
            [ATTR_POSTINGS]: SAMPLE_POSTINGS,
        });
        const tx = blockRowToTransaction({id: "fallback-id", ial});
        expect(tx?.uuid).toBe("fallback-id");
    });

    it("handles empty tags gracefully", () => {
        const ial = buildIAL({
            [ATTR_TYPE]: TRANSACTION_TYPE_VALUE,
            [ATTR_DATE]: "2024-03-15",
            [ATTR_STATUS]: "cleared",
            [ATTR_PAYEE]: "Test",
            [ATTR_POSTINGS]: SAMPLE_POSTINGS,
            [ATTR_TAGS]: "",
        });
        const tx = blockRowToTransaction({id: "block-1", ial});
        expect(tx?.tags).toEqual([]);
    });

    it("handles invalid JSON in postings gracefully (returns null)", () => {
        const ial = buildIAL({
            [ATTR_TYPE]: TRANSACTION_TYPE_VALUE,
            [ATTR_DATE]: "2024-03-15",
            [ATTR_PAYEE]: "Test",
            [ATTR_POSTINGS]: "NOT_JSON",
        });
        const tx = blockRowToTransaction({id: "block-1", ial});
        expect(tx).toBeNull();
    });
});

// ─── attributeMapToTransaction ────────────────────────────────────────────────

const SAMPLE_ATTRS: Record<string, string> = {
    [ATTR_TYPE]: TRANSACTION_TYPE_VALUE,
    [ATTR_DATE]: "2024-03-15",
    [ATTR_STATUS]: "cleared",
    [ATTR_PAYEE]: "海底捞",
    [ATTR_NARRATION]: "部门聚餐",
    [ATTR_POSTINGS]: SAMPLE_POSTINGS,
    [ATTR_TAGS]: "聚餐,报销",
    [ATTR_UUID]: "test-uuid-1",
};

describe("attributeMapToTransaction", () => {
    it("converts a valid attribute map to ITransaction", () => {
        const tx = attributeMapToTransaction("block-1", SAMPLE_ATTRS);
        expect(tx).not.toBeNull();
        expect(tx?.blockId).toBe("block-1");
        expect(tx?.date).toBe("2024-03-15");
        expect(tx?.status).toBe("cleared");
        expect(tx?.payee).toBe("海底捞");
        expect(tx?.narration).toBe("部门聚餐");
        expect(tx?.postings).toHaveLength(2);
        expect(tx?.postings[0].amount).toBe(258);
        expect(tx?.tags).toContain("聚餐");
        expect(tx?.tags).toContain("报销");
    });

    it("returns null when custom-ledger-type is missing", () => {
        const attrs = {...SAMPLE_ATTRS};
        delete attrs[ATTR_TYPE];
        expect(attributeMapToTransaction("block-1", attrs)).toBeNull();
    });

    it("returns null when custom-ledger-type is not 'transaction'", () => {
        const attrs = {...SAMPLE_ATTRS, [ATTR_TYPE]: "balance"};
        expect(attributeMapToTransaction("block-1", attrs)).toBeNull();
    });

    it("returns null for empty attribute map", () => {
        expect(attributeMapToTransaction("block-1", {})).toBeNull();
    });

    it("falls back to blockId when uuid is missing", () => {
        const attrs = {...SAMPLE_ATTRS};
        delete attrs[ATTR_UUID];
        const tx = attributeMapToTransaction("fallback-id", attrs);
        expect(tx?.uuid).toBe("fallback-id");
    });

    it("handles empty tags gracefully", () => {
        const attrs = {...SAMPLE_ATTRS, [ATTR_TAGS]: ""};
        const tx = attributeMapToTransaction("block-1", attrs);
        expect(tx?.tags).toEqual([]);
    });

    it("handles invalid JSON in postings gracefully (returns null)", () => {
        const attrs = {...SAMPLE_ATTRS, [ATTR_POSTINGS]: "NOT_JSON"};
        expect(attributeMapToTransaction("block-1", attrs)).toBeNull();
    });

    it("correctly parses postings JSON without IAL escaping issues", () => {
        const postingsJson = JSON.stringify([
            {account: "Expenses:Shopping:Digital", amount: 196.9, currency: "CNY"},
            {account: "Liabilities:CreditCard:CMB", amount: -196.9, currency: "CNY"},
        ]);
        const attrs = {...SAMPLE_ATTRS, [ATTR_POSTINGS]: postingsJson};
        const tx = attributeMapToTransaction("block-1", attrs);
        expect(tx).not.toBeNull();
        expect(tx?.postings[0].account).toBe("Expenses:Shopping:Digital");
        expect(tx?.postings[0].amount).toBe(196.9);
        expect(tx?.postings[1].account).toBe("Liabilities:CreditCard:CMB");
        expect(tx?.postings[1].amount).toBe(-196.9);
    });
});

// ─── attributeMapToPosting ────────────────────────────────────────────────────

describe("attributeMapToPosting", () => {
    it("converts a valid posting attribute map to IPosting", () => {
        const attrs = {
            [ATTR_TYPE]: POSTING_TYPE_VALUE,
            [ATTR_ACCOUNT]: "Expenses:Food:Coffee",
            [ATTR_AMOUNT]: "32.50",
            [ATTR_CURRENCY]: "CNY",
            [ATTR_TX_ID]: "parent-block-1",
        };
        const p = attributeMapToPosting(attrs);
        expect(p).not.toBeNull();
        expect(p!.account).toBe("Expenses:Food:Coffee");
        expect(p!.amount).toBe(32.5);
        expect(p!.currency).toBe("CNY");
    });

    it("returns null when type is not 'posting'", () => {
        const attrs = {
            [ATTR_TYPE]: TRANSACTION_TYPE_VALUE,
            [ATTR_ACCOUNT]: "Expenses:Food",
            [ATTR_AMOUNT]: "10",
            [ATTR_CURRENCY]: "CNY",
        };
        expect(attributeMapToPosting(attrs)).toBeNull();
    });

    it("returns null when account is missing", () => {
        const attrs = {
            [ATTR_TYPE]: POSTING_TYPE_VALUE,
            [ATTR_AMOUNT]: "10",
            [ATTR_CURRENCY]: "CNY",
        };
        expect(attributeMapToPosting(attrs)).toBeNull();
    });

    it("defaults currency to CNY when missing", () => {
        const attrs = {
            [ATTR_TYPE]: POSTING_TYPE_VALUE,
            [ATTR_ACCOUNT]: "Assets:Cash",
            [ATTR_AMOUNT]: "-50",
        };
        const p = attributeMapToPosting(attrs);
        expect(p).not.toBeNull();
        expect(p!.currency).toBe("CNY");
        expect(p!.amount).toBe(-50);
    });

    it("defaults amount to 0 when missing", () => {
        const attrs = {
            [ATTR_TYPE]: POSTING_TYPE_VALUE,
            [ATTR_ACCOUNT]: "Assets:Cash",
            [ATTR_CURRENCY]: "USD",
        };
        const p = attributeMapToPosting(attrs);
        expect(p).not.toBeNull();
        expect(p!.amount).toBe(0);
    });
});

// ─── attributeMapToTransaction with childPostings ────────────────────────────

describe("attributeMapToTransaction with childPostings", () => {
    it("prefers childPostings over legacy JSON blob", () => {
        const childPostings = [
            {account: "Expenses:Transport", amount: 50, currency: "CNY"},
            {account: "Assets:Cash", amount: -50, currency: "CNY"},
        ];
        // SAMPLE_ATTRS has JSON blob postings for Food:Dining
        const tx = attributeMapToTransaction("block-1", SAMPLE_ATTRS, childPostings);
        expect(tx).not.toBeNull();
        expect(tx!.postings).toHaveLength(2);
        // Should use childPostings, not the JSON blob
        expect(tx!.postings[0].account).toBe("Expenses:Transport");
        expect(tx!.postings[1].account).toBe("Assets:Cash");
    });

    it("falls back to JSON blob when childPostings is empty", () => {
        const tx = attributeMapToTransaction("block-1", SAMPLE_ATTRS, []);
        expect(tx).not.toBeNull();
        // Should fall back to JSON blob
        expect(tx!.postings[0].account).toBe("Expenses:Food:Dining");
    });

    it("falls back to JSON blob when childPostings is undefined", () => {
        const tx = attributeMapToTransaction("block-1", SAMPLE_ATTRS);
        expect(tx).not.toBeNull();
        expect(tx!.postings[0].account).toBe("Expenses:Food:Dining");
    });
});

// ─── attributeRowsToTransactions ──────────────────────────────────────────────

describe("attributeRowsToTransactions", () => {
    it("groups rows by block_id and converts to transactions", () => {
        const rows: IAttributeRow[] = [
            {block_id: "b1", name: ATTR_TYPE, value: TRANSACTION_TYPE_VALUE},
            {block_id: "b1", name: ATTR_DATE, value: "2024-03-15"},
            {block_id: "b1", name: ATTR_PAYEE, value: "海底捞"},
            {block_id: "b1", name: ATTR_POSTINGS, value: SAMPLE_POSTINGS},
            {block_id: "b1", name: ATTR_UUID, value: "uuid-1"},
            {block_id: "b2", name: ATTR_TYPE, value: TRANSACTION_TYPE_VALUE},
            {block_id: "b2", name: ATTR_DATE, value: "2024-03-16"},
            {block_id: "b2", name: ATTR_PAYEE, value: "滴滴出行"},
            {block_id: "b2", name: ATTR_POSTINGS, value: JSON.stringify([
                {account: "Expenses:Transport", amount: 32, currency: "CNY"},
                {account: "Assets:Alipay", amount: -32, currency: "CNY"},
            ])},
            {block_id: "b2", name: ATTR_UUID, value: "uuid-2"},
        ];
        const txns = attributeRowsToTransactions(rows);
        expect(txns).toHaveLength(2);
        expect(txns[0].blockId).toBe("b1");
        expect(txns[0].payee).toBe("海底捞");
        expect(txns[1].blockId).toBe("b2");
        expect(txns[1].payee).toBe("滴滴出行");
    });

    it("skips blocks without transaction type", () => {
        const rows: IAttributeRow[] = [
            {block_id: "b1", name: ATTR_TYPE, value: "balance"},
            {block_id: "b1", name: ATTR_DATE, value: "2024-03-15"},
        ];
        const txns = attributeRowsToTransactions(rows);
        expect(txns).toHaveLength(0);
    });

    it("returns empty array for empty input", () => {
        expect(attributeRowsToTransactions([])).toEqual([]);
    });
});

// ─── generateUUID ─────────────────────────────────────────────────────────────

describe("generateUUID", () => {
    it("generates a string in UUID v4 format", () => {
        const uuid = generateUUID();
        expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("generates unique values on successive calls", () => {
        const seen = new Set<string>();
        for (let i = 0; i < 50; i++) {
            seen.add(generateUUID());
        }
        expect(seen.size).toBe(50);
    });
});

// ─── sanitizeBlockId ──────────────────────────────────────────────────────────

describe("sanitizeBlockId", () => {
    it("accepts a valid SiYuan block ID", () => {
        expect(sanitizeBlockId("20240315123456-abcdef0")).toBe("20240315123456-abcdef0");
    });

    it("accepts block IDs with all digits in suffix", () => {
        expect(sanitizeBlockId("20240101000000-1234567")).toBe("20240101000000-1234567");
    });

    it("throws for SQL injection attempt", () => {
        expect(() => sanitizeBlockId("'; DROP TABLE blocks; --")).toThrow("Invalid SiYuan block ID");
    });

    it("throws for empty string", () => {
        expect(() => sanitizeBlockId("")).toThrow("Invalid SiYuan block ID");
    });

    it("throws for block ID with uppercase letters", () => {
        expect(() => sanitizeBlockId("20240315123456-ABCDEF0")).toThrow("Invalid SiYuan block ID");
    });

    it("throws for block ID with wrong suffix length", () => {
        expect(() => sanitizeBlockId("20240315123456-abcde")).toThrow("Invalid SiYuan block ID");
    });
});

// ─── buildBlockContent ───────────────────────────────────────────────────────

const SAMPLE_TX: ITransaction = {
    blockId: "block-1",
    uuid: "uuid-1",
    date: "2024-03-15",
    status: "cleared",
    payee: "海底捞",
    narration: "部门聚餐",
    tags: ["聚餐", "报销"],
    postings: [
        {account: "Expenses:Food:Dining", amount: 258, currency: "CNY"},
        {account: "Assets:Alipay", amount: -258, currency: "CNY"},
    ],
};

describe("buildBlockContent", () => {
    it("includes date, payee and amount in detailed mode", () => {
        const content = buildBlockContent(SAMPLE_TX, DEFAULT_CONFIG);
        expect(content).toContain("2024-03-15");
        expect(content).toContain("海底捞");
        expect(content).toContain("¥258.00");
    });

    it("includes narration in detailed mode", () => {
        const content = buildBlockContent(SAMPLE_TX, DEFAULT_CONFIG);
        expect(content).toContain("部门聚餐");
    });

    it("includes posting accounts in detailed mode", () => {
        const content = buildBlockContent(SAMPLE_TX, DEFAULT_CONFIG);
        expect(content).toContain("Expenses:Food:Dining");
        expect(content).toContain("Assets:Alipay");
    });

    it("includes tags in detailed mode", () => {
        const content = buildBlockContent(SAMPLE_TX, DEFAULT_CONFIG);
        expect(content).toContain("聚餐");
        expect(content).toContain("报销");
    });

    it("shows ✓ for cleared status", () => {
        const content = buildBlockContent(SAMPLE_TX, DEFAULT_CONFIG);
        expect(content).toContain("✓");
    });

    it("shows ? for pending status", () => {
        const tx = {...SAMPLE_TX, status: "pending" as const};
        const content = buildBlockContent(tx, DEFAULT_CONFIG);
        expect(content).toContain("?");
    });

    it("shows ~ for uncleared status", () => {
        const tx = {...SAMPLE_TX, status: "uncleared" as const};
        const content = buildBlockContent(tx, DEFAULT_CONFIG);
        expect(content).toContain("~");
    });

    it("compact mode includes payee, amount, and account abbreviations", () => {
        const compactConfig = {...DEFAULT_CONFIG, displayMode: "compact" as const};
        const content = buildBlockContent(SAMPLE_TX, compactConfig);
        expect(content).toContain("海底捞");
        expect(content).toContain("¥258.00");
        // compact mode uses account tail segments
        expect(content).toContain("Dining");
        expect(content).toContain("Alipay");
    });

    it("uses correct currency symbol for USD", () => {
        const usdTx: ITransaction = {
            ...SAMPLE_TX,
            postings: [
                {account: "Expenses:Shopping", amount: 29.99, currency: "USD"},
                {account: "Assets:Bank", amount: -29.99, currency: "USD"},
            ],
        };
        const content = buildBlockContent(usdTx, DEFAULT_CONFIG);
        expect(content).toContain("$29.99");
    });
});

// ─── buildPayeeHistory / getPayeeStats / searchPayees ─────────────────────────

describe("buildPayeeHistory", () => {
    const txns: ITransaction[] = [
        {
            blockId: "b1", uuid: "u1", date: "2024-03-10", status: "cleared",
            payee: "海底捞", postings: [
                {account: "Expenses:Food:Dining", amount: 258, currency: "CNY"},
                {account: "Assets:Alipay", amount: -258, currency: "CNY"},
            ],
        },
        {
            blockId: "b2", uuid: "u2", date: "2024-03-15", status: "cleared",
            payee: "海底捞", postings: [
                {account: "Expenses:Food:Dining", amount: 302, currency: "CNY"},
                {account: "Assets:WeChatPay", amount: -302, currency: "CNY"},
            ],
        },
        {
            blockId: "b3", uuid: "u3", date: "2024-03-12", status: "cleared",
            payee: "滴滴出行", postings: [
                {account: "Expenses:Transport:Taxi", amount: 32, currency: "CNY"},
                {account: "Assets:Alipay", amount: -32, currency: "CNY"},
            ],
        },
        {
            blockId: "b4", uuid: "u4", date: "2024-03-14", status: "cleared",
            payee: "海底捞火锅", postings: [
                {account: "Expenses:Food:Dining", amount: 199, currency: "CNY"},
                {account: "Assets:Cash", amount: -199, currency: "CNY"},
            ],
        },
    ];

    const ds = new DataService();

    it("builds payee history with correct count and totalAmount", () => {
        const history = ds.buildPayeeHistory(txns);
        expect(history["海底捞"]).toBeDefined();
        expect(history["海底捞"].count).toBe(2);
        expect(history["海底捞"].totalAmount).toBe(258 + 302);
    });

    it("tracks the most recent account and date", () => {
        const history = ds.buildPayeeHistory(txns);
        // 2024-03-15 is later, so lastDate should be that
        expect(history["海底捞"].lastDate).toBe("2024-03-15");
        expect(history["海底捞"].lastAccount).toBe("Expenses:Food:Dining");
    });

    it("correctly handles single-transaction payees", () => {
        const history = ds.buildPayeeHistory(txns);
        expect(history["滴滴出行"].count).toBe(1);
        expect(history["滴滴出行"].totalAmount).toBe(32);
        expect(history["滴滴出行"].lastAccount).toBe("Expenses:Transport:Taxi");
    });

    it("skips transactions without payee", () => {
        const txnsWithEmpty: ITransaction[] = [
            {
                blockId: "b5", uuid: "u5", date: "2024-03-20", status: "cleared",
                payee: "", postings: [
                    {account: "Expenses:Food:Dining", amount: 50, currency: "CNY"},
                    {account: "Assets:Cash", amount: -50, currency: "CNY"},
                ],
            },
        ];
        const history = ds.buildPayeeHistory(txnsWithEmpty);
        expect(Object.keys(history)).toHaveLength(0);
    });
});

describe("searchPayees", () => {
    const ds = new DataService();
    const txns: ITransaction[] = [
        {
            blockId: "b1", uuid: "u1", date: "2024-03-10", status: "cleared",
            payee: "海底捞", postings: [
                {account: "Expenses:Food:Dining", amount: 258, currency: "CNY"},
                {account: "Assets:Alipay", amount: -258, currency: "CNY"},
            ],
        },
        {
            blockId: "b2", uuid: "u2", date: "2024-03-11", status: "cleared",
            payee: "海底捞", postings: [
                {account: "Expenses:Food:Dining", amount: 300, currency: "CNY"},
                {account: "Assets:Alipay", amount: -300, currency: "CNY"},
            ],
        },
        {
            blockId: "b3", uuid: "u3", date: "2024-03-12", status: "cleared",
            payee: "海底捞火锅", postings: [
                {account: "Expenses:Food:Dining", amount: 199, currency: "CNY"},
                {account: "Assets:Cash", amount: -199, currency: "CNY"},
            ],
        },
        {
            blockId: "b4", uuid: "u4", date: "2024-03-13", status: "cleared",
            payee: "滴滴出行", postings: [
                {account: "Expenses:Transport:Taxi", amount: 32, currency: "CNY"},
                {account: "Assets:Alipay", amount: -32, currency: "CNY"},
            ],
        },
    ];

    // Set up cache with payee history
    ds.setCache({
        ...ds.getCache(),
        payeeHistory: ds.buildPayeeHistory(txns),
    });

    it("returns all payees sorted by count when query is empty", () => {
        const results = ds.searchPayees("");
        expect(results.length).toBe(3);
        expect(results[0]).toBe("海底捞"); // count=2, highest
    });

    it("filters by prefix match — 海 returns 海底捞 first then 海底捞火锅", () => {
        const results = ds.searchPayees("海");
        expect(results.length).toBe(2);
        expect(results).toContain("海底捞");
        expect(results).toContain("海底捞火锅");
    });

    it("filters by substring match", () => {
        const results = ds.searchPayees("底捞");
        expect(results.length).toBe(2);
    });

    it("returns empty array when no match", () => {
        const results = ds.searchPayees("xyz不存在");
        expect(results.length).toBe(0);
    });

    it("is case-insensitive for English payees", () => {
        // Add an English payee
        const cache = ds.getCache();
        cache.payeeHistory["Starbucks"] = {count: 5, totalAmount: 150, lastAccount: "Expenses:Food:Dining", lastDate: "2024-03-15"};
        ds.setCache(cache);

        const results = ds.searchPayees("star");
        expect(results).toContain("Starbucks");

        const results2 = ds.searchPayees("STAR");
        expect(results2).toContain("Starbucks");
    });

    it("respects the limit parameter", () => {
        const results = ds.searchPayees("", 2);
        expect(results.length).toBe(2);
    });
});

describe("getPayeeStats", () => {
    const ds = new DataService();
    const txns: ITransaction[] = [
        {
            blockId: "b1", uuid: "u1", date: "2024-03-10", status: "cleared",
            payee: "海底捞", postings: [
                {account: "Expenses:Food:Dining", amount: 258, currency: "CNY"},
                {account: "Assets:Alipay", amount: -258, currency: "CNY"},
            ],
        },
    ];
    ds.setCache({...ds.getCache(), payeeHistory: ds.buildPayeeHistory(txns)});

    it("returns stats for a known payee", () => {
        const stats = ds.getPayeeStats("海底捞");
        expect(stats).toBeDefined();
        expect(stats!.count).toBe(1);
        expect(stats!.totalAmount).toBe(258);
    });

    it("returns undefined for unknown payee", () => {
        expect(ds.getPayeeStats("未知商家")).toBeUndefined();
    });

    it("calculates average correctly", () => {
        const txns2: ITransaction[] = [
            {
                blockId: "b1", uuid: "u1", date: "2024-03-10", status: "cleared",
                payee: "TestPayee", postings: [
                    {account: "Expenses:Food:Dining", amount: 100, currency: "CNY"},
                    {account: "Assets:Alipay", amount: -100, currency: "CNY"},
                ],
            },
            {
                blockId: "b2", uuid: "u2", date: "2024-03-12", status: "cleared",
                payee: "TestPayee", postings: [
                    {account: "Expenses:Food:Dining", amount: 200, currency: "CNY"},
                    {account: "Assets:Alipay", amount: -200, currency: "CNY"},
                ],
            },
        ];
        const ds2 = new DataService();
        ds2.setCache({...ds2.getCache(), payeeHistory: ds2.buildPayeeHistory(txns2)});
        const stats = ds2.getPayeeStats("TestPayee");
        expect(stats).toBeDefined();
        const avg = stats!.totalAmount / stats!.count;
        expect(avg).toBe(150);
    });
});

// ─── buildNarrationHistory / searchNarrations ─────────────────────────────────

describe("buildNarrationHistory", () => {
    const txns: ITransaction[] = [
        {
            blockId: "b1", uuid: "u1", date: "2024-03-10", status: "cleared",
            payee: "海底捞", narration: "部门聚餐", postings: [
                {account: "Expenses:Food:Dining", amount: 258, currency: "CNY"},
                {account: "Assets:Alipay", amount: -258, currency: "CNY"},
            ],
        },
        {
            blockId: "b2", uuid: "u2", date: "2024-03-15", status: "cleared",
            payee: "星巴克", narration: "下午茶", postings: [
                {account: "Expenses:Food:Dining", amount: 42, currency: "CNY"},
                {account: "Assets:WeChatPay", amount: -42, currency: "CNY"},
            ],
        },
        {
            blockId: "b3", uuid: "u3", date: "2024-03-16", status: "cleared",
            payee: "海底捞", narration: "部门聚餐", postings: [
                {account: "Expenses:Food:Dining", amount: 300, currency: "CNY"},
                {account: "Assets:Alipay", amount: -300, currency: "CNY"},
            ],
        },
        {
            blockId: "b4", uuid: "u4", date: "2024-03-17", status: "cleared",
            payee: "滴滴出行", postings: [
                {account: "Expenses:Transport:Taxi", amount: 32, currency: "CNY"},
                {account: "Assets:Alipay", amount: -32, currency: "CNY"},
            ],
        },
    ];

    const ds = new DataService();

    it("builds narration history with correct counts", () => {
        const history = ds.buildNarrationHistory(txns);
        expect(history["部门聚餐"]).toBe(2);
        expect(history["下午茶"]).toBe(1);
    });

    it("skips transactions without narration", () => {
        const history = ds.buildNarrationHistory(txns);
        expect(Object.keys(history).length).toBe(2);
    });
});

describe("searchNarrations", () => {
    const txns: ITransaction[] = [
        {
            blockId: "b1", uuid: "u1", date: "2024-03-10", status: "cleared",
            payee: "海底捞", narration: "部门聚餐", postings: [
                {account: "Expenses:Food:Dining", amount: 258, currency: "CNY"},
                {account: "Assets:Alipay", amount: -258, currency: "CNY"},
            ],
        },
        {
            blockId: "b2", uuid: "u2", date: "2024-03-15", status: "cleared",
            payee: "星巴克", narration: "下午茶", postings: [
                {account: "Expenses:Food:Dining", amount: 42, currency: "CNY"},
                {account: "Assets:WeChatPay", amount: -42, currency: "CNY"},
            ],
        },
        {
            blockId: "b3", uuid: "u3", date: "2024-03-16", status: "cleared",
            payee: "海底捞", narration: "部门聚餐", postings: [
                {account: "Expenses:Food:Dining", amount: 300, currency: "CNY"},
                {account: "Assets:Alipay", amount: -300, currency: "CNY"},
            ],
        },
    ];

    const ds = new DataService();
    ds.setCache({...ds.getCache(), narrationHistory: ds.buildNarrationHistory(txns)});

    it("returns most used narrations when query is empty", () => {
        const results = ds.searchNarrations("");
        expect(results[0]).toBe("部门聚餐"); // count=2 > count=1
        expect(results).toContain("下午茶");
    });

    it("filters by substring match", () => {
        const results = ds.searchNarrations("聚餐");
        expect(results).toContain("部门聚餐");
        expect(results).not.toContain("下午茶");
    });

    it("returns empty for non-matching query", () => {
        const results = ds.searchNarrations("xyz不存在");
        expect(results.length).toBe(0);
    });

    it("respects limit", () => {
        const results = ds.searchNarrations("", 1);
        expect(results.length).toBe(1);
    });
});

// ─── buildTagHistory / searchTags ─────────────────────────────────────────────

describe("buildTagHistory", () => {
    const txns: ITransaction[] = [
        {
            blockId: "b1", uuid: "u1", date: "2024-03-10", status: "cleared",
            payee: "海底捞", tags: ["聚餐", "报销"], postings: [
                {account: "Expenses:Food:Dining", amount: 258, currency: "CNY"},
                {account: "Assets:Alipay", amount: -258, currency: "CNY"},
            ],
        },
        {
            blockId: "b2", uuid: "u2", date: "2024-03-15", status: "cleared",
            payee: "星巴克", tags: ["聚餐"], postings: [
                {account: "Expenses:Food:Dining", amount: 42, currency: "CNY"},
                {account: "Assets:WeChatPay", amount: -42, currency: "CNY"},
            ],
        },
        {
            blockId: "b3", uuid: "u3", date: "2024-03-16", status: "cleared",
            payee: "滴滴出行", postings: [
                {account: "Expenses:Transport:Taxi", amount: 32, currency: "CNY"},
                {account: "Assets:Alipay", amount: -32, currency: "CNY"},
            ],
        },
    ];

    const ds = new DataService();

    it("builds tag history with correct counts", () => {
        const history = ds.buildTagHistory(txns);
        expect(history["聚餐"]).toBe(2);
        expect(history["报销"]).toBe(1);
    });

    it("skips transactions without tags", () => {
        const history = ds.buildTagHistory(txns);
        expect(Object.keys(history).length).toBe(2);
    });
});

describe("searchTags", () => {
    const txns: ITransaction[] = [
        {
            blockId: "b1", uuid: "u1", date: "2024-03-10", status: "cleared",
            payee: "海底捞", tags: ["聚餐", "报销"], postings: [
                {account: "Expenses:Food:Dining", amount: 258, currency: "CNY"},
                {account: "Assets:Alipay", amount: -258, currency: "CNY"},
            ],
        },
        {
            blockId: "b2", uuid: "u2", date: "2024-03-15", status: "cleared",
            payee: "星巴克", tags: ["聚餐"], postings: [
                {account: "Expenses:Food:Dining", amount: 42, currency: "CNY"},
                {account: "Assets:WeChatPay", amount: -42, currency: "CNY"},
            ],
        },
        {
            blockId: "b3", uuid: "u3", date: "2024-03-16", status: "cleared",
            payee: "公司", tags: ["报销", "差旅"], postings: [
                {account: "Income:Reimbursement", amount: -380, currency: "CNY"},
                {account: "Assets:BankCard", amount: 380, currency: "CNY"},
            ],
        },
    ];

    const ds = new DataService();
    ds.setCache({...ds.getCache(), tagHistory: ds.buildTagHistory(txns)});

    it("returns most used tags when query is empty", () => {
        const results = ds.searchTags("");
        expect(results[0]).toBe("聚餐"); // count=2 is highest
    });

    it("filters by substring match", () => {
        const results = ds.searchTags("报");
        expect(results).toContain("报销");
        expect(results).not.toContain("聚餐");
    });

    it("returns empty for non-matching query", () => {
        const results = ds.searchTags("xyz不存在");
        expect(results.length).toBe(0);
    });

    it("respects limit", () => {
        const results = ds.searchTags("", 1);
        expect(results.length).toBe(1);
    });

    it("is case-insensitive for English tags", () => {
        const ds2 = new DataService();
        ds2.setCache({
            ...ds2.getCache(),
            tagHistory: {"Dinner": 3, "dining": 1, "Travel": 2},
        });
        const results = ds2.searchTags("din");
        expect(results).toContain("Dinner");
        expect(results).toContain("dining");
    });
});
