import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: { core: "core/index.ts", image: "core/image.ts" },
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
