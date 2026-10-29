# Implementation plan

## Workspace

Use the Vite+ monorepo for `imagegen-guide`. The library is in
`packages/imagegen-guide`. Build the initial headless implementation in its `core`
directory. Add the `react` directory after the core capabilities work.

## 1. Core layout contract

Define the ArkType module and infer the public types. Use Satori's plain element
objects and public `onNodeDetected` callback. The dependency choice is recorded in
[dependency research](research.md).

The layout must supply image and label rectangles without a browser. Include
mixed ratios, explicit dimensions, weighted tracks, and optional labels.

Verification: check exact rectangles for a small atlas with known dimensions.
Check that labels are outside image content. Confirm that each input ID appears
once in the resolved layout.

## 2. Schematic, prompt, and catalogue

Produce the schematic from the resolved geometry. Generate prompt text and JSON
catalogue entries from that same result. Supply one headless example with labels
above and below images, and one example with no labels.

Verification: render the schematic as an image. Compare the image bounds with the
catalogue. Confirm that prompt sections preserve image order and scoped descriptions.

## 3. Image extraction

Use an existing image-processing library to crop one entry, selected entries, or
all entries. Keep this operation in a separate import path if its runtime requires Node.js.

Verification: crop a known atlas with distinct cell colors. Check crop dimensions,
pixel boundaries, and image IDs. Confirm that the layout entry point does not load
the Node-specific image dependency.

## 4. React adapter

After the core operations work, add the `react` directory to the same package.
Render the resolved layout without changing its rectangles. This step has no
configuration UI.
