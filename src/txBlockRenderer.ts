/**
 * Data-driven transaction block renderer.
 *
 * Instead of displaying static markdown text generated at insert time,
 * this module reads IAL attributes directly from a transaction block's
 * DOM element and replaces its visible content with a dynamically
 * rendered HTML card.
 *
 * **Why data-driven?**
 *   • The rendering logic lives in the plugin code, not in the block
 *     content. Updating the plugin automatically updates all transaction
 *     block UIs — no migration needed.
 *   • Inspired by sy-query-view's approach: data (attributes) is the
 *     source of truth, and the UI is derived from it at runtime.
 *
 * The original text produced by `buildBlockContent()` is preserved in
 * the block as a fallback for when the plugin is not loaded.
 */

import {
    ATTR_DATE,
    ATTR_STATUS,
    ATTR_PAYEE,
    ATTR_NARRATION,
    ATTR_POSTINGS,
    ATTR_TAGS,
    type ILedgerConfig,
    type IPosting,
    type TransactionStatus,
} from "./types";

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ITxRenderOptions {
    config: ILedgerConfig;
    /** Called when the user clicks the edit button on the rendered card */
    onEdit?: (blockId: string) => void;
    /** Tooltip text for the edit button */
    editLabel?: string;
}

/**
 * Render a single transaction block by overlaying a rich HTML card on
 * top of the static markdown content.  All transaction data is read
 * from the block element's IAL attributes.
 *
 * **Idempotent** — blocks that already carry the `ledger-tx-rendered`
 * CSS class are silently skipped.
 */
export function renderTransactionBlock(
    block: HTMLElement,
    options: ITxRenderOptions,
): void {
    // Skip if already rendered
    if (block.classList.contains("ledger-tx-rendered")) return;

    // ── Read IAL attributes from the DOM element ─────────────────────────
    const date = block.getAttribute(ATTR_DATE) || "";
    const status = (block.getAttribute(ATTR_STATUS) || "uncleared") as TransactionStatus;
    const payee = block.getAttribute(ATTR_PAYEE) || "";
    const narration = block.getAttribute(ATTR_NARRATION) || "";
    const tagsRaw = block.getAttribute(ATTR_TAGS) || "";
    const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];

    let postings: IPosting[] = [];
    try {
        postings = JSON.parse(block.getAttribute(ATTR_POSTINGS) || "[]");
    } catch {
        // Keep empty array — the block may have corrupt/missing data
    }

    // If essential data is missing the attributes haven't been set yet —
    // leave the raw text visible instead.
    if (!date && !payee) return;

    // ── Resolve block ID ─────────────────────────────────────────────────
    const blockId =
        block.getAttribute("data-node-id") ||
        block.closest("[data-node-id]")?.getAttribute("data-node-id") ||
        "";

    // ── Compute derived values ───────────────────────────────────────────
    // Sum of positive postings = the "transaction amount" shown in the card.
    // In double-entry bookkeeping, debits + credits balance to zero, so the
    // total of the positive side represents the movement of funds.
    const amount = postings
        .filter(p => p.amount > 0)
        .reduce((s, p) => s + p.amount, 0);
    const currency = postings[0]?.currency || options.config.defaultCurrency;
    const sym = options.config.currencySymbols[currency] || currency;

    // Transaction-type flags (used by CSS for colour-coding)
    const hasExpense = postings.some(p => p.account.startsWith("Expenses"));
    const hasIncome = postings.some(p => p.account.startsWith("Income"));
    const isTransfer = !hasExpense && !hasIncome;

    block.setAttribute("data-expense", String(hasExpense && !hasIncome));
    block.setAttribute("data-income", String(hasIncome && !hasExpense));
    block.setAttribute("data-transfer", String(isTransfer));

    // ── Build the overlay element ────────────────────────────────────────
    const overlay = document.createElement("div");
    overlay.className = "ledger-tx-card";
    overlay.setAttribute("contenteditable", "false");
    overlay.innerHTML = buildCardHTML({
        date,
        status,
        payee,
        narration,
        postings,
        tags,
        amount,
        sym,
        config: options.config,
        editLabel: options.editLabel || "✏️",
    });

    // Wire up the edit button
    if (options.onEdit && blockId) {
        const editBtn = overlay.querySelector<HTMLElement>(".ledger-tx-card-edit");
        if (editBtn) {
            editBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                options.onEdit!(blockId);
            });
        }
    }

    // Insert the overlay as the first child of the block
    block.insertBefore(overlay, block.firstChild);

    // Mark the block so the observer skips it on subsequent passes
    block.classList.add("ledger-tx-rendered");
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Escape text for safe HTML interpolation */
function esc(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

interface ICardHTMLParams {
    date: string;
    status: TransactionStatus;
    payee: string;
    narration: string;
    postings: IPosting[];
    tags: string[];
    amount: number;
    sym: string;
    config: ILedgerConfig;
    editLabel: string;
}

function buildCardHTML(p: ICardHTMLParams): string {
    if (p.config.displayMode === "compact") {
        return buildCompactCard(p);
    }
    return buildDetailedCard(p);
}

function buildCompactCard(p: ICardHTMLParams): string {
    const from = p.postings.find(x => x.amount < 0)?.account.split(":").pop() || "";
    const to = p.postings.find(x => x.amount > 0)?.account.split(":").pop() || "";

    return `<div class="ledger-tx-card-row">
  <span class="ledger-tx-card-date">${esc(p.date)}</span>
  <span class="ledger-tx-card-payee">${esc(p.payee)}</span>
  <span class="ledger-tx-card-amount">${esc(p.sym)}${p.amount.toFixed(2)}</span>
  <span class="ledger-tx-card-flow">${esc(to)} ← ${esc(from)}</span>
</div>
<button class="ledger-tx-card-edit" title="${esc(p.editLabel)}">${esc(p.editLabel)}</button>`;
}

function buildDetailedCard(p: ICardHTMLParams): string {
    const statusIcon =
        p.status === "cleared" ? "✓" : p.status === "pending" ? "?" : "~";

    const postingsHTML = p.postings
        .map((posting) => {
            const arrow = posting.amount >= 0 ? "📤" : "📥";
            const pSym = p.config.currencySymbols[posting.currency] || posting.currency;
            return `<div class="ledger-tx-card-posting">
  <span class="ledger-tx-card-posting-icon">${arrow}</span>
  <span class="ledger-tx-card-posting-account">${esc(posting.account)}</span>
  <span class="ledger-tx-card-posting-amount">${esc(pSym)}${posting.amount.toFixed(2)}</span>
</div>`;
        })
        .join("");

    const tagsHTML =
        p.tags.length > 0
            ? `<div class="ledger-tx-card-tags">${p.tags.map(t => `<span class="ledger-tx-card-tag">🏷️ ${esc(t)}</span>`).join("")}</div>`
            : "";

    return `<div class="ledger-tx-card-header">
  <span class="ledger-tx-card-date">${esc(p.date)}</span>
  <span class="ledger-tx-card-status">[${statusIcon}]</span>
  <span class="ledger-tx-card-payee">${esc(p.payee)}</span>
  ${p.narration ? `<span class="ledger-tx-card-narration">${esc(p.narration)}</span>` : ""}
  <span class="ledger-tx-card-amount">${esc(p.sym)}${p.amount.toFixed(2)}</span>
</div>
<div class="ledger-tx-card-postings">${postingsHTML}</div>
${tagsHTML}
<button class="ledger-tx-card-edit" title="${esc(p.editLabel)}">${esc(p.editLabel)}</button>`;
}
