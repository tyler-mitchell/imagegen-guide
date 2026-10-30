---
name: imagegen-guide
description: Use imagegen-guide to make a labeled image atlas, generate artwork with all supplied references, crop named images, and deliver the crops. Use this for icon sets and other multi-image layouts.
---

# Imagegen Guide

The package makes layout data and crops. `image_gen` makes artwork.

## Default for square UI icons

Create `/tmp/icon-job/config.json` from [examples/icon-atlas.json](examples/icon-atlas.json). The starter has twelve labeled cells. It makes a 1536×1152 guide with 284×284 image regions.

Change only each cell's `id`, `label.text`, and `prompt`. Keep the other values unless the layout or display size needs a change. The default uses planned crops. Do not add `crop.detect`.

For TypeScript callers, pass a literal config to `createAtlas`. `atlas.imageIds` then supplies typed IDs to `cropImages.ids` and `createGif.frames`.

## Make the guide

Save the task config outside the consumer app. Run the root script:

```sh
vp run cli -- --config /tmp/icon-job/config.json --out /tmp/icon-job
```

Use the paths in the command result. With the starter config, they end in:

```text
icon-atlas-light.guide.png
icon-atlas-light.prompt.txt
icon-atlas-light.layout.json
```

This command makes no artwork or crops. It returns only guide, prompt, layout, and config paths.

## Generate the artwork

Use the built-in `image_gen` tool. Send these inputs together in one request:

```text
geometry: /tmp/icon-job/icon-atlas-light.guide.png
instructions: /tmp/icon-job/icon-atlas-light.prompt.txt
style: every reference image supplied by the user
result: one generated atlas PNG
```

Attach every user reference image. Use the guide for positions and the references for style. Keep labels, lines, and artwork outside image regions out of the result.

If the user chose an existing image, use that exact image. The requested canvas size is a target; `image_gen` can return another size. Do not regenerate for that reason alone.

## Crop the result

Use the saved layout and the exact PNG returned by the generator. Do not pass `--config` to this command:

```sh
vp run cli -- crop --layout /tmp/icon-job/icon-atlas-light.layout.json --source /path/to/generated.png --out /tmp/icon-job/crops
```

The result gives the source dimensions, catalogue path, and crop count. The images are in `/tmp/icon-job/crops/icon-atlas/<id>.png`. The catalogue has each crop size. Do not run a separate image-size command.

## Make a GIF when needed

Use the same layout and generated source. All leaf images play in layout order at 100 ms per frame:

```sh
vp run cli -- gif --layout /tmp/icon-job/icon-atlas-light.layout.json --source /path/to/generated.png --out /tmp/icon-job
```

Use `--ids first,second,third` to set frame order. Use `--delay 120` to set one delay for all frames. In TypeScript, `{ id: "first", delay: 180 }` overrides one frame.

## Check before delivery

1. Match the crop count to the requested icon count.
2. Inspect the atlas and each crop. Reject clipped art, stray pixels, missing icons, and text from the guide.
3. Check crops at the display size. On a 2× display, a 56-point icon needs at least 112 source pixels per side.
4. Put only the checked cropped PNGs in the consumer app. Follow that app's build and install steps.

Keep a source with a different size when its full layout still matches the guide. The crop command scales the guide rectangles. It cannot fix shifted icons or art outside a rectangle.

## When cropping fails

`No foreground found for settings` means that optional detection did not find enough artwork in that tile's search area. Check the source background, `crop.detect.alphaThreshold`, and `crop.detect.minArea`. Use planned crops when the artwork fits the guide. Detection cannot separate artwork that crosses into another tile's search area.

If a crop cuts off art, show the planned boxes on the source:

```sh
vp run cli -- overlay --source /path/to/generated.png --catalogue /tmp/icon-job/crops/icon-atlas.catalogue.json --out /tmp/icon-job/overlay
```

Use an existing good source when one exists. Otherwise, correct the request or guide before another generation. Do not cover the defect with resizing or custom crop coordinates.

For mixed image ratios, groups, viewports, or detected bounds, read [README.md](../../README.md) and [docs/specification.md](../../docs/specification.md). Add only the options that the task needs.
