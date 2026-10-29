import { schema, createAtlas, createCatalogue } from "imagegen-guide/core";
import { cropImages } from "imagegen-guide/core/image";

const config = schema.Config.assert({
  id: "package-probe",
  canvas: { width: 256, height: 128, padding: 8 },
  grid: { columns: 2, gap: 8 },
  cells: [{ id: "settings" }, { id: "search", aspectRatio: "4:3" }],
});

const atlas = await createAtlas({ config, fonts: [] });
const catalogue = createCatalogue({
  layout: atlas.layout,
  source: { id: "rendered-guide", width: atlas.layout.width, height: atlas.layout.height },
});
const [crop] = await cropImages({
  source: new TextEncoder().encode(atlas.schematic),
  catalogue,
  ids: ["settings"],
});

const expected = catalogue.images.find((image) => image.id === "settings")?.crop;
const png = new DataView(crop?.bytes.buffer, crop?.bytes.byteOffset, crop?.bytes.byteLength);
if (
  !atlas.schematic.startsWith("<svg") ||
  !atlas.prompt.includes("settings") ||
  !expected ||
  crop?.id !== "settings" ||
  crop.format !== "png" ||
  png.getUint32(16) !== expected.width ||
  png.getUint32(20) !== expected.height
) {
  throw new Error("The published guide, catalogue, and selected crop disagree.");
}

console.log(`imagegen-guide: rendered guide and extracted ${crop.id} (${expected.width}×${expected.height}).`);
