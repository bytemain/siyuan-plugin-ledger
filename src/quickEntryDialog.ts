/**
 * Quick entry dialogs — expense, income, transfer, and simple one-line entry.
 */
import {Dialog, Protyle, showMessage} from "siyuan";
import {DataService} from "./dataService";
import {IAccount, IPosting, ITransaction} from "./types";
import {ACCOUNT_ALIASES, CREDIT_CARD_PAYMENT_PATTERNS, REIMBURSEMENT_PATTERNS} from "./defaultAccounts";
import {attachPayeeAutocomplete, attachNarrationAutocomplete, attachTagAutocomplete} from "./autocomplete";

const ADD_NEW_SENTINEL = "__ADD_NEW__";

// ─── Helper ──────────────────────────────────────────────────────────────────

function escapeHtmlAttr(s: string): string {
    if (!s) return "";
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
    /** Pre-select the "from" account (e.g. for credit card payment or reimbursement) */
    defaultFromAccount?: string;
    /** Pre-select the "to" account (e.g. for credit card payment) */
    defaultToAccount?: string;
    /** Pre-fill tags (e.g. ["报销"] for reimbursement) */
    defaultTags?: string[];
    /** Called when a new account is added inline so it can be persisted */
    onAccountAdded?: () => void;
}

// ─── Inline "add account" dialog ─────────────────────────────────────────────

/**
 * Opens a small dialog to create a new account inline from a dropdown.
 * On save the account is added to DataService and the callback is invoked
 * with the new account so the caller can update the <select>.
 */
function openInlineAddAccountDialog(
    ds: DataService,
    i18n: Record<string, string>,
    defaultType: IAccount["type"],
    onCreated: (account: IAccount) => void,
): void {
    const types: IAccount["type"][] = ["Assets", "Liabilities", "Income", "Expenses", "Equity"];
    const config = ds.getConfig();
    const isCategory = defaultType === "Expenses" || defaultType === "Income";
    const dialogTitle = isCategory ? (i18n.addCategory ?? i18n.addAccount) : i18n.addAccount;

    const editContent = `<div class="b3-dialog__content ledger-dialog">
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.accountPath}</label>
    <input id="inline-add-path" class="b3-text-field fn__block" value="" placeholder="${isCategory ? "Expenses:Food:Dining" : "Assets:Bank:Savings"}">
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.accountType}</label>
    <select id="inline-add-type" class="b3-select fn__block">
      ${types.map(t => `<option value="${t}" ${t === defaultType ? "selected" : ""}>${t}</option>`).join("")}
    </select>
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.icon}</label>
    <input id="inline-add-icon" class="b3-text-field fn__block" value="" placeholder="💰">
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.note}</label>
    <input id="inline-add-note" class="b3-text-field fn__block" value="">
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.currencies}</label>
    <input id="inline-add-currencies" class="b3-text-field fn__block" value="${config.defaultCurrency}" placeholder="CNY,USD">
  </div>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" id="inline-add-cancel">${i18n.cancel}</button>
  <div class="fn__space"></div>
  <button class="b3-button b3-button--text" id="inline-add-save">${i18n.save}</button>
</div>`;

    const addDialog = new Dialog({
        title: `+ ${dialogTitle}`,
        content: editContent,
        width: "420px",
    });
    const eel = addDialog.element;

    eel.querySelector("#inline-add-cancel")?.addEventListener("click", () => addDialog.destroy());
    eel.querySelector("#inline-add-save")?.addEventListener("click", () => {
        const path = eel.querySelector<HTMLInputElement>("#inline-add-path")?.value.trim() || "";
        const type = (eel.querySelector<HTMLSelectElement>("#inline-add-type")?.value || defaultType) as IAccount["type"];
        const icon = eel.querySelector<HTMLInputElement>("#inline-add-icon")?.value.trim() || "";
        const note = eel.querySelector<HTMLInputElement>("#inline-add-note")?.value.trim() || "";
        const currencies = (eel.querySelector<HTMLInputElement>("#inline-add-currencies")?.value || config.defaultCurrency)
            .split(",").map(c => c.trim()).filter(Boolean);

        if (!path) {
            eel.querySelector<HTMLInputElement>("#inline-add-path")?.classList.add("ledger-error");
            eel.querySelector<HTMLInputElement>("#inline-add-path")?.focus();
            return;
        }

        // Check for duplicate account path
        if (ds.findAccount(path)) {
            eel.querySelector<HTMLInputElement>("#inline-add-path")?.classList.add("ledger-error");
            eel.querySelector<HTMLInputElement>("#inline-add-path")?.focus();
            return;
        }

        const newAccount: IAccount = {
            path,
            type,
            currencies: currencies.length ? currencies : [config.defaultCurrency],
            openDate: new Date().toISOString().slice(0, 10),
            icon,
            note,
        };

        // Add to DataService
        const accounts = ds.getAccounts();
        accounts.push(newAccount);
        ds.setAccounts(accounts);

        addDialog.destroy();
        showMessage(`[Ledger] ${i18n.accountsSaved}`);
        onCreated(newAccount);
    });

    // Focus path input
    setTimeout(() => eel.querySelector<HTMLInputElement>("#inline-add-path")?.focus(), 100);
}

