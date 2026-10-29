# imagegen-guide

Define an image atlas once. Produce its SVG guide, prompt, crop geometry, and image catalogue without a UI or image-generation provider.

```ts
import { readFile } from "node:fs/promises";
import { createAtlas, cropImages } from "imagegen-guide";

const atlas = await createAtlas({
  config: {
    id: "icons",
    canvas: { width: 1200, aspectRatio: "3:2" },
    grid: { columns: 2, gap: 24 },
    appearance: { label: { fontFamily: "Roboto", fontWeight: 700 } },
    cells: [
      { id: "settings", label: { text: "Settings" } },
      { id: "search", aspectRatio: "4:3", label: { text: "Search" } },
    ],
  },
});

// Send atlas.schematic and atlas.prompt to the generator of your choice.
// Inspect the result: each image must fit its guide rectangle.
const crops = await cropImages({ atlas, source: await readFile("generated.png") });
// Each crop carries its image ID, bytes, and format.
```

`cropImages` uses planned rectangles, scaled to the source dimensions. It preserves source alpha but does not remove backgrounds or fix artwork outside a rectangle. Use `detectCatalogue` only when each tile is separate on a uniform background; see the [CLI workflow](https://github.com/tyler-mitchell/imagegen-guide#see-the-output).

MIT licensed.
