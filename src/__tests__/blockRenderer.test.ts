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
});

// ─── buildHTMLBlockDOM ───────────────────────────────────────────────────────

describe("buildHTMLBlockDOM", () => {
    const tx: ITransaction = {
        blockId: "block-1",
        uuid: "uuid-1",
        date: "2024-03-15",
        status: "cleared",
        payee: "Test",
        narration: "",
        postings: [
            {account: "Expenses:Food", amount: 10, currency: "CNY"},
            {account: "Assets:Bank", amount: -10, currency: "CNY"},
        ],
        tags: [],
    };

    it("wraps content in NodeHTMLBlock DOM structure", () => {
        const dom = buildHTMLBlockDOM(tx, DEFAULT_CONFIG, i18n);
        expect(dom).toContain('data-type="NodeHTMLBlock"');
        expect(dom).toContain("render-node");
        expect(dom).toContain("protyle-html");
        expect(dom).toContain("data-content=");
        expect(dom).toContain("protyle-attr");
    });

    it("HTML-escapes the content for the data-content attribute", () => {
        const dom = buildHTMLBlockDOM(tx, DEFAULT_CONFIG, i18n);
        // The data-content attribute should contain HTML-escaped content
        // e.g., <style> becomes &lt;style&gt;
        expect(dom).toContain("&lt;style&gt;");
        expect(dom).toContain("&lt;div");
    });

    it("escapes content safely to prevent attribute injection", () => {
        const maliciousTx: ITransaction = {
            ...tx,
            payee: 'Test" onload="alert(1)',
        };
        const dom = buildHTMLBlockDOM(maliciousTx, DEFAULT_CONFIG, i18n);
        // The quote should be double-escaped so it can't break out of data-content
        expect(dom).not.toContain('onload="alert');
    });
});
