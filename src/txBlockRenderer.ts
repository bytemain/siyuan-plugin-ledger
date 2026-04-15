/**
 * Transaction block renderer — builds HTML for a transaction card.
 *
 * This module provides two public APIs:
 *
 * 1. `buildTransactionHTML(data, config)` — pure function that returns an
 *    HTML string for a transaction card.  Used by the global
 *    `Ledger.renderTransaction()` inside embed blocks.
 *
 * 2. `renderTransactionIntoContainer(data, container, config)` — convenience
 *    wrapper that builds the HTML *and* injects it into a DOM container
 *    element (the embed block's `item`).
 *
 * The rendering is fully data-driven: the transaction data object is the
 * single source of truth, and the HTML is derived from it at runtime.
 */

import {
    type ILedgerConfig,
    type IPosting,
    type TransactionStatus,
} from "./types";
import type {ITransactionEmbedData} from "./embedBlock";

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a complete HTML string for a transaction card.
 *
 * @param data   Transaction data (from the embed block's serialised JSON)
 * @param config Plugin configuration (display mode, currency symbols, etc.)
 * @returns      HTML string ready to be inserted into a container element
 */
export function buildTransactionHTML(
    data: ITransactionEmbedData,
    config: ILedgerConfig,
): string {
    const postings = data.postings || [];
    const amount = postings
        .filter(p => p.amount > 0)
        .reduce((s, p) => s + p.amount, 0);
    const currency = postings[0]?.currency || config.defaultCurrency;
    const sym = config.currencySymbols[currency] || currency;

    const params: ICardHTMLParams = {
        date: data.date,
        status: (data.status || "uncleared") as TransactionStatus,
        payee: data.payee,
        narration: data.narration,
        postings,
        tags: data.tags || [],
        amount,
        sym,
        config,
    };

    if (config.displayMode === "compact") {
        return buildCompactCard(params);
    }
    return buildDetailedCard(params);
}

/**
 * Render a transaction card into a container DOM element.
 *
 * This is called by `Ledger.renderTransaction()` (the global registered
 * by the plugin).  The `container` is the embed block's `item` element
 * provided by SiYuan's `//!js` execution context.
 */
export function renderTransactionIntoContainer(
    data: ITransactionEmbedData,
    container: HTMLElement,
    config: ILedgerConfig,
): void {
    if (!container) return;

    const html = buildTransactionHTML(data, config);

    // Create wrapper div
    const wrapper = document.createElement("div");
    wrapper.className = "ledger-tx-card";
    wrapper.setAttribute("contenteditable", "false");
    wrapper.innerHTML = html;

    // Clear any previous render and insert
    const existing = container.querySelector(".ledger-tx-card");
    if (existing) {
        existing.replaceWith(wrapper);
    } else {
        container.prepend(wrapper);
    }
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
}

function buildCompactCard(p: ICardHTMLParams): string {
    const from = p.postings.find(x => x.amount < 0)?.account.split(":").pop() || "";
    const to = p.postings.find(x => x.amount > 0)?.account.split(":").pop() || "";

    return `<div class="ledger-tx-card-row">
  <span class="ledger-tx-card-date">${esc(p.date)}</span>
  <span class="ledger-tx-card-payee">${esc(p.payee)}</span>
  <span class="ledger-tx-card-amount">${esc(p.sym)}${p.amount.toFixed(2)}</span>
  <span class="ledger-tx-card-flow">${esc(to)} ← ${esc(from)}</span>
</div>`;
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
${tagsHTML}`;
}