/**
 * Rebuild the <option> list for a <select>, including the sentinel "add new" item.
 */
function rebuildSelectOptions(
    select: HTMLSelectElement,
    ds: DataService,
    prefixes: string[],
    addLabel: string,
): void {
    const options = prefixes
        .flatMap(prefix => ds.getAccountsByPrefix(prefix))
        .map(a => {
            const path = escapeHtmlAttr(a.path);
            const note = a.note ? ` (${escapeHtmlAttr(a.note)})` : "";
            return `<option value="${path}">${a.icon || ""} ${path}${note}</option>`;
        })
        .join("");
    select.innerHTML = options + `<option value="${ADD_NEW_SENTINEL}">${addLabel}</option>`;
}

/**
 * Attach a change listener to a <select> that intercepts the "add new" sentinel
 * and opens the inline add-account dialog.
 */
function attachAddNewHandler(
    select: HTMLSelectElement,
    ds: DataService,
    i18n: Record<string, string>,
    prefixes: string[],
    defaultType: IAccount["type"],
    addLabel: string,
    onAccountAdded?: () => void,
): void {
    select.addEventListener("change", () => {
        if (select.value !== ADD_NEW_SENTINEL) return;

        // Remember current real value to restore if user cancels
        const firstRealOption = select.querySelector<HTMLOptionElement>(`option:not([value="${ADD_NEW_SENTINEL}"])`);
        const fallbackValue = firstRealOption?.value || "";

        openInlineAddAccountDialog(ds, i18n, defaultType, (newAccount) => {
            // Rebuild options and select the newly created account
            rebuildSelectOptions(select, ds, prefixes, addLabel);
            select.value = newAccount.path;
            onAccountAdded?.();
        });

        // Restore previous value so form doesn't have sentinel selected
        select.value = fallbackValue;
    });
}

