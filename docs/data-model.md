# 🏗️ 数据模型与存储设计

本文档面向开发者和高级用户，说明思源记账插件的核心数据模型、存储方式，以及 `postings` 数组的设计理念。

---

## 目录

- [1. 整体架构](#1-整体架构)
- [2. IAL 属性清单](#2-ial-属性清单)
- [3. 核心类型定义](#3-核心类型定义)
- [4. Postings 数组设计理念](#4-postings-数组设计理念)
- [5. 存储示例](#5-存储示例)
- [6. 通过思源 API 查询交易](#6-通过思源-api-查询交易)
- [7. 已知限制与未来方向](#7-已知限制与未来方向)

---

## 1. 整体架构

插件将每一笔交易存储为思源笔记中一个块的 **IAL（Inline Attribute List）自定义属性**。每个属性以 `custom-ledger-` 为前缀，利用思源的 `attributes` 表进行持久化和 SQL 查询。

```
┌─────────────────────────────────────────────────┐
│  SiYuan Block                                   │
│  ┌───────────────────────────────────────────┐  │
│  │ IAL (Inline Attribute List)               │  │
│  │  custom-ledger-type = "transaction"       │  │
│  │  custom-ledger-date = "2024-03-15"        │  │
│  │  custom-ledger-payee = "超市"             │  │
│  │  custom-ledger-postings = "[{...},{...}]" │  │
│  │  custom-ledger-uuid = "abc-123"           │  │
│  │  ...                                      │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────┐
│  SiYuan attributes 表            │
│  (block_id, name, value)         │
│  可通过 /api/query/sql 查询      │
└──────────────────────────────────┘
```

## 2. IAL 属性清单

所有属性名均定义于 `src/types.ts`：

| 常量名 | IAL 属性名 | 值类型 | 说明 |
|--------|-----------|--------|------|
| `ATTR_TYPE` | `custom-ledger-type` | `"transaction"` | 标识块类型，目前仅 `"transaction"` |
| `ATTR_DATE` | `custom-ledger-date` | ISO 日期字符串 | 交易日期，如 `"2024-03-15"` |
| `ATTR_STATUS` | `custom-ledger-status` | `"cleared"` \| `"pending"` \| `"uncleared"` | 交易状态 |
| `ATTR_PAYEE` | `custom-ledger-payee` | 字符串 | 交易对方（收款方/付款方） |
| `ATTR_NARRATION` | `custom-ledger-narration` | 字符串 | 交易备注/描述 |
| `ATTR_POSTINGS` | `custom-ledger-postings` | JSON 字符串 | 过账明细数组，详见下文 |
| `ATTR_TAGS` | `custom-ledger-tags` | 逗号分隔字符串 | 标签，如 `"餐饮,报销"` |
| `ATTR_UUID` | `custom-ledger-uuid` | UUID 字符串 | 全局唯一标识（用于导入导出幂等） |

## 3. 核心类型定义

### IPosting

每个过账条目表示一笔资金在某个账户上的变动：

```typescript
interface IPosting {
    account: string;        // 账户路径，如 "Expenses:Food:Dining"
    amount: number;         // 金额（正数 = 账户余额增加，负数 = 账户余额减少）
    currency: string;       // 货币代码，如 "CNY"
    price?: number;         // 单价（用于外币/投资交易）
    priceCurrency?: string; // 单价货币
    cost?: number;          // 成本（用于投资交易）
    costCurrency?: string;  // 成本货币
}
```

> **符号约定**：`amount` 的正负代表该账户余额的变化方向。
> - `Expenses:*` 金额为正值（支出分类余额增加 = 花了钱）
> - `Income:*` 金额为负值（收入来源余额减少 = 赚了钱）
> - `Assets:*` 金额视情况：付款时为负（资产减少），收款时为正（资产增加）
> - 所有 postings 的 `amount` 之和必须为 **零**（借贷平衡）

### ITransaction

一笔完整的交易记录：

```typescript
interface ITransaction {
    blockId: string;               // 思源块 ID
    uuid: string;                  // 全局唯一标识
    date: string;                  // ISO 8601 日期
    status: TransactionStatus;     // 交易状态
    payee: string;                 // 交易对方
    narration?: string;            // 备注
    postings: IPosting[];          // 过账明细数组
    tags?: string[];               // 标签数组
}
```

## 4. Postings 数组设计理念

### 为什么 postings 是数组？

`postings` 设计为数组，是为了忠实实现 **复式记账（double-entry bookkeeping）** 的数据模型。这与 [Beancount](https://beancount.github.io/docs/)、[Ledger CLI](https://ledger-cli.org/) 等专业纯文本记账工具保持一致。

在复式记账中，一笔交易可以涉及 **两个或多个账户**，每个账户的资金变动就是一个 posting。所有 postings 的金额之和必须为零（借贷平衡）。

### 典型场景

**日常消费（2 个 postings）：**

```
2024-03-15 * "午餐"
    Expenses:Food:Dining     35.00 CNY   ← posting 1：支出增加（正值）
    Assets:Alipay           -35.00 CNY   ← posting 2：资产减少（负值）
```

**拆分消费（3+ 个 postings）：**

```
2024-03-15 * "超市购物"
    Expenses:Food:Groceries   80.00 CNY  ← posting 1：食品支出
    Expenses:Daily:Household  20.00 CNY  ← posting 2：日用品支出
    Assets:Bank:BOC         -100.00 CNY  ← posting 3：银行扣款
```

**转账（2 个 postings）：**

```
2024-03-15 * "支付宝→银行"
    Assets:Alipay           -500.00 CNY  ← 转出
    Assets:Bank:BOC          500.00 CNY  ← 转入
```

**信用卡还款（2 个 postings）：**

```
2024-03-15 * "还信用卡"
    Liabilities:CreditCard:CMB   3000.00 CNY  ← 负债减少
    Assets:Bank:CMB             -3000.00 CNY  ← 资产减少
```

### 为什么不把每个 posting 拆成独立属性？

如果把 postings 拆成独立的 IAL 属性（如 `custom-ledger-account-0`、`custom-ledger-amount-0`），会带来以下问题：

1. **属性数量不固定**：交易可能有 2～N 个 postings，IAL 属性无法动态定义数组长度
2. **原子性丧失**：多个属性需要原子更新，否则可能出现数据不一致
3. **查询复杂化**：跨多个属性的 JOIN 查询比单属性内的 LIKE 搜索更复杂

因此，将 postings 序列化为 JSON 字符串存储在单个属性中，是当前最合理的折中方案。

## 5. 存储示例

一笔超市购物交易在 IAL 中的实际存储形态：

```
custom-ledger-type="transaction"
custom-ledger-date="2024-03-15"
custom-ledger-status="cleared"
custom-ledger-payee="盒马鲜生"
custom-ledger-narration="周末采购"
custom-ledger-postings='[{"account":"Expenses:Food:Groceries","amount":80,"currency":"CNY"},{"account":"Expenses:Daily:Household","amount":20,"currency":"CNY"},{"account":"Assets:Alipay","amount":-100,"currency":"CNY"}]'
custom-ledger-tags="日用,食品"
custom-ledger-uuid="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

## 6. 通过思源 API 查询交易

### 按账户查询

尽管 `postings` 存储为 JSON 字符串，仍然可以通过思源的 SQL API 和 `LIKE` 进行账户搜索：

```sql
SELECT DISTINCT a1.block_id, a2.value AS dt
FROM attributes a1
JOIN attributes a2 ON a1.block_id = a2.block_id
JOIN attributes a3 ON a1.block_id = a3.block_id
WHERE a1.name = 'custom-ledger-type'
  AND a1.value = 'transaction'
  AND a2.name = 'custom-ledger-date'
  AND a3.name = 'custom-ledger-postings'
  AND a3.value LIKE '%Expenses:Food%' ESCAPE '\\'
ORDER BY a2.value DESC
```

这条查询会返回所有 postings 中包含 `Expenses:Food` 的交易块，包括其子账户（如 `Expenses:Food:Dining`、`Expenses:Food:Groceries`）。

### 按收款方查询

```sql
SELECT DISTINCT a1.block_id
FROM attributes a1
JOIN attributes a2 ON a1.block_id = a2.block_id
WHERE a1.name = 'custom-ledger-type'
  AND a1.value = 'transaction'
  AND a2.name = 'custom-ledger-payee'
  AND a2.value = '盒马鲜生'
```

### 按日期范围查询

```sql
SELECT DISTINCT a1.block_id, a2.value AS dt
FROM attributes a1
JOIN attributes a2 ON a1.block_id = a2.block_id
WHERE a1.name = 'custom-ledger-type'
  AND a1.value = 'transaction'
  AND a2.name = 'custom-ledger-date'
  AND a2.value BETWEEN '2024-03-01' AND '2024-03-31'
ORDER BY a2.value DESC
```

### 按标签查询

```sql
SELECT DISTINCT a1.block_id
FROM attributes a1
JOIN attributes a2 ON a1.block_id = a2.block_id
WHERE a1.name = 'custom-ledger-type'
  AND a1.value = 'transaction'
  AND a2.name = 'custom-ledger-tags'
  AND a2.value LIKE '%报销%'
```

## 7. 已知限制与未来方向

### 当前限制

| 限制 | 说明 |
|------|------|
| 无法做金额范围查询 | 金额嵌在 JSON 内部，SQL `LIKE` 无法提取数值进行比较 |
| 无法按单个 posting 精确筛选 | 例如"金额大于 100 且账户为 Expenses:Food"的组合筛选不可行 |
| JSON 解析开销 | 插件需要在内存中 `JSON.parse` 所有交易的 postings 进行计算 |

### 缓解措施

- **内存缓存**：插件维护 `ILedgerCache` 缓存结构，包含 `accountBalances`、`monthlyExpenses`、`monthlyIncome` 等预计算结果，避免每次查询都解析 JSON
- **嵌入块查询**：`embedBlock.ts` 提供 `buildByAccountQuery()` 等函数，通过 `LIKE` 模糊匹配在 SQL 层面完成初步筛选

### 未来可能的改进方向

1. **增加冗余索引属性**：为高频查询场景增加独立的 IAL 属性（如 `custom-ledger-accounts`），存储账户列表的扁平字符串，提升查询精度
2. **金额摘要属性**：增加 `custom-ledger-total-amount` 等属性，支持金额范围查询
3. **插件端全文索引**：在插件侧维护一个轻量级索引数据库，弥补 IAL 存储的查询短板

---

> **源码参考**：
> - 类型定义：[`src/types.ts`](../src/types.ts)
> - 数据读写：[`src/dataService.ts`](../src/dataService.ts)
> - 嵌入查询：[`src/embedBlock.ts`](../src/embedBlock.ts)
