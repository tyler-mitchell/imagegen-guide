# Dependency research

Scope: headless layout, schematic output, and image extraction.
Sources were retrieved on 2026-10-11.

| Package        | Installed version | Role                                         |
| -------------- | ----------------- | -------------------------------------------- |
| Vite+          | 0.2.9             | Workspace, checks, and package build         |
| ArkType        | 2.2.8             | Core schema and inferred types               |
| Satori         | 0.47.1            | Layout rectangles and SVG schematic          |
| Sharp          | 0.35.5            | Image extraction and encoding                |
| @thi.ng/layout | 4.1.21            | Stacked allocation and native nested layouts |

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
It accepts SVG input for raster output. Sharp requires a Node-compatible runtime;
its entry point must be separate from the framework-independent layout entry point.

Sources: [extraction](https://sharp.pixelplumbing.com/api-resize/#extract),
[input](https://sharp.pixelplumbing.com/api-constructor/), and
[output](https://sharp.pixelplumbing.com/api-output/).

## Selection criteria

The selected layout path must expose the exact rectangles used by the schematic.
SVG parsing, DOM measurement, and a second layout calculation are not acceptable
substitutes for a supported rectangle-output contract.

Select Satori for the initial headless schematic and layout path. Its public
callback supplies the required rectangles and image identity. A separate Yoga
integration or XML serializer is not required for this path.

Select Sharp for the separate image-extraction entry point. The core layout path
must not import Sharp. Its native runtime belongs to the crop operation.

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

OpenCV supplies `inRange`, `connectedComponentsWithStats`, and `BFMatcher`.
These operations segment foreground regions on a uniform background and match
normalized region positions. Connected-component statistics supply actual integer
bounding boxes. They do not distinguish a tile from its shadow or reconstruct
group labels. Keep source pixels unchanged during extraction.

Sources: [OpenCV shape analysis](https://docs.opencv.org/4.13.0/d3/dc0/group__imgproc__shape.html),
[OpenCV matching](https://docs.opencv.org/4.13.0/d5/d6f/tutorial_feature_flann_matcher.html),
and [OpenCV JavaScript package](https://github.com/TechStark/opencv-js).
