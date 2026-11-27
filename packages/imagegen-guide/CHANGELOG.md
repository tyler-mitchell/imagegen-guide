# Changelog

## 0.1.0
<sub>2026-11-27</sub>

- *(minor)*
  Added headless guides with labels, dimension lines, reference images, and transparent-crop prompts, plus source-scaled named crops. `createGif({ atlas, source })` animates every leaf image with typed IDs and a default delay; the CLI separates guide, crop, and GIF work.
- *(minor)*
  Detect separated artwork beyond planned crop bounds, and locate connected artwork within each tile's share of the surrounding gaps.
- *(minor)* Publish the imagegen-guide command for guide, crop, and GIF workflows, with built-in mixed and animation examples.
- *(minor)* Allow a GIF frame selection to name a nested image group and play its leaf images in layout order.
- *(minor)* Allow crop and GIF commands to reuse an edited source catalogue, including corrected crop rectangles.
- *(minor)*
  Support fixed row tracks and row spans for mixed-size texture atlases while keeping image crop bounds separate from guide borders.
- *(minor)* Export crops at a requested pixel size and resize kernel while preserving source bounds and recording output dimensions.
- *(minor)*
  Split large grouped atlases into generation-sized guide pages with stable IDs, then crop generated pages together from the saved manifest.
- *(minor)*
  Added a config-level page size for guide generation. The bundled 100-family example now uses six four-state families per guide in the same gapless 4-by-6 lattice as the 23-icon example.
- *(minor)*
  Added per-image crop sizes so one generated atlas can export wide, square, and tall images at their requested dimensions.
- *(patch)* Report missing atlas tiles clearly when crop detection cannot match every image.
