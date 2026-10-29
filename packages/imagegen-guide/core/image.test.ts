import sharp from "sharp";
import { expect, expectTypeOf, test } from "vite-plus/test";
import { createAtlas, createCatalogue, createGif, cropImages } from "./index.ts";

const sample = async () => {
  const colors = ["#ff0000", "#00ff00", "#0000ff"] as const;
  const atlas = await createAtlas({
    config: {
      id: "frames",
      canvas: { width: 480, height: 280, padding: 16 },
      grid: { columns: 3, gap: 12 },
      cells: [
        { id: "red", aspectRatio: "1:1" },
        { id: "green", aspectRatio: "2:3" },
        { id: "blue", aspectRatio: "3:2" },
      ],
    },
  });
  const source = await sharp({
    create: {
      width: atlas.layout.width,
      height: atlas.layout.height,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite(
      atlas.layout.cells.map((cell, index) => ({
        input: {
          create: {
            width: cell.image.width,
            height: cell.image.height,
            channels: 4 as const,
            background: colors[index]!,
          },
        },
        left: cell.image.x,
        top: cell.image.y,
      })),
    )
    .png()
    .toBuffer();
  return { atlas, source };
};

const center = async (gif: Uint8Array, page: number) => {
  const { width, height } = await sharp(gif, { page }).metadata();
  return sharp(gif, { page })
    .extract({ left: Math.floor(width! / 2), top: Math.floor(height! / 2), width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
};

test("animates every image in layout order with one default delay", async () => {
  const { atlas, source } = await sample();
  const gif = await createGif({ atlas, source });
  const metadata = await sharp(gif, { animated: true }).metadata();
  const crops = await cropImages({ atlas, source });

  expectTypeOf<(typeof atlas.imageIds)[number]>().toEqualTypeOf<"red" | "green" | "blue">();
  expect(metadata.pages).toBe(3);
  expect(metadata.delay).toEqual([100, 100, 100]);
  expect(metadata.width).toBe(Math.max(...crops.map(({ crop }) => crop.width)));
  expect(metadata.pageHeight).toBe(Math.max(...crops.map(({ crop }) => crop.height)));
  const corner = await sharp(gif, { page: 0 })
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect(corner[3]).toBe(0);
  expect(await center(gif, 0)).toEqual(Buffer.from([255, 0, 0]));
  expect(await center(gif, 1)).toEqual(Buffer.from([0, 255, 0]));
  expect(await center(gif, 2)).toEqual(Buffer.from([0, 0, 255]));
});

test("reorders, repeats, and overrides one frame delay", async () => {
  const { atlas, source } = await sample();
  const gif = await createGif({
    atlas,
    source,
    frames: ["blue", { id: "red", delay: 240 }, "blue"],
    delay: 80,
    loop: 2,
  });
  const metadata = await sharp(gif, { animated: true }).metadata();

  expect(metadata.pages).toBe(3);
  expect(metadata.delay).toEqual([80, 240, 80]);
  expect(metadata.loop).toBe(2);
  expect(await center(gif, 0)).toEqual(Buffer.from([0, 0, 255]));
  expect(await center(gif, 1)).toEqual(Buffer.from([255, 0, 0]));
  expect(await center(gif, 2)).toEqual(Buffer.from([0, 0, 255]));
});

test("reports missing image IDs and empty animation sequences", async () => {
  const { atlas, source } = await sample();
  const catalogue = createCatalogue({
    layout: atlas.layout,
    source: { id: atlas.layout.id, width: atlas.layout.width, height: atlas.layout.height },
  });

  await expect(cropImages({ catalogue, source, ids: ["missing"] })).rejects.toThrow(
    "Unknown image ID: missing",
  );
  await expect(createGif({ catalogue, source, frames: ["red", "missing"] })).rejects.toThrow(
    "Unknown image ID: missing",
  );
  await expect(createGif({ atlas, source, frames: [] })).rejects.toThrow(
    "A GIF needs at least one frame.",
  );
});

test("returns source-sized crop bounds with each image", async () => {
  const { atlas, source } = await sample();
  const smaller = await sharp(source).resize({ width: 240, height: 140 }).png().toBuffer();
  const crops = await cropImages({ atlas, source: smaller });

  expect(crops.map((crop) => crop.id)).toEqual(["red", "green", "blue"]);
  for (const [index, crop] of crops.entries()) {
    const bounds = atlas.layout.cells[index]!.image;
    const metadata = await sharp(crop.bytes).metadata();
    expect(crop.crop.width).toBe(
      Math.round((bounds.x + bounds.width) / 2) - Math.round(bounds.x / 2),
    );
    expect(crop.crop.height).toBe(
      Math.round((bounds.y + bounds.height) / 2) - Math.round(bounds.y / 2),
    );
    expect([metadata.width, metadata.height]).toEqual([crop.crop.width, crop.crop.height]);
  }
});

test("returns selected crops in caller order, including repeated IDs", async () => {
  const { atlas, source } = await sample();
  const crops = await cropImages({ atlas, source, ids: ["blue", "red", "blue"] });

  expect(crops.map((crop) => crop.id)).toEqual(["blue", "red", "blue"]);
});

test("retains nested image IDs in the public atlas type", async () => {
  const atlas = await createAtlas({
    config: {
      id: "nested-ids",
      canvas: { width: 600, height: 400 },
      grid: { columns: 2, gap: 24 },
      cells: [
        {
          id: "group",
          children: {
            grid: { columns: 2, gap: 12 },
            cells: [{ id: "left" }, { id: "right" }],
          },
        },
        { id: "solo" },
      ],
    },
  });

  expect(atlas.imageIds).toEqual(["group", "left", "right", "solo"]);
  expectTypeOf<(typeof atlas.imageIds)[number]>().toEqualTypeOf<
    "group" | "left" | "right" | "solo"
  >();
});
