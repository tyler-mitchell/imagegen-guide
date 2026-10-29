# Requirements

## Purpose

Create a standard layout guide for image generation. Use the same layout to find,
inspect, and crop individual images in the generated atlas.

## Requirements

| ID     | Requirement                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-01 | Define the complete atlas with a serializable configuration.                                                                            |
| REQ-02 | Supply standard aspect-ratio presets and explicit dimensions for the canvas and individual images.                                      |
| REQ-03 | Configure image dimensions, preferred column widths, gaps, padding, alignment, and row or column groups.                                |
| REQ-04 | Support images with different aspect ratios in one atlas.                                                                               |
| REQ-05 | Give each image a stable ID and a resolved row and column.                                                                              |
| REQ-06 | Support optional labels above or below each image. Configure label text, size, font, color, alignment, spacing, and wrapping.           |
| REQ-07 | Configure the schematic background, image fill, outline color, outline width, and corner radius.                                        |
| REQ-08 | Supply shared defaults and explicit overrides for rows, columns, and cells.                                                             |
| REQ-09 | Produce a minimal schematic with the exact image proportions and positions defined by the configuration.                                |
| REQ-10 | Return the image rectangles used by the schematic. Exclude labels, outlines, padding, and gaps from crop content.                       |
| REQ-11 | Produce a JSON catalogue with source identity, image IDs, dimensions, crop rectangles, labels, and output references.                   |
| REQ-12 | Generate provider-independent prompt text from the configuration.                                                                       |
| REQ-13 | Support optional descriptions for the atlas, rows, columns, and individual images. These descriptions need not appear on the schematic. |
| REQ-14 | Crop one image, selected images, or all images from a generated atlas. Supply the crop data for saving or inspection.                   |
| REQ-15 | Support named light and dark appearance presets with explicit color overrides.                                                          |
| REQ-16 | All core capabilities must be callable through a headless API.                                                                          |
| REQ-17 | The core must be independent of UI frameworks and image-generation providers.                                                           |
| REQ-18 | One authoritative schema must define types and validation. Core operations receive valid data.                                          |
| REQ-19 | The schematic, crop geometry, prompt text, and catalogue must describe the same configured layout.                                      |
| REQ-20 | Required dimensions and appearance controls must be available through configuration.                                                    |
| REQ-21 | Layout generation must not require an external service or artifact store.                                                               |
| REQ-22 | Consumers must be able to inspect, crop, and save outputs without a specific UI renderer.                                               |
| REQ-23 | UI renderers can display the resolved layout without changing its geometry.                                                             |
| REQ-24 | Individual images can be identified for regeneration with their dimensions and prompt context.                                          |
| REQ-25 | Consumers can save selected images to an artifact library.                                                                              |
| REQ-26 | Use standard aspect ratios and reduce unused canvas space through packing without overlap.                                              |
| REQ-27 | Support nested image groups and retain their hierarchy in crop geometry and catalogues. Crop groups or individual descendants.          |
| REQ-28 | Support atlases of 100 app icons, including multiple variants for each icon.                                                            |
| REQ-29 | Configure the requested image resolution and map crops to the actual generated source resolution.                                       |
| REQ-30 | Supply concise default layout instructions that consumers can prepend or append to their own prompts.                                   |

## Acceptance

A headless example must produce a schematic, crop geometry, prompt text, and a JSON
catalogue from one configuration. It must include different image ratios and both
label positions. An image-extraction example must crop the specified image content
without labels or gaps. It must retain the image IDs in the catalogue.

The guide defines the intended layout. It does not guarantee that an external
image-generation model will follow that layout.
