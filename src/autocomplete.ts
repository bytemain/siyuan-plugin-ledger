/**
 * Autocomplete dropdown — shared UI component for payee, narration, and tag suggestion lists.
 */
import {DataService} from "./dataService";

// ─── Helper ──────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
    if (!s) return "";
    return s
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ─── Generic autocomplete core ──────────────────────────────────────────────

interface IAutoCompleteItem {
    text: string;
    badge?: string;
}

interface IGenericAutoCompleteOptions {
    input: HTMLInputElement;
    /** Fetch suggestions for the current query */
    fetchItems: (query: string) => IAutoCompleteItem[];
    /** Called when an item is selected */
    onSelect?: (value: string) => void;
    /** Extract the query substring to autocomplete (for multi-value inputs like tags) */
    getQuery?: (input: HTMLInputElement) => string;
    /** Apply the selected value back into the input (for multi-value inputs like tags) */
    applyValue?: (input: HTMLInputElement, value: string) => void;
}

function attachGenericAutocomplete(opts: IGenericAutoCompleteOptions): () => void {
    const {input, fetchItems, onSelect} = opts;
    const getQuery = opts.getQuery || ((inp: HTMLInputElement) => inp.value.trim());
    const applyValue = opts.applyValue || ((inp: HTMLInputElement, value: string) => { inp.value = value; });

    const dropdown = document.createElement("div");
    dropdown.className = "ledger-autocomplete-dropdown";
    dropdown.style.display = "none";

    const formRow = input.closest(".ledger-form-row") || input.parentElement;
    if (formRow?.parentElement) {
        formRow.parentElement.insertBefore(dropdown, formRow.nextSibling);
    } else {
        input.parentElement?.appendChild(dropdown);
    }

    let activeIndex = -1;
    let currentItems: IAutoCompleteItem[] = [];

    function renderDropdown(items: IAutoCompleteItem[]) {
        currentItems = items;
        activeIndex = -1;
        if (items.length === 0) {
            dropdown.style.display = "none";
            return;
        }
        dropdown.innerHTML = items.map((item, i) => {
            const badge = item.badge ? `<span class="ledger-ac-count">${escapeHtml(item.badge)}</span>` : "";
            return `<div class="ledger-ac-item" data-index="${i}" data-value="${escapeHtml(item.text)}">
                <span class="ledger-ac-text">${escapeHtml(item.text)}</span>
                <span class="ledger-ac-badges">${badge}</span>
            </div>`;
        }).join("");
        dropdown.style.display = "";
    }

    function selectItem(index: number) {
        if (index < 0 || index >= currentItems.length) return;
        const value = currentItems[index].text;
        applyValue(input, value);
        dropdown.style.display = "none";
        onSelect?.(value);
    }

    function updateHighlight() {
        const items = dropdown.querySelectorAll<HTMLElement>(".ledger-ac-item");
        items.forEach((el, i) => {
            el.classList.toggle("ledger-ac-active", i === activeIndex);
        });
    }

    function onInputHandler() {
        const query = getQuery(input);
        const results = fetchItems(query);
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
        setTimeout(() => { dropdown.style.display = "none"; }, 200);
    }

    function onFocus() {
        onInputHandler();
    }

    input.addEventListener("input", onInputHandler);
    input.addEventListener("keydown", onKeyDown);
    input.addEventListener("blur", onBlur);
    input.addEventListener("focus", onFocus);
    dropdown.addEventListener("mousedown", onDropdownClick);

    input.removeAttribute("list");

    return () => {
        input.removeEventListener("input", onInputHandler);
        input.removeEventListener("keydown", onKeyDown);
        input.removeEventListener("blur", onBlur);
        input.removeEventListener("focus", onFocus);
        dropdown.removeEventListener("mousedown", onDropdownClick);
        dropdown.remove();
    };
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

    return attachGenericAutocomplete({
        input,
        fetchItems: (query: string) => {
            const results = ds.searchPayees(query, 8);
            return results.map(payee => {
                const stats = ds.getPayeeStats(payee);
                const parts: string[] = [];
                if (stats) parts.push(`${stats.count}×`);
                if (stats && stats.count > 0) parts.push(`≈${Math.round(stats.totalAmount / stats.count)}`);
                return {text: payee, badge: parts.join(" ")};
            });
        },
        onSelect,
    });
}

// ─── Narration autocomplete ─────────────────────────────────────────────────

export interface INarrationAutoCompleteOptions {
    input: HTMLInputElement;
    dataService: DataService;
    onSelect?: (narration: string) => void;
}

/**
 * Attach autocomplete to a narration input field.
 * Returns a cleanup function.
 */
export function attachNarrationAutocomplete(opts: INarrationAutoCompleteOptions): () => void {
    const {input, dataService: ds, onSelect} = opts;

    return attachGenericAutocomplete({
        input,
        fetchItems: (query: string) => {
            const results = ds.searchNarrations(query, 8);
            const history = ds.getCache().narrationHistory ?? {};
            return results.map(n => ({
                text: n,
                badge: history[n] > 1 ? `${history[n]}×` : undefined,
            }));
        },
        onSelect,
    });
}

// ─── Tag autocomplete ───────────────────────────────────────────────────────

export interface ITagAutoCompleteOptions {
    input: HTMLInputElement;
    dataService: DataService;
    onSelect?: (tag: string) => void;
}

/**
 * Attach autocomplete to a tags input field (comma-separated multi-value).
 * Autocomplete operates on the last tag being typed after the last comma.
 * Returns a cleanup function.
 */
export function attachTagAutocomplete(opts: ITagAutoCompleteOptions): () => void {
    const {input, dataService: ds, onSelect} = opts;

    return attachGenericAutocomplete({
        input,
        getQuery: (inp: HTMLInputElement) => {
            // Extract the current (last) tag being typed
            const parts = inp.value.split(",");
            return (parts[parts.length - 1] || "").trim();
        },
        fetchItems: (query: string) => {
            // Exclude already-completed tags (all but the last partial one)
            const allParts = input.value.split(",").map(t => t.trim().toLowerCase());
            const completedTags = new Set(
                allParts.slice(0, -1).filter(Boolean)
            );
            const results = ds.searchTags(query, 8)
                .filter(t => !completedTags.has(t.toLowerCase()));
            const history = ds.getCache().tagHistory ?? {};
            return results.map(t => ({
                text: t,
                badge: history[t] > 1 ? `${history[t]}×` : undefined,
            }));
        },
        applyValue: (inp: HTMLInputElement, value: string) => {
            // Replace the last partial tag with the selected value
            const rawParts = inp.value.split(",");
            // Keep all completed parts, replace only the last (partial) one
            const completed = rawParts.slice(0, -1).map(t => t.trim()).filter(Boolean);
            completed.push(value);
            inp.value = completed.join(", ") + ", ";
        },
        onSelect,
    });
}
