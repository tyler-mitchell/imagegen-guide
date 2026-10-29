// Node file I/O is confined to this example's input and output boundary.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { program } from "cmd-mesh";
import { createFile } from "package-management";
import sharp from "sharp";
import {
  schema,
  createAtlas,
  createCatalogue,
  compareCatalogues,
  type Layout,
  type Config,
  type Catalogue,
  cropImages,
  createGif,
  createMask,
  detectCatalogue,
  detectRegions,
  overlayImage,
} from "../core/index.ts";
import mixed from "./configs/mixed.json" with { type: "json" };
import icons from "./configs/icons.json" with { type: "json" };
import variants from "./configs/variants.json" with { type: "json" };
import wide from "./configs/wide.json" with { type: "json" };
import portrait from "./configs/portrait.json" with { type: "json" };
import labels from "./configs/labels.json" with { type: "json" };
import nested from "./configs/nested.json" with { type: "json" };
import deep from "./configs/deep.json" with { type: "json" };

const parseIds = (ids?: string) => ids?.split(",").map((id) => id.trim());

const sourceCatalogues = async ({
  layout,
  source,
  sourceFile,
  options,
  outputs,
}: {
  layout: Layout;
  source: Uint8Array;
  sourceFile: string;
  options?: Config["crop"];
  outputs?: Readonly<Record<string, string>>;
}) => {
  const metadata = await sharp(source).metadata();
  const planned = createCatalogue({
    layout,
    outputs,
    source: {
      id: layout.id,
      uri: sourceFile,
      width: metadata.width!,
      height: metadata.height!,
      ...(options?.viewport ? { viewport: options.viewport } : {}),
    },
  });
  const catalogue = options?.detect
    ? await detectCatalogue({ source, catalogue: planned, options: options.detect })
    : planned;
  return { metadata, planned, catalogue };
};

const saveImages = async ({
  out,
  layout,
  source,
  sourceFile,
  options,
  ids,
}: {
  out: string;
  layout: Layout;
  source: Uint8Array;
  sourceFile: string;
  options?: Config["crop"];
  ids?: readonly string[];
}) => {
  const name = encodeURIComponent(layout.id);
  const format = options?.format ?? "png";
  const outputs = (cells: Layout["cells"]): [string, string][] =>
    cells.flatMap((cell) => [
      ...((ids ? ids.includes(cell.id) : !cell.children)
        ? [[cell.id, `${name}/${encodeURIComponent(cell.id)}.${format}`] as [string, string]]
        : []),
      ...(cell.children ? outputs(cell.children) : []),
    ]);
  const { metadata, planned, catalogue } = await sourceCatalogues({
    layout,
    outputs: Object.fromEntries(outputs(layout.cells)),
    source,
    sourceFile,
    options,
  });
  const crops = await cropImages({ source, catalogue, format, ids });
  await mkdir(`${out}/${name}`, { recursive: true });
  createFile(`${out}/${name}.catalogue.json`, JSON.stringify(catalogue, null, 2));
  if (options?.detect) {
    createFile(`${out}/${name}.planned.catalogue.json`, JSON.stringify(planned, null, 2));
    createFile(
      `${out}/${name}.comparison.json`,
      JSON.stringify(compareCatalogues({ expected: planned, actual: catalogue }), null, 2),
    );
  }
  for (const crop of crops)
    await writeFile(`${out}/${name}/${encodeURIComponent(crop.id)}.${format}`, crop.bytes);
  return {
    source: sourceFile,
    dimensions: { width: metadata.width, height: metadata.height },
    catalogue: `${out}/${name}.catalogue.json`,
    images: crops.length,
  };
};

