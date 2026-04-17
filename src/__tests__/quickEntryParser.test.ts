import {describe, it, expect} from "vitest";
import {parseQuickLine} from "../quickEntryDialog";
import {DataService} from "../dataService";
import {DEFAULT_CONFIG} from "../types";

// Create a DataService instance for testing
function createTestDS(): DataService {
    const ds = new DataService();
    ds.setConfig({...DEFAULT_CONFIG});
    return ds;
}

// ─── Standard expense parsing ─────────────────────────────────────────────────

describe("parseQuickLine — standard expenses", () => {
    it("parses basic 'payee amount' format", () => {
        const ds = createTestDS();
        const result = parseQuickLine("午饭 58", ds);
        expect(result).not.toBeNull();
        expect(result!.payee).toBe("午饭");
        expect(result!.postings).toHaveLength(2);
        expect(result!.postings![0].amount).toBe(58);
        expect(result!.postings![0].account).toBe("Expenses:Food:Dining");
        expect(result!.postings![1].amount).toBe(-58);
        expect(result!.postings![1].account).toBe("Assets:Alipay"); // default debit
    });

    it("parses 'payee amount account-alias' format", () => {
        const ds = createTestDS();
        const result = parseQuickLine("打车 32 微信", ds);
        expect(result).not.toBeNull();
        expect(result!.payee).toBe("打车");
        expect(result!.postings![1].account).toBe("Assets:WeChatPay");
    });

    it("parses with date prefix", () => {
        const ds = createTestDS();
        const result = parseQuickLine("2024-03-15 海底捞 258 信用卡", ds);
        expect(result).not.toBeNull();
        expect(result!.date).toBe("2024-03-15");
        expect(result!.payee).toBe("海底捞");
        expect(result!.postings![0].amount).toBe(258);
        expect(result!.postings![1].account).toBe("Liabilities:CreditCard:CMB");
    });

    it("parses with tags", () => {
        const ds = createTestDS();
        const result = parseQuickLine("打车 86 微信 标签:待报销", ds);
        expect(result).not.toBeNull();
        expect(result!.tags).toContain("待报销");
    });

    it("uses credit card alias '招行信用卡'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("海底捞 258 招行信用卡", ds);
        expect(result).not.toBeNull();
        expect(result!.postings![1].account).toBe("Liabilities:CreditCard:CMB");
    });

    it("uses credit card alias '工行信用卡'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("海底捞 258 工行信用卡", ds);
        expect(result).not.toBeNull();
        expect(result!.postings![1].account).toBe("Liabilities:CreditCard:ICBC");
    });

    it("uses credit card alias '工行'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("午饭 50 工行", ds);
        expect(result).not.toBeNull();
        expect(result!.postings![1].account).toBe("Liabilities:CreditCard:ICBC");
    });

    it("uses credit card alias '招行'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("午饭 50 招行", ds);
        expect(result).not.toBeNull();
        expect(result!.postings![1].account).toBe("Liabilities:CreditCard:CMB");
    });

    it("returns null for empty input", () => {
        const ds = createTestDS();
        expect(parseQuickLine("", ds)).toBeNull();
    });

    it("returns null when amount is missing", () => {
        const ds = createTestDS();
        expect(parseQuickLine("午饭", ds)).toBeNull();
    });

    it("parses multi-word payee 'Codex Team 35.9'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("Codex Team 35.9", ds);
        expect(result).not.toBeNull();
        expect(result!.payee).toBe("Codex Team");
        expect(result!.postings![0].amount).toBeCloseTo(35.9);
        expect(result!.postings![1].amount).toBeCloseTo(-35.9);
    });

    it("parses multi-word payee with account alias 'Codex Team 35.9 微信'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("Codex Team 35.9 微信", ds);
        expect(result).not.toBeNull();
        expect(result!.payee).toBe("Codex Team");
        expect(result!.postings![1].account).toBe("Assets:WeChatPay");
    });

    it("parses double-quoted payee '\"Codex Team\" 35.9'", () => {
        const ds = createTestDS();
        const result = parseQuickLine('"Codex Team" 35.9', ds);
        expect(result).not.toBeNull();
        expect(result!.payee).toBe("Codex Team");
        expect(result!.postings![0].amount).toBeCloseTo(35.9);
    });

    it("parses full-width quoted payee '“Codex Team” 35.9'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("\u201CCodex Team\u201D 35.9", ds);
        expect(result).not.toBeNull();
        expect(result!.payee).toBe("Codex Team");
    });

    it("parses multi-word payee with date prefix", () => {
        const ds = createTestDS();
        const result = parseQuickLine("2024-03-15 Codex Team 35.9 微信", ds);
        expect(result).not.toBeNull();
        expect(result!.date).toBe("2024-03-15");
        expect(result!.payee).toBe("Codex Team");
        expect(result!.postings![1].account).toBe("Assets:WeChatPay");
    });
});

// ─── Credit card bill payment parsing ─────────────────────────────────────────

