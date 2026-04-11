import {describe, it, expect} from "vitest";
import {buildTransactionCardHTML, buildHTMLBlockContent, buildHTMLBlockDOM} from "../blockRenderer";
import {DEFAULT_CONFIG} from "../types";
import type {IPosting, ITransaction} from "../types";

const i18n: Record<string, string> = {
    cleared: "已确认",
    pending: "待确认",
    uncleared: "未确认",
    editTransaction: "编辑交易",
    deleteTransaction: "删除交易",
};

// ─── buildTransactionCardHTML ─────────────────────────────────────────────────

describe("buildTransactionCardHTML", () => {
    const expensePostings: IPosting[] = [
        {account: "Expenses:Food:Dining", amount: 32.5, currency: "CNY"},
        {account: "Assets:Alipay", amount: -32.5, currency: "CNY"},
    ];

    const incomePostings: IPosting[] = [
        {account: "Assets:Bank", amount: 5000, currency: "CNY"},
        {account: "Income:Salary", amount: -5000, currency: "CNY"},
    ];

    const transferPostings: IPosting[] = [
        {account: "Assets:Bank", amount: 1000, currency: "CNY"},
        {account: "Assets:WeChat", amount: -1000, currency: "CNY"},
    ];

    it("generates HTML for an expense transaction", () => {
        const html = buildTransactionCardHTML(
            "2024-03-15", "cleared", "Coffee", "Morning coffee",
            expensePostings, ["dining"], DEFAULT_CONFIG, i18n,
        );
        expect(html).toContain("ledger-card--expense");
        expect(html).toContain("2024-03-15");
        expect(html).toContain("Coffee");
        expect(html).toContain("¥32.50");
        expect(html).toContain("ledger-card-amount--expense");
        expect(html).toContain("Morning coffee");
        expect(html).toContain("dining");
    });

    it("generates HTML for an income transaction", () => {
        const html = buildTransactionCardHTML(
            "2024-03-15", "cleared", "Company", "",
            incomePostings, [], DEFAULT_CONFIG, i18n,
        );
        expect(html).toContain("ledger-card--income");
        expect(html).toContain("Company");
        expect(html).toContain("¥5000.00");
        expect(html).toContain("ledger-card-amount--income");
    });

    it("generates HTML for a transfer transaction", () => {
        const html = buildTransactionCardHTML(
            "2024-03-15", "pending", "Transfer", "",
            transferPostings, [], DEFAULT_CONFIG, i18n,
        );
        expect(html).toContain("ledger-card--transfer");
        expect(html).toContain("ledger-card-amount--transfer");
    });

    it("includes edit and delete action buttons", () => {
        const html = buildTransactionCardHTML(
            "2024-03-15", "cleared", "Test", "",
            expensePostings, [], DEFAULT_CONFIG, i18n,
        );
        expect(html).toContain('data-action="edit"');
        expect(html).toContain('data-action="delete"');
        expect(html).toContain("✏️");
        expect(html).toContain("🗑️");
    });

    it("renders status badges correctly", () => {
        const clearedHtml = buildTransactionCardHTML(
            "2024-03-15", "cleared", "Test", "",
            expensePostings, [], DEFAULT_CONFIG, i18n,
        );
        expect(clearedHtml).toContain("ledger-card-status--cleared");
        expect(clearedHtml).toContain("✓");

        const pendingHtml = buildTransactionCardHTML(
            "2024-03-15", "pending", "Test", "",
            expensePostings, [], DEFAULT_CONFIG, i18n,
        );
        expect(pendingHtml).toContain("ledger-card-status--pending");
        expect(pendingHtml).toContain("?");

        const unclearedHtml = buildTransactionCardHTML(
            "2024-03-15", "uncleared", "Test", "",
            expensePostings, [], DEFAULT_CONFIG, i18n,
        );
        expect(unclearedHtml).toContain("ledger-card-status--uncleared");
        expect(unclearedHtml).toContain("~");
    });

    it("shows posting details with icons", () => {
        const html = buildTransactionCardHTML(
            "2024-03-15", "cleared", "Test", "",
            expensePostings, [], DEFAULT_CONFIG, i18n,
        );
        expect(html).toContain("📤"); // positive amount
        expect(html).toContain("📥"); // negative amount
        expect(html).toContain("Food:Dining");
        expect(html).toContain("¥-32.50");
    });

    it("renders multiple tags as separate spans", () => {
        const html = buildTransactionCardHTML(
            "2024-03-15", "cleared", "Test", "",
            expensePostings, ["dining", "work", "reimbursable"], DEFAULT_CONFIG, i18n,
        );
        expect(html).toContain("🏷️");
        expect(html).toContain("dining");
        expect(html).toContain("work");
        expect(html).toContain("reimbursable");
        // Each tag in its own span (class appears on container + each tag span)
        expect((html.match(/ledger-card-tag"/g) || []).length).toBe(3);
    });

    it("hides tags and narration sections when empty", () => {
        const html = buildTransactionCardHTML(
            "2024-03-15", "cleared", "Test", "",
            expensePostings, [], DEFAULT_CONFIG, i18n,
        );
        expect(html).not.toContain("🏷️");
        expect(html).not.toContain("ledger-card-narration");
    });

    it("escapes HTML special characters in payee and narration", () => {
        const html = buildTransactionCardHTML(
            "2024-03-15", "cleared", "<script>alert('xss')</script>", "A & B \"test\"",
            expensePostings, [], DEFAULT_CONFIG, i18n,
        );
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
        expect(html).toContain("A &amp; B &quot;test&quot;");
    });

    it("uses currency symbols from config", () => {
        const usdPostings: IPosting[] = [
            {account: "Expenses:Food", amount: 10, currency: "USD"},
            {account: "Assets:Bank", amount: -10, currency: "USD"},
        ];
        const html = buildTransactionCardHTML(
            "2024-03-15", "cleared", "Test", "",
            usdPostings, [], DEFAULT_CONFIG, i18n,
        );
        expect(html).toContain("$10.00");
    });
});

// ─── buildHTMLBlockContent ───────────────────────────────────────────────────

describe("buildHTMLBlockContent", () => {
    const tx: ITransaction = {
        blockId: "block-1",
        uuid: "uuid-1",
        date: "2024-03-15",
        status: "cleared",
        payee: "Coffee Shop",
        narration: "Latte",
        postings: [
            {account: "Expenses:Food", amount: 5, currency: "CNY"},
            {account: "Assets:Cash", amount: -5, currency: "CNY"},
        ],
        tags: ["coffee"],
    };

    it("includes embedded <style> block with card CSS", () => {
        const html = buildHTMLBlockContent(tx, DEFAULT_CONFIG, i18n);
        expect(html).toContain("<style>");
        expect(html).toContain("ledger-tx-card");
        expect(html).toContain("ledger-card--expense");
    });

    it("includes the card HTML after the style block", () => {
        const html = buildHTMLBlockContent(tx, DEFAULT_CONFIG, i18n);
        expect(html).toContain("Coffee Shop");
        expect(html).toContain("¥5.00");
        expect(html).toContain("coffee");
    });

    it("wraps content in a container div", () => {
        const html = buildHTMLBlockContent(tx, DEFAULT_CONFIG, i18n);
        // Must start with <div to be recognised as an HTML block by Lute
        expect(html).toMatch(/^<div class="ledger-tx-wrapper">/);
        expect(html).toMatch(/<\/div>$/);
    });

    it("does not contain blank lines (critical for Lute HTML block parsing)", () => {
        const html = buildHTMLBlockContent(tx, DEFAULT_CONFIG, i18n);
        // Blank lines would cause Lute to split this into multiple blocks
        const lines = html.split("\n");
        const hasBlankLine = lines.some(line => line.trim() === "");
        expect(hasBlankLine).toBe(false);
    });

    it("escapes content safely to prevent XSS", () => {
        const maliciousTx: ITransaction = {
            ...tx,
            payee: '<script>alert("xss")</script>',
        };
        const html = buildHTMLBlockContent(maliciousTx, DEFAULT_CONFIG, i18n);
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });
});

// ─── buildHTMLBlockDOM ───────────────────────────────────────────────────────

describe("buildHTMLBlockDOM", () => {
    const tx: ITransaction = {
        blockId: "20240315120000-abcdefg",
        uuid: "uuid-1",
        date: "2024-03-15",
        status: "cleared",
        payee: "Coffee Shop",
        narration: "Latte",
        postings: [
            {account: "Expenses:Food", amount: 5, currency: "CNY"},
            {account: "Assets:Cash", amount: -5, currency: "CNY"},
        ],
        tags: ["coffee"],
    };

    it("produces valid NodeHTMLBlock protyle DOM structure", () => {
        const dom = buildHTMLBlockDOM(tx, DEFAULT_CONFIG, i18n);
        expect(dom).toContain('data-type="NodeHTMLBlock"');
        expect(dom).toContain('class="render-node"');
        expect(dom).toContain('data-subtype="block"');
    });

    it("includes protyle-icons div", () => {
        const dom = buildHTMLBlockDOM(tx, DEFAULT_CONFIG, i18n);
        expect(dom).toContain('class="protyle-icons"');
        expect(dom).toContain("protyle-action__edit");
        expect(dom).toContain("protyle-action__menu");
    });

    it("includes protyle-html element with double-escaped data-content", () => {
        const dom = buildHTMLBlockDOM(tx, DEFAULT_CONFIG, i18n);
        expect(dom).toContain("<protyle-html");
        expect(dom).toContain("data-content=");
        // Content must be double-escaped for SiYuan's DOM string format:
        // 1st layer: content encoding (< → &lt;)
        // 2nd layer: attribute encoding (&lt; → &amp;lt;)
        // This ensures Lute's parser decodes one layer, leaving the content
        // encoding intact for protyle-html's UnEscapeHTMLStr.
        expect(dom).toContain("&amp;lt;div class=&amp;quot;ledger-tx-wrapper&amp;quot;&amp;gt;");
    });

    it("includes protyle-attr div", () => {
        const dom = buildHTMLBlockDOM(tx, DEFAULT_CONFIG, i18n);
        expect(dom).toContain('class="protyle-attr"');
        expect(dom).toContain('contenteditable="false"');
    });

    it("uses empty data-node-id for insert (no blockId provided)", () => {
        const dom = buildHTMLBlockDOM(tx, DEFAULT_CONFIG, i18n);
        // When no blockId argument, data-node-id is empty
        expect(dom).toContain('data-node-id=""');
    });

    it("uses provided blockId in data-node-id for updates", () => {
        const dom = buildHTMLBlockDOM(tx, DEFAULT_CONFIG, i18n, "20240315120000-abcdefg");
        expect(dom).toContain('data-node-id="20240315120000-abcdefg"');
    });

    it("contains zero-width spaces (\\u200b) matching Lute output", () => {
        const dom = buildHTMLBlockDOM(tx, DEFAULT_CONFIG, i18n);
        expect(dom).toContain("\u200b");
    });
});
