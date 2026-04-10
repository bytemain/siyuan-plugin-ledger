/**
 * SiYuan Ledger — Main plugin entry point
 */
import {
    Plugin,
    showMessage,
    confirm,
    Dialog,
    Menu,
    openTab,
    adaptHotkey,
    getFrontend,
    Protyle,
    fetchPost,
    Setting,
} from "siyuan";
import "./index.scss";

import {
    ILedgerConfig,
    IAccount,
    ILedgerCache,
    ITransaction,
    STORAGE_CONFIG,
    STORAGE_ACCOUNTS,
    STORAGE_CACHE,
    TAB_DASHBOARD,
    DOCK_OVERVIEW,
    DEFAULT_CONFIG,
    ATTR_TYPE,
    ATTR_DATE,
    ATTR_STATUS,
    ATTR_PAYEE,
    ATTR_NARRATION,
    ATTR_POSTINGS,
    ATTR_TAGS,
    ATTR_UUID,
    TRANSACTION_TYPE_VALUE,
} from "./types";
import {DataService} from "./dataService";
import {DEFAULT_ACCOUNTS} from "./defaultAccounts";
import {openQuickEntryDialog, openSimpleEntryDialog} from "./quickEntryDialog";
import {openImportExportDialog} from "./importExportDialog";
import {openAccountManagerDialog} from "./accountManagerDialog";
import {buildDashboardHTML} from "./dashboard";
import {exportToLedger, exportToBeancount, exportToCSV, downloadFile} from "./exportService";

export default class LedgerPlugin extends Plugin {

    private isMobile: boolean;
    private dataService: DataService = new DataService();
    private topBarElement: HTMLElement | null = null;
    private statusBarElement: HTMLElement | null = null;

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    async onload() {
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        // Register the ledger icon SVG
        this.addIcons(`<symbol id="iconLedger" viewBox="0 0 32 32">
<path d="M24 4H8C6.9 4 6 4.9 6 6v20c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-2 16H10v-2h12v2zm0-4H10v-2h12v2zm0-4H10v-2h12v2z"/>
</symbol>`);

        // Load persisted data
        await this.loadPersistedData();

        // Register commands
        this.registerCommands();

        // Register slash commands
        this.registerSlashCommands();

        // Register dashboard tab
        this.registerDashboardTab();

        // Register dock panel
        this.registerDockPanel();

        // Register settings
        this.registerSettings();

        // Register EventBus listeners
        this.registerEventBusListeners();

        console.log(this.i18n.helloPlugin);
    }

    onLayoutReady() {
        this.topBarElement = this.addTopBar({
            icon: "iconLedger",
            title: "SiYuan Ledger",
            position: "right",
            callback: () => {
                if (this.isMobile) {
                    this.showTopMenu();
                } else {
                    let rect = this.topBarElement!.getBoundingClientRect();
                    if (rect.width === 0) {
                        rect = document.querySelector("#barMore")!.getBoundingClientRect();
                    }
                    this.showTopMenu(rect);
                }
            },
        });

        // Status bar
        const statusEl = document.createElement("div");
        statusEl.className = "toolbar__item ariaLabel";
        statusEl.setAttribute("aria-label", "SiYuan Ledger");
        statusEl.style.cursor = "pointer";
        this.updateStatusBar(statusEl);
        statusEl.addEventListener("click", () => this.openDashboard());
        this.statusBarElement = statusEl;
        this.addStatusBar({element: statusEl});

        // Refresh cache on startup (non-blocking)
        this.dataService.refreshCache().then(() => {
            this.savePersistedCache();
            if (this.statusBarElement) this.updateStatusBar(this.statusBarElement);
        }).catch(e => console.warn("[Ledger] cache refresh failed:", e));
    }

    onunload() {
        console.log(this.i18n.byePlugin);
    }

    uninstall() {
        Promise.all([
            this.removeData(STORAGE_CONFIG),
            this.removeData(STORAGE_ACCOUNTS),
            this.removeData(STORAGE_CACHE),
        ]).catch(e => console.warn("[Ledger] uninstall cleanup failed:", e));
    }

    // ─── Data loading / saving ───────────────────────────────────────────────

    private async loadPersistedData() {
        try {
            const [configData, accountsData, cacheData] = await Promise.all([
                this.loadData(STORAGE_CONFIG),
                this.loadData(STORAGE_ACCOUNTS),
                this.loadData(STORAGE_CACHE),
            ]);

            if (configData && typeof configData === "object") {
                this.dataService.setConfig({...DEFAULT_CONFIG, ...configData} as ILedgerConfig);
            }
            if (Array.isArray(accountsData) && accountsData.length > 0) {
                this.dataService.setAccounts(accountsData as IAccount[]);
            } else {
                this.dataService.setAccounts(DEFAULT_ACCOUNTS);
            }
            if (cacheData && typeof cacheData === "object") {
                const c = cacheData as ILedgerCache;
                // Migration: ensure payeeHistory exists for caches saved before this feature
                if (!c.payeeHistory) c.payeeHistory = {};
                this.dataService.setCache(c);
            }
        } catch (e) {
            console.warn("[Ledger] loadPersistedData failed:", e);
        }
    }

