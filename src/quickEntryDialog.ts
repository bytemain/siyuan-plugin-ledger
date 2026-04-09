/**
 * Quick entry dialogs — expense, income, transfer, and simple one-line entry.
 */
import {Dialog, Protyle} from "siyuan";
import {DataService} from "./dataService";
import {IPosting, ITransaction} from "./types";
import {ACCOUNT_ALIASES} from "./defaultAccounts";

// ─── Helper ──────────────────────────────────────────────────────────────────

function escapeHtmlAttr(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function accountOptions(ds: DataService, prefix: string): string {
    return ds.getAccountsByPrefix(prefix)
        .map(a => {
            const path = escapeHtmlAttr(a.path);
            const note = a.note ? ` (${escapeHtmlAttr(a.note)})` : "";
            return `<option value="${path}">${a.icon || ""} ${path}${note}</option>`;
        })
        .join("");
}

function allAccountOptions(ds: DataService): string {
    const types = ["Assets", "Liabilities", "Income", "Expenses", "Equity"];
    return types.map(t => `<optgroup label="${t}">${accountOptions(ds, t)}</optgroup>`).join("");
}

/** Returns YYYY-MM-DD for today */
function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

// ─── Expense / Income dialog ─────────────────────────────────────────────────

export interface IQuickEntryOptions {
    mode: "expense" | "income" | "transfer";
    protyle: Protyle;
    dataService: DataService;
    i18n: Record<string, string>;
    onSuccess?: (blockId: string) => void;
}

export function openQuickEntryDialog(opts: IQuickEntryOptions): void {
    const {mode, protyle, dataService: ds, i18n, onSuccess} = opts;
    const config = ds.getConfig();

    const isExpense = mode === "expense";
    const isIncome = mode === "income";

    const titleMap = {
        expense: i18n.quickExpense,
        income: i18n.quickIncome,
        transfer: i18n.quickTransfer,
    };
    const title = titleMap[mode];

    // Auto-complete suggestions
    const cache = ds.getCache();
    const payeeSuggestions = cache.recentPayees.slice(0, 8);
    const datalistHtml = payeeSuggestions.length
        ? `<datalist id="ledger-payee-list">${payeeSuggestions.map(p => `<option value="${p}">`).join("")}</datalist>`
        : "";

    // Account selectors
    const expenseAccounts = allAccountOptions(ds);
    const assetAccounts = ds.getAccountsByPrefix("Assets")
        .concat(ds.getAccountsByPrefix("Liabilities"))
        .map(a => `<option value="${a.path}">${a.icon || ""} ${a.path}${a.note ? " (" + a.note + ")" : ""}</option>`)
        .join("");
    const incomeAccounts = accountOptions(ds, "Income");

    let fromAccountHtml: string;
    let toAccountHtml: string;

    if (isExpense) {
        fromAccountHtml = `<select id="ledger-from-account" class="b3-select fn__block">${assetAccounts}</select>`;
        toAccountHtml = `<select id="ledger-to-account" class="b3-select fn__block">${expenseAccounts}</select>`;
    } else if (isIncome) {
        fromAccountHtml = `<select id="ledger-from-account" class="b3-select fn__block">${incomeAccounts}</select>`;
        toAccountHtml = `<select id="ledger-to-account" class="b3-select fn__block">${assetAccounts}</select>`;
    } else {
        // transfer
        fromAccountHtml = `<select id="ledger-from-account" class="b3-select fn__block">${assetAccounts}</select>`;
        toAccountHtml = `<select id="ledger-to-account" class="b3-select fn__block">${assetAccounts}</select>`;
    }

    const fromLabel = isExpense ? i18n.payAccount : (isIncome ? i18n.incomeSource : i18n.fromAccount);
    const toLabel = isExpense ? i18n.expenseCategory : (isIncome ? i18n.toAccount : i18n.toAccount);

    const splitSectionId = "ledger-split-section";
    const splitToggleId = "ledger-split-toggle";

    const content = `<div class="b3-dialog__content ledger-dialog">
  ${datalistHtml}
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.date}</label>
    <input id="ledger-date" class="b3-text-field fn__block" type="date" value="${todayStr()}">
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.status}</label>
    <select id="ledger-status" class="b3-select fn__block">
      <option value="cleared">✓ ${i18n.cleared}</option>
      <option value="pending">? ${i18n.pending}</option>
      <option value="uncleared">~ ${i18n.uncleared}</option>
    </select>
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.payee}</label>
    <input id="ledger-payee" class="b3-text-field fn__block" type="text" list="ledger-payee-list" placeholder="${i18n.payeePlaceholder}">
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.amount}</label>
    <div style="display:flex;gap:8px;">
      <input id="ledger-amount" class="b3-text-field" type="number" min="0" step="0.01" placeholder="0.00" style="flex:1">
      <select id="ledger-currency" class="b3-select" style="width:80px;">
        <option value="CNY" ${config.defaultCurrency === "CNY" ? "selected" : ""}>CNY</option>
        <option value="USD" ${config.defaultCurrency === "USD" ? "selected" : ""}>USD</option>
        <option value="EUR" ${config.defaultCurrency === "EUR" ? "selected" : ""}>EUR</option>
        <option value="GBP" ${config.defaultCurrency === "GBP" ? "selected" : ""}>GBP</option>
        <option value="JPY" ${config.defaultCurrency === "JPY" ? "selected" : ""}>JPY</option>
        <option value="HKD" ${config.defaultCurrency === "HKD" ? "selected" : ""}>HKD</option>
      </select>
    </div>
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${toLabel}</label>
    ${toAccountHtml}
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${fromLabel}</label>
    ${fromAccountHtml}
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.narration}</label>
    <input id="ledger-narration" class="b3-text-field fn__block" type="text" placeholder="${i18n.narrationPlaceholder}">
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.tags}</label>
    <input id="ledger-tags" class="b3-text-field fn__block" type="text" placeholder="${i18n.tagsPlaceholder}">
  </div>
  <div class="ledger-form-row">
    <label></label>
    <label class="ledger-checkbox-label">
      <input id="${splitToggleId}" type="checkbox"> ${i18n.splitBill}
    </label>
  </div>
  <div id="${splitSectionId}" style="display:none;" class="ledger-split-section">
    <div id="ledger-split-rows"></div>
    <button id="ledger-add-split" class="b3-button b3-button--outline" style="margin-top:8px;">+ ${i18n.addSplitRow}</button>
  </div>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" id="ledger-cancel">${i18n.cancel}</button>
  <div class="fn__space"></div>
  <button class="b3-button b3-button--text" id="ledger-submit">✓ ${i18n.recordTx}</button>
</div>`;

    const dialog = new Dialog({
        title: `💰 ${title}`,
        content,
        width: "500px",
        height: "auto",
    });

    const el = dialog.element;

    // ── Set defaults ────────────────────────────────────────────────────
    const defDebit = config.defaultDebitAccount;
    const fromSelect = el.querySelector<HTMLSelectElement>("#ledger-from-account");
    if (fromSelect) {
        const opt = fromSelect.querySelector<HTMLOptionElement>(`option[value="${defDebit}"]`);
        if (opt) opt.selected = true;
    }

    // ── Split bill toggle ───────────────────────────────────────────────
    const splitToggle = el.querySelector<HTMLInputElement>(`#${splitToggleId}`);
    const splitSection = el.querySelector<HTMLElement>(`#${splitSectionId}`);
    const splitRows = el.querySelector<HTMLElement>("#ledger-split-rows");

    if (splitToggle && splitSection && splitRows) {
        splitToggle.addEventListener("change", () => {
            splitSection.style.display = splitToggle.checked ? "" : "none";
        });

        el.querySelector("#ledger-add-split")?.addEventListener("click", () => {
            const rowIndex = splitRows.children.length;
            const rowDiv = document.createElement("div");
            rowDiv.className = "ledger-split-row";
            rowDiv.innerHTML = `
        <select class="b3-select split-account" style="flex:1">${expenseAccounts}</select>
        <input class="b3-text-field split-amount" type="number" min="0" step="0.01" placeholder="0.00" style="width:90px">
        <button class="b3-button b3-button--outline split-remove" style="padding:0 6px" data-index="${rowIndex}">×</button>`;
            rowDiv.querySelector(".split-remove")?.addEventListener("click", () => rowDiv.remove());
            splitRows.appendChild(rowDiv);
        });
    }

    // ── Cancel ─────────────────────────────────────────────────────────
    el.querySelector("#ledger-cancel")?.addEventListener("click", () => dialog.destroy());

    // ── Submit ──────────────────────────────────────────────────────────
    el.querySelector("#ledger-submit")?.addEventListener("click", async () => {
        const dateVal = (el.querySelector<HTMLInputElement>("#ledger-date"))?.value || todayStr();
        const statusVal = (el.querySelector<HTMLSelectElement>("#ledger-status"))?.value as ITransaction["status"] || "cleared";
        const payeeVal = (el.querySelector<HTMLInputElement>("#ledger-payee"))?.value.trim() || "";
        const amountVal = parseFloat((el.querySelector<HTMLInputElement>("#ledger-amount"))?.value || "0");
        const currencyVal = (el.querySelector<HTMLSelectElement>("#ledger-currency"))?.value || config.defaultCurrency;
        const toAccount = (el.querySelector<HTMLSelectElement>("#ledger-to-account"))?.value || "";
        const fromAccount = (el.querySelector<HTMLSelectElement>("#ledger-from-account"))?.value || "";
        const narrationVal = (el.querySelector<HTMLInputElement>("#ledger-narration"))?.value.trim() || "";
        const tagsVal = (el.querySelector<HTMLInputElement>("#ledger-tags"))?.value.trim() || "";
        const tags = tagsVal ? tagsVal.split(",").map(t => t.trim()).filter(Boolean) : [];

        if (!payeeVal) {
            const payeeInput = el.querySelector<HTMLInputElement>("#ledger-payee");
            payeeInput?.focus();
            payeeInput?.classList.add("ledger-error");
            return;
        }
        if (isNaN(amountVal) || amountVal <= 0) {
            const amountInput = el.querySelector<HTMLInputElement>("#ledger-amount");
            amountInput?.focus();
            amountInput?.classList.add("ledger-error");
            return;
        }

        let postings: IPosting[];
        const isSplit = splitToggle?.checked;

        if (isSplit && splitRows && splitRows.children.length > 0) {
            // Build split postings
            const splitPostingRows = [...splitRows.children] as HTMLElement[];
            postings = [];
            for (const row of splitPostingRows) {
                const acct = (row.querySelector<HTMLSelectElement>(".split-account"))?.value || "";
                const amt = parseFloat((row.querySelector<HTMLInputElement>(".split-amount"))?.value || "0");
                if (acct && !isNaN(amt)) {
                    if (isExpense) {
                        postings.push({account: acct, amount: amt, currency: currencyVal});
                    } else {
                        postings.push({account: acct, amount: -amt, currency: currencyVal});
                    }
                }
            }
            // Add counter posting (from account)
            const splitTotal = postings.reduce((s, p) => s + Math.abs(p.amount), 0);
            postings.push({
                account: fromAccount,
                amount: isExpense ? -splitTotal : splitTotal,
                currency: currencyVal,
            });
        } else if (isExpense) {
            postings = [
                {account: toAccount, amount: amountVal, currency: currencyVal},
                {account: fromAccount, amount: -amountVal, currency: currencyVal},
            ];
        } else if (isIncome) {
            postings = [
                {account: fromAccount, amount: -amountVal, currency: currencyVal},
                {account: toAccount, amount: amountVal, currency: currencyVal},
            ];
        } else {
            // transfer
            postings = [
                {account: fromAccount, amount: -amountVal, currency: currencyVal},
                {account: toAccount, amount: amountVal, currency: currencyVal},
            ];
        }

        const tx: Omit<ITransaction, "blockId"> = {
            uuid: "",
            date: dateVal,
            status: statusVal,
            payee: payeeVal,
            narration: narrationVal,
            postings,
            tags,
        };

        try {
            const protoInst = protyle.protyle;
            const element = protoInst?.wysiwyg?.element;
            const parentID = protoInst?.block?.rootID || "";
            const previousID = element?.lastElementChild
                ? (element.lastElementChild as HTMLElement).dataset?.nodeId || ""
                : "";

            const blockId = await ds.insertTransaction(tx, parentID, previousID);
            dialog.destroy();
            onSuccess?.(blockId);
        } catch (e) {
            console.error("[SiYuan Ledger] insert transaction failed:", e);
        }
    });

    // ── Keyboard shortcut: Enter = submit ───────────────────────────────
    el.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey && !(e.target as HTMLElement).matches("textarea")) {
            e.preventDefault();
            (el.querySelector<HTMLButtonElement>("#ledger-submit"))?.click();
        }
        if (e.key === "Escape") {
            dialog.destroy();
        }
    });

    // Focus payee field
    setTimeout(() => (el.querySelector<HTMLInputElement>("#ledger-payee"))?.focus(), 100);
}

