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

import {fetchSyncPost} from "siyuan";
import {
    type ILedgerConfig,
    type IPosting,
    type TransactionStatus,
} from "./types";
import type {ITransactionEmbedData} from "./embedBlock";

/**
 * Optional context from the SiYuan `//!js` execution environment.
 * When provided, `renderTransactionIntoContainer` can perform the full
 * set of post-render cleanup that SiYuan's `renderEmbed()` would
 * normally handle.
 */
export interface IEmbedRenderContext {
    /** The embed block's `data-node-id` */
    blockId?: string;
    /** SiYuan protyle instance (injected into `//!js` as `protyle`) */
    protyle?: { contentElement: HTMLElement };
    /** Saved scroll offset (injected into `//!js` as `top`) */
    top?: number;
}

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
    ctx?: IEmbedRenderContext,
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

    // ── Post-render cleanup ──────────────────────────────────────────────
    // Since we return `undefined` from the //!js code to skip SiYuan's
    // built-in renderEmbed() (which would show the yellow "no matching
    // blocks" fallback), we must replicate the relevant parts of
    // renderEmbed() ourselves.
    //
    // Reference: siyuan-note/siyuan  blockRender.ts → renderEmbed()
    //            frostime/sy-query-view  data-view.ts → render()
    if (container.getAttribute("data-type") === "NodeBlockQueryEmbed") {
        // 1. Stop the refresh button spinner.
        //    genRenderFrame() adds `fn__rotate` to the SVG; renderEmbed()
        //    removes it once content is ready.
        const rotateElement = container.querySelector(".fn__rotate");
        if (rotateElement) {
            rotateElement.classList.remove("fn__rotate");
        }

        // 2. Ensure all inner nodes are not editable so SiYuan's protyle
        //    editor does not treat our rendered card as editable content.
        container.querySelectorAll("[contenteditable=\"true\"]").forEach(node => {
            node.setAttribute("contenteditable", "false");
        });

        // 3. Clear the frozen height so the block auto-sizes to fit the
        //    rendered card.  blockRender freezes it before executing //!js
        //    to reduce flicker; renderEmbed() clears it at the end.
        container.style.height = "";

        // 4. Update SiYuan's search index for this embed block so its
        //    rendered content is discoverable via global search.
        if (ctx?.blockId) {
            try {
                fetchSyncPost("/api/search/updateEmbedBlock", {
                    id: ctx.blockId,
                    content: wrapper.textContent || "",
                });
            } catch (_) { /* best-effort index update */ }
        }

        // 5. Restore scroll position after rendering (forward/back
        //    navigation).
        if (ctx?.top && ctx.protyle) {
            ctx.protyle.contentElement.scrollTop = ctx.top;
        }
    }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Escape text for safe HTML interpolation */
function esc(s: string): string {
    if (!s) return "";
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