    private async savePersistedConfig() {
        await this.saveData(STORAGE_CONFIG, this.dataService.getConfig()).catch(e =>
            console.warn("[Ledger] saveConfig failed:", e)
        );
    }

    private async savePersistedAccounts() {
        await this.saveData(STORAGE_ACCOUNTS, this.dataService.getAccounts()).catch(e =>
            console.warn("[Ledger] saveAccounts failed:", e)
        );
    }

    private async savePersistedCache() {
        await this.saveData(STORAGE_CACHE, this.dataService.getCache()).catch(e =>
            console.warn("[Ledger] saveCache failed:", e)
        );
    }

    // ─── Commands ────────────────────────────────────────────────────────────

    private registerCommands() {
        this.addCommand({
            langKey: "quickExpense",
            hotkey: "⇧⌘E",
            callback: () => this.showQuickExpense(),
        });

        this.addCommand({
            langKey: "quickIncome",
            hotkey: "⇧⌘I",
            callback: () => this.showQuickIncome(),
        });

        this.addCommand({
            langKey: "openDashboard",
            hotkey: "⇧⌘L",
            callback: () => this.openDashboard(),
        });

        this.addCommand({
            langKey: "exportLedger",
            callback: () => this.doExport("ledger"),
        });

        this.addCommand({
            langKey: "exportBeancount",
            callback: () => this.doExport("beancount"),
        });

        this.addCommand({
            langKey: "exportCSV",
            callback: () => this.doExport("csv"),
        });

        this.addCommand({
            langKey: "importFile",
            callback: () => this.openImportExport(),
        });

        this.addCommand({
            langKey: "manageAccounts",
            callback: () => this.openAccountManager(),
        });
    }

    // ─── Slash commands ──────────────────────────────────────────────────────

