import {describe, it, expect} from "vitest";
import {exportToLedger, exportToBeancount, exportToCSV} from "../exportService";
import {ITransaction, IAccount, DEFAULT_CONFIG} from "../types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SIMPLE_TX: ITransaction = {
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

const PENDING_TX: ITransaction = {
    blockId: "block-2",
    uuid: "uuid-2",
    date: "2024-03-16",
    status: "pending",
    payee: "Taxi",
    narration: "",
    tags: [],
    postings: [
        {account: "Expenses:Transport:Taxi", amount: 32, currency: "CNY"},
        {account: "Assets:WeChatPay", amount: -32, currency: "CNY"},
    ],
};

const UNCLEARED_TX: ITransaction = {
    blockId: "block-3",
    uuid: "uuid-3",
    date: "2024-03-17",
    status: "uncleared",
    payee: "Shop",
    narration: "",
    tags: [],
    postings: [
        {account: "Expenses:Shopping:Daily", amount: 50, currency: "CNY"},
        {account: "Assets:Cash", amount: -50, currency: "CNY"},
    ],
};

const USD_TX: ITransaction = {
    blockId: "block-4",
    uuid: "uuid-4",
    date: "2024-04-01",
    status: "cleared",
    payee: "Amazon",
    narration: "book",
    tags: [],
    postings: [
        {account: "Expenses:Shopping:Digital", amount: 29.99, currency: "USD"},
        {account: "Assets:Bank:Checking", amount: -29.99, currency: "USD"},
    ],
};

const ACCOUNTS: IAccount[] = [
    {
        path: "Expenses:Food:Dining",
        type: "Expenses",
        currencies: ["CNY"],
        openDate: "2020-01-01",
    },
    {
        path: "Assets:Alipay",
        type: "Assets",
        currencies: ["CNY"],
        openDate: "2021-06-01",
    },
];

// ─── exportToLedger ───────────────────────────────────────────────────────────

describe("exportToLedger", () => {
    it("outputs cleared transaction with * mark", () => {
        const out = exportToLedger([SIMPLE_TX], DEFAULT_CONFIG);
        expect(out).toContain("2024/03/15 * 海底捞");
    });

    it("outputs pending transaction with ! mark", () => {
        const out = exportToLedger([PENDING_TX], DEFAULT_CONFIG);
        expect(out).toContain("2024/03/16 ! Taxi");
    });

    it("outputs uncleared transaction without mark", () => {
        const out = exportToLedger([UNCLEARED_TX], DEFAULT_CONFIG);
        expect(out).toContain("2024/03/17 Shop");
        expect(out).not.toContain("2024/03/17 * Shop");
        expect(out).not.toContain("2024/03/17 ! Shop");
    });

    it("converts date separator from - to /", () => {
        const out = exportToLedger([SIMPLE_TX], DEFAULT_CONFIG);
        expect(out).toContain("2024/03/15");
        expect(out).not.toContain("2024-03-15");
    });

    it("uses currency symbol for CNY", () => {
        const out = exportToLedger([SIMPLE_TX], DEFAULT_CONFIG);
        expect(out).toContain("¥258.00");
    });

    it("uses currency symbol for USD", () => {
        const out = exportToLedger([USD_TX], DEFAULT_CONFIG);
        expect(out).toContain("$29.99");
    });

    it("includes narration as a comment line", () => {
        const out = exportToLedger([SIMPLE_TX], DEFAULT_CONFIG);
        expect(out).toContain("; 部门聚餐");
    });

    it("includes tags in Ledger tag format", () => {
        const out = exportToLedger([SIMPLE_TX], DEFAULT_CONFIG);
        expect(out).toContain("; :聚餐:报销:");
    });

    it("omits the last posting's amount (Ledger auto-balance)", () => {
        const out = exportToLedger([SIMPLE_TX], DEFAULT_CONFIG);
        // Second posting (Assets:Alipay) should appear without an amount
        const lines = out.split("\n");
        const alipayLine = lines.find(l => l.includes("Assets:Alipay"));
        expect(alipayLine).toBeDefined();
        expect(alipayLine).not.toMatch(/¥/);
    });

    it("sorts transactions by date ascending", () => {
        const out = exportToLedger([PENDING_TX, SIMPLE_TX], DEFAULT_CONFIG);
        const pos1 = out.indexOf("2024/03/15");
        const pos2 = out.indexOf("2024/03/16");
        expect(pos1).toBeLessThan(pos2);
    });

    it("separates transactions with blank lines", () => {
        const out = exportToLedger([SIMPLE_TX, PENDING_TX], DEFAULT_CONFIG);
        expect(out).toMatch(/\n\n/);
    });
});

