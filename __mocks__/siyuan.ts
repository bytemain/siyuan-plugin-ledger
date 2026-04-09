/**
 * Minimal stub for the `siyuan` SDK used by SiYuan plugins.
 * Only the symbols that our source modules import need to be present here;
 * everything is a no-op so pure-logic unit tests can run in Node.js without
 * a running SiYuan instance.
 */

export function fetchPost(
    _url: string,
    _data: unknown,
    callback?: (res: {code: number; msg: string; data: unknown}) => void,
): void {
    callback?.({code: 0, msg: "", data: null});
}

export function fetchSyncPost(
    _url: string,
    _data: unknown,
): Promise<{code: number; msg: string; data: unknown}> {
    return Promise.resolve({code: 0, msg: "", data: null});
}

/** Stub Plugin base class — only used by src/index.ts, not by tested modules */
export class Plugin {
    name = "";
    i18n: Record<string, string> = {};
    saveData(_key: string, _data: unknown): Promise<void> {
        return Promise.resolve();
    }
    loadData(_key: string): Promise<unknown> {
        return Promise.resolve(null);
    }
}

export class Dialog {
    element: HTMLElement = document.createElement("div");
    constructor(_opts: unknown) {}
    destroy() {}
}

export class Menu {
    addItem(_opts: unknown) {}
}

export class Protyle {
    constructor(_app: unknown, _element: HTMLElement, _opts?: unknown) {}
}
