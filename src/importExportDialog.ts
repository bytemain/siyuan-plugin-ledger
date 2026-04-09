/**
 * Import / Export dialog
 */
import {Dialog, showMessage} from "siyuan";
import {DataService} from "./dataService";
import {exportToLedger, exportToBeancount, exportToCSV, downloadFile} from "./exportService";
import {parseLedgerFile, parseBeancountFile, parseCSV} from "./importService";
import {ITransaction} from "./types";

export interface IImportExportDialogOptions {
    dataService: DataService;
    i18n: Record<string, string>;
    isMobile: boolean;
    onImportSuccess?: (txns: ITransaction[]) => void;
}

export function openImportExportDialog(opts: IImportExportDialogOptions): void {
    const {dataService: ds, i18n, onImportSuccess} = opts;

    const content = `<div class="b3-dialog__content ledger-dialog" style="min-height:320px;">
  <div class="ledger-tab-bar">
    <button class="b3-button ledger-tab-btn ledger-tab-active" data-tab="export">📤 ${i18n.export}</button>
    <button class="b3-button ledger-tab-btn" data-tab="import">📥 ${i18n.import}</button>
  </div>

  <!-- Export Panel -->
  <div id="ledger-panel-export" class="ledger-panel">
    <p class="ledger-hint">${i18n.exportHint}</p>
    <div class="ledger-form-row">
      <label class="ledger-label">${i18n.exportFormat}</label>
      <select id="ledger-export-format" class="b3-select fn__block">
        <option value="ledger">Ledger CLI (.ledger)</option>
        <option value="beancount">Beancount (.beancount)</option>
        <option value="csv">CSV (.csv)</option>
      </select>
    </div>
    <div class="ledger-form-row">
      <label class="ledger-label">${i18n.dateRange}</label>
      <div style="display:flex;gap:8px;">
        <input id="ledger-export-from" class="b3-text-field" type="date" style="flex:1">
        <span style="line-height:32px">—</span>
        <input id="ledger-export-to" class="b3-text-field" type="date" style="flex:1">
      </div>
    </div>
    <div style="margin-top:16px;">
      <button id="ledger-do-export" class="b3-button b3-button--text">📤 ${i18n.doExport}</button>
    </div>
  </div>

  <!-- Import Panel -->
  <div id="ledger-panel-import" class="ledger-panel" style="display:none;">
    <p class="ledger-hint">${i18n.importHint}</p>
    <div class="ledger-form-row">
      <label class="ledger-label">${i18n.importFormat}</label>
      <select id="ledger-import-format" class="b3-select fn__block">
        <option value="ledger">Ledger CLI (.ledger)</option>
        <option value="beancount">Beancount (.beancount)</option>
        <option value="csv">CSV</option>
      </select>
    </div>
    <div class="ledger-form-row">
      <label class="ledger-label">${i18n.selectFile}</label>
      <input id="ledger-import-file" type="file" class="b3-text-field fn__block" accept=".ledger,.beancount,.csv,.txt">
    </div>
    <div id="ledger-import-preview" style="display:none;margin-top:8px;">
      <div class="ledger-hint" id="ledger-import-count"></div>
    </div>
    <div style="margin-top:16px;">
      <button id="ledger-do-import" class="b3-button b3-button--text" disabled>📥 ${i18n.doImport}</button>
    </div>
  </div>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" id="ledger-ie-cancel">${i18n.close}</button>
</div>`;

    const dialog = new Dialog({
        title: `📋 ${i18n.importExport}`,
        content,
        width: "480px",
        height: "auto",
    });
    const el = dialog.element;

    // ── Tab switching ────────────────────────────────────────────────────
    el.querySelectorAll<HTMLButtonElement>(".ledger-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            el.querySelectorAll(".ledger-tab-btn").forEach(b => b.classList.remove("ledger-tab-active"));
            btn.classList.add("ledger-tab-active");
            const tab = btn.dataset.tab;
            (el.querySelector("#ledger-panel-export") as HTMLElement).style.display = tab === "export" ? "" : "none";
            (el.querySelector("#ledger-panel-import") as HTMLElement).style.display = tab === "import" ? "" : "none";
        });
    });

    // ── Export ──────────────────────────────────────────────────────────
    el.querySelector("#ledger-do-export")?.addEventListener("click", async () => {
        const format = (el.querySelector<HTMLSelectElement>("#ledger-export-format"))?.value || "csv";
        const fromDate = (el.querySelector<HTMLInputElement>("#ledger-export-from"))?.value || "";
        const toDate = (el.querySelector<HTMLInputElement>("#ledger-export-to"))?.value || "";

        try {
            let txns = await ds.queryAllTransactions();
            if (fromDate) txns = txns.filter(t => t.date >= fromDate);
            if (toDate) txns = txns.filter(t => t.date <= toDate);

            const config = ds.getConfig();
            const accounts = ds.getAccounts();
            let content = "";
            let filename = "";

            if (format === "ledger") {
                content = exportToLedger(txns, config);
                filename = `siyuan-ledger-${new Date().toISOString().slice(0, 10)}.ledger`;
            } else if (format === "beancount") {
                content = exportToBeancount(txns, accounts, config);
                filename = `siyuan-ledger-${new Date().toISOString().slice(0, 10)}.beancount`;
            } else {
                content = exportToCSV(txns);
                filename = `siyuan-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
            }

            downloadFile(filename, content);
            showMessage(`[Ledger] ${i18n.exportSuccess}: ${txns.length} ${i18n.transactions}`);
        } catch (e) {
            showMessage(`[Ledger] ${i18n.exportFailed}: ${e}`);
        }
    });

    // ── Import file picker ───────────────────────────────────────────────
    let parsedTransactions: ITransaction[] = [];

    el.querySelector<HTMLInputElement>("#ledger-import-file")?.addEventListener("change", async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const format = (el.querySelector<HTMLSelectElement>("#ledger-import-format"))?.value || "csv";

        const text = await file.text();
        const preview = el.querySelector<HTMLElement>("#ledger-import-preview");
        const countEl = el.querySelector<HTMLElement>("#ledger-import-count");
        const importBtn = el.querySelector<HTMLButtonElement>("#ledger-do-import");

        try {
            if (format === "ledger") {
                const result = parseLedgerFile(text);
                parsedTransactions = result.transactions;
            } else if (format === "beancount") {
                const result = parseBeancountFile(text);
                parsedTransactions = result.transactions;
            } else {
                parsedTransactions = parseCSV(text);
            }

            if (countEl) countEl.textContent = `${i18n.parsedTransactions}: ${parsedTransactions.length}`;
            if (preview) preview.style.display = "";
            if (importBtn) importBtn.disabled = parsedTransactions.length === 0;
        } catch (err) {
            if (countEl) countEl.textContent = `${i18n.parseError}: ${err}`;
            if (preview) preview.style.display = "";
        }
    });

    // ── Import execute ───────────────────────────────────────────────────
    el.querySelector("#ledger-do-import")?.addEventListener("click", () => {
        if (parsedTransactions.length === 0) return;
        onImportSuccess?.(parsedTransactions);
        showMessage(`[Ledger] ${i18n.importSuccess}: ${parsedTransactions.length} ${i18n.transactions}`);
        dialog.destroy();
    });

    // ── Close ────────────────────────────────────────────────────────────
    el.querySelector("#ledger-ie-cancel")?.addEventListener("click", () => dialog.destroy());
}
