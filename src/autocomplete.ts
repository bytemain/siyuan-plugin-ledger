/**
 * Autocomplete dropdown — shared UI component for payee and account suggestion lists.
 */
import {DataService} from "./dataService";

// ─── Helper ──────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ─── Payee autocomplete ──────────────────────────────────────────────────────

export interface IPayeeAutoCompleteOptions {
    /** The text input element for payee */
    input: HTMLInputElement;
    /** The DataService instance */
    dataService: DataService;
    /** Called when a payee is selected from the dropdown */
    onSelect?: (payee: string) => void;
    /** i18n strings */
    i18n: Record<string, string>;
}

/**
 * Attach a custom autocomplete dropdown to a payee input field.
 * Returns a cleanup function to remove event listeners.
 */
export function attachPayeeAutocomplete(opts: IPayeeAutoCompleteOptions): () => void {
    const {input, dataService: ds, onSelect} = opts;

    // Create dropdown container
    const dropdown = document.createElement("div");
    dropdown.className = "ledger-autocomplete-dropdown";
    dropdown.style.display = "none";

    // Insert dropdown right after the input's parent row
    const formRow = input.closest(".ledger-form-row") || input.parentElement;
    if (formRow?.parentElement) {
        formRow.parentElement.insertBefore(dropdown, formRow.nextSibling);
    } else {
        input.parentElement?.appendChild(dropdown);
    }

    let activeIndex = -1;
    let currentItems: string[] = [];

    function renderDropdown(items: string[]) {
        currentItems = items;
        activeIndex = -1;
        if (items.length === 0) {
            dropdown.style.display = "none";
            return;
        }
        dropdown.innerHTML = items.map((item, i) => {
            const stats = ds.getPayeeStats(item);
            const countBadge = stats ? `<span class="ledger-ac-count">${stats.count}×</span>` : "";
            const avgBadge = stats && stats.count > 0
                ? `<span class="ledger-ac-avg">≈${Math.round(stats.totalAmount / stats.count)}</span>`
                : "";
            return `<div class="ledger-ac-item" data-index="${i}" data-value="${escapeHtml(item)}">
                <span class="ledger-ac-text">${escapeHtml(item)}</span>
                <span class="ledger-ac-badges">${countBadge}${avgBadge}</span>
            </div>`;
        }).join("");
        dropdown.style.display = "";
    }

    function selectItem(index: number) {
        if (index < 0 || index >= currentItems.length) return;
        const payee = currentItems[index];
        input.value = payee;
        dropdown.style.display = "none";
        onSelect?.(payee);
    }

    function updateHighlight() {
        const items = dropdown.querySelectorAll<HTMLElement>(".ledger-ac-item");
        items.forEach((el, i) => {
            el.classList.toggle("ledger-ac-active", i === activeIndex);
        });
    }

    function onInput() {
        const query = input.value.trim();
        const results = ds.searchPayees(query, 8);
        renderDropdown(results);
    }

    function onKeyDown(e: KeyboardEvent) {
        if (dropdown.style.display === "none") return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
            updateHighlight();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            updateHighlight();
        } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            e.stopPropagation();
            selectItem(activeIndex);
        } else if (e.key === "Escape") {
            dropdown.style.display = "none";
        }
    }

    function onDropdownClick(e: Event) {
        const target = (e.target as HTMLElement).closest<HTMLElement>(".ledger-ac-item");
        if (!target) return;
        const index = parseInt(target.dataset.index || "-1", 10);
        selectItem(index);
    }

    function onBlur() {
        // Delay to allow click events on the dropdown to fire first
        setTimeout(() => {
            dropdown.style.display = "none";
        }, 200);
    }

    function onFocus() {
        if (input.value.trim() || Object.keys(ds.getCache().payeeHistory).length > 0) {
            onInput();
        }
    }

    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKeyDown);
    input.addEventListener("blur", onBlur);
    input.addEventListener("focus", onFocus);
    dropdown.addEventListener("mousedown", onDropdownClick);

    // Remove the native datalist if present
    input.removeAttribute("list");

    return () => {
        input.removeEventListener("input", onInput);
        input.removeEventListener("keydown", onKeyDown);
        input.removeEventListener("blur", onBlur);
        input.removeEventListener("focus", onFocus);
        dropdown.removeEventListener("mousedown", onDropdownClick);
        dropdown.remove();
    };
}
