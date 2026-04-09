import {describe, it, expect} from "vitest";
import {parseLedgerFile} from "../importService";
import {parseBeancountFile} from "../importService";
import {parseCSV} from "../importService";

// ─── parseLedgerFile ──────────────────────────────────────────────────────────

describe("parseLedgerFile", () => {
    it("parses a simple cleared transaction", () => {
        const input = `2024/03/15 * 海底捞
    Expenses:Food:Dining    ¥258.00
    Assets:Alipay
`;
        const {transactions, errors} = parseLedgerFile(input);
        expect(errors).toHaveLength(0);
        expect(transactions).toHaveLength(1);
        const tx = transactions[0];
        expect(tx.date).toBe("2024-03-15");
        expect(tx.status).toBe("cleared");
        expect(tx.payee).toBe("海底捞");
    });

    it("parses a pending transaction with ! mark", () => {
        const input = `2024-03-16 ! Taxi
    Expenses:Transport:Taxi    ¥32.00
    Assets:WeChatPay
`;
        const {transactions} = parseLedgerFile(input);
        expect(transactions[0].status).toBe("pending");
    });

    it("parses an uncleared transaction (no mark)", () => {
        const input = `2024-03-17 Shop
    Expenses:Shopping:Daily    ¥50.00
    Assets:Cash
`;
        const {transactions} = parseLedgerFile(input);
        expect(transactions[0].status).toBe("uncleared");
    });

    it("auto-balances last posting with zero amount", () => {
        const input = `2024/03/15 * Test
    Expenses:Food:Dining    ¥100.00
    Assets:Alipay
`;
        const {transactions} = parseLedgerFile(input);
        const alipay = transactions[0].postings.find(p => p.account === "Assets:Alipay");
        expect(alipay?.amount).toBe(-100);
    });

    it("parses CNY symbol ¥ amounts", () => {
        const input = `2024/03/15 * Shop
    Expenses:Food    ¥123.45
    Assets:Cash
`;
        const {transactions} = parseLedgerFile(input);
        expect(transactions[0].postings[0].amount).toBe(123.45);
        expect(transactions[0].postings[0].currency).toBe("CNY");
    });

    it("parses USD symbol $ amounts", () => {
        const input = `2024/04/01 * Amazon
    Expenses:Shopping    $29.99
    Assets:Bank
`;
        const {transactions} = parseLedgerFile(input);
        expect(transactions[0].postings[0].amount).toBeCloseTo(29.99);
        expect(transactions[0].postings[0].currency).toBe("USD");
    });

    it("parses amounts with currency code suffix", () => {
        const input = `2024/04/01 * Test
    Expenses:Misc    100.00 EUR
    Assets:Bank
`;
        const {transactions} = parseLedgerFile(input);
        expect(transactions[0].postings[0].amount).toBe(100);
        expect(transactions[0].postings[0].currency).toBe("EUR");
    });

    it("extracts narration from ; comment line", () => {
        const input = `2024/03/15 * 海底捞
    ; 部门聚餐
    Expenses:Food    ¥258.00
    Assets:Alipay
`;
        const {transactions} = parseLedgerFile(input);
        expect(transactions[0].narration).toContain("部门聚餐");
    });

    it("extracts tags from :tag1:tag2: comment format", () => {
        const input = `2024/03/15 * 海底捞
    ; :聚餐:报销:
    Expenses:Food    ¥258.00
    Assets:Alipay
`;
        const {transactions} = parseLedgerFile(input);
        expect(transactions[0].tags).toContain("聚餐");
        expect(transactions[0].tags).toContain("报销");
    });

    it("parses multiple transactions separated by blank lines", () => {
        const input = `2024/03/15 * 海底捞
    Expenses:Food    ¥258.00
    Assets:Alipay

2024/03/16 ! Taxi
    Expenses:Transport    ¥32.00
    Assets:WeChatPay

`;
        const {transactions} = parseLedgerFile(input);
        expect(transactions).toHaveLength(2);
    });

    it("returns an empty array for empty input", () => {
        const {transactions} = parseLedgerFile("");
        expect(transactions).toHaveLength(0);
    });

    it("ignores comment-only lines starting with ;", () => {
        const input = `; This is a file comment
2024/03/15 * Test
    Expenses:Misc    ¥10.00
    Assets:Cash
`;
        const {transactions} = parseLedgerFile(input);
        expect(transactions).toHaveLength(1);
    });

    it("generates a UUID for each parsed transaction", () => {
        const input = `2024/03/15 * Test
    Expenses:Misc    ¥10.00
    Assets:Cash
`;
        const {transactions} = parseLedgerFile(input);
        expect(transactions[0].uuid).toMatch(/^[0-9a-f-]{36}$/);
    });
});

// ─── parseBeancountFile ───────────────────────────────────────────────────────

