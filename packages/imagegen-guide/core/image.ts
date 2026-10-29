import satori from "satori";
import { munkres } from "munkres";
import { createCatalogue } from "./catalogue.ts";
import { schema, type Atlas, type Catalogue, type Crop, type Rectangle } from "./schema.ts";

const leaves = (images: Catalogue["images"]): Catalogue["images"] =>
  images.flatMap((image) => (image.children ? leaves(image.children) : [image]));

/** Mark leaf regions as editable through transparent pixels in an otherwise opaque mask. */
export async function createMask({ catalogue }: { catalogue: Catalogue }): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  return sharp({
    create: {
      width: catalogue.source.width,
      height: catalogue.source.height,
      channels: 4,
      background: "#000000",
    },
  })
    .composite(
      leaves(catalogue.images).map(({ crop }) => ({
        input: {
          create: {
            width: crop.width,
            height: crop.height,
            channels: 4 as const,
            background: "#000000",
          },
        },
        left: crop.x,
        top: crop.y,
        blend: "dest-out" as const,
      })),
    )
    .png()
    .toBuffer();
}

/** Overlay the planned leaf rectangles without moving or resizing source pixels. */
export async function overlayImage({
  source,
  catalogue,
  style = {},
}: {
  source: Uint8Array;
  catalogue: Catalogue;
  style?: Pick<typeof schema.ImageStyle.infer, "stroke" | "strokeWidth">;
}): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  const { width, height } = catalogue.source;
  const overlay = await satori(
    {
      type: "div",
      props: {
        style: { display: "flex", position: "relative", width, height },
        children: leaves(catalogue.images).map(({ crop }) => ({
          type: "div",
          props: {
            style: {
              position: "absolute",
              left: crop.x,
              top: crop.y,
              width: crop.width,
              height: crop.height,
              outlineStyle: "solid",
              outlineColor: style.stroke ?? "#ff00ff",
              outlineWidth: style.strokeWidth ?? 2,
            },
          },
        })),
      },
    },
    { width, height, fonts: [], pointScaleFactor: 1 },
  );
  return sharp(source)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/** Locate foreground components in source pixels without assigning image IDs. */
export async function detectRegions({
  source,
  catalogue,
  options = {},
}: {
  source: Uint8Array;
  catalogue: Catalogue;
  options?: typeof schema.DetectionOptions.infer;
}): Promise<Array<typeof schema.Region.infer>> {
  const { default: sharp } = await import("sharp");
  const { default: ready } = await import("@techstark/opencv-js");
  // OpenCV's runtime export is asynchronous; its declarations describe the resolved module.
  const cv = await (ready as unknown as PromiseLike<typeof ready>);
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const background = options.background
    ? await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 4,
          background: options.background,
        },
      })
        .raw()
        .toBuffer()
    : data.subarray(0, 4);
  const targets = leaves(catalogue.images);
  const threshold = options.threshold ?? 10;
  const minArea =
    options.minArea ??
    Math.min(...targets.map((image) => image.crop.width * image.crop.height)) / 4;
  const image = cv.matFromArray(info.height, info.width, cv.CV_8UC4, data);
  const range = (offset: number) =>
    new cv.Mat(
      image.rows,
      image.cols,
      image.type(),
      new cv.Scalar(
        ...(Array.from(background, (value) => Math.max(0, Math.min(255, value + offset))) as [
          number,
          number,
          number,
          number,
        ]),
      ),
    );
  const low = range(-threshold),
    high = range(threshold);
  const mask = new cv.Mat(),
    labels = new cv.Mat(),
    stats = new cv.Mat(),
    centroids = new cv.Mat();
  try {
    cv.inRange(image, low, high, mask);
    cv.bitwise_not(mask, mask);
    cv.connectedComponentsWithStats(mask, labels, stats, centroids, 8, cv.CV_32S);
    return schema.Region.array().assert(
      Array.from({ length: stats.rows - 1 }, (_, index) => {
        const row = (index + 1) * stats.cols;
        return {
          x: stats.data32S[row + cv.CC_STAT_LEFT]!,
          y: stats.data32S[row + cv.CC_STAT_TOP]!,
          width: stats.data32S[row + cv.CC_STAT_WIDTH]!,
          height: stats.data32S[row + cv.CC_STAT_HEIGHT]!,
          area: stats.data32S[row + cv.CC_STAT_AREA]!,
        };
      }).filter((region) => region.area >= minArea),
    );
  } finally {
    for (const resource of [image, low, high, mask, labels, stats, centroids]) resource.delete();
  }
}