// ─── Simple one-line entry ────────────────────────────────────────────────────

export interface ISimpleEntryOptions {
    protyle: Protyle;
    dataService: DataService;
    i18n: Record<string, string>;
    onSuccess?: (blockId: string) => void;
}

/**
 * Parse a quick-add line such as:
 *   "午饭 58"
 *   "打车回家 32 微信"
 *   "2024-03-15 海底捞 258 信用卡 标签:聚餐"
 */
function parseQuickLine(line: string, ds: DataService): Partial<ITransaction> | null {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length === 0) return null;

    const config = ds.getConfig();

    let idx = 0;
    let date = ds.today();
    let payee = "";
    let amount = 0;
    let accountAlias = "";
    const tags: string[] = [];

    // First token: date?
    if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(tokens[0])) {
        date = tokens[0].replace(/\//g, "-");
        idx++;
    }

    // Second token: payee (non-numeric)
    if (idx < tokens.length && isNaN(Number(tokens[idx]))) {
        payee = tokens[idx++];
    }

    // Remaining tokens
    for (; idx < tokens.length; idx++) {
        const t = tokens[idx];
        if (/^\d+(\.\d+)?$/.test(t)) {
            amount = parseFloat(t);
        } else if (t.startsWith("标签:") || t.startsWith("tags:")) {
            tags.push(...t.split(":").slice(1));
        } else if (ACCOUNT_ALIASES[t]) {
            accountAlias = ACCOUNT_ALIASES[t];
        }
    }

    if (!payee || amount <= 0) return null;

    const fromAccount = accountAlias || config.defaultDebitAccount;
    const expenseAccount = "Expenses:Food:Dining"; // default

    const postings: IPosting[] = [
        {account: expenseAccount, amount, currency: config.defaultCurrency},
        {account: fromAccount, amount: -amount, currency: config.defaultCurrency},
    ];

    return {
        uuid: "",
        date,
        status: "cleared",
        payee,
        narration: "",
        postings,
        tags,
    };
}

