import {defineConfig} from "vitest/config";
import {fileURLToPath} from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/__tests__/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov"],
            include: ["src/**/*.ts"],
            exclude: [
                "src/index.ts",
                "src/quickEntryDialog.ts",
                "src/dashboard.ts",
                "src/importExportDialog.ts",
                "src/accountManagerDialog.ts",
                "src/__tests__/**",
            ],
        },
    },
    resolve: {
        alias: {
            // Map the `siyuan` SDK to a lightweight stub so pure-logic modules
            // can be imported without a running SiYuan instance.
            siyuan: path.resolve(__dirname, "__mocks__/siyuan.ts"),
        },
    },
});
