# imagegen-guide

Define an image atlas once. Produce its SVG guide, prompt, crop geometry, and image catalogue without a UI or image-generation provider.

```ts
import { readFile } from "node:fs/promises";
import { schema, createAtlas, createCatalogue } from "imagegen-guide/core";
import { cropImages } from "imagegen-guide/core/image";

const config = schema.Config.assert({
  id: "icons",
  canvas: { width: 1200, aspectRatio: "3:2" },
  grid: { columns: 2, gap: 24 },
  cells: [
    { id: "settings", aspectRatio: "1:1" },
    { id: "search", aspectRatio: "4:3" },
  ],
});

const atlas = await createAtlas({ config, fonts: [] });
// Send atlas.schematic and atlas.prompt to the generator of your choice.
const generatedImageBytes = await readFile("generated.png");
const catalogue = createCatalogue({
  layout: atlas.layout,
  source: { id: "generation-01", width: 1200, height: 800 },
});
const crops = await cropImages({ source: generatedImageBytes, catalogue });
// Each crop carries its image ID, bytes, and format.
```

`core/image` uses Sharp. The layout entry point does not load it. Supply actual source dimensions; generated content can deviate from the guide. See the repository for complete examples and configuration controls.

MIT licensed.
