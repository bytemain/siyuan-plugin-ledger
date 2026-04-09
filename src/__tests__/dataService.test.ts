import {describe, it, expect} from "vitest";
import {parseIAL, blockRowToTransaction, generateUUID, buildBlockContent} from "../dataService";
import {
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
