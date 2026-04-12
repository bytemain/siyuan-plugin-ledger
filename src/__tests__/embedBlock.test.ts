import {describe, it, expect} from "vitest";
import {buildEmbedJsCode, buildEmbedBlockMarkdown} from "../embedBlock";
import {ATTR_TYPE, ATTR_DATE, ATTR_PAYEE, TRANSACTION_TYPE_VALUE} from "../types";

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