export function openQuickEntryDialog(opts: IQuickEntryOptions): void {
    const {mode, protyle, dataService: ds, i18n, onSuccess, onAccountAdded} = opts;
    const config = ds.getConfig();

    const isExpense = mode === "expense";
    const isIncome = mode === "income";
    const isTransfer = mode === "transfer";

    const titleMap = {
        expense: i18n.quickExpense,
        income: i18n.quickIncome,
        transfer: i18n.quickTransfer,
    };
    const title = titleMap[mode];

    const addCategoryLabel = i18n.addCategoryInline || "+ New Category…";
    const addAccountLabel = i18n.addAccountInline || "+ New Account…";

    // Account selectors — append "add new" sentinel at end of each dropdown
    const expenseCategoryAccounts = accountOptions(ds, "Expenses")
        + `<option value="${ADD_NEW_SENTINEL}">${addCategoryLabel}</option>`;
    const assetAccounts = ds.getAccountsByPrefix("Assets")
        .concat(ds.getAccountsByPrefix("Liabilities"))
        .map(a => `<option value="${a.path}">${a.icon || ""} ${a.path}${a.note ? " (" + a.note + ")" : ""}</option>`)
        .join("")
        + `<option value="${ADD_NEW_SENTINEL}">${addAccountLabel}</option>`;
    const incomeAccounts = accountOptions(ds, "Income")
        + `<option value="${ADD_NEW_SENTINEL}">${addCategoryLabel}</option>`;

    let fromAccountHtml: string;
    let toAccountHtml: string;

    if (isExpense) {
        fromAccountHtml = `<select id="ledger-from-account" class="b3-select fn__block">${assetAccounts}</select>`;
        toAccountHtml = `<select id="ledger-to-account" class="b3-select fn__block">${expenseCategoryAccounts}</select>`;
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

    const payeeRow = `<div class="ledger-form-row">
    <label class="ledger-label">${isTransfer ? i18n.transferDescription : i18n.payee}</label>
    <input id="ledger-payee" class="b3-text-field fn__block" type="text" placeholder="${isTransfer ? i18n.transferDescPlaceholder : i18n.payeePlaceholder}" autocomplete="off">
  </div>`;

    const amountRow = `<div class="ledger-form-row">
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
  </div>`;

    // For expense mode, show amount first (more intuitive); otherwise payee first
    const payeeAmountRows = isExpense ? amountRow + payeeRow : payeeRow + amountRow;

    const content = `<div class="b3-dialog__content ledger-dialog">
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
  ${payeeAmountRows}
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
    <input id="ledger-narration" class="b3-text-field fn__block" type="text" placeholder="${i18n.narrationPlaceholder}" autocomplete="off">
  </div>
  <div class="ledger-form-row">
    <label class="ledger-label">${i18n.tags}</label>
    <input id="ledger-tags" class="b3-text-field fn__block" type="text" placeholder="${i18n.tagsPlaceholder}" autocomplete="off">
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

    // ── Attach payee autocomplete with category inference + amount pre-fill ─
    const payeeInput = el.querySelector<HTMLInputElement>("#ledger-payee");
    if (payeeInput) {
        attachPayeeAutocomplete({
            input: payeeInput,
            dataService: ds,
            i18n,
            onSelect: (selectedPayee: string) => {
                const stats = ds.getPayeeStats(selectedPayee);
                if (!stats) return;
                // Amount pre-fill: use historical average
                const amountInput = el.querySelector<HTMLInputElement>("#ledger-amount");
                if (amountInput && !amountInput.value) {
                    const avg = Math.round(stats.totalAmount / stats.count);
                    if (avg > 0) amountInput.value = String(avg);
                }
                // Category inference: select the most recently used account
                if (stats.lastAccount) {
                    const toSelect = el.querySelector<HTMLSelectElement>("#ledger-to-account");
                    if (toSelect) {
                        const opt = [...toSelect.options].find(o => o.value === stats.lastAccount);
                        if (opt) toSelect.value = stats.lastAccount;
                    }
                }
            },
        });
    }

    // ── Attach narration autocomplete ───────────────────────────────────
    const narrationInput = el.querySelector<HTMLInputElement>("#ledger-narration");
    if (narrationInput) {
        attachNarrationAutocomplete({input: narrationInput, dataService: ds});
    }

    // ── Attach tag autocomplete ─────────────────────────────────────────
    const tagsInput = el.querySelector<HTMLInputElement>("#ledger-tags");
    if (tagsInput) {
        attachTagAutocomplete({input: tagsInput, dataService: ds});
    }

    // ── Set defaults ────────────────────────────────────────────────────
    const defFromAccount = opts.defaultFromAccount || config.defaultDebitAccount;
    const fromSelect = el.querySelector<HTMLSelectElement>("#ledger-from-account");
    if (fromSelect) {
        fromSelect.value = defFromAccount;
    }

    // Set default "to" account if specified
    if (opts.defaultToAccount) {
        const toSelect = el.querySelector<HTMLSelectElement>("#ledger-to-account");
        if (toSelect) {
            toSelect.value = opts.defaultToAccount;
        }
    }

    // Pre-fill tags if specified
    if (opts.defaultTags && opts.defaultTags.length > 0) {
        const tagsInput = el.querySelector<HTMLInputElement>("#ledger-tags");
        if (tagsInput && !tagsInput.value) {
            tagsInput.value = opts.defaultTags.join(", ");
        }
    }

    // ── Attach "add new" handlers on dropdowns ──────────────────────────
    const toSelect = el.querySelector<HTMLSelectElement>("#ledger-to-account");
    if (toSelect) {
        let toPrefixes: string[];
        let toDefaultType: IAccount["type"];
        let toAddLabel: string;
        if (isExpense) {
            toPrefixes = ["Expenses"];
            toDefaultType = "Expenses";
            toAddLabel = addCategoryLabel;
        } else if (isIncome) {
            toPrefixes = ["Assets", "Liabilities"];
            toDefaultType = "Assets";
            toAddLabel = addAccountLabel;
        } else {
            toPrefixes = ["Assets", "Liabilities"];
            toDefaultType = "Assets";
            toAddLabel = addAccountLabel;
        }
        attachAddNewHandler(toSelect, ds, i18n, toPrefixes, toDefaultType, toAddLabel, onAccountAdded);
    }

    if (fromSelect) {
        let fromPrefixes: string[];
        let fromDefaultType: IAccount["type"];
        let fromAddLabel: string;
        if (isExpense) {
            fromPrefixes = ["Assets", "Liabilities"];
            fromDefaultType = "Assets";
            fromAddLabel = addAccountLabel;
        } else if (isIncome) {
            fromPrefixes = ["Income"];
            fromDefaultType = "Income";
            fromAddLabel = addCategoryLabel;
        } else {
            fromPrefixes = ["Assets", "Liabilities"];
            fromDefaultType = "Assets";
            fromAddLabel = addAccountLabel;
        }
        attachAddNewHandler(fromSelect, ds, i18n, fromPrefixes, fromDefaultType, fromAddLabel, onAccountAdded);
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
        <select class="b3-select split-account" style="flex:1">${expenseCategoryAccounts}</select>
        <input class="b3-text-field split-amount" type="number" min="0" step="0.01" placeholder="0.00" style="width:90px">
        <button class="b3-button b3-button--outline split-remove" style="padding:0 6px" data-index="${rowIndex}">×</button>`;
            rowDiv.querySelector(".split-remove")?.addEventListener("click", () => rowDiv.remove());
            // Attach add-new handler to split account dropdown
            const splitSelect = rowDiv.querySelector<HTMLSelectElement>(".split-account");
            if (splitSelect) {
                attachAddNewHandler(splitSelect, ds, i18n, ["Expenses"], "Expenses", addCategoryLabel, onAccountAdded);
            }
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

        if (!payeeVal && !isTransfer) {
            const payeeInput = el.querySelector<HTMLInputElement>("#ledger-payee");
            payeeInput?.focus();
            payeeInput?.classList.add("ledger-error");
            return;
        }
        // For transfers, use a default payee if none provided
        const finalPayee = payeeVal || (isTransfer ? (i18n.transferDefaultPayee || "Transfer") : "");
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
            payee: finalPayee,
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

    // Focus: amount for expense/transfer, payee for income
    setTimeout(() => {
        const focusField = isIncome ? "#ledger-payee" : "#ledger-amount";
        (el.querySelector<HTMLInputElement>(focusField))?.focus();
    }, 100);
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
 *   "还信用卡 5000 银行卡"         — credit card bill payment (transfer)
 *   "还招行 5000"                  — credit card bill payment to specific card
 *   "报销 差旅费 380"              — reimbursement income
 *   "报销 差旅费 380 银行卡"       — reimbursement income to specific account
 */
/**
 * Tokenize a quick-entry line. Whitespace-separated by default, but quoted
 * substrings (ASCII "…" '…' or full-width “…” ‘…’) are kept together as a
 * single token so that payees/narrations containing spaces (e.g.
 * `"Codex Team" 35.9`) are parsed correctly.
 */
function tokenizeQuickLine(line: string): string[] {
    const tokens: string[] = [];
    const re = /"([^"]*)"|'([^']*)'|\u201C([^\u201D]*)\u201D|\u2018([^\u2019]*)\u2019|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
        tokens.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? "");
    }
    return tokens;
}

