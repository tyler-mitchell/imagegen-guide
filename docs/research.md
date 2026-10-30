# Dependency research

Scope: headless layout, schematic output, and image extraction.
Sources were retrieved on 2026-10-11 and 2026-10-29.

| Package        | Installed version | Role                                         |
| -------------- | ----------------- | -------------------------------------------- |
| Vite+          | 0.2.9             | Workspace, checks, and package build         |
| ArkType        | 2.2.8             | Core schema and inferred types               |
| Satori         | 0.47.1            | Layout rectangles and SVG schematic          |
| Sharp          | 0.35.5            | Image extraction and encoding                |
| @thi.ng/layout | 4.1.21            | Stacked allocation and native nested layouts |
| defu           | 6.1.7             | Recursive configuration defaults             |

## Layout and schematic output

| Option                     | Public affordances                                                               | Limit                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Satori                     | Plain element objects, layout, font measurement, SVG output, and node rectangles | Text requires supplied font data.                                              |
| Yoga and an XML serializer | Layout calculation with aspect ratios; separate SVG construction                 | More integration code; Yoga supplies a subset of Flexbox rather than CSS Grid. |
| Takumi                     | Node-based image rendering                                                       | A public layout-output API has not been confirmed.                             |

### Satori

```ts
satori({ type: "div", props: { style, children } }, { width, height, fonts });
```

Satori accepts element objects without JSX or React in consumer code. It handles
layout, font measurement, and SVG output. Text requires font data. The documented
font formats are TTF, OTF, and WOFF.

