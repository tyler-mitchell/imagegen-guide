import { schema, createAtlas } from "imagegen-guide/core";

const config = schema.Config.assert({
  id: "package-probe",
  canvas: { width: 256, height: 128, padding: 8 },
  grid: { columns: 2, gap: 8 },
  cells: [{ id: "settings" }, { id: "search", aspectRatio: "4:3" }],
});

const atlas = await createAtlas({ config, fonts: [] });
if (
  !atlas.schematic.startsWith("<svg") ||
  !atlas.prompt.includes("settings") ||
  atlas.layout.cells.map((cell) => cell.id).join(",") !== "settings,search"
) {
  throw new Error("The published package did not produce the configured guide.");
}