// ─── exportToBeancount ───────────────────────────────────────────────────────

describe("exportToBeancount", () => {
    it("includes option header", () => {
        const out = exportToBeancount([SIMPLE_TX], ACCOUNTS, DEFAULT_CONFIG);
        expect(out).toContain("option \"title\"");
        expect(out).toContain("option \"operating_currency\" \"CNY\"");
    });

    it("outputs open directives for used accounts", () => {
        const out = exportToBeancount([SIMPLE_TX], ACCOUNTS, DEFAULT_CONFIG);
        expect(out).toContain("open Assets:Alipay");
        expect(out).toContain("open Expenses:Food:Dining");
    });

    it("uses account openDate from accounts list", () => {
        const out = exportToBeancount([SIMPLE_TX], ACCOUNTS, DEFAULT_CONFIG);
        // Assets:Alipay has openDate 2021-06-01
        expect(out).toContain("2021-06-01 open Assets:Alipay");
    });

    it("uses default open date for unknown accounts", () => {
        const out = exportToBeancount([SIMPLE_TX], [], DEFAULT_CONFIG);
        expect(out).toContain("2020-01-01 open");
    });

    it("outputs cleared transaction with * mark", () => {
        const out = exportToBeancount([SIMPLE_TX], ACCOUNTS, DEFAULT_CONFIG);
        expect(out).toContain("2024-03-15 * \"海底捞\" \"部门聚餐\"");
    });

    it("outputs pending transaction with ! mark", () => {
        const out = exportToBeancount([PENDING_TX], [], DEFAULT_CONFIG);
        expect(out).toContain("2024-03-16 ! \"Taxi\"");
    });

    it("outputs amounts in Beancount format: number then currency code", () => {
        const out = exportToBeancount([SIMPLE_TX], ACCOUNTS, DEFAULT_CONFIG);
        expect(out).toContain("258.00 CNY");
        expect(out).toContain("-258.00 CNY");
    });

    it("outputs tags as #tag format", () => {
        const out = exportToBeancount([SIMPLE_TX], ACCOUNTS, DEFAULT_CONFIG);
        expect(out).toContain("#聚餐");
        expect(out).toContain("#报销");
    });

    it("keeps ISO date format YYYY-MM-DD", () => {
        const out = exportToBeancount([SIMPLE_TX], ACCOUNTS, DEFAULT_CONFIG);
        expect(out).toContain("2024-03-15");
        expect(out).not.toContain("2024/03/15");
    });
});

// ─── exportToCSV ─────────────────────────────────────────────────────────────

describe("exportToCSV", () => {
    it("starts with the correct header row", () => {
        const out = exportToCSV([SIMPLE_TX]);
        const firstLine = out.split("\n")[0];
        expect(firstLine).toBe("Date,Status,Payee,Narration,Account,Amount,Currency,Tags");
    });

    it("outputs one row per posting", () => {
        const out = exportToCSV([SIMPLE_TX]);
        const lines = out.split("\n").filter(Boolean);
        // 1 header + 2 postings
        expect(lines).toHaveLength(3);
    });

    it("correctly escapes payees with commas in quoted field", () => {
        const txWithComma: ITransaction = {
            ...SIMPLE_TX,
            payee: "Café, Paris",
            narration: "",
            tags: [],
        };
        const out = exportToCSV([txWithComma]);
        expect(out).toContain('"Café, Paris"');
    });

    it("correctly escapes double quotes inside values", () => {
        const txWithQuote: ITransaction = {
            ...SIMPLE_TX,
            payee: 'Say "hi"',
            narration: "",
            tags: [],
        };
        const out = exportToCSV([txWithQuote]);
        expect(out).toContain('"Say ""hi"""');
    });

    it("formats amounts to 2 decimal places", () => {
        const out = exportToCSV([SIMPLE_TX]);
        expect(out).toContain("258.00");
        expect(out).toContain("-258.00");
    });

    it("includes comma-separated tags in the Tags column", () => {
        const out = exportToCSV([SIMPLE_TX]);
        expect(out).toContain('"聚餐,报销"');
    });

    it("sorts transactions by date ascending", () => {
        const out = exportToCSV([PENDING_TX, SIMPLE_TX]);
        const lines = out.split("\n").filter(Boolean).slice(1); // skip header
        expect(lines[0]).toContain("2024-03-15");
        expect(lines[lines.length - 1]).toContain("2024-03-16");
    });
});
