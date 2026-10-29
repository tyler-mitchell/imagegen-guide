# Core specification

The headless API supplies configuration, schematic rendering, packing, crop geometry,
prompt text, catalogues, and image extraction.

## Package boundaries

```text
packages/imagegen-guide/
  core/                configuration, layout, schematic, prompt, catalogue, and crops
  react/               later UI adapter
```

The `react` directory is not part of the initial build. The package has one public
entry point. Image operations load Sharp only when called.

## Configuration

This example shows the configuration shape. All lengths are pixels.

```ts
const config = {
  id: "app-icons",
  canvas: { width: 1536, aspectRatio: "4:3", padding: 48 },
  grid: { columns: 3, gap: 24 },
  appearance: {
    preset: "light",
    background: "#ffffff",
    image: { fill: "none", stroke: "#333333", strokeWidth: 1, radius: 0 },
    label: {
      position: "below",
      fontFamily: "Inter",
      fontSize: 20,
      lineHeight: 24,
      color: "#333333",
      gap: 12,
      align: "center",
    },
  },
  align: "center",
  defaults: { aspectRatio: "1:1" },
  prompt: "Create a consistent set of app icons.",
  cells: [
    { id: "settings", row: 0, column: 0, label: { text: "Settings" } },
    { id: "search", row: 0, column: 1, label: { text: "Search", position: "above" } },
    { id: "canvas", row: 0, column: 2, aspectRatio: "4:3" },
    { id: "files", row: 1, column: 0, label: { text: "Files" } },
    { id: "voice", row: 1, column: 1, aspectRatio: "2:3", prompt: "A microphone." },
    { id: "tools", row: 1, column: 2, label: { text: "Tools" } },
  ],
};
```

Support `1:1`, `3:2`, `2:3`, `4:3`, `3:4`, `16:9`, and `9:16` ratio presets.
A ratio can also use explicit width and height values. Canvas size can use width
and ratio, height and ratio, or explicit width and height.

Columns define preferred image widths through pixel dimensions or relative weights.
Row and column indices identify groups for styles and descriptions; they do not
reserve fixed positions. Column spans adjust preferred widths. Row or column
overrides can supply exact image dimensions.
Omit row and column indices to use native grid placement in array order, including
column spans. Explicit indices override the resulting logical coordinates.
Padding and gaps can use uniform values or individual sides and axes.
`align` and `verticalAlign` position the packed group through native Flexbox alignment.
Labels can wrap to a configured line count. Set `fontFamily`, `fontWeight`, and
`fontStyle` to use a Google Font. The core loads the requested face and text.
Callers can supply Satori font data for offline rendering.

### Nested groups

```ts
const family = {
  id: "settings",
  row: 0,
  column: 0,
  label: { text: "Settings" },
  children: {
    grid: { columns: 2, gap: 8, padding: 8 },
    defaults: { aspectRatio: "1:1" },
    cells: [
      { id: "settings-light", row: 0, column: 0, prompt: "Light variant." },
      { id: "settings-dark", row: 0, column: 1, prompt: "Dark variant." },
    ],
  },
};
```

A group contains another grid with the same scope controls as the root grid.
`grid.padding` reserves space inside the group outline. It accepts a uniform value
or separate edge values. Nested grids default to their row and column gaps for
vertical and horizontal padding. The root grid defaults to zero; canvas padding
remains separate. Set `grid.padding: 0` to remove the inset explicitly.
Nesting can continue to further levels. IDs are unique across the complete atlas.
Groups fit their contents by default. An explicit group ratio reserves an image
region with that ratio; explicit dimensions remain fixed. Group crops contain
their descendants and their internal labels. Leaf crops exclude their own labels
and outlines. All descendant coordinates remain absolute in the original atlas.

## Defaults and overrides

Apply appearance presets, atlas defaults, row overrides, column overrides, and
cell overrides in that order. Cell values take precedence. Omitted labels reserve
no label space. Label overrides can set styles without text. Set `label: false`
on a cell to hide an inherited label. A row description and a column description both remain in prompt
context; neither replaces the other.

## Schema

The public schema contains configuration, resolved layout, rectangles, labels,
prompt text, source-image metadata, catalogue entries, and crop results.

```ts
import { type } from "arktype";

export const schema = type.module({
  Rectangle: {
    x: "number.integer >= 0",
    y: "number.integer >= 0",
    width: "number.integer > 0",
    height: "number.integer > 0",
  },
});
export type Rectangle = typeof schema.Rectangle.infer;
```

