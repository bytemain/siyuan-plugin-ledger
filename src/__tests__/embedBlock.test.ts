import {describe, it, expect} from "vitest";
import {buildEmbedJsCode, buildEmbedBlockMarkdown, buildTransactionEmbedCode, attrsToTransactionData} from "../embedBlock";
import {
    ATTR_TYPE, ATTR_DATE, ATTR_STATUS, ATTR_PAYEE, ATTR_NARRATION,
    ATTR_POSTINGS, ATTR_TAGS, ATTR_UUID, TRANSACTION_TYPE_VALUE,
} from "../types";

describe("buildEmbedJsCode", () => {
    it("generates monthly query code with //!js prefix", () => {
        const code = buildEmbedJsCode({type: "monthly", param: "2024-03"});
        expect(code).toContain("//!js");
        expect(code).toContain("2024-03");
        expect(code).toContain(ATTR_TYPE);
        expect(code).toContain(TRANSACTION_TYPE_VALUE);
        expect(code).toContain(ATTR_DATE);
        expect(code).toContain("fetchSyncPost");
        expect(code).toContain("return query()");
    });

    it("generates monthly query with current month when no param given", () => {
        const code = buildEmbedJsCode({type: "monthly"});
        expect(code).toContain("//!js");
        const currentMonth = new Date().toISOString().slice(0, 7);
        expect(code).toContain(currentMonth);
    });

    it("generates recent query with default limit", () => {
        const code = buildEmbedJsCode({type: "recent"});
        expect(code).toContain("//!js");
        expect(code).toContain("LIMIT 20");
        expect(code).toContain("ORDER BY");
    });

    it("generates recent query with custom limit", () => {
        const code = buildEmbedJsCode({type: "recent", limit: 50});
        expect(code).toContain("LIMIT 50");
    });

    it("clamps recent limit to valid range", () => {
        const code1 = buildEmbedJsCode({type: "recent", limit: -5});
        expect(code1).toContain("LIMIT 1");

        const code2 = buildEmbedJsCode({type: "recent", limit: 200});
        expect(code2).toContain("LIMIT 100");
    });

    it("generates all query", () => {
        const code = buildEmbedJsCode({type: "all"});
        expect(code).toContain("//!js");
        expect(code).toContain(ATTR_TYPE);
        expect(code).toContain(TRANSACTION_TYPE_VALUE);
        expect(code).toContain("ORDER BY");
        expect(code).not.toContain("LIMIT");
    });

    it("generates byAccount query with account path", () => {
        const code = buildEmbedJsCode({type: "byAccount", param: "Expenses:Food"});
        expect(code).toContain("//!js");
        expect(code).toContain("Expenses:Food");
        expect(code).toContain("custom-ledger-postings");
    });

    it("generates byPayee query with payee name", () => {
        const code = buildEmbedJsCode({type: "byPayee", param: "海底捞"});
        expect(code).toContain("//!js");
        expect(code).toContain("海底捞");
        expect(code).toContain(ATTR_PAYEE);
    });

    it("escapes single quotes in SQL values", () => {
        const code = buildEmbedJsCode({type: "byPayee", param: "O'Brien"});
        // Should be double-escaped for SQL
        expect(code).toContain("O''Brien");
    });

    it("escapes LIKE wildcards in account path queries", () => {
        const code = buildEmbedJsCode({type: "byAccount", param: "Expenses:100%_Food"});
        expect(code).toContain("ESCAPE");
        // In the generated code string, % and _ are escaped with backslash for SQL LIKE
        expect(code).toContain("100\\%");
        expect(code).toContain("\\_Food");
    });

    it("returns all query for unknown type", () => {
        // @ts-expect-error: testing fallback for invalid type
        const code = buildEmbedJsCode({type: "unknown"});
        expect(code).toContain("//!js");
        expect(code).toContain(ATTR_TYPE);
    });
});