Google Fonts' [CSS API](https://developers.google.com/fonts/docs/css2) accepts a
family, italic axis, weight axis, and a `text` subset. The core requests each
resolved label face and passes the returned font bytes to Satori. [CSSTree](https://github.com/csstree/csstree/blob/master/docs/parsing.md)
parses the returned stylesheet so its font URL is read as CSS, rather than text
matching. Callers can pass font bytes instead when rendering offline.

The public `SatoriOptions` type includes a layout-node callback:

```ts
onNodeDetected?: (node: SatoriNode) => void;
```

Source: [SatoriOptions](https://github.com/vercel/satori/blob/main/src/satori.ts),
exported options type. This can supply geometry during schematic generation.

The exported `SatoriNode` contains `left`, `top`, `width`, `height`, and the element
`props`. Image IDs can be carried in the element properties and read with the
rectangle. One render operation can supply the guide and its catalogue geometry.

Source: [SatoriNode](https://github.com/vercel/satori/blob/main/src/layout.ts),
exported node interface. The public contract supports a single-pass layout path.

The installed Satori 0.47.1 declarations confirm these fields and `onNodeDetected`.
Reference: `satori/dist/standalone.d.cts`, `SatoriNode` and `SatoriOptions`.
The default entry bundles its layout engine; it does not require a project-owned WASM loader.

Source: [Satori usage](https://github.com/vercel/satori), sections “Use without JSX”,
“Fonts”, and “Pixel Grid Rounding”.

Satori accepts SVG image data as an `<img>` source. Dimension lines use that
supported image path as an absolute schematic overlay. OpenCV's `arrowedLine`
draws into a raster `Mat`, so it does not provide vector annotations for the
SVG guide. Sources: [Satori images](https://github.com/vercel/satori#images) and
[OpenCV drawing functions](https://docs.opencv.org/4.13.0/d6/d6e/group__imgproc__draw.html).
Dimension lines use the same measured line and inward arrows on both axes, as
described in [AutoCAD's dimension anatomy](https://help.autodesk.com/cloudhelp/2027/ENU/AutoCAD-MAC-Core/files/GUID-EEC547BD-477F-4FA8-9831-A3AC3BE80F92.htm).
Satori also supports CSS `backgroundImage: url(...)`, `backgroundSize`,
`backgroundPosition`, and `backgroundRepeat` for per-cell schematic references. Source:
[Satori CSS support](https://github.com/vercel/satori#css).

### Configuration defaults

`defu(object, ...defaults)` gives the leftmost object priority, recursively
merges plain objects, and does not mutate its inputs. Arrays concatenate when
both sides define them. Cell, row, column, and appearance style defaults have
no overlapping array fields, so this merge preserves the configured override
order. Source: [defu usage and remarks](https://github.com/unjs/defu#usage).

### Yoga

Yoga is an embeddable layout engine. Its aspect ratio is width divided by height.
The engine supports minimum and maximum dimensions, margins, padding, and gaps.

Sources: [About Yoga](https://www.yogalayout.dev/docs/about-yoga),
[aspect ratio](https://www.yogalayout.dev/docs/styling/aspect-ratio), and
[layout](https://www.yogalayout.dev/docs/getting-started/laying-out-a-tree).

### SVG serialization

`xmlbuilder2` supplies XML construction, namespaces, and serialization. It can
write SVG shapes and text without a browser DOM.

Sources: [namespaces](https://oozcitak.github.io/xmlbuilder2/namespaces.html) and
[serialization](https://oozcitak.github.io/xmlbuilder2/serialization.html).

### Takumi

Takumi supplies node-based raster rendering. Its suitability depends on whether
one public operation can expose the same layout used for rendering.

Source: [Takumi reference](https://takumi.kane.tw/docs/reference/).

## Image extraction

```ts
sharp(input).extract({ left, top, width, height }).png().toBuffer();
```

Sharp accepts integer pixel rectangles and supplies image extraction and encoding.
It accepts SVG input for raster output. Its `join.animated` option joins an
ordered array of images into GIF frames. Sharp loads only when an image operation
runs; guide creation does not load it.
Sharp's `resize` accepts `fit: "contain"` and a named kernel. The crop API uses
transparent containment and exposes Sharp's kernel names; `nearest` preserves
hard pixel boundaries when reducing an enlarged texture atlas.

Sources: [extraction](https://sharp.pixelplumbing.com/api-resize/#extract),
[resize](https://sharp.pixelplumbing.com/api-resize/#resize),
[input](https://sharp.pixelplumbing.com/api-constructor/), and
[output](https://sharp.pixelplumbing.com/api-output/).

## Selection criteria

The selected layout path must expose the exact rectangles used by the schematic.
SVG parsing, DOM measurement, and a second layout calculation are not acceptable
substitutes for a supported rectangle-output contract.

Select Satori for the initial headless schematic and layout path. Its public
callback supplies the required rectangles and image identity. A separate Yoga
integration or XML serializer is not required for this path.

Select Sharp for image extraction and GIF encoding. The public package entry
point can expose both guide and image operations because Sharp loads on demand.

## Rectangle packing

Satori supports CSS Grid but does not support its `masonry` value. It supplies
text measurement and SVG output, rather than rectangle packing.

`@thi.ng/layout`, in thi.ng/umbrella, supplies `GridLayout` and `StackedLayout`.
Stacked layouts allocate blocks above the lowest available column span. `next`,
`spanForSize`, and `nest` supply placement and nested allocation. The public
constructor connects a child layout to a parent when the content width differs
from the decorated group width. Complete each child before allocating the next
parent or sibling block.

Select `StackedLayout` for measured image and label blocks and nested groups.
Pixel-sized spans preserve measured dimensions. Satori resolves preferred column
widths and typography; the final Satori callback supplies absolute crop bounds.
Use returned allocation boxes for occupied bounds: the inherited `height` getter
does not track stacked column offsets in version 4.1.21.

MaxRects supplies rectangle packing but does not supply parent/child layouts.
It is not part of the selected implementation.

Sources: [Satori CSS support](https://github.com/vercel/satori#css),
[MaxRects API](https://github.com/soimy/maxrects-packer#api), and
[thi.ng layout](https://github.com/thi-ng/umbrella/tree/develop/packages/layout).

Satori's `pointScaleFactor: 0` disables pixel-grid rounding. Use it during native
measurement, then round final crop edges. This preserves equal track widths before
packing. Source: [pixel-grid rounding](https://github.com/vercel/satori#pixel-grid-rounding).

## Source-region detection

OpenCV's `inRange` compares the source to an opaque outer background. Sharp's
`extractChannel("alpha")` supplies alpha pixels to OpenCV's `threshold`; a
transparent outer background uses that alpha mask alone.
`connectedComponentsWithStats` reports unassigned regions. When the significant
component count equals the number of leaves, Munkres assigns them one-to-one
by minimum center distance. Otherwise, planned regions divide the remaining
foreground.

```ts
const tile = mask.roi(new cv.Rect(left, top, right - left, bottom - top));
const area = cv.countNonZero(tile);
const bounds = cv.boundingRect(tile);
```

The planned rectangles divide each gap at its midpoint. A tile's `Mat.roi`
isolates its search area. `countNonZero` measures foreground area, and
`boundingRect` returns its integer bounds. This keeps image IDs from the
planned catalogue even when neighboring foreground pixels connect. The
search areas cannot infer which tile owns pixels beyond their boundary.
Extraction preserves source pixels.

Sources: [OpenCV shape analysis](https://docs.opencv.org/4.13.0/d3/dc0/group__imgproc__shape.html),
[OpenCV array operations](https://docs.opencv.org/4.13.0/d2/de8/group__core__array.html),
[OpenCV thresholding](https://docs.opencv.org/4.13.0/d7/d1b/group__imgproc__misc.html),
[Sharp channel operations](https://sharp.pixelplumbing.com/api-channel/#extractchannel),
[Munkres assignment API](https://github.com/havelessbemore/munkres#usage),
and [Sharp animated joins](https://sharp.pixelplumbing.com/api-constructor/#join).

## GIF timing and task inputs

```ts
sharp(frames, { join: { animated: true } }).gif({
  delay: [100, 180, 100],
  loop: 0,
  keepDuplicateFrames: true,
});
```

Sharp 0.35.5 accepts an image array for animated joins and a number or array
for GIF delay. An array permits one frame to use another delay. Sources:
[Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/#join) and
[GIF output](https://sharp.pixelplumbing.com/api-output/#gif).

The CLI reads config and source paths at run time. Vite+ caches scripts only
when script caching is enabled. Leave script caching off so an external input
change cannot replay old guide output. Source:
[Vite+ task caching](https://viteplus.dev/guide/cache#when-is-caching-enabled).
Vite+ exports the test API from `vite-plus/test`; `vp test` runs Vitest without
a separate Vitest dependency. Source: [Vite+ tests](https://viteplus.dev/guide/test).

`cmd-mesh@0.5.0` accepts ArkType token parsers in `ParameterDescriptor.type`.
Its public `dist/types.d.ts` uses `string.integer.parse` for a numeric flag.
Use that parser for numeric CLI values; a plain `number` rejects text tokens.
Vite+ `vp pack` uses tsdown for library packages and accepts multiple entries.
The package's `bin` field names the built CLI entry. A source shebang is retained
for the Node command. Sources: [Vite+ pack](https://viteplus.dev/guide/pack),
[tsdown entries](https://tsdown.dev/options/entry), and
[tsdown package bins](https://tsdown.dev/reference/api/Interface.ExportsOptions).
