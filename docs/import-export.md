# 导入导出与备份

本文档介绍如何导出你的账目数据进行备份，以及如何从其他记账工具导入数据。

---

## 一、导出数据

### 1.1 打开导出功能

通过顶栏插件菜单 → **导入/导出** 打开导入导出对话框。

### 1.2 支持的导出格式

插件支持三种专业记账格式导出：

#### 格式 1：Ledger CLI（`.ledger`）

适合使用 [ledger-cli](https://www.ledger-cli.org/) 或 [hledger](https://hledger.org/) 做进阶分析的用户。

导出示例：

```ledger
2024/03/15 * 海底捞
    ; 部门聚餐
    ; :聚餐:报销:
    Expenses:Food:Dining    ¥258.00
    Assets:Alipay
```

特点：
- 状态标记：`*`（已确认）、`!`（待处理）、无标记（未确认）
- 支持货币符号（¥ $ € £）
- 最后一行金额自动省略（Ledger 会推算）
- 标签以 `:tag:` 格式表示

#### 格式 2：Beancount（`.bean`）

适合使用 [Beancount](https://beancount.github.io/) 和 [Fava](https://beancount.github.io/fava/) 做专业财务分析的用户。

导出示例：

```beancount
option "title" "SiYuan Ledger"

2020-01-01 open Expenses:Food:Dining CNY
2020-01-01 open Assets:Alipay CNY

2024-03-15 * "海底捞" "聚餐" #聚餐
  Expenses:Food:Dining    258.00 CNY
  Assets:Alipay          -258.00 CNY
```

特点：
- 自动生成 `open` 指令声明所有使用过的账户
- 所有过账行都显示完整金额（Beancount 要求平衡）
- 标签以 `#tag` 格式表示
- 收款方和备注以双引号包裹

#### 格式 3：CSV（`.csv`）

适合在 Excel、Google Sheets 或其他电子表格中分析的用户。

导出示例：

```csv
Date,Status,Payee,Narration,Account1,Amount1,Currency1,Account2,Amount2,Currency2,Tags
2024-03-15,cleared,海底捞,聚餐,Expenses:Food:Dining,258.00,CNY,Assets:Alipay,-258.00,CNY,"聚餐,报销"
```

特点：
- 标准 CSV 格式，任何电子表格软件都能打开
- 多个过账行展开为多列
- 标签以逗号分隔

---

## 二、导入数据

### 2.1 支持的导入格式

插件支持从以下格式导入：

- **Ledger CLI**（`.ledger`）
- **Beancount**（`.bean`）
- **CSV**（`.csv`）

### 2.2 导入步骤

1. 打开导入/导出对话框。
2. 选择**导入**选项卡。
3. 选择文件格式。
4. 上传或粘贴文件内容。
5. 预览导入数据，确认无误后点击导入。

### 2.3 导入注意事项

#### 去重机制

每笔交易都有唯一的 **UUID**。导入时插件会检查 UUID：
- 已存在的交易会被跳过，不会重复导入
- 导出再导入同一份文件是安全的

#### 账户匹配

导入时会自动匹配已有账户。如果导入数据中包含本地不存在的账户路径，导入后这些账户会被自动创建。

#### 数据验证

导入前插件会验证：
- 每笔交易至少有 2 个过账行
- 同一币种的过账行金额之和为 0（复式平衡）
- 日期格式有效

---

## 三、备份建议

### 3.1 定期备份

建议每月至少备份一次账目数据：

1. 导出为 **Ledger** 或 **Beancount** 格式（纯文本，便于长期保存）。
2. 同时导出一份 **CSV** 格式（便于在电子表格中查看）。
3. 将导出文件保存到云存储或其他安全位置。

### 3.2 迁移到其他工具

如果需要迁移到专业记账软件：

| 目标工具 | 推荐导出格式 |
|---------|------------|
| ledger-cli / hledger | Ledger 格式 |
| Beancount + Fava | Beancount 格式 |
| Excel / Google Sheets | CSV 格式 |
| 其他记账 APP | CSV 格式（最通用） |

---

## 四、从其他工具迁移到本插件

### 4.1 从 Ledger CLI 迁移

如果你之前使用 ledger-cli 或 hledger，可以直接导入你的 `.ledger` 文件。插件会解析：

- 交易日期和状态标记
- 收款方和备注
- 账户路径和金额
- 标签信息

### 4.2 从 Beancount 迁移

直接导入 `.bean` 文件即可。`open` 指令会被自动忽略，只导入交易记录。

### 4.3 从 Excel/CSV 迁移

确保 CSV 文件包含以下列：

```
Date, Status, Payee, Narration, Account1, Amount1, Currency1, Account2, Amount2, Currency2, Tags
```

如果你的 CSV 格式不同，可能需要先调整列名和格式。

---

## 下一步

- [在笔记中嵌入账单](./embed-blocks.md) — 将账单查询嵌入笔记
- [五分钟快速上手](./quick-start.md) — 回顾基本使用方法
