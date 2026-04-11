/**
 * Block renderer — builds transaction HTML content for SiYuan HTML blocks.
 *
 * Transactions are inserted as SiYuan HTML blocks using `dataType: "markdown"`
 * with raw HTML content. SiYuan's Lute parser recognizes raw HTML starting with
 * block-level tags (like `<div>`) and creates a `NodeHTMLBlock` automatically.
 * The block content is then rendered inside a shadow DOM.
 *
 * Card features:
 * - Visual layout: date, status badge, payee, total amount, postings, tags
 * - Inline edit (✏️) and delete (🗑️) buttons
 * - Color-coded border/background by transaction type
 * - All styles embedded via <style> block (required for shadow DOM isolation)
 */
import {
    IPosting,
    ITransaction,
    ILedgerConfig,
} from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent XSS when building card HTML.
 */
export function escapeHTML(str: string): string {
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

// ─── Embedded CSS ────────────────────────────────────────────────────────────
// These styles are injected into the HTML block content as an inline <style>.
// This is necessary because SiYuan renders HTML blocks inside a shadow DOM,
// so external plugin stylesheets do not apply.
// The CSS is kept minified to reduce block storage size. Each line below
// corresponds to a logical group of styles for maintainability.

function getCardCSS(): string {
    // Base card
    const base = ".ledger-tx-card{border-left:3px solid var(--b3-theme-primary,#4a90d9);border-radius:6px;background:rgba(59,130,246,.04);padding:8px 12px;font-family:var(--b3-font-family,system-ui,sans-serif);font-size:13px;line-height:1.5;transition:box-shadow .15s ease}"
        + ".ledger-tx-card:hover{box-shadow:0 1px 6px rgba(0,0,0,.08)}";

    // Type-specific colors
    const types = ".ledger-card--expense{border-left-color:#e74c3c;background:rgba(231,76,60,.04)}"
        + ".ledger-card--income{border-left-color:#2ecc71;background:rgba(46,204,113,.04)}"
        + ".ledger-card--transfer{border-left-color:#3498db;background:rgba(52,152,219,.04)}";

    // Header layout
    const header = ".ledger-card-header{display:flex;align-items:center;gap:8px;flex-wrap:wrap}"
        + ".ledger-card-date{font-size:12px;color:var(--b3-theme-on-surface-muted,#888);white-space:nowrap}"
        + ".ledger-card-payee{font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}";

    // Status badges
    const status = ".ledger-card-status{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:700;flex-shrink:0}"
        + ".ledger-card-status--cleared{background:rgba(46,204,113,.15);color:#27ae60}"
        + ".ledger-card-status--pending{background:rgba(241,196,15,.15);color:#f39c12}"
        + ".ledger-card-status--uncleared{background:rgba(149,165,166,.15);color:#7f8c8d}";

    // Amount
    const amount = ".ledger-card-amount{font-family:var(--b3-font-family-code,monospace);font-weight:700;font-size:14px;white-space:nowrap}"
        + ".ledger-card-amount--expense{color:#e74c3c}"
        + ".ledger-card-amount--income{color:#2ecc71}"
        + ".ledger-card-amount--transfer{color:#3498db}";

    // Action buttons (edit / delete)
    const actions = ".ledger-card-actions{display:flex;gap:2px;flex-shrink:0;opacity:0;transition:opacity .15s ease}"
        + ".ledger-tx-card:hover .ledger-card-actions{opacity:1}"
        + ".ledger-card-btn{width:26px;height:26px;padding:0;border:none;border-radius:4px;background:transparent;cursor:pointer;font-size:14px;line-height:26px;text-align:center;transition:background .12s ease}"
        + ".ledger-card-btn:hover{background:rgba(0,0,0,.06)}"
        + ".ledger-card-btn--delete:hover{background:rgba(231,76,60,.12)}";

    // Postings body
    const postings = ".ledger-card-body{margin-top:6px;padding-top:6px;border-top:1px solid rgba(0,0,0,.06)}"
        + ".ledger-card-posting{display:flex;align-items:center;gap:6px;padding:2px 0;font-size:12px}"
        + ".ledger-card-posting-icon{flex-shrink:0;font-size:12px}"
        + ".ledger-card-posting-account{flex:1;font-family:var(--b3-font-family-code,monospace);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
        + ".ledger-card-posting-amount{font-family:var(--b3-font-family-code,monospace);font-size:12px;font-weight:500;white-space:nowrap}";

    // Footer (narration + tags)
    const footer = ".ledger-card-footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px}"
        + ".ledger-card-footer:empty{display:none}"
        + ".ledger-card-narration{font-size:11px;color:var(--b3-theme-on-surface-muted,#888);font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%}"
        + ".ledger-card-tags{display:flex;align-items:center;gap:4px;font-size:11px}"
        + ".ledger-card-tag{display:inline-block;background:rgba(59,130,246,.08);color:var(--b3-theme-primary,#4a90d9);border-radius:3px;padding:0 5px;font-size:10px;line-height:1.7}";

    return base + types + header + status + amount + actions + postings + footer;
}

// ─── Card HTML builder ───────────────────────────────────────────────────────

/**
 * Build the HTML string for a transaction card.
 *
 * The generated HTML is compact (no blank lines) so that SiYuan's Lute parser
 * treats it as a single HTML block when inserted via `dataType: "markdown"`.
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
    const statusIconMap: Record<string, string> = {cleared: "✓", pending: "?", uncleared: "~"};
    const statusIcon = statusIconMap[status] || "~";
    const statusLabelMap: Record<string, string> = {
        cleared: i18n.cleared || "Cleared",
        pending: i18n.pending || "Pending",
        uncleared: i18n.uncleared || "Uncleared",
    };
    const statusLabel = statusLabelMap[status] || statusLabelMap.uncleared;

    // Amount color class
    const amountClassMap: Record<string, string> = {
        income: "ledger-card-amount--income",
        expense: "ledger-card-amount--expense",
        transfer: "ledger-card-amount--transfer",
    };
    const amountClass = amountClassMap[txType];

    // Posting rows (compact, no newlines between elements)
    const postingRows = postings.map(p => {
        const icon = p.amount >= 0 ? "📤" : "📥";
        const shortAccount = p.account.split(":").slice(-2).join(":");
        return "<div class=\"ledger-card-posting\">"
            + `<span class="ledger-card-posting-icon">${icon}</span>`
            + `<span class="ledger-card-posting-account" title="${escapeHTML(p.account)}">${escapeHTML(shortAccount)}</span>`
            + `<span class="ledger-card-posting-amount">${escapeHTML(sym(p.currency))}${p.amount.toFixed(2)}</span>`
            + "</div>";
    }).join("");

    // Tags (compact)
    const tagsHTML = tags.length > 0
        ? `<div class="ledger-card-tags">🏷️ ${tags.map(t => `<span class="ledger-card-tag">${escapeHTML(t)}</span>`).join("")}</div>`
        : "";

    // Narration (compact)
    const narrationHTML = narration
        ? `<span class="ledger-card-narration" title="${escapeHTML(narration)}">${escapeHTML(narration)}</span>`
        : "";

    // Footer — only rendered if there's content, to avoid blank-line issues
    const footerContent = narrationHTML + tagsHTML;
    const footerHTML = footerContent
        ? `<div class="ledger-card-footer">${footerContent}</div>`
        : "";

    // Build compact HTML (no blank lines — critical for Lute HTML block parsing)
    return `<div class="ledger-tx-card ledger-card--${txType}">`
        + "<div class=\"ledger-card-header\">"
        + `<span class="ledger-card-date">📅 ${escapeHTML(date)}</span>`
        + `<span class="ledger-card-status ledger-card-status--${status}" title="${escapeHTML(statusLabel)}">${statusIcon}</span>`
        + `<span class="ledger-card-payee">${escapeHTML(payee)}</span>`
        + `<span class="ledger-card-amount ${amountClass}">${escapeHTML(sym(currency))}${amount.toFixed(2)}</span>`
        + "<div class=\"ledger-card-actions\">"
        + `<button class="ledger-card-btn ledger-card-btn--edit" title="${escapeHTML(i18n.editTransaction || "Edit")}" data-action="edit">✏️</button>`
        + `<button class="ledger-card-btn ledger-card-btn--delete" title="${escapeHTML(i18n.deleteTransaction || "Delete")}" data-action="delete">🗑️</button>`
        + "</div></div>"
        + `<div class="ledger-card-body">${postingRows}</div>`
        + footerHTML
        + "</div>";
}

// ─── Full HTML block content ─────────────────────────────────────────────────

/**
 * Build the complete HTML content for a transaction HTML block.
 *
 * The content is wrapped in a single `<div>` container so Lute's HTML block
 * parser treats it as one block. The embedded `<style>` provides CSS for
 * shadow DOM rendering.
 *
 * Used as the `data` parameter with `dataType: "markdown"` in SiYuan's
 * insertBlock / updateBlock API. Lute recognises raw HTML starting with
 * `<div>` and creates a `NodeHTMLBlock` automatically.
 */
export function buildHTMLBlockContent(
    tx: ITransaction,
    config: ILedgerConfig,
    i18n: Record<string, string>,
): string {
    const tags = tx.tags || [];
    const cardHTML = buildTransactionCardHTML(
        tx.date, tx.status, tx.payee, tx.narration || "",
        tx.postings, tags, config, i18n,
    );
    // Wrap in a container <div> with embedded <style>.
    // No blank lines — Lute ends an HTML block at a blank line.
    return `<div class="ledger-tx-wrapper"><style>${getCardCSS()}</style>${cardHTML}</div>`;
}
