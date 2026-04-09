/**
 * Account manager dialog — view and edit the account tree.
 */
import {Dialog, showMessage} from "siyuan";
import {DataService} from "./dataService";
import {IAccount} from "./types";

export function openAccountManagerDialog(
    dataService: DataService,
    i18n: Record<string, string>,
    onSave: (accounts: IAccount[]) => void,
): void {
    const accounts = [...dataService.getAccounts()];
    const types: IAccount["type"][] = ["Assets", "Liabilities", "Income", "Expenses", "Equity"];

    function renderTree(): string {
        return types.map(type => {
            const group = accounts.filter(a => a.type === type);
            const rows = group.map((a) => {
                const globalIdx = accounts.indexOf(a);
                return `<div class="ledger-account-row" data-idx="${globalIdx}">
          <span class="ledger-account-icon">${a.icon || ""}</span>
          <span class="ledger-account-path">${a.path}</span>
          <span class="ledger-account-note">${a.note || ""}</span>
          <span class="ledger-account-status ${a.closeDate ? "ledger-closed" : "ledger-open"}">
            ${a.closeDate ? `⛔ ${i18n.closed}` : `✓ ${i18n.open}`}
          </span>
          <button class="b3-button ledger-account-edit" data-idx="${globalIdx}">${i18n.edit}</button>
          ${!a.closeDate
            ? `<button class="b3-button b3-button--outline ledger-account-close" data-idx="${globalIdx}">${i18n.closeAccount}</button>`
            : ""}
        </div>`;
            }).join("");
            return `<div class="ledger-account-group">
        <div class="ledger-account-type-header">${type}</div>
        ${rows || `<div class="ledger-empty">${i18n.noAccounts}</div>`}
      </div>`;
        }).join("");
    }

    const content = `<div class="b3-dialog__content ledger-dialog ledger-account-manager">
  <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
    <button id="ledger-add-account" class="b3-button b3-button--text">+ ${i18n.addAccount}</button>
  </div>
  <div id="ledger-account-tree">${renderTree()}</div>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" id="ledger-acct-cancel">${i18n.cancel}</button>
  <div class="fn__space"></div>
  <button class="b3-button b3-button--text" id="ledger-acct-save">${i18n.save}</button>
</div>`;

    const dialog = new Dialog({
        title: `🏦 ${i18n.accountManager}`,
        content,
        width: "600px",
        height: "70vh",
    });
    const el = dialog.element;

    function refreshTree() {
        const tree = el.querySelector<HTMLElement>("#ledger-account-tree");
        if (tree) tree.innerHTML = renderTree();
        attachRowEvents();
    }

    function openEditDialog(idx: number) {
        const acc = accounts[idx] || {} as Partial<IAccount>;
        const editContent = `<div class="b3-dialog__content ledger-dialog">
      <div class="ledger-form-row">
        <label class="ledger-label">${i18n.accountPath}</label>
        <input id="edit-path" class="b3-text-field fn__block" value="${acc.path || ""}" placeholder="Expenses:Food:Dining">
      </div>
      <div class="ledger-form-row">
        <label class="ledger-label">${i18n.accountType}</label>
        <select id="edit-type" class="b3-select fn__block">
          ${types.map(t => `<option value="${t}" ${acc.type === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
      </div>
      <div class="ledger-form-row">
        <label class="ledger-label">${i18n.icon}</label>
        <input id="edit-icon" class="b3-text-field fn__block" value="${acc.icon || ""}" placeholder="💰">
      </div>
      <div class="ledger-form-row">
        <label class="ledger-label">${i18n.note}</label>
        <input id="edit-note" class="b3-text-field fn__block" value="${acc.note || ""}">
      </div>
      <div class="ledger-form-row">
        <label class="ledger-label">${i18n.currencies}</label>
        <input id="edit-currencies" class="b3-text-field fn__block" value="${(acc.currencies || ["CNY"]).join(",")}" placeholder="CNY,USD">
      </div>
    </div>
    <div class="b3-dialog__action">
      <button class="b3-button b3-button--cancel" id="edit-cancel">${i18n.cancel}</button>
      <div class="fn__space"></div>
      <button class="b3-button b3-button--text" id="edit-save">${i18n.save}</button>
    </div>`;

        const editDialog = new Dialog({
            title: idx < accounts.length ? `✏️ ${i18n.editAccount}` : `+ ${i18n.addAccount}`,
            content: editContent,
            width: "420px",
        });
        const eel = editDialog.element;
        eel.querySelector("#edit-cancel")?.addEventListener("click", () => editDialog.destroy());
        eel.querySelector("#edit-save")?.addEventListener("click", () => {
            const path = (eel.querySelector<HTMLInputElement>("#edit-path"))?.value.trim();
            const type = (eel.querySelector<HTMLSelectElement>("#edit-type"))?.value as IAccount["type"];
            const icon = (eel.querySelector<HTMLInputElement>("#edit-icon"))?.value.trim();
            const note = (eel.querySelector<HTMLInputElement>("#edit-note"))?.value.trim();
            const currencies = (eel.querySelector<HTMLInputElement>("#edit-currencies"))?.value.split(",").map(c => c.trim()).filter(Boolean);

            if (!path) return;

            const updated: IAccount = {
                path,
                type,
                currencies: currencies || ["CNY"],
                openDate: acc.openDate || new Date().toISOString().slice(0, 10),
                icon,
                note,
            };

            if (idx < accounts.length) {
                accounts[idx] = updated;
            } else {
                accounts.push(updated);
            }
            editDialog.destroy();
            refreshTree();
        });
    }

    function attachRowEvents() {
        el.querySelectorAll<HTMLButtonElement>(".ledger-account-edit").forEach(btn => {
            btn.addEventListener("click", () => openEditDialog(parseInt(btn.dataset.idx || "0")));
        });
        el.querySelectorAll<HTMLButtonElement>(".ledger-account-close").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.dataset.idx || "0");
                accounts[idx].closeDate = new Date().toISOString().slice(0, 10);
                refreshTree();
            });
        });
    }

    attachRowEvents();

    el.querySelector("#ledger-add-account")?.addEventListener("click", () => {
        openEditDialog(accounts.length);
    });

    el.querySelector("#ledger-acct-cancel")?.addEventListener("click", () => dialog.destroy());
    el.querySelector("#ledger-acct-save")?.addEventListener("click", () => {
        onSave(accounts);
        showMessage(`[Ledger] ${i18n.accountsSaved}`);
        dialog.destroy();
    });
}
