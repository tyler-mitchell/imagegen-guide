import satori from "satori";
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

const foregroundMask = async ({
  source,
  options,
}: {
  source: Uint8Array;
  options: typeof schema.DetectionOptions.infer;
}) => {
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
  const transparent = background[3] === 0;
  const threshold = options.threshold ?? 10;
  const alphaThreshold = options.alphaThreshold ?? 127;
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
  const rangeBounds = transparent
    ? undefined
    : { low: range(-threshold), high: range(threshold) };
  const alpha = new cv.Mat(),
    alphaMask = new cv.Mat(),
    mask = new cv.Mat();
  try {
    cv.extractChannel(image, alpha, 3);
    cv.threshold(alpha, transparent ? mask : alphaMask, alphaThreshold, 255, cv.THRESH_BINARY);
    if (rangeBounds) {
      cv.inRange(image, rangeBounds.low, rangeBounds.high, mask);
      cv.bitwise_not(mask, mask);
      cv.bitwise_and(mask, alphaMask, mask);
    }
    return { cv, mask };
  } catch (error) {
    mask.delete();
    throw error;
  } finally {
    for (const resource of [
      image,
      alpha,
      alphaMask,
      ...(rangeBounds ? [rangeBounds.low, rangeBounds.high] : []),
    ])
      resource.delete();
  }
};

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
  const { cv, mask } = await foregroundMask({ source, options });
  const targets = leaves(catalogue.images);
  const minArea =
    options.minArea ??
    Math.min(...targets.map((image) => image.crop.width * image.crop.height)) / 4;
  const labels = new cv.Mat(),
    stats = new cv.Mat(),
    centroids = new cv.Mat();
  try {
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
    for (const resource of [mask, labels, stats, centroids]) resource.delete();
  }
}

/** Locate each leaf in the space between its planned bounds and neighboring leaves. */
export async function detectCatalogue({
  source,
  catalogue,
  options = {},
}: {
  source: Uint8Array;
  catalogue: Catalogue;
  options?: typeof schema.DetectionOptions.infer;
}): Promise<Catalogue> {
  const { cv, mask } = await foregroundMask({ source, options });
  const targets = leaves(catalogue.images);
  const minArea = options.minArea ?? 1;
  const viewport = catalogue.source.viewport ?? {
    x: 0,
    y: 0,
    width: catalogue.source.width,
    height: catalogue.source.height,
  };
  const detected = (() => {
    try {
      return new Map(
        targets.map(({ id, crop }) => {
          const neighbors = targets.filter((image) => image.id !== id).map((image) => image.crop);
          const left = Math.max(
            viewport.x,
            ...neighbors
              .filter((neighbor) => neighbor.x + neighbor.width <= crop.x)
              .map((neighbor) => Math.round((neighbor.x + neighbor.width + crop.x) / 2)),
          );
          const top = Math.max(
            viewport.y,
            ...neighbors
              .filter((neighbor) => neighbor.y + neighbor.height <= crop.y)
              .map((neighbor) => Math.round((neighbor.y + neighbor.height + crop.y) / 2)),
          );
          const right = Math.min(
            viewport.x + viewport.width,
            ...neighbors
              .filter((neighbor) => crop.x + crop.width <= neighbor.x)
              .map((neighbor) => Math.round((crop.x + crop.width + neighbor.x) / 2)),
          );
          const bottom = Math.min(
            viewport.y + viewport.height,
            ...neighbors
              .filter((neighbor) => crop.y + crop.height <= neighbor.y)
              .map((neighbor) => Math.round((crop.y + crop.height + neighbor.y) / 2)),
          );
          const tile = mask.roi(new cv.Rect(left, top, right - left, bottom - top));
          try {
            const area = cv.countNonZero(tile);
            if (area === 0 || area < minArea) return [id, undefined] as const;
            const bounds = cv.boundingRect(tile);
            return [
              id,
              { x: left + bounds.x, y: top + bounds.y, width: bounds.width, height: bounds.height },
            ] as const;
          } finally {
            tile.delete();
          }
        }),
      );
    } finally {
      mask.delete();
    }
  })();
  const missing = targets.filter((image) => !detected.get(image.id)).map((image) => image.id);
  if (missing.length)
    throw new RangeError(
      `No foreground found for ${missing.join(", ")}. Check background, threshold, and minArea; omit detection to use planned crop bounds.`,
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

/** Animate leaf images in layout order, or expand selected groups into ordered frames. */
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
  type ImageNode = { id: string; children?: readonly ImageNode[] };
  const entries = (images: readonly ImageNode[]): ImageNode[] =>
    images.flatMap((image) => [image, ...(image.children ? entries(image.children) : [])]);
  const leafIds = (images: readonly ImageNode[]): string[] =>
    images.flatMap((image) => (image.children ? leafIds(image.children) : [image.id]));
  const byId = new Map(
    entries(selection.catalogue?.images ?? selection.atlas!.layout.cells).map((image) => [
      image.id,
      image,
    ]),
  );
  const sequence = frames?.flatMap((frame) => {
    const id = typeof frame === "string" ? frame : frame.id;
    const children = byId.get(id)?.children;
    return children
      ? leafIds(children).map((id) =>
          typeof frame === "string" ? (id as Id) : { ...frame, id: id as Id },
        )
      : [frame];
  });
  const crops = await cropImages({
    source,
    ids: sequence?.map((frame) => (typeof frame === "string" ? frame : frame.id)),
    ...selection,
  });
  const orderedFrames = sequence ?? crops.map((crop) => crop.id);
  if (orderedFrames.length === 0) throw new RangeError("A GIF needs at least one frame.");
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
      delay: orderedFrames.map((frame) =>
        typeof frame === "string" ? delay : (frame.delay ?? delay),
      ),
      loop,
      keepDuplicateFrames: true,
    })
    .toBuffer();
}
