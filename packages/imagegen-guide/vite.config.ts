import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: { index: "core/index.ts" },
    dts: {
      tsgo: true,
    },
    exports: false,
    publint: true,
    attw: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
