#!/usr/bin/env node
// Node file I/O is confined to the command boundary.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { program } from "cmd-mesh";
import { createFile } from "package-management";
import sharp from "sharp";
import {
  schema,
  createAtlas,
  createAtlasPages,
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
} from "./core/index.ts";
import mixed from "./examples/configs/mixed.json" with { type: "json" };
import icons from "./examples/configs/icons.json" with { type: "json" };
import variants from "./examples/configs/variants.json" with { type: "json" };
import wide from "./examples/configs/wide.json" with { type: "json" };
import portrait from "./examples/configs/portrait.json" with { type: "json" };
import labels from "./examples/configs/labels.json" with { type: "json" };
import nested from "./examples/configs/nested.json" with { type: "json" };
import deep from "./examples/configs/deep.json" with { type: "json" };
import adventurerAnimations from "./examples/configs/adventurer-animations.json" with { type: "json" };
import characterTexture from "./examples/configs/character-texture.json" with { type: "json" };
import manifest from "./package.json" with { type: "json" };

const parseIds = (ids?: string) => ids?.split(",").map((id) => id.trim());

const loadSelection = async ({
  layoutFile,
  catalogueFile,
  configFile,
}: {
  layoutFile?: string;
  catalogueFile?: string;
  configFile?: string;
}) => {
  if (Boolean(layoutFile) === Boolean(catalogueFile))
    throw new RangeError("Pass exactly one of --layout or --catalogue.");
  if (catalogueFile && configFile)
    throw new RangeError("--config applies to --layout; an edited catalogue owns its crop bounds.");
  return {
    layout: layoutFile
      ? schema.Layout.assert(JSON.parse(await readFile(layoutFile, "utf8")))
      : undefined,
    catalogue: catalogueFile
      ? schema.Catalogue.assert(JSON.parse(await readFile(catalogueFile, "utf8")))
      : undefined,
    options: configFile
      ? schema.Config.assert(JSON.parse(await readFile(configFile, "utf8"))).crop
      : undefined,
  };
};

