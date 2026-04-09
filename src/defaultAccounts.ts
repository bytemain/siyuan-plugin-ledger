/**
 * Default account tree suitable for Chinese users.
 * Users can customise this list through the plugin settings.
 */
import {IAccount} from "./types";

export const DEFAULT_ACCOUNTS: IAccount[] = [
    // ─── Assets ──────────────────────────────────────────────────────────
    {path: "Assets:Bank:Checking",        type: "Assets",      currencies: ["CNY"], openDate: "2020-01-01", icon: "💳", note: "银行卡"},
    {path: "Assets:Bank:Savings",         type: "Assets",      currencies: ["CNY"], openDate: "2020-01-01", icon: "🏦", note: "储蓄卡"},
    {path: "Assets:Alipay",               type: "Assets",      currencies: ["CNY"], openDate: "2020-01-01", icon: "📱", note: "支付宝"},
    {path: "Assets:WeChatPay",            type: "Assets",      currencies: ["CNY"], openDate: "2020-01-01", icon: "💬", note: "微信支付"},
    {path: "Assets:Cash",                 type: "Assets",      currencies: ["CNY"], openDate: "2020-01-01", icon: "💵", note: "现金"},
    {path: "Assets:Investments",          type: "Assets",      currencies: ["CNY"], openDate: "2020-01-01", icon: "📈", note: "投资"},

    // ─── Liabilities ─────────────────────────────────────────────────────
    {path: "Liabilities:CreditCard:ICBC", type: "Liabilities", currencies: ["CNY"], openDate: "2020-01-01", icon: "💳", note: "工行信用卡"},
    {path: "Liabilities:CreditCard:CMB",  type: "Liabilities", currencies: ["CNY"], openDate: "2020-01-01", icon: "💳", note: "招行信用卡"},
    {path: "Liabilities:HuaBei",          type: "Liabilities", currencies: ["CNY"], openDate: "2020-01-01", icon: "🔴", note: "花呗"},
    {path: "Liabilities:JieBei",          type: "Liabilities", currencies: ["CNY"], openDate: "2020-01-01", icon: "🟡", note: "借呗"},

    // ─── Income ──────────────────────────────────────────────────────────
    {path: "Income:Salary",               type: "Income",      currencies: ["CNY"], openDate: "2020-01-01", icon: "💰", note: "工资"},
    {path: "Income:Bonus",                type: "Income",      currencies: ["CNY"], openDate: "2020-01-01", icon: "🎁", note: "奖金"},
    {path: "Income:Investment:Dividends", type: "Income",      currencies: ["CNY"], openDate: "2020-01-01", icon: "📊", note: "股息"},
    {path: "Income:Investment:Interest",  type: "Income",      currencies: ["CNY"], openDate: "2020-01-01", icon: "🏦", note: "利息"},
    {path: "Income:Reimbursement",        type: "Income",      currencies: ["CNY"], openDate: "2020-01-01", icon: "📋", note: "报销"},

    // ─── Expenses ────────────────────────────────────────────────────────
    {path: "Expenses:Food:Dining",        type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "🍽️", note: "外出就餐"},
    {path: "Expenses:Food:Groceries",     type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "🛒", note: "日常采购"},
    {path: "Expenses:Food:Delivery",      type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "🚀", note: "外卖"},
    {path: "Expenses:Transport:Taxi",     type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "🚕", note: "打车"},
    {path: "Expenses:Transport:Metro",    type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "🚇", note: "地铁公交"},
    {path: "Expenses:Transport:Fuel",     type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "⛽", note: "加油"},
    {path: "Expenses:Housing:Rent",       type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "🏠", note: "房租"},
    {path: "Expenses:Housing:Utilities",  type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "💡", note: "水电燃气"},
    {path: "Expenses:Housing:Internet",   type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "🌐", note: "宽带"},
    {path: "Expenses:Shopping:Clothes",   type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "👔", note: "服饰"},
    {path: "Expenses:Shopping:Digital",   type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "📱", note: "数码"},
    {path: "Expenses:Shopping:Daily",     type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "🧴", note: "日用品"},
    {path: "Expenses:Entertainment",      type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "🎮", note: "娱乐"},
    {path: "Expenses:Health:Medical",     type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "🏥", note: "医疗"},
    {path: "Expenses:Health:Fitness",     type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "🏋️", note: "健身"},
    {path: "Expenses:Education",          type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "📚", note: "教育"},
    {path: "Expenses:Travel",             type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "✈️", note: "旅行"},
    {path: "Expenses:Gift",               type: "Expenses",    currencies: ["CNY"], openDate: "2020-01-01", icon: "🎁", note: "人情往来"},

    // ─── Equity ──────────────────────────────────────────────────────────
    {path: "Equity:Opening-Balances",     type: "Equity",      currencies: ["CNY"], openDate: "2020-01-01", icon: "📋", note: "期初余额"},
    {path: "Equity:Conversions",          type: "Equity",      currencies: ["CNY"], openDate: "2020-01-01", icon: "🔄", note: "货币转换"},
];

/** Quick alias map used by the simple-entry parser */
export const ACCOUNT_ALIASES: Record<string, string> = {
    "支付宝": "Assets:Alipay",
    "alipay": "Assets:Alipay",
    "微信": "Assets:WeChatPay",
    "wechat": "Assets:WeChatPay",
    "微信支付": "Assets:WeChatPay",
    "银行卡": "Assets:Bank:Checking",
    "bank": "Assets:Bank:Checking",
    "信用卡": "Liabilities:CreditCard:CMB",
    "credit": "Liabilities:CreditCard:CMB",
    "现金": "Assets:Cash",
    "cash": "Assets:Cash",
    "花呗": "Liabilities:HuaBei",
    "借呗": "Liabilities:JieBei",
};
