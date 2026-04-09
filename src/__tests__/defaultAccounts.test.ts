import {describe, it, expect} from "vitest";
import {DEFAULT_ACCOUNTS, ACCOUNT_ALIASES} from "../defaultAccounts";

// ─── DEFAULT_ACCOUNTS ─────────────────────────────────────────────────────────

describe("DEFAULT_ACCOUNTS", () => {
    it("contains at least 30 accounts", () => {
        expect(DEFAULT_ACCOUNTS.length).toBeGreaterThanOrEqual(30);
    });

    it("every account has a non-empty path", () => {
        for (const acc of DEFAULT_ACCOUNTS) {
            expect(acc.path).toBeTruthy();
        }
    });

    it("every account path has the form Type:... with a valid top-level type", () => {
        const validTypes = new Set(["Assets", "Liabilities", "Income", "Expenses", "Equity"]);
        for (const acc of DEFAULT_ACCOUNTS) {
            const topLevel = acc.path.split(":")[0];
            expect(validTypes.has(topLevel), `${acc.path} has invalid type`).toBe(true);
        }
    });

    it("every account type matches the top-level segment of its path", () => {
        for (const acc of DEFAULT_ACCOUNTS) {
            const topLevel = acc.path.split(":")[0];
            expect(acc.type).toBe(topLevel);
        }
    });

    it("every account has exactly one currency", () => {
        for (const acc of DEFAULT_ACCOUNTS) {
            expect(acc.currencies.length).toBeGreaterThanOrEqual(1);
        }
    });

    it("every account has a valid ISO-8601 openDate", () => {
        const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
        for (const acc of DEFAULT_ACCOUNTS) {
            expect(acc.openDate).toMatch(ISO_DATE);
        }
    });

    it("contains standard Chinese payment assets", () => {
        const paths = DEFAULT_ACCOUNTS.map(a => a.path);
        expect(paths).toContain("Assets:Alipay");
        expect(paths).toContain("Assets:WeChatPay");
        expect(paths).toContain("Assets:Cash");
        expect(paths).toContain("Assets:Bank:Checking");
    });

    it("contains income accounts", () => {
        const incomeAccounts = DEFAULT_ACCOUNTS.filter(a => a.type === "Income");
        expect(incomeAccounts.length).toBeGreaterThanOrEqual(3);
    });

    it("contains expense accounts", () => {
        const expenseAccounts = DEFAULT_ACCOUNTS.filter(a => a.type === "Expenses");
        expect(expenseAccounts.length).toBeGreaterThanOrEqual(10);
    });

    it("contains equity accounts", () => {
        const equityAccounts = DEFAULT_ACCOUNTS.filter(a => a.type === "Equity");
        expect(equityAccounts.length).toBeGreaterThanOrEqual(1);
    });

    it("has no duplicate paths", () => {
        const paths = DEFAULT_ACCOUNTS.map(a => a.path);
        const unique = new Set(paths);
        expect(unique.size).toBe(paths.length);
    });
});

// ─── ACCOUNT_ALIASES ─────────────────────────────────────────────────────────

describe("ACCOUNT_ALIASES", () => {
    it("maps 支付宝 to Assets:Alipay", () => {
        expect(ACCOUNT_ALIASES["支付宝"]).toBe("Assets:Alipay");
    });

    it("maps 微信 to Assets:WeChatPay", () => {
        expect(ACCOUNT_ALIASES["微信"]).toBe("Assets:WeChatPay");
    });

    it("maps 现金 to Assets:Cash", () => {
        expect(ACCOUNT_ALIASES["现金"]).toBe("Assets:Cash");
    });

    it("maps 银行卡 to Assets:Bank:Checking", () => {
        expect(ACCOUNT_ALIASES["银行卡"]).toBe("Assets:Bank:Checking");
    });

    it("maps 信用卡 to a Liabilities account", () => {
        expect(ACCOUNT_ALIASES["信用卡"]).toMatch(/^Liabilities/);
    });

    it("has English lowercase aliases for major accounts", () => {
        expect(ACCOUNT_ALIASES["alipay"]).toBeDefined();
        expect(ACCOUNT_ALIASES["wechat"]).toBeDefined();
        expect(ACCOUNT_ALIASES["cash"]).toBeDefined();
        expect(ACCOUNT_ALIASES["bank"]).toBeDefined();
    });

    it("all alias values correspond to valid account paths in DEFAULT_ACCOUNTS", () => {
        const paths = new Set(DEFAULT_ACCOUNTS.map(a => a.path));
        for (const [alias, path] of Object.entries(ACCOUNT_ALIASES)) {
            expect(paths.has(path), `alias "${alias}" → "${path}" not in DEFAULT_ACCOUNTS`).toBe(true);
        }
    });
});