describe("parseBeancountFile", () => {
    it("parses a simple cleared transaction", () => {
        const input = `2024-03-15 * "海底捞" "部门聚餐"
  Expenses:Food:Dining    258.00 CNY
  Assets:Alipay          -258.00 CNY
`;
        const {transactions, errors} = parseBeancountFile(input);
        expect(errors).toHaveLength(0);
        expect(transactions).toHaveLength(1);
        const tx = transactions[0];
        expect(tx.date).toBe("2024-03-15");
        expect(tx.status).toBe("cleared");
        expect(tx.payee).toBe("海底捞");
        expect(tx.narration).toBe("部门聚餐");
    });

    it("parses a pending transaction with ! mark", () => {
        const input = `2024-03-16 ! "Taxi" ""
  Expenses:Transport    32.00 CNY
  Assets:WeChatPay     -32.00 CNY
`;
        const {transactions} = parseBeancountFile(input);
        expect(transactions[0].status).toBe("pending");
    });

    it("parses amounts and currencies correctly", () => {
        const input = `2024-03-15 * "Shop" ""
  Expenses:Shopping    258.00 CNY
  Assets:Alipay       -258.00 CNY
`;
        const {transactions} = parseBeancountFile(input);
        const postings = transactions[0].postings;
        expect(postings[0].amount).toBe(258);
        expect(postings[0].currency).toBe("CNY");
        expect(postings[1].amount).toBe(-258);
    });

    it("parses open directives into accounts", () => {
        const input = `2020-01-01 open Assets:Alipay CNY
2020-01-01 open Expenses:Food:Dining CNY

2024-03-15 * "Test" ""
  Expenses:Food:Dining    100.00 CNY
  Assets:Alipay          -100.00 CNY
`;
        const {accounts} = parseBeancountFile(input);
        expect(accounts).toHaveLength(2);
        expect(accounts.find(a => a.path === "Assets:Alipay")).toBeDefined();
    });

    it("extracts account type from the first segment of the path", () => {
        const input = `2020-01-01 open Liabilities:CreditCard CNY
`;
        const {accounts} = parseBeancountFile(input);
        expect(accounts[0].type).toBe("Liabilities");
    });

    it("extracts #tags from transaction header", () => {
        const input = `2024-03-15 * "海底捞" "聚餐" #工作 #报销
  Expenses:Food    258.00 CNY
  Assets:Alipay   -258.00 CNY
`;
        const {transactions} = parseBeancountFile(input);
        expect(transactions[0].tags).toContain("工作");
        expect(transactions[0].tags).toContain("报销");
    });

    it("parses multiple transactions", () => {
        const input = `2024-03-15 * "A" ""
  Expenses:Food    100.00 CNY
  Assets:Cash     -100.00 CNY

2024-03-16 * "B" ""
  Expenses:Transport    50.00 CNY
  Assets:Cash          -50.00 CNY

`;
        const {transactions} = parseBeancountFile(input);
        expect(transactions).toHaveLength(2);
    });

    it("returns empty arrays for empty input", () => {
        const {transactions, accounts} = parseBeancountFile("");
        expect(transactions).toHaveLength(0);
        expect(accounts).toHaveLength(0);
    });

    it("generates a UUID for each parsed transaction", () => {
        const input = `2024-03-15 * "Test" ""
  Expenses:Misc    10.00 CNY
  Assets:Cash     -10.00 CNY
`;
        const {transactions} = parseBeancountFile(input);
        expect(transactions[0].uuid).toMatch(/^[0-9a-f-]{36}$/);
    });
});

// ─── parseCSV ─────────────────────────────────────────────────────────────────

describe("parseCSV", () => {
    const CSV_CONTENT = [
        "Date,Status,Payee,Narration,Account,Amount,Currency,Tags",
        "2024-03-15,cleared,海底捞,部门聚餐,Expenses:Food:Dining,258.00,CNY,\"聚餐,报销\"",
        "2024-03-15,cleared,海底捞,部门聚餐,Assets:Alipay,-258.00,CNY,\"聚餐,报销\"",
        "2024-03-16,pending,Taxi,,Expenses:Transport:Taxi,32.00,CNY,",
        "2024-03-16,pending,Taxi,,Assets:WeChatPay,-32.00,CNY,",
    ].join("\n");

    it("groups rows by date+payee+narration into transactions", () => {
        const txns = parseCSV(CSV_CONTENT);
        expect(txns).toHaveLength(2);
    });

    it("parses postings correctly", () => {
        const txns = parseCSV(CSV_CONTENT);
        const dining = txns.find(t => t.payee === "海底捞");
        expect(dining?.postings).toHaveLength(2);
        expect(dining?.postings[0].amount).toBe(258);
        expect(dining?.postings[1].amount).toBe(-258);
    });

    it("parses tags from comma-separated string", () => {
        const txns = parseCSV(CSV_CONTENT);
        const dining = txns.find(t => t.payee === "海底捞");
        expect(dining?.tags).toContain("聚餐");
        expect(dining?.tags).toContain("报销");
    });

    it("handles quoted fields with embedded commas", () => {
        const csv = [
            "Date,Status,Payee,Narration,Account,Amount,Currency,Tags",
            "\"2024-03-15\",cleared,\"Café, Paris\",,Expenses:Misc,100.00,CNY,",
        ].join("\n");
        const txns = parseCSV(csv);
        expect(txns[0].payee).toBe("Café, Paris");
    });

    it("handles quoted fields with escaped double quotes", () => {
        const csv = [
            "Date,Status,Payee,Narration,Account,Amount,Currency,Tags",
            "2024-03-15,cleared,\"Say \"\"hi\"\"\",test,Expenses:Misc,10.00,CNY,",
        ].join("\n");
        const txns = parseCSV(csv);
        expect(txns[0].payee).toBe('Say "hi"');
    });

    it("returns empty array for header-only CSV", () => {
        const txns = parseCSV("Date,Status,Payee,Narration,Account,Amount,Currency,Tags");
        expect(txns).toHaveLength(0);
    });

    it("returns empty array for completely empty input", () => {
        expect(parseCSV("")).toHaveLength(0);
    });

    it("generates a UUID for each parsed transaction", () => {
        const txns = parseCSV(CSV_CONTENT);
        for (const tx of txns) {
            expect(tx.uuid).toMatch(/^[0-9a-f-]{36}$/);
        }
    });
});