    private registerSlashCommands() {
        this.protyleSlash = [
            {
                filter: ["\u8bb0\u8d26", "\u652f\u51fa", "expense", "exp", "e", "\u82b1\u8d39", "\u6d88\u8d39", "jz", "zc", "hf", "xf"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">\ud83d\udcb0 ${this.i18n.quickExpense}</span></div>`,
                id: "ledger-expense",
                callback: (protyle: Protyle) => {
                    const slashBlockId = this.getSlashBlockId(protyle);
                    this.showQuickExpense(protyle, slashBlockId);
                },
            },
            {
                filter: ["\u6536\u5165", "income", "inc", "i", "\u5de5\u8d44", "\u8fdb\u8d26", "sr", "gz"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">\ud83d\udcc8 ${this.i18n.quickIncome}</span></div>`,
                id: "ledger-income",
                callback: (protyle: Protyle) => {
                    const slashBlockId = this.getSlashBlockId(protyle);
                    this.showQuickIncome(protyle, slashBlockId);
                },
            },
            {
                filter: ["\u8f6c\u8d26", "transfer", "trans", "t", "\u5212\u8f6c", "zz", "hz"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">\ud83d\udd04 ${this.i18n.quickTransfer}</span></div>`,
                id: "ledger-transfer",
                callback: (protyle: Protyle) => {
                    const slashBlockId = this.getSlashBlockId(protyle);
                    this.showQuickTransfer(protyle, slashBlockId);
                },
            },
            {
                filter: ["\u5feb\u8bb0", "quick", "q", "ledger", "kj"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">\u26a1 ${this.i18n.quickEntry}</span></div>`,
                id: "ledger-quickadd",
                callback: (protyle: Protyle) => {
                    const slashBlockId = this.getSlashBlockId(protyle);
                    this.showQuickEntry(protyle, slashBlockId);
                },
            },
            {
                filter: ["还信用卡", "还款", "creditcard", "repay", "hxyk", "hk"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">💳 ${this.i18n.quickCreditCardPayment}</span></div>`,
                id: "ledger-creditcard-payment",
                callback: (protyle: Protyle) => {
                    const slashBlockId = this.getSlashBlockId(protyle);
                    this.showCreditCardPayment(protyle, slashBlockId);
                },
            },
            {
                filter: ["报销", "reimbursement", "reimburse", "bx"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">📋 ${this.i18n.quickReimbursement}</span></div>`,
                id: "ledger-reimbursement",
                callback: (protyle: Protyle) => {
                    const slashBlockId = this.getSlashBlockId(protyle);
                    this.showReimbursement(protyle, slashBlockId);
                },
            },
        ];
    }

    // ─── Dashboard Tab ───────────────────────────────────────────────────────

    private registerDashboardTab() {
        this.addTab({
            type: TAB_DASHBOARD,
            init: (custom) => {
                custom.element.innerHTML = `<div class="fn__flex-1" style="height:100%;overflow:hidden;" id="ledger-dashboard-root">
  <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--b3-theme-on-surface-muted)">
    Loading\u2026
  </div>
</div>`;
                this.renderDashboard(custom.element.querySelector("#ledger-dashboard-root") as HTMLElement);
            },
        });
    }

    private async renderDashboard(container: HTMLElement | null) {
        if (!container) return;
        try {
            const today = new Date().toISOString().slice(0, 7);
            const allTxns = await this.dataService.queryAllTransactions();
            const monthTxns = allTxns.filter(t => t.date.startsWith(today));

            // Collect available months
            const months = [...new Set(allTxns.map(t => t.date.slice(0, 7)))].sort().reverse();
            if (!months.includes(today)) months.unshift(today);

            const html = buildDashboardHTML({
                transactions: monthTxns,
                allTransactions: allTxns,
                dataService: this.dataService,
                i18n: this.i18n,
                selectedMonth: today,
                availableMonths: months,
                budgetUsage: [],
            });

            container.innerHTML = html;
            this.attachDashboardEvents(container, allTxns, months);
        } catch (e) {
            console.error("[Ledger] renderDashboard failed:", e);
            container.innerHTML = `<div style="padding:20px;color:#e74c3c">Error loading dashboard: ${e}</div>`;
        }
    }

    private attachDashboardEvents(
        container: HTMLElement,
        allTxns: ITransaction[],
        months: string[],
    ) {
        const monthSelect = container.querySelector<HTMLSelectElement>("#ledger-month-select");
        if (monthSelect) {
            monthSelect.addEventListener("change", (e) => {
                const selected = (e.target as HTMLSelectElement).value;
                const filtered = allTxns.filter(t => t.date.startsWith(selected));
                const newHtml = buildDashboardHTML({
                    transactions: filtered,
                    allTransactions: allTxns,
                    dataService: this.dataService,
                    i18n: this.i18n,
                    selectedMonth: selected,
                    availableMonths: months,
                    budgetUsage: [],
                });
                container.innerHTML = newHtml;
                this.attachDashboardEvents(container, allTxns, months);
            });
        }

        container.querySelector("#ledger-refresh")?.addEventListener("click", async () => {
            container.innerHTML = "<div style=\"padding:20px;text-align:center\">Loading\u2026</div>";
            await this.dataService.refreshCache();
            await this.savePersistedCache();
            this.renderDashboard(container);
        });
    }

    private openDashboard() {
        openTab({
            app: this.app,
            custom: {
                icon: "iconLedger",
                title: this.i18n.dashboard,
                id: this.name + TAB_DASHBOARD,
                data: {},
            },
        });
    }

    // ─── Dock Panel ──────────────────────────────────────────────────────────

    private registerDockPanel() {
        this.addDock({
            config: {
                position: "LeftBottom",
                size: {width: 220, height: 0},
                icon: "iconLedger",
                title: this.i18n.dockTitle,
                hotkey: "\u2325\u2318L",
            },
            data: {},
            type: DOCK_OVERVIEW,
            init: (dock) => {
                dock.element.innerHTML = this.buildDockHTML();
                this.attachDockEvents(dock.element);
            },
            update: (dock) => {
                dock.element.innerHTML = this.buildDockHTML();
                this.attachDockEvents(dock.element);
            },
        });
    }

    private buildDockHTML(): string {
        const ds = this.dataService;
        const config = ds.getConfig();
        const currency = config.defaultCurrency;
        const symDef = ds.getCurrencySymbol(currency);
        const cache = ds.getCache();

        // Asset rows
        const assetRows = ds.getAccountsByPrefix("Assets").map(a => {
            const bal = cache.accountBalances[a.path]?.[currency] || 0;
            return `<div class="ledger-dock-row">
        <span>${a.icon || ""} ${a.note || a.path.split(":").pop()}</span>
        <span class="ledger-dock-amount">${symDef}${bal.toFixed(2)}</span>
      </div>`;
        }).join("");

        const liabilityRows = ds.getAccountsByPrefix("Liabilities").map(a => {
            const bal = cache.accountBalances[a.path]?.[currency] || 0;
            if (bal === 0) return "";
            return `<div class="ledger-dock-row">
        <span>${a.icon || ""} ${a.note || a.path.split(":").pop()}</span>
        <span class="ledger-dock-amount ledger-expense">${symDef}${bal.toFixed(2)}</span>
      </div>`;
        }).join("");

        // Monthly summary
        const thisMonth = new Date().toISOString().slice(0, 7);
        const monthlyExpense = cache.monthlyExpenses[thisMonth] || 0;

        // Monthly income from cache (optional chaining for backward compat with older cached data)
        const monthlyIncome = cache.monthlyIncome?.[thisMonth] || 0;

        // Net assets (total assets - total liabilities)
        let totalAssets = 0;
        for (const a of ds.getAccountsByPrefix("Assets")) {
            totalAssets += cache.accountBalances[a.path]?.[currency] || 0;
        }
        let totalLiabilities = 0;
        for (const a of ds.getAccountsByPrefix("Liabilities")) {
            totalLiabilities += cache.accountBalances[a.path]?.[currency] || 0;
        }
        const netAssets = totalAssets + totalLiabilities; // liabilities are negative

        return `<div class="ledger-dock">
  <div class="ledger-dock-header">
    <span>\ud83d\udcb0 ${this.i18n.dockTitle}</span>
    <span id="ledger-dock-refresh" style="cursor:pointer;font-size:14px;" title="${this.i18n.refresh}">\ud83d\udd04</span>
  </div>
  <div class="ledger-dock-body">
    <div class="ledger-dock-section">
      <div class="ledger-dock-section-title">${this.i18n.assets}</div>
      ${assetRows || `<div class="ledger-empty" style="font-size:11px;">${this.i18n.noData}</div>`}
    </div>
    ${liabilityRows ? `<div class="ledger-dock-section">
      <div class="ledger-dock-section-title">${this.i18n.liabilities}</div>
      ${liabilityRows}
    </div>` : ""}
    <div class="ledger-dock-divider"></div>
    <div class="ledger-dock-section">
      <div class="ledger-dock-section-title">\u2500\u2500 ${thisMonth} \u2500\u2500</div>
      <div class="ledger-dock-row">
        <span>${this.i18n.monthlyIncome}</span>
        <span class="ledger-dock-amount ledger-income">${symDef}${monthlyIncome.toFixed(2)}</span>
      </div>
      <div class="ledger-dock-row">
        <span>${this.i18n.monthlyExpenses}</span>
        <span class="ledger-dock-amount ledger-expense">${symDef}${monthlyExpense.toFixed(2)}</span>
      </div>
    </div>
    <div class="ledger-dock-divider"></div>
    <div class="ledger-dock-section">
      <div class="ledger-dock-row">
        <span>${this.i18n.netAssets}</span>
        <span class="ledger-dock-amount ${netAssets >= 0 ? "ledger-income" : "ledger-expense"}">${symDef}${netAssets.toFixed(2)}</span>
      </div>
    </div>
  </div>
  <div class="ledger-dock-actions">
    <button class="b3-button b3-button--outline ledger-dock-btn" id="ledger-dock-expense">\ud83d\udcdd ${this.i18n.quickExpense}</button>
    <button class="b3-button b3-button--outline ledger-dock-btn" id="ledger-dock-dashboard">\ud83d\udcca ${this.i18n.openDashboard}</button>
  </div>
</div>`;
    }

    private attachDockEvents(element: HTMLElement) {
        element.querySelector("#ledger-dock-expense")?.addEventListener("click", () => {
            this.showQuickExpense();
        });
        element.querySelector("#ledger-dock-dashboard")?.addEventListener("click", () => {
            this.openDashboard();
        });
        element.querySelector("#ledger-dock-refresh")?.addEventListener("click", async () => {
            await this.dataService.refreshCache();
            await this.savePersistedCache();
            element.innerHTML = this.buildDockHTML();
            this.attachDockEvents(element);
        });
    }

    // ─── Settings ────────────────────────────────────────────────────────────

    private registerSettings() {
        const config = this.dataService.getConfig();

        const currencyInput = document.createElement("input");
        currencyInput.className = "b3-text-field fn__block";
        currencyInput.value = config.defaultCurrency;
        currencyInput.placeholder = "CNY";

        const debitInput = document.createElement("input");
        debitInput.className = "b3-text-field fn__block";
        debitInput.value = config.defaultDebitAccount;
        debitInput.placeholder = "Assets:Alipay";

        const displayModeSelect = document.createElement("select");
        displayModeSelect.className = "b3-select fn__block";
        displayModeSelect.innerHTML = `
          <option value="detailed" ${config.displayMode === "detailed" ? "selected" : ""}>${this.i18n.settingDisplayModeDetailed}</option>
          <option value="compact" ${config.displayMode === "compact" ? "selected" : ""}>${this.i18n.settingDisplayModeCompact}</option>`;

        this.setting = new Setting({
            confirmCallback: () => {
                const updatedConfig = {
                    ...this.dataService.getConfig(),
                    defaultCurrency: currencyInput.value.trim() || "CNY",
                    defaultDebitAccount: debitInput.value.trim() || "Assets:Alipay",
                    displayMode: displayModeSelect.value as "detailed" | "compact",
                };
                this.dataService.setConfig(updatedConfig);
                this.savePersistedConfig();
                showMessage("[Ledger] " + this.i18n.save);
            },
        });

        this.setting.addItem({
            title: this.i18n.settingDefaultCurrency,
            description: "e.g. CNY, USD, EUR",
            createActionElement: () => currencyInput,
        });
        this.setting.addItem({
            title: this.i18n.settingDefaultDebitAccount,
            description: "e.g. Assets:Alipay",
            createActionElement: () => debitInput,
        });
        this.setting.addItem({
            title: this.i18n.settingDisplayMode,
            createActionElement: () => displayModeSelect,
        });
    }

    // ─── EventBus ────────────────────────────────────────────────────────────

    private registerEventBusListeners() {
        // Inject edit buttons when protyle content loads
        this.eventBus.on("loaded-protyle-static", ({detail}: any) => {
            this.injectEditButtons(detail?.protyle?.wysiwyg?.element);
        });
        this.eventBus.on("loaded-protyle-dynamic", ({detail}: any) => {
            this.injectEditButtons(detail?.protyle?.wysiwyg?.element);
        });

        // Right-click menu on transaction blocks
        this.eventBus.on("open-menu-content", ({detail}: any) => {
            const blockEl = detail?.element as HTMLElement | undefined;
            if (!blockEl) return;
            const isLedgerBlock = blockEl.getAttribute(ATTR_TYPE) === TRANSACTION_TYPE_VALUE
                || blockEl.querySelector(`[${ATTR_TYPE}="${TRANSACTION_TYPE_VALUE}"]`);
            if (!isLedgerBlock) return;

            detail.menu.addItem({
                id: "ledger-edit-tx",
                iconHTML: "\ud83d\udcb0",
                label: this.i18n.editTransaction,
                click: () => {
                    const blockId = blockEl.dataset.nodeId
                        || blockEl.closest("[data-node-id]")?.getAttribute("data-node-id");
                    if (blockId) this.openEditTransactionById(blockId);
                },
            });
            detail.menu.addItem({
                id: "ledger-delete-tx",
                iconHTML: "\ud83d\uddd1\ufe0f",
                label: this.i18n.deleteTransaction,
                click: () => {
                    const blockId = blockEl.dataset.nodeId
                        || blockEl.closest("[data-node-id]")?.getAttribute("data-node-id");
                    if (!blockId) return;
                    confirm("\u26a0\ufe0f", this.i18n.confirmDeleteTx, () => {
                        this.dataService.deleteTransaction(blockId).then(() => {
                            showMessage("[Ledger] " + this.i18n.txDeleted);
                        });
                    });
                },
            });
        });
    }

    /**
     * Scan a protyle wysiwyg element for transaction blocks and inject an
     * edit button in the upper-right corner of each one.
     */
    private injectEditButtons(container: HTMLElement | undefined) {
        if (!container) return;
        const blocks = container.querySelectorAll<HTMLElement>(
            `[${ATTR_TYPE}="${TRANSACTION_TYPE_VALUE}"]`,
        );
        for (const block of blocks) {
            // Skip if we already injected a button
            if (block.querySelector(".ledger-edit-btn")) continue;
            block.classList.add("ledger-tx-has-edit");
            const btn = document.createElement("button");
            btn.className = "ledger-edit-btn";
            btn.title = this.i18n.editTransaction;
            btn.textContent = "✏️";
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                const blockId = block.dataset.nodeId
                    || block.closest("[data-node-id]")?.getAttribute("data-node-id");
                if (blockId) this.openEditTransactionById(blockId);
            });
            block.appendChild(btn);
        }
    }

    private openEditTransactionById(blockId: string) {
        fetchPost("/api/attr/getBlockAttrs", {id: blockId}, (res) => {
            if (res.code !== 0) return;
            const attrs = res.data || {};

            let postings: ITransaction["postings"] = [];
            try {
                postings = JSON.parse(attrs[ATTR_POSTINGS] || "[]");
            } catch {
                // keep empty
            }
            const tagsRaw = attrs[ATTR_TAGS] || "";

            const tx: ITransaction = {
                blockId,
                uuid: attrs[ATTR_UUID] || blockId,
                date: attrs[ATTR_DATE] || "",
                status: (attrs[ATTR_STATUS] as ITransaction["status"]) || "uncleared",
                payee: attrs[ATTR_PAYEE] || "",
                narration: attrs[ATTR_NARRATION] || "",
                postings,
                tags: tagsRaw ? tagsRaw.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
            };

            this.openEditDialog(tx);
        });
    }

    private openEditDialog(tx: ITransaction) {
        const ds = this.dataService;
        const i18n = this.i18n;
        const config = ds.getConfig();

        const allAccounts = ["Assets", "Liabilities", "Income", "Expenses", "Equity"]
            .map(t => `<optgroup label="${t}">${ds.getAccountsByPrefix(t).map(a =>
                `<option value="${a.path}">${a.icon || ""} ${a.path}${a.note ? " (" + a.note + ")" : ""}</option>`
            ).join("")}</optgroup>`).join("");

        // Build posting rows HTML
        const postingRowsHtml = tx.postings.map((p, idx) => `
        <div class="ledger-split-row" data-posting-idx="${idx}">
          <select class="b3-select edit-posting-account" style="flex:1">${allAccounts.replace(
            `value="${p.account}"`,
            `value="${p.account}" selected`
        )}</select>
          <input class="b3-text-field edit-posting-amount" type="number" step="0.01" value="${p.amount}" style="width:100px">
          <select class="b3-select edit-posting-currency" style="width:70px">
            ${Object.keys(config.currencySymbols).map(c =>
            `<option value="${c}" ${c === p.currency ? "selected" : ""}>${c}</option>`
        ).join("")}
          </select>
        </div>`).join("");

        const content = `<div class="b3-dialog__content ledger-dialog">
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.date}</label>
    <input id="ledger-edit-date" class="b3-text-field fn__block" type="date" value="${tx.date}">
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.status}</label>
    <select id="ledger-edit-status" class="b3-select fn__block">
      <option value="cleared" ${tx.status === "cleared" ? "selected" : ""}>✓ ${i18n.cleared}</option>
      <option value="pending" ${tx.status === "pending" ? "selected" : ""}>? ${i18n.pending}</option>
      <option value="uncleared" ${tx.status === "uncleared" ? "selected" : ""}>~ ${i18n.uncleared}</option>
    </select>
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.payee}</label>
    <input id="ledger-edit-payee" class="b3-text-field fn__block" type="text" value="${tx.payee}">
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.narration}</label>
    <input id="ledger-edit-narration" class="b3-text-field fn__block" type="text" value="${tx.narration || ""}">
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.tags}</label>
    <input id="ledger-edit-tags" class="b3-text-field fn__block" type="text" value="${(tx.tags || []).join(", ")}">
  </div>
  <div class="ledger-section-title" style="margin-top:8px">${i18n.postings}</div>
  <div id="ledger-edit-postings">
    ${postingRowsHtml}
  </div>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" id="ledger-edit-cancel">${i18n.cancel}</button>
  <div class="fn__space"></div>
  <button class="b3-button b3-button--text" id="ledger-edit-save">✓ ${i18n.save}</button>
</div>`;

        const dialog = new Dialog({
            title: `✏️ ${i18n.editTransaction}`,
            content,
            width: "520px",
            height: "auto",
        });
        const el = dialog.element;

        el.querySelector("#ledger-edit-cancel")?.addEventListener("click", () => dialog.destroy());

        el.querySelector("#ledger-edit-save")?.addEventListener("click", async () => {
            const updatedTx: ITransaction = {
                blockId: tx.blockId,
                uuid: tx.uuid,
                date: (el.querySelector<HTMLInputElement>("#ledger-edit-date"))?.value || tx.date,
                status: (el.querySelector<HTMLSelectElement>("#ledger-edit-status"))?.value as ITransaction["status"] || tx.status,
                payee: (el.querySelector<HTMLInputElement>("#ledger-edit-payee"))?.value.trim() || tx.payee,
                narration: (el.querySelector<HTMLInputElement>("#ledger-edit-narration"))?.value.trim() || "",
                tags: ((el.querySelector<HTMLInputElement>("#ledger-edit-tags"))?.value || "")
                    .split(",").map(t => t.trim()).filter(Boolean),
                postings: [],
            };

            // Collect postings from form
            const postingRows = el.querySelectorAll("#ledger-edit-postings .ledger-split-row");
            for (const row of postingRows) {
                const account = (row.querySelector<HTMLSelectElement>(".edit-posting-account"))?.value || "";
                const amount = parseFloat((row.querySelector<HTMLInputElement>(".edit-posting-amount"))?.value || "0");
                const currency = (row.querySelector<HTMLSelectElement>(".edit-posting-currency"))?.value || config.defaultCurrency;
                if (account) {
                    updatedTx.postings.push({account, amount, currency});
                }
            }

            if (updatedTx.postings.length < 2) {
                showMessage("[Ledger] " + i18n.postingsRequired);
                return;
            }

            try {
                await ds.updateTransaction(updatedTx);
                dialog.destroy();
                showMessage("[Ledger] " + i18n.txUpdated);
            } catch (e) {
                console.error("[SiYuan Ledger] update transaction failed:", e);
                showMessage(`[Ledger] ${i18n.txUpdateFailed}: ${e}`);
            }
        });

        el.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Escape") dialog.destroy();
        });
    }

    // ─── Quick entry helpers ─────────────────────────────────────────────────

    private getActiveProtyle(): Protyle | null {
        try {
            return this.getEditor()?.protyle as unknown as Protyle ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Find the block ID of the currently focused block in the protyle.
     * Used to identify the block where a slash command was typed.
     */
    private getSlashBlockId(protyle: Protyle): string | undefined {
        const wysiwyg = protyle?.protyle?.wysiwyg?.element;
        if (!wysiwyg) return undefined;
        const sel = document.getSelection();
        if (!sel || sel.rangeCount === 0) return undefined;
        let node: Node | null = sel.getRangeAt(0).startContainer;
        while (node && node !== wysiwyg) {
            if (node instanceof HTMLElement && node.dataset?.nodeId) {
                return node.dataset.nodeId;
            }
            node = node.parentNode;
        }
        return undefined;
    }

    /**
     * Remove the empty block left behind by a slash command.
     */
    private removeSlashBlock(blockId: string): void {
        fetchPost("/api/block/deleteBlock", {id: blockId}, (res) => {
            if (res.code !== 0) {
                console.warn("[SiYuan Ledger] failed to remove slash block:", res.msg);
            }
        });
    }

    private showQuickExpense(protyle?: Protyle, slashBlockId?: string) {
        const p = protyle || this.getActiveProtyle();
        if (!p) {
            showMessage("[Ledger] " + this.i18n.openDocFirst);
            return;
        }
        openQuickEntryDialog({
            mode: "expense",
            protyle: p,
            dataService: this.dataService,
            i18n: this.i18n,
            onSuccess: () => {
                showMessage("[Ledger] " + this.i18n.txInserted);
                this.savePersistedCache();
                if (slashBlockId) this.removeSlashBlock(slashBlockId);
            },
        });
    }

    private showQuickIncome(protyle?: Protyle, slashBlockId?: string) {
        const p = protyle || this.getActiveProtyle();
        if (!p) {
            showMessage("[Ledger] " + this.i18n.openDocFirst);
            return;
        }
        openQuickEntryDialog({
            mode: "income",
            protyle: p,
            dataService: this.dataService,
            i18n: this.i18n,
            onSuccess: () => {
                showMessage("[Ledger] " + this.i18n.txInserted);
                this.savePersistedCache();
                if (slashBlockId) this.removeSlashBlock(slashBlockId);
            },
        });
    }

    private showQuickTransfer(protyle?: Protyle, slashBlockId?: string) {
        const p = protyle || this.getActiveProtyle();
        if (!p) {
            showMessage("[Ledger] " + this.i18n.openDocFirst);
            return;
        }
        openQuickEntryDialog({
            mode: "transfer",
            protyle: p,
            dataService: this.dataService,
            i18n: this.i18n,
            onSuccess: () => {
                showMessage("[Ledger] " + this.i18n.txInserted);
                this.savePersistedCache();
                if (slashBlockId) this.removeSlashBlock(slashBlockId);
            },
        });
    }

    private showQuickEntry(protyle?: Protyle, slashBlockId?: string) {
        const p = protyle || this.getActiveProtyle();
        if (!p) {
            showMessage("[Ledger] " + this.i18n.openDocFirst);
            return;
        }
        openSimpleEntryDialog({
            protyle: p,
            dataService: this.dataService,
            i18n: this.i18n,
            onSuccess: () => {
                showMessage("[Ledger] " + this.i18n.txInserted);
                this.savePersistedCache();
                if (slashBlockId) this.removeSlashBlock(slashBlockId);
            },
        });
    }

    private showCreditCardPayment(protyle?: Protyle, slashBlockId?: string) {
        const p = protyle || this.getActiveProtyle();
        if (!p) {
            showMessage("[Ledger] " + this.i18n.openDocFirst);
            return;
        }
        openQuickEntryDialog({
            mode: "transfer",
            protyle: p,
            dataService: this.dataService,
            i18n: this.i18n,
            defaultFromAccount: "Assets:Bank:Checking",
            defaultToAccount: "Liabilities:CreditCard:CMB",
            onSuccess: () => {
                showMessage("[Ledger] " + this.i18n.txInserted);
                this.savePersistedCache();
                if (slashBlockId) this.removeSlashBlock(slashBlockId);
            },
        });
    }

    private showReimbursement(protyle?: Protyle, slashBlockId?: string) {
        const p = protyle || this.getActiveProtyle();
        if (!p) {
            showMessage("[Ledger] " + this.i18n.openDocFirst);
            return;
        }
        openQuickEntryDialog({
            mode: "income",
            protyle: p,
            dataService: this.dataService,
            i18n: this.i18n,
            defaultFromAccount: "Income:Reimbursement",
            defaultTags: ["报销"],
            onSuccess: () => {
                showMessage("[Ledger] " + this.i18n.txInserted);
                this.savePersistedCache();
                if (slashBlockId) this.removeSlashBlock(slashBlockId);
            },
        });
    }

    // ─── Export helpers ──────────────────────────────────────────────────────

    private async doExport(format: "ledger" | "beancount" | "csv") {
        try {
            const txns = await this.dataService.queryAllTransactions();
            const config = this.dataService.getConfig();
            const accounts = this.dataService.getAccounts();
            const date = new Date().toISOString().slice(0, 10);
            let content = "";
            let filename = "";

            if (format === "ledger") {
                content = exportToLedger(txns, config);
                filename = `siyuan-ledger-${date}.ledger`;
            } else if (format === "beancount") {
                content = exportToBeancount(txns, accounts, config);
                filename = `siyuan-ledger-${date}.beancount`;
            } else {
                content = exportToCSV(txns);
                filename = `siyuan-ledger-${date}.csv`;
            }
            downloadFile(filename, content);
            showMessage(`[Ledger] Exported ${txns.length} transactions`);
        } catch (e) {
            showMessage(`[Ledger] Export failed: ${e}`);
        }
    }

    // ─── Import/Export dialog ────────────────────────────────────────────────

    private openImportExport() {
        openImportExportDialog({
            dataService: this.dataService,
            i18n: this.i18n,
            isMobile: this.isMobile,
            onImportSuccess: async (txns) => {
                // Actually persist each imported transaction
                const protyle = this.getActiveProtyle();
                if (!protyle) {
                    showMessage("[Ledger] " + this.i18n.openDocFirst);
                    return;
                }
                try {
                    const protoInst = protyle.protyle;
                    const parentID = protoInst?.block?.rootID || "";
                    let previousID = protoInst?.wysiwyg?.element?.lastElementChild
                        ? ((protoInst.wysiwyg.element.lastElementChild as HTMLElement).dataset?.nodeId || "")
                        : "";

                    for (const tx of txns) {
                        const blockId = await this.dataService.insertTransaction(tx, parentID, previousID);
                        previousID = blockId;
                    }
                    await this.dataService.refreshCache();
                    await this.savePersistedCache();
                    showMessage(`[Ledger] ${this.i18n.importSuccess}: ${txns.length} ${this.i18n.transactions}`);
                } catch (e) {
                    console.error("[SiYuan Ledger] import failed:", e);
                    showMessage(`[Ledger] ${this.i18n.importFailed}: ${e}`);
                }
            },
        });
    }

    // ─── Account manager ─────────────────────────────────────────────────────

    private openAccountManager() {
        openAccountManagerDialog(
            this.dataService,
            this.i18n,
            (updatedAccounts) => {
                this.dataService.setAccounts(updatedAccounts);
                this.savePersistedAccounts();
            },
        );
    }

    // ─── Top bar menu ────────────────────────────────────────────────────────

    private showTopMenu(rect?: DOMRect) {
        const menu = new Menu("ledgerTopBar");
        menu.addItem({
            icon: "iconLedger",
            label: `\ud83d\udcb0 ${this.i18n.quickExpense}`,
            accelerator: adaptHotkey("\u21e7\u2318E"),
            click: () => this.showQuickExpense(),
        });
        menu.addItem({
            icon: "iconLedger",
            label: `\ud83d\udcc8 ${this.i18n.quickIncome}`,
            accelerator: adaptHotkey("\u21e7\u2318I"),
            click: () => this.showQuickIncome(),
        });
        menu.addItem({
            icon: "iconLedger",
            label: `\ud83d\udd04 ${this.i18n.quickTransfer}`,
            click: () => this.showQuickTransfer(),
        });
        menu.addItem({
            icon: "iconLedger",
            label: `\u26a1 ${this.i18n.quickEntry}`,
            click: () => this.showQuickEntry(),
        });
        menu.addItem({
            icon: "iconLedger",
            label: `💳 ${this.i18n.quickCreditCardPayment}`,
            click: () => this.showCreditCardPayment(),
        });
        menu.addItem({
            icon: "iconLedger",
            label: `📋 ${this.i18n.quickReimbursement}`,
            click: () => this.showReimbursement(),
        });
        menu.addSeparator();
        menu.addItem({
            icon: "iconLedger",
            label: `\ud83d\udcca ${this.i18n.openDashboard}`,
            accelerator: adaptHotkey("\u21e7\u2318L"),
            click: () => this.openDashboard(),
        });
        menu.addSeparator();
        menu.addItem({
            icon: "iconLedger",
            label: `\ud83d\udccb ${this.i18n.importExport}`,
            click: () => this.openImportExport(),
        });
        menu.addItem({
            icon: "iconLedger",
            label: `\ud83c\udfe6 ${this.i18n.accountManager}`,
            click: () => this.openAccountManager(),
        });

        if (rect) {
            menu.open({x: rect.left, y: rect.bottom, isLeft: false});
        } else {
            menu.open({x: 0, y: 0});
        }
    }

    // ─── Status bar ──────────────────────────────────────────────────────────

    private updateStatusBar(el: HTMLElement) {
        const cache = this.dataService.getCache();
        const config = this.dataService.getConfig();
        const sym = this.dataService.getCurrencySymbol(config.defaultCurrency);
        const thisMonth = new Date().toISOString().slice(0, 7);
        const monthlyExpense = cache.monthlyExpenses[thisMonth] || 0;

        el.innerHTML = `<svg style="width:14px;height:14px;vertical-align:middle;margin-right:4px;">
      <use xlink:href="#iconLedger"></use></svg><span style="font-size:12px;vertical-align:middle;">
      ${this.i18n.statusBar} <span class="ledger-expense">${sym}${monthlyExpense.toFixed(0)}</span></span>`;
    }
}