const example = program({
  name: "imagegen-guide",
  version: "0.0.0",
  cli: { default: "guide" },
  commands: {
    guide: {
      description: "Save a schematic, layout, and prompt for image generation.",
      input: {
        out: { type: "string = 'examples/output'", cli: "--out" },
        preset: { type: "'light' | 'dark' | undefined", cli: "--preset" },
        config: { type: "string | undefined", cli: "--config" },
        example: {
          type: "'mixed' | 'icons' | 'variants' | 'wide' | 'portrait' | 'labels' | 'nested' | 'deep' = 'mixed'",
          cli: "--example",
        },
      },
      run: async ({ out, preset, example, config: configFile }) => {
        const selected = schema.Config.assert(
          configFile
            ? JSON.parse(await readFile(configFile, "utf8"))
            : { mixed, icons, variants, wide, portrait, labels, nested, deep }[example],
        );
        const config = schema.Config.assert({
          ...selected,
          appearance: {
            ...selected.appearance,
            preset: preset ?? selected.appearance?.preset ?? "light",
          },
        });
        const name = `${encodeURIComponent(configFile ? config.id : example)}-${config.appearance!.preset}`;
        const atlas = await createAtlas({ config });
        const guide = await sharp(Buffer.from(atlas.schematic)).png().toBuffer();
        await mkdir(out, { recursive: true });
        createFile(`${out}/${name}.svg`, atlas.schematic);
        await writeFile(`${out}/${name}.guide.png`, guide);
        createFile(`${out}/${name}.layout.json`, JSON.stringify(atlas.layout, null, 2));
        createFile(`${out}/${name}.config.json`, JSON.stringify(config, null, 2));
        createFile(`${out}/${name}.prompt.txt`, atlas.prompt);
        return {
          schematic: `${out}/${name}.svg`,
          guide: `${out}/${name}.guide.png`,
          layout: `${out}/${name}.layout.json`,
          config: `${out}/${name}.config.json`,
          prompt: `${out}/${name}.prompt.txt`,
        };
      },
    },
    crop: {
      description: "Crop an unchanged source from saved layout geometry.",
      input: {
        layout: { type: "string", required: true, cli: "--layout" },
        source: { type: "string", required: true, cli: "--source" },
        config: {
          type: "string | undefined",
          cli: "--config",
          description: "Optional crop settings. Omit for planned bounds.",
        },
        ids: {
          type: "string | undefined",
          cli: "--ids",
          description: "Comma-separated image IDs. Default: all leaf images.",
        },
        out: { type: "string = 'examples/output/crops'", cli: "--out" },
      },
      run: async ({ layout: layoutFile, source: sourceFile, config: configFile, ids, out }) => {
        const layout = schema.Layout.assert(JSON.parse(await readFile(layoutFile, "utf8")));
        const config = configFile
          ? schema.Config.assert(JSON.parse(await readFile(configFile, "utf8")))
          : undefined;
        return saveImages({
          out,
          layout,
          source: await readFile(sourceFile),
          sourceFile,
          options: config?.crop,
          ids: parseIds(ids),
        });
      },
    },
    gif: {
      description: "Animate a generated atlas in layout order.",
      input: {
        layout: { type: "string", required: true, cli: "--layout" },
        source: { type: "string", required: true, cli: "--source" },
        config: {
          type: "string | undefined",
          cli: "--config",
          description: "Optional crop settings. Omit for planned bounds.",
        },
        ids: {
          type: "string | undefined",
          cli: "--ids",
          description: "Comma-separated frame IDs in playback order. Default: all leaves.",
        },
        delay: {
          type: "string.integer.parse = '100'",
          cli: "--delay",
          description: "Milliseconds per frame. Default: 100.",
        },
        loop: {
          type: "string.integer.parse = '0'",
          cli: "--loop",
          description: "Repeat count. Zero means forever.",
        },
        out: { type: "string = 'examples/output/gifs'", cli: "--out" },
      },
      run: async ({
        layout: layoutFile,
        source: sourceFile,
        config: configFile,
        ids,
        delay,
        loop,
        out,
      }) => {
        const layout = schema.Layout.assert(JSON.parse(await readFile(layoutFile, "utf8")));
        const config = configFile
          ? schema.Config.assert(JSON.parse(await readFile(configFile, "utf8")))
          : undefined;
        const source = await readFile(sourceFile);
        const { catalogue } = await sourceCatalogues({
          layout,
          source,
          sourceFile,
          options: config?.crop,
        });
        const animation = await createGif({
          catalogue,
          source,
          frames: parseIds(ids),
          delay: schema.FrameDelay.assert(delay),
          loop: schema.Index.assert(loop),
        });
        await mkdir(out, { recursive: true });
        const gif = `${out}/${encodeURIComponent(layout.id)}.gif`;
        await writeFile(gif, animation);
        const metadata = await sharp(animation, { animated: true }).metadata();
        return { gif, frames: metadata.pages, delay: metadata.delay, loop: metadata.loop };
      },
    },
    regions: {
      description: "Save native foreground bounds before assigning image IDs.",
      input: {
        layout: { type: "string", required: true, cli: "--layout" },
        source: { type: "string", required: true, cli: "--source" },
        config: { type: "string | undefined", cli: "--config" },
        out: { type: "string = 'examples/output/regions'", cli: "--out" },
      },
      run: async ({ layout: layoutFile, source: sourceFile, config: configFile, out }) => {
        const layout = schema.Layout.assert(JSON.parse(await readFile(layoutFile, "utf8")));
        const config = configFile
          ? schema.Config.assert(JSON.parse(await readFile(configFile, "utf8")))
          : undefined;
        const source = await readFile(sourceFile);
        const metadata = await sharp(source).metadata();
        const catalogue = createCatalogue({
          layout,
          source: {
            id: layout.id,
            uri: sourceFile,
            width: metadata.width!,
            height: metadata.height!,
            ...(config?.crop?.viewport ? { viewport: config.crop.viewport } : {}),
          },
        });
        const regions = await detectRegions({ source, catalogue, options: config?.crop?.detect });
        const report = schema.DetectionReport.assert({ source: catalogue.source, regions });
        await mkdir(out, { recursive: true });
        createFile(`${out}/${layout.id}.regions.json`, JSON.stringify(report, null, 2));
        return {
          regions: regions.length,
          largest: regions.toSorted((a, b) => b.area - a.area)[0],
          report: `${out}/${layout.id}.regions.json`,
        };
      },
    },
    mask: {
      description: "Save an edit mask with transparent crop regions and opaque surroundings.",
      input: {
        catalogue: { type: "string", required: true, cli: "--catalogue" },
        out: { type: "string = 'examples/output/mask'", cli: "--out" },
      },
      run: async ({ catalogue, out }) => {
        const data = schema.Catalogue.assert(JSON.parse(await readFile(catalogue, "utf8")));
        const mask = await createMask({ catalogue: data });
        await mkdir(out, { recursive: true });
        await writeFile(`${out}/mask.png`, mask);
        return { mask: `${out}/mask.png`, catalogue };
      },
    },
    overlay: {
      description: "Overlay saved crop boxes on a generated image for correction.",
      input: {
        source: { type: "string", required: true, cli: "--source" },
        catalogue: { type: "string", required: true, cli: "--catalogue" },
        stroke: { type: "string = '#ff00ff'", cli: "--stroke" },
        strokeWidth: { type: "string.numeric.parse = '2'", cli: "--stroke-width" },
        prompt: { type: "string | undefined", cli: "--prompt" },
        out: { type: "string = 'examples/output/overlay'", cli: "--out" },
      },
      run: async ({ source, catalogue, stroke, strokeWidth, prompt, out }) => {
        const data = schema.Catalogue.assert(JSON.parse(await readFile(catalogue, "utf8")));
        const count = (images: Catalogue["images"]): number =>
          images.reduce((total, image) => total + (image.children ? count(image.children) : 1), 0);
        const image = await overlayImage({
          source: await readFile(source),
          catalogue: data,
          style: schema.ImageStyle.assert({ stroke, strokeWidth }),
        });
        await mkdir(out, { recursive: true });
        await writeFile(`${out}/overlay.png`, image);
        createFile(
          `${out}/prompt.txt`,
          [
            `Image 1 is the annotated atlas to edit; image 2 is its original schematic. The guide outlines use ${stroke}. Produce all ${data.images.length} families and ${count(data.images)} icons, restoring any missing ones. The schematic owns the geometry: rebuild any incorrect row heights, image boundaries, and unintended blank strips in image 1. Regenerate cells at their required sizes and positions; do not only erase the guide lines. Fit each icon exactly inside its outlined rectangle, edge-to-edge, without inset or exterior shadow. Preserve the configured symbols, variants, and family order. Do not merge, omit, or reorder families. Keep any schematic labels outside image regions. Preserve the outlined box positions relative to the canvas; scale the entire schematic uniformly to the requested resolution. Remove all guide outlines from the final image.`,
            ...(prompt ? [await readFile(prompt, "utf8")] : []),
          ].join("\n"),
        );
        return { image: `${out}/overlay.png`, prompt: `${out}/prompt.txt`, catalogue };
      },
    },
    compare: {
      description: "Report exact pixel differences between planned and detected leaf bounds.",
      input: {
        expected: { type: "string", required: true, cli: "--expected" },
        actual: { type: "string", required: true, cli: "--actual" },
        out: { type: "string = 'examples/output/comparison.json'", cli: "--out" },
      },
      run: async ({ expected, actual, out }) => {
        const comparison = compareCatalogues({
          expected: schema.Catalogue.assert(JSON.parse(await readFile(expected, "utf8"))),
          actual: schema.Catalogue.assert(JSON.parse(await readFile(actual, "utf8"))),
        });
        createFile(out, JSON.stringify(comparison, null, 2));
        return {
          images: comparison.images.length,
          exact: comparison.images.filter((image) =>
            Object.values(image.delta).every((value) => value === 0),
          ).length,
          maxDelta: Math.max(
            ...comparison.images.flatMap((image) => Object.values(image.delta).map(Math.abs)),
          ),
          report: out,
        };
      },
    },
  },
});

await example.main();