export function parseQuickLine(line: string, ds: DataService): Partial<ITransaction> | null {
    const trimmed = line.trim();
    const tokens = tokenizeQuickLine(trimmed);
    if (tokens.length === 0) return null;

    // Strip optional leading date to find the keyword token
    let keywordStart = 0;
    if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(tokens[0])) {
        keywordStart = 1;
    }
    const keywordToken = tokens[keywordStart] || "";

    // ── Check for credit card bill payment (还信用卡/还招行/还工行...) ──
    for (const {pattern, targetAccount} of CREDIT_CARD_PAYMENT_PATTERNS) {
        if (pattern.test(keywordToken)) {
            return parseCreditCardPayment(tokens, pattern, targetAccount, ds);
        }
    }

    // ── Check for reimbursement income (报销/收到报销...) ──
    for (const pattern of REIMBURSEMENT_PATTERNS) {
        if (pattern.test(keywordToken)) {
            return parseReimbursement(tokens, pattern, ds);
        }
    }

    // ── Standard expense parsing ──
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

    // Second token(s): payee — collect all consecutive non-numeric tokens
    // that aren't tags or known account aliases, so multi-word payees
    // (e.g. `Codex Team 35.9` or the quoted form `"Codex Team" 35.9`) are
    // captured as a single payee.
    const payeeParts: string[] = [];
    while (idx < tokens.length) {
        const t = tokens[idx];
        if (/^\d+(\.\d+)?$/.test(t)) break;
        if (t.startsWith("标签:") || t.startsWith("tags:")) break;
        if (ACCOUNT_ALIASES[t]) break;
        payeeParts.push(t);
        idx++;
    }
    payee = payeeParts.join(" ");

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
    // Category inference: use payee history if available, otherwise default
    const payeeStats = ds.getPayeeStats(payee);
    const expenseAccount = (payeeStats?.lastAccount && payeeStats.lastAccount.startsWith("Expenses:"))
        ? payeeStats.lastAccount
        : "Expenses:Food:Dining";

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