describe("parseQuickLine — credit card bill payment", () => {
    it("parses '还信用卡 5000'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("还信用卡 5000", ds);
        expect(result).not.toBeNull();
        expect(result!.payee).toBe("还信用卡");
        expect(result!.postings).toHaveLength(2);
        // Transfer: credit card receives positive (debt reduced), asset gets negative
        expect(result!.postings![0].account).toBe("Liabilities:CreditCard:CMB");
        expect(result!.postings![0].amount).toBe(5000);
        expect(result!.postings![1].account).toBe("Assets:Alipay"); // default debit account
        expect(result!.postings![1].amount).toBe(-5000);
    });

    it("parses '还信用卡 5000 银行卡'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("还信用卡 5000 银行卡", ds);
        expect(result).not.toBeNull();
        expect(result!.postings![0].account).toBe("Liabilities:CreditCard:CMB");
        expect(result!.postings![1].account).toBe("Assets:Bank:Checking");
        expect(result!.postings![1].amount).toBe(-5000);
    });

    it("parses '还招行 3000'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("还招行 3000", ds);
        expect(result).not.toBeNull();
        expect(result!.payee).toBe("还招行");
        expect(result!.postings![0].account).toBe("Liabilities:CreditCard:CMB");
        expect(result!.postings![0].amount).toBe(3000);
    });

    it("parses '还工行 2000 银行卡'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("还工行 2000 银行卡", ds);
        expect(result).not.toBeNull();
        expect(result!.postings![0].account).toBe("Liabilities:CreditCard:ICBC");
        expect(result!.postings![0].amount).toBe(2000);
        expect(result!.postings![1].account).toBe("Assets:Bank:Checking");
    });

    it("parses '还花呗 1000'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("还花呗 1000", ds);
        expect(result).not.toBeNull();
        expect(result!.postings![0].account).toBe("Liabilities:HuaBei");
        expect(result!.postings![0].amount).toBe(1000);
    });

    it("parses '还借呗 500'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("还借呗 500", ds);
        expect(result).not.toBeNull();
        expect(result!.postings![0].account).toBe("Liabilities:JieBei");
    });

    it("parses with date prefix '2024-03-15 还信用卡 5000'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("2024-03-15 还信用卡 5000", ds);
        expect(result).not.toBeNull();
        expect(result!.date).toBe("2024-03-15");
        expect(result!.payee).toBe("还信用卡");
        expect(result!.postings![0].amount).toBe(5000);
    });

    it("returns null when amount is missing", () => {
        const ds = createTestDS();
        expect(parseQuickLine("还信用卡", ds)).toBeNull();
    });
});

// ─── Reimbursement income parsing ─────────────────────────────────────────────

describe("parseQuickLine — reimbursement", () => {
    it("parses '报销 差旅费 380'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("报销 差旅费 380", ds);
        expect(result).not.toBeNull();
        expect(result!.payee).toBe("差旅费");
        expect(result!.postings).toHaveLength(2);
        // Income posting (negative for Income account)
        expect(result!.postings![0].account).toBe("Income:Reimbursement");
        expect(result!.postings![0].amount).toBe(-380);
        // Asset posting (positive for Assets account)
        expect(result!.postings![1].account).toBe("Assets:Alipay"); // default debit
        expect(result!.postings![1].amount).toBe(380);
    });

    it("parses '报销 差旅费 380 银行卡'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("报销 差旅费 380 银行卡", ds);
        expect(result).not.toBeNull();
        expect(result!.postings![1].account).toBe("Assets:Bank:Checking");
        expect(result!.postings![1].amount).toBe(380);
    });

    it("parses '收到报销 打车费 86'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("收到报销 打车费 86", ds);
        expect(result).not.toBeNull();
        expect(result!.payee).toBe("打车费");
        expect(result!.postings![0].account).toBe("Income:Reimbursement");
        expect(result!.postings![0].amount).toBe(-86);
    });

    it("auto-tags with '报销' when no tags specified", () => {
        const ds = createTestDS();
        const result = parseQuickLine("报销 差旅费 380", ds);
        expect(result).not.toBeNull();
        expect(result!.tags).toContain("报销");
    });

    it("uses explicit tags when specified", () => {
        const ds = createTestDS();
        const result = parseQuickLine("报销 差旅费 380 标签:出差", ds);
        expect(result).not.toBeNull();
        expect(result!.tags).toContain("出差");
    });

    it("parses with date prefix", () => {
        const ds = createTestDS();
        const result = parseQuickLine("2024-03-15 报销 差旅费 380", ds);
        expect(result).not.toBeNull();
        expect(result!.date).toBe("2024-03-15");
        expect(result!.payee).toBe("差旅费");
        expect(result!.postings![0].amount).toBe(-380);
    });

    it("uses '报销' as payee when no narration given", () => {
        const ds = createTestDS();
        const result = parseQuickLine("报销 380", ds);
        expect(result).not.toBeNull();
        expect(result!.payee).toBe("报销");
    });

    it("returns null when amount is missing", () => {
        const ds = createTestDS();
        expect(parseQuickLine("报销 差旅费", ds)).toBeNull();
    });

    it("parses multi-word narration '报销 出差 打车费 86'", () => {
        const ds = createTestDS();
        const result = parseQuickLine("报销 出差 打车费 86", ds);
        expect(result).not.toBeNull();
        expect(result!.payee).toBe("出差 打车费");
        expect(result!.postings![0].amount).toBe(-86);
    });
});