describe("buildEmbedBlockMarkdown", () => {
    it("wraps JS code in {{ }} with escaped newlines", () => {
        const jsCode = "//!js\nreturn [\"id1\"]";
        const md = buildEmbedBlockMarkdown(jsCode);
        expect(md.startsWith("{{")).toBe(true);
        expect(md.endsWith("}}")).toBe(true);
        // Newlines should be replaced with _esc_newline_
        expect(md).not.toContain("\n");
        expect(md).toContain("_esc_newline_");
    });

    it("produces valid embed block format for monthly query", () => {
        const jsCode = buildEmbedJsCode({type: "monthly", param: "2024-03"});
        const md = buildEmbedBlockMarkdown(jsCode);
        expect(md.startsWith("{{//!js")).toBe(true);
        expect(md.endsWith("}}")).toBe(true);
        expect(md).not.toContain("\n");
    });

    it("preserves the //!js shebang at the start", () => {
        const jsCode = buildEmbedJsCode({type: "all"});
        const md = buildEmbedBlockMarkdown(jsCode);
        // After {{ should be //!js
        expect(md.slice(2).startsWith("//!js")).toBe(true);
    });
});

describe("buildTransactionEmbedCode", () => {
    it("generates //!js code that calls Ledger.renderTransaction", () => {
        const code = buildTransactionEmbedCode();
        expect(code).toContain("//!js");
        expect(code).toContain("Ledger.renderTransaction");
        expect(code).toContain("return render()");
    });

    it("reads blockId from the DOM via closest('[data-node-id]')", () => {
        const code = buildTransactionEmbedCode();
        expect(code).toContain("item.closest('[data-node-id]')");
        expect(code).toContain("getAttribute('data-node-id')");
    });

    it("fetches IAL attributes via fetchSyncPost", () => {
        const code = buildTransactionEmbedCode();
        expect(code).toContain("fetchSyncPost");
        expect(code).toContain("/api/attr/getBlockAttrs");
    });

    it("does not embed transaction-specific data in the JS code", () => {
        const txWithData = {
            uuid: "test-uuid-1234",
            date: "2024-03-15",
            status: "cleared" as const,
            payee: "星巴克",
            narration: "拿铁",
            postings: [
                {account: "Expenses:Food:Coffee", amount: 32.5, currency: "CNY"},
                {account: "Assets:Alipay", amount: -32.5, currency: "CNY"},
            ],
            tags: ["daily"],
        };
        const code = buildTransactionEmbedCode(txWithData);
        // Transaction-specific data should NOT appear in the JS code
        expect(code).not.toContain("test-uuid-1234");
        expect(code).not.toContain("星巴克");
        expect(code).not.toContain("32.5");
        expect(code).not.toContain("Expenses:Food:Coffee");
    });

    it("generates identical code regardless of the transaction", () => {
        const code1 = buildTransactionEmbedCode({
            uuid: "a", date: "2024-01-01", status: "cleared",
            payee: "A", postings: [{account: "X", amount: 1, currency: "CNY"}],
        });
        const code2 = buildTransactionEmbedCode({
            uuid: "b", date: "2025-12-31", status: "pending",
            payee: "B", postings: [{account: "Y", amount: 999, currency: "USD"}],
        });
        expect(code1).toBe(code2);
    });

    it("works without any argument", () => {
        const code = buildTransactionEmbedCode();
        expect(code).toContain("//!js");
        expect(code).toContain("Ledger.renderTransaction");
    });

    it("guards against missing Ledger global", () => {
        const code = buildTransactionEmbedCode();
        expect(code).toContain("typeof Ledger");
    });

    it("works with buildEmbedBlockMarkdown to produce valid embed markdown", () => {
        const code = buildTransactionEmbedCode();
        const md = buildEmbedBlockMarkdown(code);
        expect(md.startsWith("{{")).toBe(true);
        expect(md.endsWith("}}")).toBe(true);
        expect(md).not.toContain("\n");
        expect(md).toContain("_esc_newline_");
    });

    it("returns [] so SiYuan does not render extra blocks", () => {
        const code = buildTransactionEmbedCode();
        expect(code).toContain("return []");
    });
});