const sourceCatalogues = async ({
  layout,
  catalogue: savedCatalogue,
  source,
  sourceFile,
  options,
}: {
  layout?: Layout;
  catalogue?: Catalogue;
  source: Uint8Array;
  sourceFile: string;
  options?: Config["crop"];
}) => {
  const metadata = await sharp(source).metadata();
  if (savedCatalogue) {
    if (
      metadata.width !== savedCatalogue.source.width ||
      metadata.height !== savedCatalogue.source.height
    )
      throw new RangeError("The source dimensions do not match the saved catalogue.");
    return { metadata, planned: savedCatalogue, catalogue: savedCatalogue };
  }
  const planned = createCatalogue({
    layout: layout!,
    source: {
      id: layout!.id,
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
  savedCatalogue,
  source,
  sourceFile,
  options,
  size,
  kernel,
  ids,
}: {
  out: string;
  layout?: Layout;
  savedCatalogue?: Catalogue;
  source: Uint8Array;
  sourceFile: string;
  options?: Config["crop"];
  size?: typeof schema.CropSize.infer;
  kernel?: typeof schema.ResizeKernel.infer;
  ids?: readonly string[];
}) => {
  const name = encodeURIComponent(savedCatalogue?.atlasId ?? layout!.id);
  const format = options?.format ?? "png";
  const outputSize = size ?? options?.size;
  const outputKernel = kernel ?? options?.kernel;
  const {
    metadata,
    planned,
    catalogue: located,
  } = await sourceCatalogues({
    layout,
    catalogue: savedCatalogue,
    source,
    sourceFile,
    options,
  });
  const outputPaths = (images: Catalogue["images"]): [string, string][] =>
    images.flatMap((image) => [
      ...((ids ? ids.includes(image.id) : !image.children)
        ? [[image.id, `${name}/${encodeURIComponent(image.id)}.${format}`] as [string, string]]
        : []),
      ...(image.children ? outputPaths(image.children) : []),
    ]);
  const paths = new Map(outputPaths(located.images));
  const resolvedSize =
    typeof outputSize === "number" ? { width: outputSize, height: outputSize } : outputSize;
  const withOutputs = (data: Catalogue): Catalogue => {
    const images = (entries: Catalogue["images"]): Catalogue["images"] =>
      entries.map((entry) => ({
        ...entry,
        output: paths.get(entry.id),
        outputSize: paths.has(entry.id)
          ? (resolvedSize ?? { width: entry.crop.width, height: entry.crop.height })
          : undefined,
        ...(entry.children ? { children: images(entry.children) } : {}),
      }));
    return { ...data, source: { ...data.source, uri: sourceFile }, images: images(data.images) };
  };
  const catalogue = withOutputs(located);
  const crops = await cropImages({
    source,
    catalogue,
    format,
    size: outputSize,
    kernel: outputKernel,
    ids,
  });
  await mkdir(`${out}/${name}`, { recursive: true });
  createFile(`${out}/${name}.catalogue.json`, JSON.stringify(catalogue, null, 2));
  if (options?.detect && !savedCatalogue) {
    const expected = withOutputs(planned);
    createFile(`${out}/${name}.planned.catalogue.json`, JSON.stringify(expected, null, 2));
    createFile(
      `${out}/${name}.comparison.json`,
      JSON.stringify(compareCatalogues({ expected, actual: catalogue }), null, 2),
    );
  }
  for (const crop of crops)
    await writeFile(`${out}/${name}/${encodeURIComponent(crop.id)}.${format}`, crop.bytes);
  return {
    source: sourceFile,
    dimensions: { width: metadata.width, height: metadata.height },
    ...(outputSize === undefined ? {} : { outputSize }),
    catalogue: `${out}/${name}.catalogue.json`,
    images: crops.length,
  };
};

const example = program({
  name: "imagegen-guide",
  version: manifest.version,
  cli: { default: "guide" },
  commands: {
    guide: {
      description: "Save a schematic, layout, and prompt for image generation.",
      input: {
        out: { type: "string = 'imagegen-guide-output'", cli: "--out" },
        preset: { type: "'light' | 'dark' | undefined", cli: "--preset" },
        config: { type: "string | undefined", cli: "--config" },
        maxImages: { type: "string.integer.parse | undefined", cli: "--max-images" },
        example: {
          type: "'mixed' | 'icons' | 'variants' | 'wide' | 'portrait' | 'labels' | 'nested' | 'deep' | 'adventurer-animations' | 'character-texture' = 'mixed'",
          cli: "--example",
        },
      },
      run: async ({ out, preset, example, config: configFile, maxImages }) => {
        const selected = schema.Config.assert(
          configFile
            ? JSON.parse(await readFile(configFile, "utf8"))
            : {
                mixed,
                icons,
                variants,
                wide,
                portrait,
                labels,
                nested,
                deep,
                "adventurer-animations": adventurerAnimations,
                "character-texture": characterTexture,
              }[example],
        );
        const config = schema.Config.assert({
          ...selected,
          appearance: {
            ...selected.appearance,
            preset: preset ?? selected.appearance?.preset ?? "light",
          },
        });
        const pages =
          maxImages === undefined
            ? [{ config, atlas: await createAtlas({ config }) }]
            : await createAtlasPages({ config, maxImages });
        await mkdir(out, { recursive: true });
        const outputs = [];
        for (const page of pages) {
          const name = `${encodeURIComponent(
            maxImages === undefined ? (configFile ? config.id : example) : page.config.id,
          )}-${config.appearance!.preset}`;
          const guide = await sharp(Buffer.from(page.atlas.schematic)).png().toBuffer();
          createFile(`${out}/${name}.svg`, page.atlas.schematic);
          await writeFile(`${out}/${name}.guide.png`, guide);
          createFile(`${out}/${name}.layout.json`, JSON.stringify(page.atlas.layout, null, 2));
          createFile(`${out}/${name}.config.json`, JSON.stringify(page.config, null, 2));
          createFile(`${out}/${name}.prompt.txt`, page.atlas.prompt);
          outputs.push({
            schematic: `${out}/${name}.svg`,
            guide: `${out}/${name}.guide.png`,
            layout: `${out}/${name}.layout.json`,
            config: `${out}/${name}.config.json`,
            prompt: `${out}/${name}.prompt.txt`,
          });
        }
        if (maxImages === undefined) return outputs[0];
        const manifest = resolve(out, `${encodeURIComponent(config.id)}.pages.json`);
        createFile(
          manifest,
          JSON.stringify(
            schema.GuideManifest.assert({
              id: config.id,
              pages: outputs.map((output, index) => ({
                id: pages[index]!.config.id,
                schematic: resolve(output.schematic),
                guide: resolve(output.guide),
                layout: resolve(output.layout),
                config: resolve(output.config),
                prompt: resolve(output.prompt),
              })),
            }),
            null,
            2,
          ),
        );
        return { manifest, pages: outputs.length };
      },
    },
    crop: {
      description: "Crop one source or a paged atlas from its saved guide manifest.",
      input: {
        layout: { type: "string | undefined", cli: "--layout" },
        catalogue: { type: "string | undefined", cli: "--catalogue" },
        manifest: { type: "string | undefined", cli: "--manifest" },
        sources: { type: "string | undefined", cli: "--sources" },
        source: { type: "string | undefined", cli: "--source" },
        config: {
          type: "string | undefined",
          cli: "--config",
          description: "Optional crop settings. Omit for planned bounds.",
        },
        size: { type: "string.integer.parse | undefined", cli: "--size" },
        kernel: { type: "string | undefined", cli: "--kernel" },
        ids: {
          type: "string | undefined",
          cli: "--ids",
          description: "Comma-separated image IDs. Default: all leaf images.",
        },
        out: { type: "string = 'imagegen-guide-output/crops'", cli: "--out" },
      },
      run: async ({
        layout: layoutFile,
        catalogue: catalogueFile,
        manifest: manifestFile,
        sources: sourceFiles,
        source: sourceFile,
        config: configFile,
        size,
        kernel,
        ids,
        out,
      }) => {
        if (manifestFile) {
          if (layoutFile || catalogueFile || configFile || sourceFile || ids)
            throw new RangeError("--manifest uses --sources and the saved page configurations.");
          const manifest = schema.GuideManifest.assert(
            JSON.parse(await readFile(manifestFile, "utf8")),
          );
          const sources = parseIds(sourceFiles) ?? [];
          if (sources.length === 0 || sources.length > manifest.pages.length)
            throw new RangeError(
              `Pass 1 to ${manifest.pages.length} source images in page order; found ${sources.length}.`,
            );
          const results = [];
          for (const [index, page] of manifest.pages.slice(0, sources.length).entries()) {
            const layout = schema.Layout.assert(JSON.parse(await readFile(page.layout, "utf8")));
            const config = schema.Config.assert(JSON.parse(await readFile(page.config, "utf8")));
            results.push(
              await saveImages({
                out,
                layout,
                source: await readFile(sources[index]!),
                sourceFile: sources[index]!,
                options: config.crop,
                size: size === undefined ? undefined : schema.CropSize.assert(size),
                kernel: kernel === undefined ? undefined : schema.ResizeKernel.assert(kernel),
              }),
            );
          }
          return {
            pages: results.length,
            totalPages: manifest.pages.length,
            images: results.reduce((count, result) => count + result.images, 0),
            catalogues: results.map((result) => result.catalogue),
            ...(manifest.pages[sources.length]
              ? { nextPage: manifest.pages[sources.length]!.id }
              : {}),
          };
        }
        if (!sourceFile || sourceFiles)
          throw new RangeError(
            "Pass --source with --layout or --catalogue; use --sources with --manifest.",
          );
        const { layout, catalogue, options } = await loadSelection({
          layoutFile,
          catalogueFile,
          configFile,
        });
        return saveImages({
          out,
          layout,
          savedCatalogue: catalogue,
          source: await readFile(sourceFile),
          sourceFile,
          options,
          size: size === undefined ? undefined : schema.CropSize.assert(size),
          kernel: kernel === undefined ? undefined : schema.ResizeKernel.assert(kernel),
          ids: parseIds(ids),
        });
      },
    },
    gif: {
      description: "Animate a generated atlas from a layout or edited catalogue.",
      input: {
        layout: { type: "string | undefined", cli: "--layout" },
        catalogue: { type: "string | undefined", cli: "--catalogue" },
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
        out: { type: "string = 'imagegen-guide-output/gifs'", cli: "--out" },
      },
      run: async ({
        layout: layoutFile,
        catalogue: catalogueFile,
        source: sourceFile,
        config: configFile,
        ids,
        delay,
        loop,
        out,
      }) => {
        const {
          layout,
          catalogue: savedCatalogue,
          options,
        } = await loadSelection({
          layoutFile,
          catalogueFile,
          configFile,
        });
        const source = await readFile(sourceFile);
        const { catalogue } = await sourceCatalogues({
          layout,
          catalogue: savedCatalogue,
          source,
          sourceFile,
          options,
        });
        const animation = await createGif({
          catalogue,
          source,
          frames: parseIds(ids),
          delay: schema.FrameDelay.assert(delay),
          loop: schema.Index.assert(loop),
        });
        await mkdir(out, { recursive: true });
        const gif = `${out}/${encodeURIComponent(catalogue.atlasId)}.gif`;
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
        out: { type: "string = 'imagegen-guide-output/regions'", cli: "--out" },
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
        out: { type: "string = 'imagegen-guide-output/mask'", cli: "--out" },
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
        out: { type: "string = 'imagegen-guide-output/overlay'", cli: "--out" },
      },
      run: async ({ source, catalogue, stroke, strokeWidth, prompt, out }) => {
        const data = schema.Catalogue.assert(JSON.parse(await readFile(catalogue, "utf8")));
        const leaves = (images: Catalogue["images"]): Catalogue["images"] =>
          images.flatMap((image) => (image.children ? leaves(image.children) : [image]));
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
            ...(prompt ? [await readFile(prompt, "utf8")] : []),
            `Image 1 is the annotated atlas to correct; image 2 is its original schematic. The guide outlines use ${stroke}. Restore every named image (${leaves(
              data.images,
            )
              .map((image) => image.id)
              .join(
                ", ",
              )}) at the schematic's position and size. Keep all artwork inside its own rectangle. Correct missing or shifted images and blank strips; do not only erase the guide lines. Keep schematic labels outside image regions and remove the guide outlines from the final image.`,
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
        out: { type: "string = 'imagegen-guide-output/comparison.json'", cli: "--out" },
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
