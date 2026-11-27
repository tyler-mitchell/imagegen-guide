import { createAtlas, cropImages } from "imagegen-guide";

const atlas = await createAtlas({
  config: {
    id: "package-probe",
    canvas: { width: 256, height: 128, padding: 8 },
    grid: { columns: 2, gap: 8 },
    cells: [{ id: "settings" }, { id: "search", aspectRatio: "4:3" }],
  },
});

const [settings] = await cropImages({
  atlas,
  source: new TextEncoder().encode(atlas.schematic),
  ids: ["settings"],
});
if (
  !atlas.schematic.startsWith("<svg") ||
  !atlas.prompt.includes("settings") ||
  atlas.layout.cells.map((cell) => cell.id).join(",") !== "settings,search" ||
  settings?.id !== "settings" ||
  settings.bytes.length === 0
) {
  throw new Error("The published package did not produce and crop the configured guide.");
}
