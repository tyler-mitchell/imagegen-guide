import sharp from "sharp";
import satori from "satori";
import { schema, type Catalogue, type Crop } from "./schema.ts";

const leaves = (images: Catalogue["images"]): Catalogue["images"] =>
  images.flatMap((image) => (image.children ? leaves(image.children) : [image]));

/** Mark leaf regions as editable through transparent pixels in an otherwise opaque mask. */
export function createMask({ catalogue }: { catalogue: Catalogue }): Promise<Uint8Array> {
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
  const { default: ready } = await import("@techstark/opencv-js");
  const cv = await (ready as unknown as PromiseLike<typeof ready>);
  const targets = leaves(catalogue.images);
  const expected = cv.matFromArray(
    targets.length,
    2,
    cv.CV_32F,
    targets.flatMap((image) => [
      image.crop.x + image.crop.width / 2,
      image.crop.y + image.crop.height / 2,
    ]),
  );
  const actual = new cv.Mat(),
    matches = new cv.DMatchVector(),
    matcher = new cv.BFMatcher(cv.NORM_L2, true);
  try {
    const points = cv.matFromArray(
      regions.length,
      2,
      cv.CV_32F,
      regions.flatMap((region) => [region.x + region.width / 2, region.y + region.height / 2]),
    );
    points.copyTo(actual);
    points.delete();
    for (const matrix of [expected, actual])
      for (const axis of [0, 1]) {
        const column = matrix.col(axis);
        cv.normalize(column, column, 0, 1, cv.NORM_MINMAX);
        column.delete();
      }
    matcher.match(expected, actual, matches);
    const detected = new Map(
      Array.from({ length: matches.size() }, (_, index) => {
        const match = matches.get(index),
          target = targets[match.queryIdx]!,
          region = regions[match.trainIdx]!;
        return [
          target.id,
          {
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
          },
        ] as const;
      }),
    );
    const images = (entries: Catalogue["images"]): Catalogue["images"] =>
      entries.map((entry) => {
        if (!entry.children) return { ...entry, crop: detected.get(entry.id)! };
        const children = images(entry.children);
        const points = cv.matFromArray(
          children.length * 2,
          1,
          cv.CV_32SC2,
          children.flatMap(({ crop }) => [
            crop.x,
            crop.y,
            crop.x + crop.width - 1,
            crop.y + crop.height - 1,
          ]),
        );
        const crop = cv.boundingRect(points);
        points.delete();
        return { ...entry, crop, children };
      });
    return schema.Catalogue.assert({ ...catalogue, images: images(catalogue.images) });
  } finally {
    for (const resource of [expected, actual, matches, matcher]) resource.delete();
  }
}

/** Extract leaf images by default, or select images and groups by ID. */
export async function cropImages({
  source,
  catalogue,
  ids,
  format = "png",
}: {
  source: Uint8Array;
  catalogue: Catalogue;
  ids?: readonly string[];
  format?: typeof schema.ImageFormat.infer;
}): Promise<Crop[]> {
  const select = (images: Catalogue["images"]): Catalogue["images"] =>
    images.flatMap((image) => {
      const selected = ids ? ids.includes(image.id) : !image.children;
      return [...(selected ? [image] : []), ...(image.children ? select(image.children) : [])];
    });
  const images = select(catalogue.images);
  const crops: Crop[] = [];
  for (const image of images) {
    const { x: left, y: top, width, height } = image.crop;
    const bytes = await sharp(source)
      .extract({ left, top, width, height })
      .toFormat(format)
      .toBuffer();
    crops.push({ id: image.id, bytes, format });
  }
  return crops;
}
