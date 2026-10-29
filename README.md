![imagegen-guide: configure an app icon atlas, render an empty guide, generate the atlas, and extract four individual icons](docs/assets/cover.png)

<div align="center">

# imagegen-guide

**One configuration. A guide for generation and individual images from its output.**

Headless image layout for generation workflows.

</div>

![A six-cell guide with square, landscape, and portrait regions and labels above and below the regions](docs/assets/mixed-light.png)

This guide comes from [mixed.json](packages/imagegen-guide/examples/configs/mixed.json). Each outlined image region has a stable ID and a crop rectangle. Labels sit outside leaf crops.

## From layout to images

```ts
import { readFile, writeFile } from "node:fs/promises";
import { createAtlas, cropImages } from "imagegen-guide";

const atlas = await createAtlas({
  config: {
    id: "app-icons",
    canvas: { width: 1200, aspectRatio: "4:3", padding: 48 },
    grid: { columns: 2, gap: 24 },
    appearance: { label: { fontFamily: "Roboto", fontWeight: 700 } },
    cells: [
      { id: "settings", label: { text: "Settings" } },
      { id: "search", label: { text: "Search" } },
      { id: "files", label: { text: "Files" } },
      { id: "voice", label: { text: "Voice" } },
    ],
  },
});

// Give atlas.schematic and atlas.prompt to your image generator.
// Then extract by ID from the image it returns. Source dimensions are read from the image.
const [settings] = await cropImages({
  atlas,
  source: await readFile("generated.png"),
  ids: ["settings"],
});
await writeFile("settings.png", settings.bytes);
```

The guide, prompt, and crop geometry come from the same atlas. Google Fonts labels load by family and weight; callers can supply font bytes for offline use. Image generation and storage remain with the caller.

## See the output

The [generated 100-icon atlas](docs/assets/generated-icons.png) is a separate visual example of this workflow. A model can drift from the guide; planned rectangles do not certify that generated pixels match them.

![A generated atlas of 100 labeled application icons](docs/assets/generated-icons.png)

Run the example program to save a guide, prompt, layout JSON, and catalogue:

```sh
pnpm run cli -- --example mixed
pnpm run cli -- --example variants
pnpm run cli -- --example icons --source atlas.png
```

Outputs go to `examples/output/`. The `--source` form reads the generated image's dimensions and saves leaf crops. Use `--ids settings,search` to select IDs or `--config path/to/config.json` for your own atlas.

## Layout controls

```json
{
  "id": "variants",
  "canvas": { "width": 1200, "aspectRatio": "4:3", "padding": 48 },
  "grid": { "columns": 2, "gap": 24 },
  "appearance": { "preset": "dark" },
  "defaults": { "aspectRatio": "1:1" },
  "cells": [
    {
      "id": "settings",
      "children": {
        "grid": { "columns": 2, "gap": 8 },
        "cells": [
          { "id": "settings-light", "prompt": "Light variant." },
          { "id": "settings-dark", "prompt": "Dark variant." }
        ]
      }
    }
  ]
}
```

See the runnable [variant configuration](packages/imagegen-guide/examples/configs/variants.json) for a full atlas. Groups retain their hierarchy in the catalogue and can be cropped by ID. Cells also support mixed ratios, explicit dimensions, weighted columns, spans, scoped descriptions, labels, and appearance overrides.

For separated foreground tiles on a uniform background, `detectCatalogue` can locate observed leaf bounds. `compareCatalogues` reports signed differences from planned bounds. Detection does not correct merged tiles or certify image quality.

## Package and development

```ts
import { createAtlas, cropImages, createCatalogue, detectCatalogue } from "imagegen-guide";
```

Importing the package for guide creation does not load Sharp. Image operations load it when called and can extract PNG, JPEG, WebP, or AVIF. `createCatalogue` exposes source-specific IDs and rectangles when a consumer needs JSON metadata or saved output references.

```sh
pnpm install
pnpm run check
pnpm run build
```

Node.js 22.18 or later is required. [Requirements](docs/requirements.md), [specification](docs/specification.md), [build order](docs/implementation-plan.md), and [dependency research](docs/research.md) define the product contracts. Licensed under [MIT](LICENSE).
