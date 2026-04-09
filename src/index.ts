/**
 * SiYuan Ledger — Main plugin entry point
 */
import {
    Plugin,
    showMessage,
    confirm,
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
                this.dataService.setCache(cacheData as ILedgerCache);
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
                filter: ["\u8bb0\u8d26", "\u652f\u51fa", "expense", "\u82b1\u8d39", "\u6d88\u8d39"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">\ud83d\udcb0 ${this.i18n.quickExpense}</span></div>`,
                id: "ledger-expense",
                callback: (protyle: Protyle) => {
                    this.showQuickExpense(protyle);
                },
            },
            {
                filter: ["\u6536\u5165", "income", "\u5de5\u8d44", "\u8fdb\u8d26"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">\ud83d\udcc8 ${this.i18n.quickIncome}</span></div>`,
                id: "ledger-income",
                callback: (protyle: Protyle) => {
                    this.showQuickIncome(protyle);
                },
            },
            {
                filter: ["\u8f6c\u8d26", "transfer", "\u5212\u8f6c"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">\ud83d\udd04 ${this.i18n.quickTransfer}</span></div>`,
                id: "ledger-transfer",
                callback: (protyle: Protyle) => {
                    this.showQuickTransfer(protyle);
                },
            },
            {
                filter: ["\u5feb\u8bb0", "quick", "q"],
                html: `<div class="b3-list-item__first"><span class="b3-list-item__text">\u26a1 ${this.i18n.quickEntry}</span></div>`,
                id: "ledger-quickadd",
                callback: (protyle: Protyle) => {
                    this.showQuickEntry(protyle);
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
        <span>${this.i18n.monthlyExpenses}</span>
        <span class="ledger-dock-amount ledger-expense">${symDef}${monthlyExpense.toFixed(2)}</span>
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

    private openEditTransactionById(blockId: string) {
        fetchPost("/api/attr/getBlockAttrs", {id: blockId}, (res) => {
            if (res.code !== 0) return;
            showMessage(`[Ledger] ${this.i18n.editTransaction}: ${blockId.slice(0, 8)}\u2026`);
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

    private showQuickExpense(protyle?: Protyle) {
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
            },
        });
    }

    private showQuickIncome(protyle?: Protyle) {
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
            },
        });
    }

    private showQuickTransfer(protyle?: Protyle) {
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
            },
        });
    }

    private showQuickEntry(protyle?: Protyle) {
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
            onImportSuccess: (txns) => {
                showMessage(`[Ledger] Imported ${txns.length} transactions`);
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
      ${this.i18n.statusBar} ${sym}${monthlyExpense.toFixed(0)}</span>`;
    }
}
