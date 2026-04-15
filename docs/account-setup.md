# 账户体系配置

本文档介绍如何根据你的实际情况自定义账户分类体系。

---

## 一、账户类型基础

复式记账有五大类账户，每类有不同含义：

| 类型 | 英文 | 含义 | 余额增加方向 | 示例 |
|------|------|------|------------|------|
| 资产 | Assets | 你拥有的钱 | 余额增加 = 好事 | 银行卡、支付宝、现金 |
| 负债 | Liabilities | 你欠别人的钱 | 余额增加 = 欠更多 | 信用卡、花呗 |
| 收入 | Income | 钱的来源 | 余额增加 = 赚更多 | 工资、奖金、利息 |
| 支出 | Expenses | 钱的去向 | 余额增加 = 花更多 | 餐饮、交通、房租 |
| 权益 | Equity | 特殊调整类 | — | 期初余额、汇率差 |

> 💡 **简单理解：** 资产和负债记录你的财务状况（有多少钱、欠多少钱），收入和支出记录你的资金流动（从哪来、到哪去）。

---

## 二、打开账户管理

点击思源笔记顶栏的 **插件图标**，或通过命令面板搜索"账户管理"，进入账户管理界面。

界面以树形结构展示所有账户，按五大类分组显示。

---

## 三、添加新账户

### 3.1 操作步骤

1. 在账户管理界面，点击对应分类下的 **+** 按钮。
2. 填写账户信息：

| 字段 | 说明 | 示例 |
|------|------|------|
| 路径 | 账户的层级路径，用冒号分隔 | `Expenses:Pet:Food` |
| 类型 | 自动继承父分类，一般无需修改 | `Expenses` |
| 图标 | 选择一个表情符号 | 🐕 |
| 备注 | 可选的账户说明 | 宠物粮食开销 |
| 支持币种 | 该账户使用的货币 | `CNY` |

3. 点击保存。

### 3.2 路径命名规则

账户路径使用**英文冒号 `:`** 分隔层级，建议使用**英文命名**（和国际通用的记账软件兼容）：

```
✅ 推荐：Expenses:Food:Dining
✅ 推荐：Assets:Bank:CMB
❌ 避免：支出:餐饮:外食      （中文路径可用但不利于导出兼容）
```

### 3.3 常见自定义场景

#### 场景 1：添加宠物相关支出

```
Expenses:Pet           🐾  宠物总分类
Expenses:Pet:Food      🦴  宠物粮食
Expenses:Pet:Medical   💉  宠物医疗
Expenses:Pet:Grooming  ✂️  宠物美容
```

#### 场景 2：添加副业收入

```
Income:Freelance       💻  自由职业
Income:Freelance:Web   🌐  网站开发
Income:Freelance:Design 🎨 设计外包
```

#### 场景 3：添加更多银行账户

```
Assets:Bank:CMB        🏦  招商银行
Assets:Bank:ICBC       🏦  工商银行
Assets:Bank:ABC        🏦  农业银行
```

#### 场景 4：添加投资细分

```
Assets:Investments:Stock   📈  股票
Assets:Investments:Fund    📊  基金
Assets:Investments:Crypto  🪙  数字货币
```

---

## 四、编辑账户

在账户管理界面，点击某个账户旁的 **编辑** 按钮，可以修改：

- 图标
- 备注说明
- 支持的币种

> ⚠️ **注意：** 修改账户路径会影响该路径下所有已记录的交易关联，请谨慎操作。

---

## 五、关闭（归档）账户

如果某个账户不再使用（如注销了某张银行卡），可以将其**关闭**：

1. 编辑该账户。
2. 设置**关闭日期**。
3. 保存。

关闭后的账户：
- 不再出现在记账弹窗的下拉列表中
- 历史交易记录仍然保留
- 需要时可以重新打开

---

## 六、推荐的账户体系

### 极简版（适合刚入门）

保留默认账户即可，不需要做任何修改。默认的 30+ 账户已经覆盖了大多数场景。

### 进阶版（适合详细记账）

在默认基础上，根据你的实际情况增加细分：

```
📂 支出细分建议
├── Expenses:Food:Dining      → 外食/堂食
├── Expenses:Food:Groceries   → 买菜/超市
├── Expenses:Food:Delivery    → 外卖
├── Expenses:Food:Drinks      → 饮料/奶茶
├── Expenses:Food:Snacks      → 零食
├── Expenses:Transport:Taxi   → 打车
├── Expenses:Transport:Metro  → 地铁/公交
├── Expenses:Transport:Fuel   → 加油
├── Expenses:Transport:Parking → 停车费
├── Expenses:Housing:Rent     → 房租
├── Expenses:Housing:Mortgage → 房贷
├── Expenses:Housing:Property → 物业费
└── Expenses:Child:Education  → 子女教育
```

> 💡 **建议：** 不要一开始就建太多分类，先用默认的记一个月，看看哪些分类不够用再添加。过于细致的分类反而会增加记账负担。

---

## 下一步

- [五分钟快速上手](./quick-start.md) — 回顾基本操作
- [日常记账场景](./daily-expense.md) — 各种日常记账方法
- [仪表盘与数据分析](./dashboard-and-reports.md) — 查看分类统计
