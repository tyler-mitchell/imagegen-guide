# imagegen-guide

Define an image atlas once. Produce its SVG guide, prompt, crop geometry, and image catalogue without a UI or image-generation provider.

```ts
import { readFile } from "node:fs/promises";
import { createAtlas, cropImages, createGif } from "imagegen-guide";

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
const source = await readFile("generated.png");
const crops = await cropImages({ atlas, source });
const gif = await createGif({ atlas, source });
// Use crops[*].bytes and gif in your app, or save them with the CLI below.
```

`atlas.imageIds` lists the configured IDs. TypeScript suggests them for crop IDs and GIF frame IDs. Crops include their source rectangles, scale to the source size, and keep source alpha. They do not fix misaligned art.
Pass `sizes` to `cropImages`, or set `crop.sizes` by image ID in a CLI config, to export different pixel sizes from one source.

The GIF uses all leaf images in layout order at 100 ms per frame. Optional detection measures artwork inside each planned tile and its share of the gaps. See the [CLI workflow](https://github.com/tyler-mitchell/imagegen-guide#see-the-output).

Pass `frames` to change GIF order or timing. The [run-cycle example](https://github.com/tyler-mitchell/imagegen-guide#animate-named-frames) shows both forms. The [six-region guide](https://github.com/tyler-mitchell/imagegen-guide/blob/main/packages/imagegen-guide/examples/configs/adventurer-animations.json) shows labels, dimension lines, and wider regions for sword poses.

The installed package also provides the `imagegen-guide` command. Run `imagegen-guide guide --example mixed --out atlas-job`, then `imagegen-guide crop --layout atlas-job/mixed-light.layout.json --source generated.png --out atlas-job/crops`. `imagegen-guide gif` uses the same layout and source.

MIT licensed.