/**
 * Parse a credit card bill payment line.
 * E.g. "还信用卡 5000 银行卡" → transfer from Assets:Bank:Checking to Liabilities:CreditCard:CMB
 */
function parseCreditCardPayment(
    tokens: string[],
    pattern: RegExp,
    defaultTargetAccount: string,
    ds: DataService,
): Partial<ITransaction> | null {
    const config = ds.getConfig();
    let idx = 0;
    let date = ds.today();
    let payee = "";
    let amount = 0;
    let sourceAccount = "";

    // First token may be a date
    if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(tokens[0])) {
        date = tokens[0].replace(/\//g, "-");
        idx++;
    }

    // The payee token is the one matching the pattern (e.g. "还信用卡")
    if (idx < tokens.length && pattern.test(tokens[idx])) {
        payee = tokens[idx++];
    }

    // Remaining tokens: amount and optional source account alias
    for (; idx < tokens.length; idx++) {
        const t = tokens[idx];
        if (/^\d+(\.\d+)?$/.test(t)) {
            amount = parseFloat(t);
        } else if (ACCOUNT_ALIASES[t]) {
            sourceAccount = ACCOUNT_ALIASES[t];
        }
    }

    if (!payee || amount <= 0) return null;

    const fromAccount = sourceAccount || config.defaultDebitAccount;
    const postings: IPosting[] = [
        {account: defaultTargetAccount, amount: amount, currency: config.defaultCurrency},
        {account: fromAccount, amount: -amount, currency: config.defaultCurrency},
    ];

    return {
        uuid: "",
        date,
        status: "cleared",
        payee,
        narration: "",
        postings,
        tags: [],
    };
}

