import { schema, type Layout, type Catalogue } from "./schema.ts";

/** Map the schematic's image bounds to the generated source resolution. */
export function createCatalogue({
  layout,
  source,
  outputs = {},
}: {
  layout: Layout;
  source: typeof schema.Source.infer;
  outputs?: Readonly<Record<string, string>>;
}): Catalogue {
  const viewport = source.viewport ?? { x: 0, y: 0, width: source.width, height: source.height };
  const images = (cells: Layout["cells"]): Catalogue["images"] =>
    cells.map((cell) => {
      const x = Math.round(viewport.x + (cell.image.x * viewport.width) / layout.width);
      const y = Math.round(viewport.y + (cell.image.y * viewport.height) / layout.height);
      return {
        id: cell.id,
        row: cell.row,
        column: cell.column,
        crop: {
          x,
          y,
          width:
            Math.round(
              viewport.x + ((cell.image.x + cell.image.width) * viewport.width) / layout.width,
            ) - x,
          height:
            Math.round(
              viewport.y + ((cell.image.y + cell.image.height) * viewport.height) / layout.height,
            ) - y,
        },
        ...(cell.label ? { label: { text: cell.label.text, position: cell.label.position } } : {}),
        context: cell.context,
        ...(outputs[cell.id] ? { output: outputs[cell.id] } : {}),
        ...(cell.children ? { children: images(cell.children) } : {}),
      };
    });
  return { atlasId: layout.id, source, images: images(layout.cells) };
}

/** Compare leaf bounds in the same source coordinate system, without changing either catalogue. */
export function compareCatalogues({
  expected,
  actual,
}: {
  expected: Catalogue;
  actual: Catalogue;
}) {
  const leaves = (images: Catalogue["images"]): Catalogue["images"] =>
    images.flatMap((image) => (image.children ? leaves(image.children) : [image]));
  const observed = new Map(leaves(actual.images).map((image) => [image.id, image.crop]));
  return schema.Comparison.assert({
    source: actual.source,
    images: leaves(expected.images).map((image) => {
      const crop = observed.get(image.id)!;
      return {
        id: image.id,
        expected: image.crop,
        actual: crop,
        delta: {
          x: crop.x - image.crop.x,
          y: crop.y - image.crop.y,
          width: crop.width - image.crop.width,
          height: crop.height - image.crop.height,
        },
      };
    }),
  });
}
