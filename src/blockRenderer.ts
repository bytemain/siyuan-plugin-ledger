/**
 * Block renderer — renders transaction blocks as custom HTML cards.
 *
 * Instead of displaying raw markdown text, the plugin overlays a rich HTML
 * card on each transaction block. The card includes:
 * - Visual layout: date, status, payee, amount, postings, tags
 * - Inline edit (✏️) and delete (🗑️) buttons
 * - Color-coded border/background by transaction type
 *
 * Data source: custom-ledger-* block attributes on the DOM element.
 * The underlying markdown content is hidden but preserved for fallback.
 */
import {
    IPosting,
    ILedgerConfig,
    ATTR_TYPE,
    ATTR_DATE,
    ATTR_STATUS,
    ATTR_PAYEE,
    ATTR_NARRATION,
    ATTR_POSTINGS,
    ATTR_TAGS,
    TRANSACTION_TYPE_VALUE,
} from "./types";

// ─── HTML builder ────────────────────────────────────────────────────────────

/** CSS class applied to rendered card containers */
const CARD_CLASS = "ledger-tx-card";
/** Marker attribute to avoid re-rendering */
const RENDERED_ATTR = "data-ledger-rendered";

/**
 * Escape HTML special characters to prevent XSS when building card HTML.
 */
function escapeHTML(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * Determine the transaction type from its postings.
 * Returns "expense" | "income" | "transfer".
 */
function detectTxType(postings: IPosting[]): "expense" | "income" | "transfer" {
    const hasExpense = postings.some(p => p.account.startsWith("Expenses"));
    const hasIncome = postings.some(p => p.account.startsWith("Income"));
    if (hasExpense) return "expense";
    if (hasIncome) return "income";
    return "transfer";
}

/**
 * Build the HTML string for a transaction card.
 */
export function buildTransactionCardHTML(
    date: string,
    status: string,
    payee: string,
    narration: string,
    postings: IPosting[],
    tags: string[],
    config: ILedgerConfig,
    i18n: Record<string, string>,
): string {
    const sym = (currency: string) => config.currencySymbols[currency] || currency;
    const txType = detectTxType(postings);

    // Total positive amount
    const amount = postings
        .filter(p => p.amount > 0)
        .reduce((s, p) => s + p.amount, 0);
    const currency = postings[0]?.currency || config.defaultCurrency;

    // Status badge
    const statusIcon = status === "cleared" ? "✓" : status === "pending" ? "?" : "~";
    const statusLabel = status === "cleared"
        ? (i18n.cleared || "Cleared")
        : status === "pending"
            ? (i18n.pending || "Pending")
            : (i18n.uncleared || "Uncleared");

    // Amount color class
    const amountClass = txType === "income"
        ? "ledger-card-amount--income"
        : txType === "expense"
            ? "ledger-card-amount--expense"
            : "ledger-card-amount--transfer";

    // Posting rows
    const postingRows = postings.map(p => {
        const icon = p.amount >= 0 ? "📤" : "📥";
        const shortAccount = p.account.split(":").slice(-2).join(":");
        return `<div class="ledger-card-posting">
      <span class="ledger-card-posting-icon">${icon}</span>
      <span class="ledger-card-posting-account" title="${escapeHTML(p.account)}">${escapeHTML(shortAccount)}</span>
      <span class="ledger-card-posting-amount">${escapeHTML(sym(p.currency))}${p.amount.toFixed(2)}</span>
    </div>`;
    }).join("");

    // Tags
    const tagsHTML = tags.length > 0
        ? `<div class="ledger-card-tags">🏷️ ${tags.map(t => `<span class="ledger-card-tag">${escapeHTML(t)}</span>`).join("")}</div>`
        : "";

    // Narration
    const narrationHTML = narration
        ? `<span class="ledger-card-narration" title="${escapeHTML(narration)}">${escapeHTML(narration)}</span>`
        : "";

    return `<div class="${CARD_CLASS} ledger-card--${txType}">
  <div class="ledger-card-header">
    <span class="ledger-card-date">📅 ${escapeHTML(date)}</span>
    <span class="ledger-card-status ledger-card-status--${status}" title="${escapeHTML(statusLabel)}">${statusIcon}</span>
    <span class="ledger-card-payee">${escapeHTML(payee)}</span>
    <span class="ledger-card-amount ${amountClass}">${escapeHTML(sym(currency))}${amount.toFixed(2)}</span>
    <div class="ledger-card-actions">
      <button class="ledger-card-btn ledger-card-btn--edit" title="${escapeHTML(i18n.editTransaction || "Edit")}" data-action="edit">✏️</button>
      <button class="ledger-card-btn ledger-card-btn--delete" title="${escapeHTML(i18n.deleteTransaction || "Delete")}" data-action="delete">🗑️</button>
    </div>
  </div>
  <div class="ledger-card-body">
    ${postingRows}
  </div>
  <div class="ledger-card-footer">
    ${narrationHTML}
    ${tagsHTML}
  </div>
</div>`;
}

// ─── DOM rendering ───────────────────────────────────────────────────────────

/**
 * Render all unrendered transaction blocks in the document.
 *
 * For each block with `custom-ledger-type="transaction"` that hasn't been
 * rendered yet (no `data-ledger-rendered` marker), this function:
 * 1. Reads transaction data from the block's DOM attributes
 * 2. Builds a rich HTML card
 * 3. Inserts the card into the block and hides the original markdown text
 * 4. Attaches click handlers for the edit/delete buttons
 *
 * @param config - Current plugin configuration
 * @param i18n - Localisation strings
 * @param onEdit - Callback when edit is clicked, receives blockId
 * @param onDelete - Callback when delete is clicked, receives blockId
 */
export function renderTransactionBlocks(
    config: ILedgerConfig,
    i18n: Record<string, string>,
    onEdit: (blockId: string) => void,
    onDelete: (blockId: string) => void,
): void {
    const blocks = document.querySelectorAll<HTMLElement>(
        `[${ATTR_TYPE}="${TRANSACTION_TYPE_VALUE}"]`,
    );

    for (const block of blocks) {
        // Skip already-rendered blocks
        if (block.getAttribute(RENDERED_ATTR) === "true") continue;

        // Read transaction data from DOM attributes
        const date = block.getAttribute(ATTR_DATE) || "";
        const status = block.getAttribute(ATTR_STATUS) || "uncleared";
        const payee = block.getAttribute(ATTR_PAYEE) || "";
        const narration = block.getAttribute(ATTR_NARRATION) || "";
        const tagsRaw = block.getAttribute(ATTR_TAGS) || "";

        let postings: IPosting[] = [];
        try {
            postings = JSON.parse(block.getAttribute(ATTR_POSTINGS) || "[]");
        } catch {
            // If postings can't be parsed, skip rendering
            continue;
        }
        if (postings.length === 0) continue;

        const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];

        // Build the card HTML
        const cardHTML = buildTransactionCardHTML(
            date, status, payee, narration, postings, tags, config, i18n,
        );

        // Hide original markdown content (the contenteditable child)
        const contentEl = block.querySelector<HTMLElement>("[contenteditable]");
        if (contentEl) {
            contentEl.classList.add("ledger-card-original-hidden");
        }

        // Insert card before the protyle-attr div (or at the end)
        const attrEl = block.querySelector(".protyle-attr");
        const cardContainer = document.createElement("div");
        cardContainer.className = "ledger-card-container";
        cardContainer.innerHTML = cardHTML;

        if (attrEl) {
            block.insertBefore(cardContainer, attrEl);
        } else {
            block.appendChild(cardContainer);
        }

        // Mark as rendered
        block.setAttribute(RENDERED_ATTR, "true");

        // Resolve blockId
        const blockId = block.dataset.nodeId
            || block.closest("[data-node-id]")?.getAttribute("data-node-id")
            || "";

        // Attach button handlers
        const editBtn = cardContainer.querySelector<HTMLElement>('[data-action="edit"]');
        const deleteBtn = cardContainer.querySelector<HTMLElement>('[data-action="delete"]');

        if (editBtn && blockId) {
            editBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                onEdit(blockId);
            });
        }
        if (deleteBtn && blockId) {
            deleteBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                onDelete(blockId);
            });
        }
    }
}