/** Match source regions to planned leaf positions, without padding or resizing pixels. */
export async function detectCatalogue({
  source,
  catalogue,
  options = {},
}: {
  source: Uint8Array;
  catalogue: Catalogue;
  options?: typeof schema.DetectionOptions.infer;
}): Promise<Catalogue> {
  const regions = await detectRegions({ source, catalogue, options });
  const targets = leaves(catalogue.images);
  if (regions.length < targets.length)
    throw new RangeError(
      `Expected ${targets.length} separate foreground regions, found ${regions.length}. Check tile separation, background, threshold, and minArea; omit detection to use planned crop bounds.`,
    );
  const detected = new Map(
    munkres(
      targets.map(({ crop }) =>
        regions.map((region) => {
          const x = crop.x + crop.width / 2 - region.x - region.width / 2;
          const y = crop.y + crop.height / 2 - region.y - region.height / 2;
          return x * x + y * y;
        }),
      ),
    ).map(([target, match]) => {
      const { x, y, width, height } = regions[match]!;
      return [targets[target]!.id, { x, y, width, height }] as const;
    }),
  );
  const images = (entries: Catalogue["images"]): Catalogue["images"] =>
    entries.map((entry) => {
      if (!entry.children) return { ...entry, crop: detected.get(entry.id)! };
      const children = images(entry.children);
      const x = Math.min(...children.map((child) => child.crop.x));
      const y = Math.min(...children.map((child) => child.crop.y));
      return {
        ...entry,
        crop: {
          x,
          y,
          width: Math.max(...children.map((child) => child.crop.x + child.crop.width)) - x,
          height: Math.max(...children.map((child) => child.crop.y + child.crop.height)) - y,
        },
        children,
      };
    });
  return schema.Catalogue.assert({ ...catalogue, images: images(catalogue.images) });
}

type CropSelection<Id extends string = string> =
  | {
      atlas: Atlas<Id>;
      catalogue?: never;
      sourceId?: string;
      viewport?: Rectangle;
      detect?: typeof schema.DetectionOptions.infer;
    }
  | { catalogue: Catalogue; atlas?: never; sourceId?: never; viewport?: never; detect?: never };

/** Extract leaf images by default, or select images and groups by ID. */
export async function cropImages<const Id extends string = string>({
  source,
  ids,
  format = "png",
  ...selection
}: {
  source: Uint8Array;
  ids?: readonly NoInfer<Id>[];
  format?: typeof schema.ImageFormat.infer;
} & CropSelection<Id>): Promise<Crop[]> {
  const { default: sharp } = await import("sharp");
  const metadata = selection.catalogue ? undefined : await sharp(source).metadata();
  const planned =
    selection.catalogue ??
    createCatalogue({
      layout: selection.atlas!.layout,
      source: {
        id: selection.sourceId ?? selection.atlas!.layout.id,
        width: metadata!.width!,
        height: metadata!.height!,
        ...(selection.viewport ? { viewport: selection.viewport } : {}),
      },
    });
  const catalogue = selection.detect
    ? await detectCatalogue({ source, catalogue: planned, options: selection.detect })
    : planned;
  const entries = (images: Catalogue["images"]): Catalogue["images"] =>
    images.flatMap((image) => [image, ...(image.children ? entries(image.children) : [])]);
  const byId = new Map(entries(catalogue.images).map((image) => [image.id, image]));
  const images = ids
    ? ids.map((id) => {
        const image = byId.get(id);
        if (!image) throw new RangeError(`Unknown image ID: ${id}`);
        return image;
      })
    : leaves(catalogue.images);
  const crops: Crop[] = [];
  for (const image of images) {
    const { x: left, y: top, width, height } = image.crop;
    const bytes = await sharp(source)
      .extract({ left, top, width, height })
      .toFormat(format)
      .toBuffer();
    crops.push({ id: image.id, bytes, format, crop: image.crop });
  }
  return crops;
}

/** Animate all leaf images, or use an explicit frame order and timing overrides. */
export async function createGif<const Id extends string = string>({
  source,
  frames,
  delay = 100,
  loop = 0,
  ...selection
}: {
  source: Uint8Array;
  frames?: readonly (
    | NoInfer<Id>
    | (Omit<typeof schema.GifFrame.infer, "id"> & { id: NoInfer<Id> })
  )[];
  delay?: typeof schema.FrameDelay.infer;
  loop?: typeof schema.Index.infer;
} & CropSelection<Id>): Promise<Uint8Array> {
  if (frames?.length === 0) throw new RangeError("A GIF needs at least one frame.");
  const { default: sharp } = await import("sharp");
  const crops = await cropImages({
    source,
    ids: frames?.map((frame) => (typeof frame === "string" ? frame : frame.id)),
    ...selection,
  });
  const sequence = frames ?? crops.map((crop) => crop.id);
  if (sequence.length === 0) throw new RangeError("A GIF needs at least one frame.");
  const ordered = crops.map((crop) => crop.bytes);
  const sizes = [];
  for (const bytes of ordered) sizes.push(await sharp(bytes).metadata());
  const width = Math.max(...sizes.map((size) => size.width!));
  const height = Math.max(...sizes.map((size) => size.height!));
  const images = [];
  for (const [index, bytes] of ordered.entries()) {
    const left = Math.floor((width - sizes[index]!.width!) / 2);
    const top = Math.floor((height - sizes[index]!.height!) / 2);
    images.push(
      await sharp(bytes)
        .extend({
          left,
          top,
          right: width - sizes[index]!.width! - left,
          bottom: height - sizes[index]!.height! - top,
          background: "#00000000",
        })
        .png()
        .toBuffer(),
    );
  }
  return sharp(images, { join: { animated: true } })
    .gif({
      delay: sequence.map((frame) => (typeof frame === "string" ? delay : (frame.delay ?? delay))),
      loop,
      keepDuplicateFrames: true,
    })
    .toBuffer();
}