export function openSimpleEntryDialog(opts: ISimpleEntryOptions): void {
    const {protyle, dataService: ds, i18n, onSuccess} = opts;
    const config = ds.getConfig();
    const expenseAccounts = allAccountOptions(ds);

    // Currency options
    const currencyKeys = Object.keys(config.currencySymbols);
    const currencyOptionsHtml = currencyKeys
        .map(c => `<option value="${escapeHtmlAttr(c)}" ${c === config.defaultCurrency ? "selected" : ""}>${escapeHtmlAttr(c)}</option>`)
        .join("");

    const content = `<div class="b3-dialog__content ledger-dialog">
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.quickEntryHint}</label>
    <input id="ledger-quick-line" class="b3-text-field fn__block" type="text"
      placeholder="${i18n.quickEntryPlaceholder}">
  </div>
  <div id="ledger-quick-preview" class="ledger-preview" style="display:none;">
    <div class="ledger-form-row">
      <label class="ledger-label">${i18n.date}</label>
      <input id="ledger-qe-date" class="b3-text-field fn__block" type="date" value="${todayStr()}">
    </div>
    <div class="ledger-form-row">
      <label class="ledger-label">${i18n.payee}</label>
      <input id="ledger-qe-payee" class="b3-text-field fn__block" type="text">
    </div>
    <div id="ledger-qe-postings"></div>
    <div class="ledger-form-row">
      <label class="ledger-label">${i18n.tags}</label>
      <input id="ledger-qe-tags" class="b3-text-field fn__block" type="text" placeholder="${i18n.tagsPlaceholder}">
    </div>
  </div>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" id="ledger-cancel">${i18n.cancel}</button>
  <div class="fn__space"></div>
  <button class="b3-button b3-button--text" id="ledger-submit">✓ ${i18n.recordTx}</button>
</div>`;

    const dialog = new Dialog({
        title: `⚡ ${i18n.quickEntry}`,
        content,
        width: "460px",
        height: "auto",
    });
    const el = dialog.element;
    const lineInput = el.querySelector<HTMLInputElement>("#ledger-quick-line");
    const preview = el.querySelector<HTMLElement>("#ledger-quick-preview");
    const postingsDiv = el.querySelector<HTMLElement>("#ledger-qe-postings");

    function buildPostingRow(p: IPosting): HTMLDivElement {
        const row = document.createElement("div");
        row.className = "ledger-qe-posting-row";
        const icon = p.amount >= 0 ? "📤" : "📥";
        row.innerHTML = `
          <label class="ledger-label">${icon}</label>
          <select class="b3-select qe-posting-account" style="flex:1">${expenseAccounts}</select>
          <input class="b3-text-field qe-posting-amount" type="number" step="0.01" value="${p.amount}" style="width:100px">
          <select class="b3-select qe-posting-currency" style="width:70px">${currencyOptionsHtml}</select>`;
        // Set the selected account by value (avoid CSS selector issues with special chars like colons)
        const select = row.querySelector<HTMLSelectElement>(".qe-posting-account");
        if (select) {
            select.value = p.account;
        }
        // Set the selected currency
        const currSelect = row.querySelector<HTMLSelectElement>(".qe-posting-currency");
        if (currSelect) {
            currSelect.value = p.currency;
        }
        return row;
    }

    lineInput?.addEventListener("input", () => {
        if (!preview || !postingsDiv) return;
        const partial = parseQuickLine(lineInput.value, ds);
        if (partial && partial.postings && partial.postings.length > 0) {
            const dateInput = el.querySelector<HTMLInputElement>("#ledger-qe-date");
            const payeeInput = el.querySelector<HTMLInputElement>("#ledger-qe-payee");
            const tagsInput = el.querySelector<HTMLInputElement>("#ledger-qe-tags");

            if (dateInput) dateInput.value = partial.date || todayStr();
            if (payeeInput) payeeInput.value = partial.payee || "";
            if (tagsInput) tagsInput.value = (partial.tags || []).join(", ");

            postingsDiv.innerHTML = "";
            partial.postings.forEach(p => {
                postingsDiv.appendChild(buildPostingRow(p));
            });

            preview.style.display = "";
        } else {
            preview.style.display = "none";
        }
    });

    el.querySelector("#ledger-cancel")?.addEventListener("click", () => dialog.destroy());

    el.querySelector("#ledger-submit")?.addEventListener("click", async () => {
        if (!postingsDiv) return;

        // Read from editable fields
        const dateVal = (el.querySelector<HTMLInputElement>("#ledger-qe-date"))?.value || todayStr();
        const payeeVal = (el.querySelector<HTMLInputElement>("#ledger-qe-payee"))?.value.trim() || "";
        const tagsVal = (el.querySelector<HTMLInputElement>("#ledger-qe-tags"))?.value.trim() || "";
        const tags = tagsVal ? tagsVal.split(",").map(t => t.trim()).filter(Boolean) : [];

        if (!payeeVal) {
            const payeeInput = el.querySelector<HTMLInputElement>("#ledger-qe-payee");
            payeeInput?.focus();
            payeeInput?.classList.add("ledger-error");
            return;
        }

        // Collect postings from editable fields
        const postingRows = [...postingsDiv.querySelectorAll<HTMLElement>(".ledger-qe-posting-row")];
        if (postingRows.length === 0) return;

        const postings: IPosting[] = postingRows.map(row => {
            const account = (row.querySelector<HTMLSelectElement>(".qe-posting-account"))?.value || "";
            const amount = parseFloat((row.querySelector<HTMLInputElement>(".qe-posting-amount"))?.value || "0");
            const currency = (row.querySelector<HTMLSelectElement>(".qe-posting-currency"))?.value || config.defaultCurrency;
            return {account, amount, currency};
        });

        try {
            const protoInst = protyle.protyle;
            const element = protoInst?.wysiwyg?.element;
            const parentID = protoInst?.block?.rootID || "";
            const previousID = element?.lastElementChild
                ? (element.lastElementChild as HTMLElement).dataset?.nodeId || ""
                : "";

            const tx: Omit<ITransaction, "blockId"> = {
                uuid: "",
                date: dateVal,
                status: "cleared",
                payee: payeeVal,
                narration: "",
                postings,
                tags,
            };
            const blockId = await ds.insertTransaction(tx, parentID, previousID);
            dialog.destroy();
            onSuccess?.(blockId);
        } catch (e) {
            console.error("[SiYuan Ledger] quick entry failed:", e);
        }
    });

    el.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (el.querySelector<HTMLButtonElement>("#ledger-submit"))?.click();
        }
        if (e.key === "Escape") dialog.destroy();
    });

    setTimeout(() => lineInput?.focus(), 100);
}
