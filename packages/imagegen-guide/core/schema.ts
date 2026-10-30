import { type } from "arktype";

/** The serializable input and output contracts for the headless core. */
export const schema = type.module({
  Positive: "number > 0",
  Nonnegative: "number >= 0",
  Index: "number.integer >= 0",
  AspectRatio: "'1:1' | '3:2' | '2:3' | '4:3' | '3:4' | '16:9' | '9:16' | Dimensions",
  Dimensions: { width: "Positive", height: "Positive" },
  Padding: "Nonnegative | Insets",
  Insets: { top: "Nonnegative", right: "Nonnegative", bottom: "Nonnegative", left: "Nonnegative" },
  Gap: "Nonnegative | AxisGap",
  AxisGap: { row: "Nonnegative", column: "Nonnegative" },
  Track: type("number > 0").or(type("string").matching(/^\d+(?:\.\d+)?fr$/)),
  Tracks: "number.integer > 0 | Track[]",
  Alignment: "'start' | 'center' | 'end'",
  DetectionOptions: {
    "background?": "string",
    "threshold?": "Nonnegative",
    "alphaThreshold?": "Nonnegative",
    "minArea?": "Nonnegative",
  },
  CropOptions: {
    "format?": "ImageFormat",
    "detect?": "DetectionOptions",
    "viewport?": "Rectangle",
    "size?": "CropSize",
    "kernel?": "ResizeKernel",
  },
  PixelSize: { width: "number.integer > 0", height: "number.integer > 0" },
  CropSize: "number.integer > 0 | PixelSize",
  ResizeKernel:
    "'nearest' | 'linear' | 'cubic' | 'mitchell' | 'lanczos2' | 'lanczos3' | 'mks2013' | 'mks2021'",
  OutputOptions: {
    "background?": "string",
    "transparentCrops?": "boolean",
  },
  ImageStyle: {
    "fill?": "string",
    "backgroundImage?": "string",
    "backgroundSize?": "string",
    "backgroundPosition?": "string",
    "backgroundRepeat?": "'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'",
    "dimensionLines?": "boolean",
    "dimensionLineColor?": "string",
    "stroke?": "string",
    "strokeWidth?": "Nonnegative",
    "radius?": "Nonnegative",
  },
  LabelStyle: {
    "position?": "'above' | 'below'",
    "fontFamily?": "string",
    "fontWeight?": "100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900",
    "fontStyle?": "'normal' | 'italic'",
    "fontSize?": "Positive",
    "lineHeight?": "Positive",
    "color?": "string",
    "gap?": "Nonnegative",
    "align?": "'left' | 'center' | 'right'",
    "wrap?": "boolean",
    "maxLines?": "number.integer > 0",
  },
  Label: { "...": "LabelStyle", text: "string" },
  LabelOptions: { "...": "LabelStyle", "text?": "string" },
  CellOptions: {
    "aspectRatio?": "AspectRatio",
    "width?": "Positive",
    "height?": "Positive",
    "image?": "ImageStyle",
    "label?": "LabelOptions | false",
    "prompt?": "string",
  },
  Cell: {
    "...": "CellOptions",
    id: "string",
    "row?": "Index",
    "column?": "Index",
    "rowSpan?": "number.integer > 0",
    "columnSpan?": "number.integer > 0",
    "children?": "Grid",
  },
  Canvas: "SizedCanvas | WidthCanvas | HeightCanvas",
  SizedCanvas: { "...": "Dimensions", "aspectRatio?": "AspectRatio", "padding?": "Padding" },
  WidthCanvas: { width: "Positive", aspectRatio: "AspectRatio", "padding?": "Padding" },
  HeightCanvas: { height: "Positive", aspectRatio: "AspectRatio", "padding?": "Padding" },
  Grid: {
    grid: { columns: "Tracks", "rows?": "Tracks", "gap?": "Gap", "padding?": "Padding" },
    "defaults?": "CellOptions",
    "rows?": { "[string]": "CellOptions" },
    "columns?": { "[string]": "CellOptions" },
    "prompt?": "string",
    cells: "Cell[]",
  },
  Config: {
    "...": "Grid",
    id: "string",
    canvas: "Canvas",
    "layout?": "'grid' | 'masonry'",
    "align?": "Alignment",
    "verticalAlign?": "Alignment",
    "crop?": "CropOptions",
    "output?": "OutputOptions",
    "appearance?": {
      "preset?": "'light' | 'dark'",
      "background?": "string",
      "image?": "ImageStyle",
      "label?": "LabelStyle",
    },
  },
  Rectangle: { x: "Index", y: "Index", width: "number.integer > 0", height: "number.integer > 0" },
  Region: { "...": "Rectangle", area: "number.integer > 0" },
  DetectionReport: { source: "Source", regions: "Region[]" },
  ResolvedCell: {
    id: "string",
    row: "Index",
    column: "Index",
    cell: "Rectangle",
    image: "Rectangle",
    "label?": { "...": "Label", bounds: "Rectangle" },
    context: "string[]",
    "children?": "ResolvedCell[]",
  },
  Layout: {
    id: "string",
    width: "number.integer > 0",
    height: "number.integer > 0",
    cells: "ResolvedCell[]",
  },
  Atlas: { layout: "Layout", schematic: "string", prompt: "string", imageIds: "string[]" },
  ImageFormat: "'png' | 'jpeg' | 'webp' | 'avif'",
  Crop: {
    id: "string",
    bytes: type.instanceOf(Uint8Array),
    format: "ImageFormat",
    crop: "Rectangle",
    size: "PixelSize",
  },
  FrameDelay: "number.integer > 0",
  GifFrame: { id: "string", "delay?": "FrameDelay" },
  Source: {
    id: "string",
    "uri?": "string",
    width: "number.integer > 0",
    height: "number.integer > 0",
    "viewport?": "Rectangle",
  },
  CatalogueImage: {
    id: "string",
    row: "Index",
    column: "Index",
    crop: "Rectangle",
    "label?": "Label",
    context: "string[]",
    "output?": "string",
    "outputSize?": "PixelSize",
    "children?": "CatalogueImage[]",
  },
  Catalogue: { atlasId: "string", source: "Source", images: "CatalogueImage[]" },
  ComparisonImage: {
    id: "string",
    expected: "Rectangle",
    actual: "Rectangle",
    delta: {
      x: "number.integer",
      y: "number.integer",
      width: "number.integer",
      height: "number.integer",
    },
  },
  Comparison: {
    source: "Source",
    images: "ComparisonImage[]",
  },
});

export type Config = typeof schema.Config.infer;
export type Layout = typeof schema.Layout.infer;
export type Rectangle = typeof schema.Rectangle.infer;
export type Catalogue = typeof schema.Catalogue.infer;
type CellId<Cell> = Cell extends { id: infer Id extends string }
  ?
      | Id
      | (Cell extends { children: { cells: infer Cells extends readonly unknown[] } }
          ? CellId<Cells[number]>
          : never)
  : never;
export type ImageId<C extends Config> = CellId<C["cells"][number]>;
export type Atlas<Id extends string = string> = typeof schema.Atlas.infer & { imageIds: Id[] };
export type Crop = typeof schema.Crop.infer;
export type Comparison = typeof schema.Comparison.infer;