ArkType defines the input and output contracts and owns validation. `createAtlas`
validates its configuration. Image IDs must be unique, cells must fit
within their tracks, and each cell position must refer to a configured track.

## Geometry

Each cell has separate rectangles for its allocated space, image content, and label.
The label and outline must not reduce the recorded image content through an
unrecorded inset. Label placement affects the space available to the image.

Use a top-left origin. The x-axis points right. The y-axis points down.
Coordinates refer to the original canvas before any output resizing.

Crop bounds use integer pixels. Round rectangle edges first, then subtract the
rounded edges to obtain width and height. Use these same bounds in the schematic
and catalogue. Do not round each output independently.

For a different source resolution, scale rectangle edges by source width and
height before pixel rounding. The catalogue records the source dimensions and
the resulting crop bounds. It does not infer shifts inside a generated atlas.

When the source adds outer padding, `source.viewport` can identify the pixel
rectangle that corresponds to the complete schematic canvas. Catalogue mapping
uses that viewport's origin and dimensions and records it with the source.
Omit it only when the schematic corresponds to the complete source image.
Image dimensions alone do not establish a viewport or correct local layout drift.

## Headless consumer

Usage:

```ts
import { createAtlas, cropImages } from "imagegen-guide";

const atlas = await createAtlas({ config: input });
// atlas: resolved layout, SVG schematic, and provider-independent prompt text.

const crops = await cropImages({ atlas, source: generatedImageBytes });
```

Satori measures preferred widths and label bounds. `@thi.ng/layout` packs each image and
its label as one block. A bounded scale search fits automatic image sizes into
the fixed canvas; explicit image dimensions, labels, gaps, and padding remain fixed.
`StackedLayout` uses a skyline to allocate measured blocks. Its native nesting
connects group layouts; each child completes before the next sibling is allocated.
The returned boxes supply placement and occupied bounds. Standard image ratios retain exact
integer proportions. The canvas retains its configured dimensions and ratio.

Satori renders the packed positions and exposes node rectangles through
`onNodeDetected`. The layout records those rectangles by image ID. Catalogues and
UI adapters consume this result without computing a separate layout.
Native measurement uses `pointScaleFactor: 0`. Round bounds at the final output
boundary. Early pixel-grid rounding can give equal fractional tracks different
integer widths and change subsequent packing.

## Prompt text

`defaultPrompt` is an exported string that consumers can prepend or append to
their own prompts. `atlas.prompt` includes it once, followed by canvas dimensions,
image IDs, bounds, and descriptions. Shared descriptions appear once per scope.
Nested scopes identify their parent group. Each catalogue entry retains its full
prompt context for individual regeneration. The output has no provider-specific
parameters or API request format.

## Image catalogue and crops

Each catalogue entry records its image ID, row, column, crop bounds, label, prompt
context, and output reference when a crop exists. The catalogue contains JSON data;
image bytes and font bytes remain separate.

`cropImages` takes an atlas and source bytes, optional image IDs, and an output
format. It reads the actual source dimensions and maps the atlas geometry to
them. Advanced callers can pass a catalogue with detected or planned bounds.
It returns cropped image bytes with
their IDs and format. Omit IDs to extract all leaf entries. Select a group ID to
extract its complete image region. Formats are PNG (default),
JPEG, WebP, and AVIF. The caller saves files or imports bytes into an artifact store.

`detectCatalogue({ source, catalogue, options })` locates separated foreground
tiles on a uniform background. OpenCV segments connected components and matches
their normalized positions to planned leaf positions. The default background is
the first source pixel, the threshold is 5, and the minimum component area is
one quarter of the smallest planned leaf area. Configuration can override these
values through `crop.detect`.

Detected leaf bounds describe the source pixels. They do not enforce the planned
ratio through padding or resizing. Shadows can affect these bounds. Group bounds
remain planned; detection does not locate their labels or certify their crops.
Merged tiles, retained guide outlines, and nonuniform backgrounds do not meet this
segmentation contract.

`compareCatalogues({ expected, actual })` returns each leaf ID, both rectangles,
and signed differences for x, y, width, and height. Both catalogues use the same
source coordinate system. Comparison changes neither catalogue nor source image.

A later regeneration request can select entries by ID and use their prompt
context and dimensions. It does not require a second identity system.