/**
 * Parse a reimbursement income line.
 * E.g. "报销 差旅费 380 银行卡" → income from Income:Reimbursement to Assets:Bank:Checking
 */
function parseReimbursement(
    tokens: string[],
    pattern: RegExp,
    ds: DataService,
): Partial<ITransaction> | null {
    const config = ds.getConfig();
    let idx = 0;
    let date = ds.today();
    let payee = "";
    let narration = "";
    let amount = 0;
    let targetAccount = "";
    const tags: string[] = [];

    // First token may be a date
    if (/^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(tokens[0])) {
        date = tokens[0].replace(/\//g, "-");
        idx++;
    }

    // The trigger token (e.g. "报销" or "收到报销")
    if (idx < tokens.length && pattern.test(tokens[idx])) {
        idx++;
    }

    // Remaining tokens: narration (payee description), amount, optional target account, tags
    for (; idx < tokens.length; idx++) {
        const t = tokens[idx];
        if (/^\d+(\.\d+)?$/.test(t)) {
            amount = parseFloat(t);
        } else if (t.startsWith("标签:") || t.startsWith("tags:")) {
            tags.push(...t.split(":").slice(1));
        } else if (ACCOUNT_ALIASES[t]) {
            targetAccount = ACCOUNT_ALIASES[t];
        } else {
            narration = narration ? narration + " " + t : t;
        }
    }

    if (amount <= 0) return null;

    payee = narration || "报销";
    const toAccount = targetAccount || config.defaultDebitAccount;
    const postings: IPosting[] = [
        {account: "Income:Reimbursement", amount: -amount, currency: config.defaultCurrency},
        {account: toAccount, amount: amount, currency: config.defaultCurrency},
    ];

    return {
        uuid: "",
        date,
        status: "cleared",
        payee,
        narration: "",
        postings,
        tags: tags.length > 0 ? tags : ["报销"],
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
      <input id="ledger-qe-tags" class="b3-text-field fn__block" type="text" placeholder="${i18n.tagsPlaceholder}" autocomplete="off">
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

    // Attach autocomplete to the editable payee field in the preview
    const qePayeeInput = el.querySelector<HTMLInputElement>("#ledger-qe-payee");
    if (qePayeeInput) {
        attachPayeeAutocomplete({
            input: qePayeeInput,
            dataService: ds,
            i18n,
            onSelect: (selectedPayee: string) => {
                const stats = ds.getPayeeStats(selectedPayee);
                if (!stats || !postingsDiv) return;
                // Update the first posting account if the inferred account matches
                if (stats.lastAccount) {
                    const firstAcctSelect = postingsDiv.querySelector<HTMLSelectElement>(".qe-posting-account");
                    if (firstAcctSelect) {
                        const opt = [...firstAcctSelect.options].find(o => o.value === stats.lastAccount);
                        if (opt) firstAcctSelect.value = stats.lastAccount;
                    }
                }
                // Update the first posting amount with the historical average
                if (stats.count > 0) {
                    const firstAmtInput = postingsDiv.querySelector<HTMLInputElement>(".qe-posting-amount");
                    if (firstAmtInput) {
                        const currentVal = parseFloat(firstAmtInput.value);
                        const avg = Math.round(stats.totalAmount / stats.count);
                        if (avg > 0 && (!firstAmtInput.value || currentVal === 0)) {
                            firstAmtInput.value = String(avg);
                            // Also update the counter-posting
                            const allAmtInputs = postingsDiv.querySelectorAll<HTMLInputElement>(".qe-posting-amount");
                            if (allAmtInputs.length === 2) {
                                allAmtInputs[1].value = String(-avg);
                            }
                        }
                    }
                }
            },
        });
    }

    // Attach tag autocomplete to the simple entry tags field
    const qeTagsInput = el.querySelector<HTMLInputElement>("#ledger-qe-tags");
    if (qeTagsInput) {
        attachTagAutocomplete({input: qeTagsInput, dataService: ds});
    }

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
