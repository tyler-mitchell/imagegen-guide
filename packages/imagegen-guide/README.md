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
const crops = await cropImages({ atlas, source: await readFile("generated.png") });
// Each crop carries its image ID, bytes, and format.
```

Google Fonts labels load by family, weight, and style. Callers can supply font bytes for offline use. Cropping reads actual source dimensions and loads Sharp only when called. Generated content can deviate from the guide. See the repository for complete examples and configuration controls.

MIT licensed.