describe("attrsToTransactionData", () => {
    const validAttrs: Record<string, string> = {
        [ATTR_TYPE]: TRANSACTION_TYPE_VALUE,
        [ATTR_DATE]: "2024-03-15",
        [ATTR_STATUS]: "cleared",
        [ATTR_PAYEE]: "星巴克",
        [ATTR_NARRATION]: "拿铁",
        [ATTR_POSTINGS]: JSON.stringify([
            {account: "Expenses:Food:Coffee", amount: 32.5, currency: "CNY"},
            {account: "Assets:Alipay", amount: -32.5, currency: "CNY"},
        ]),
        [ATTR_TAGS]: "daily,coffee",
        [ATTR_UUID]: "test-uuid-1234",
    };

    it("converts valid IAL attributes to ITransactionEmbedData", () => {
        const data = attrsToTransactionData(validAttrs);
        expect(data).not.toBeNull();
        expect(data!.date).toBe("2024-03-15");
        expect(data!.status).toBe("cleared");
        expect(data!.payee).toBe("星巴克");
        expect(data!.narration).toBe("拿铁");
        expect(data!.uuid).toBe("test-uuid-1234");
        expect(data!.postings).toHaveLength(2);
        expect(data!.postings[0].account).toBe("Expenses:Food:Coffee");
        expect(data!.postings[0].amount).toBe(32.5);
        expect(data!.tags).toEqual(["daily", "coffee"]);
    });

    it("returns null when ATTR_TYPE is missing", () => {
        const attrs = {...validAttrs};
        delete attrs[ATTR_TYPE];
        expect(attrsToTransactionData(attrs)).toBeNull();
    });

    it("returns null when ATTR_TYPE is not 'transaction'", () => {
        const attrs = {...validAttrs, [ATTR_TYPE]: "other"};
        expect(attrsToTransactionData(attrs)).toBeNull();
    });

    it("returns null when postings JSON is invalid", () => {
        const attrs = {...validAttrs, [ATTR_POSTINGS]: "not-json"};
        expect(attrsToTransactionData(attrs)).toBeNull();
    });

    it("handles empty postings", () => {
        const attrs = {...validAttrs, [ATTR_POSTINGS]: "[]"};
        const data = attrsToTransactionData(attrs);
        expect(data).not.toBeNull();
        expect(data!.postings).toEqual([]);
    });

    it("handles missing postings attribute", () => {
        const attrs = {...validAttrs};
        delete attrs[ATTR_POSTINGS];
        const data = attrsToTransactionData(attrs);
        expect(data).not.toBeNull();
        expect(data!.postings).toEqual([]);
    });

    it("handles empty tags", () => {
        const attrs = {...validAttrs, [ATTR_TAGS]: ""};
        const data = attrsToTransactionData(attrs);
        expect(data).not.toBeNull();
        expect(data!.tags).toEqual([]);
    });

    it("handles missing optional fields gracefully", () => {
        const minimal: Record<string, string> = {
            [ATTR_TYPE]: TRANSACTION_TYPE_VALUE,
        };
        const data = attrsToTransactionData(minimal);
        expect(data).not.toBeNull();
        expect(data!.date).toBe("");
        expect(data!.status).toBe("uncleared");
        expect(data!.payee).toBe("");
        expect(data!.narration).toBe("");
        expect(data!.postings).toEqual([]);
        expect(data!.tags).toEqual([]);
        expect(data!.uuid).toBe("");
    });

    it("trims whitespace from tag entries", () => {
        const attrs = {...validAttrs, [ATTR_TAGS]: " daily , coffee , "};
        const data = attrsToTransactionData(attrs);
        expect(data).not.toBeNull();
        expect(data!.tags).toEqual(["daily", "coffee"]);
    });
});
