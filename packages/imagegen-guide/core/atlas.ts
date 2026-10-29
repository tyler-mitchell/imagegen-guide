import satori, { type SatoriOptions, type SatoriNode } from "satori";
import { gridLayout, stackedLayout, StackedLayout } from "@thi.ng/layout";
import { schema, type Config, type Layout, type Rectangle, type Atlas } from "./schema.ts";

export const aspectRatios = {
  "1:1": 1,
  "3:2": 3 / 2,
  "2:3": 2 / 3,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
} as const;
/** Append or prepend these instructions to a consumer's image-generation prompt. */
export const defaultPrompt =
  "Use the schematic as a fixed template. Preserve its canvas, image bounds, gaps, and labels. Fill image regions edge-to-edge; add no margins or exterior shadows. Keep labels outside image regions. Replace checkerboard placeholders with artwork; omit checkerboards and guide borders from the result.";

type Grid = typeof schema.Grid.infer;
type Size = { width: number; height: number };
type ResolvedCell = Omit<
  typeof schema.Cell.infer,
  "children" | "image" | "label" | "row" | "column"
> & {
  row: number;
  column: number;
  image: typeof schema.ImageStyle.infer & {
    fill: string;
    stroke: string;
    strokeWidth: number;
    radius: number;
  };
  inset: number;
  label?: typeof schema.Label.infer;
  context: string[];
  children?: ResolvedGrid;
};
type ResolvedGrid = { source: Grid; padding: typeof schema.Insets.infer; cells: ResolvedCell[] };
type PackedCell = { cell: ResolvedCell; image: Size; size: Size; children?: PackedGrid };
type PackedGrid = { cells: PackedCell[]; width: number; size: Size };
const ratio = (value: typeof schema.AspectRatio.infer = "1:1") =>
  typeof value === "string" ? aspectRatios[value] : value.width / value.height;
const presets = {
  light: { background: "#ffffff", fill: "#f8fafc", stroke: "#64748b", color: "#334155" },
  dark: { background: "#111827", fill: "#1f2937", stroke: "#94a3b8", color: "#e2e8f0" },
};
const alignment = { start: "flex-start", center: "center", end: "flex-end" } as const;
const tracks = (value: Grid["grid"]["columns"], scale = 1) =>
  (typeof value === "number"
    ? Array.from({ length: value }, () => "1fr")
    : value.map((track) => (typeof track === "number" ? `${track * scale}px` : track))
  ).join(" ");
const gaps = (grid: Grid) =>
  typeof grid.grid.gap === "object"
    ? grid.grid.gap
    : { row: grid.grid.gap ?? 24, column: grid.grid.gap ?? 24 };
const paddingInsets = (value: typeof schema.Padding.infer) =>
  typeof value === "number" ? { top: value, right: value, bottom: value, left: value } : value;
const paddingStyle = (value: typeof schema.Insets.infer) => ({
  paddingTop: value.top,
  paddingRight: value.right,
  paddingBottom: value.bottom,
  paddingLeft: value.left,
});
// Round edges together so adjacent outputs use the same pixel boundaries.
const bounds = (node: SatoriNode): Rectangle => {
  const x = Math.round(node.left),
    y = Math.round(node.top);
  return {
    x,
    y,
    width: Math.round(node.left + node.width) - x,
    height: Math.round(node.top + node.height) - y,
  };
};

/** Render a schematic and resolve crop geometry for cells and nested groups. */
export async function createAtlas({
  config,
  fonts,
  ...options
}: { config: Config; fonts: SatoriOptions["fonts"] } & Omit<
  SatoriOptions,
  "width" | "height" | "fonts" | "onNodeDetected" | "pointScaleFactor"
>): Promise<Atlas> {
  const width = Math.round(
    "width" in config.canvas
      ? config.canvas.width
      : config.canvas.height * ratio(config.canvas.aspectRatio),
  );
  const height = Math.round(
    "height" in config.canvas ? config.canvas.height : width / ratio(config.canvas.aspectRatio),
  );
  const preset = presets[config.appearance?.preset ?? "light"];
  const insets = paddingInsets(config.canvas.padding ?? 32);
  const resolve = (grid: Grid, ancestors: string[] = []): ResolvedGrid => {
    const columns =
      typeof grid.grid.columns === "number" ? grid.grid.columns : grid.grid.columns.length;
    const placement = gridLayout(0, 0, columns, columns, 1, 0, 0);
    return {
      source: grid,
      padding: paddingInsets(
        grid.grid.padding ?? {
          top: gaps(grid).row,
          bottom: gaps(grid).row,
          left: gaps(grid).column,
          right: gaps(grid).column,
        },
      ),
      cells: grid.cells.map((cell) => {
        const position = placement.next([cell.columnSpan ?? 1, 1]);
        const rowIndex = cell.row ?? position.y;
        const columnIndex = cell.column ?? position.x;
        const row = grid.rows?.[rowIndex],
          column = grid.columns?.[columnIndex];
        const resolved = { ...grid.defaults, ...row, ...column, ...cell };
        const image = {
          fill: preset.fill,
          stroke: preset.stroke,
          strokeWidth: 1,
          radius: 0,
          ...config.appearance?.image,
          ...grid.defaults?.image,
          ...row?.image,
          ...column?.image,
          ...cell.image,
        };
        const label = {
          position: "below" as const,
          fontFamily: fonts[0]?.name,
          fontSize: 18,
          color: preset.color,
          gap: 12,
          align: "center" as const,
          wrap: true,
          ...config.appearance?.label,
          ...grid.defaults?.label,
          ...row?.label,
          ...column?.label,
          ...cell.label,
        };
        const context = [
          ...ancestors,
          grid.prompt,
          grid.defaults?.prompt,
          row?.prompt,
          column?.prompt,
          cell.prompt,
        ].filter((text): text is string => text !== undefined);
        return {
          ...resolved,
          row: rowIndex,
          column: columnIndex,
          prompt: cell.prompt,
          image,
          inset: Math.ceil(
            Math.max(
              image.strokeWidth,
              image.radius - (image.radius - image.strokeWidth) * Math.SQRT1_2,
            ),
          ),
          label:
            resolved.label !== false && label.text !== undefined
              ? { ...label, text: label.text }
              : undefined,
          context,
          children: cell.children ? resolve(cell.children, context) : undefined,
        };
      }),
    };
  };
  const root = resolve({ ...config, grid: { ...config.grid, padding: config.grid.padding ?? 0 } });
  const all = (grid: ResolvedGrid): ResolvedCell[] =>
    grid.cells.flatMap((cell) => [cell, ...(cell.children ? all(cell.children) : [])]);
  const cells = all(root);
  const detected = new Map<string, SatoriNode>();
  const render = (
    fitted: ReadonlyMap<string, Size>,
    positions?: ReadonlyMap<string, Rectangle>,
    extent?: Partial<Size>,
    scale = 1,
    pointScaleFactor = 0,
  ) => {
    const tree = (grid: ResolvedGrid): object => ({
      type: "div",
      props: {
        style: {
          display: fitted.size && config.layout !== "grid" ? "flex" : "grid",
          position: "relative",
          width: "100%",
          ...(fitted.size && config.layout !== "grid"
            ? { flexWrap: "wrap", alignItems: "flex-start" }
            : { gridTemplateColumns: tracks(grid.source.grid.columns, scale) }),
          rowGap: gaps(grid.source).row,
          columnGap: gaps(grid.source).column,
        },
        children: grid.cells.map((cell) => {
          const label = cell.label;
          const labelNode = label
            ? {
                type: "div",
                props: {
                  id: `label:${cell.id}`,
                  style: {
                    display: "block",
                    flexShrink: 0,
                    width: "100%",
                    fontFamily: label.fontFamily,
                    fontSize: label.fontSize,
                    lineHeight: label.lineHeight ? `${label.lineHeight}px` : undefined,
                    color: label.color,
                    textAlign: label.align,
                    whiteSpace: label.wrap ? "normal" : "nowrap",
                    lineClamp: label.maxLines,
                  },
                  children: label.text,
                },
              }
            : undefined;
          const size = fitted.get(cell.id);
          const image = {
            type: "div",
            props: {
              id: `image:${cell.id}`,
              style: {
                display: "flex",
                position: "relative",
                flexShrink: 0,
                ...(size ?? { width: "100%" }),
                ...(config.layout === "grid" && cell.children && !cell.height && !cell.aspectRatio
                  ? { height: undefined }
                  : {}),
                boxSizing: "border-box",
                ...(cell.children ? paddingStyle(cell.children.padding) : {}),
                backgroundColor: cell.image.fill === "none" ? "transparent" : cell.image.fill,
                backgroundImage: cell.image.backgroundImage,
                backgroundSize: cell.image.backgroundSize,
                backgroundPosition: cell.image.backgroundPosition,
              },
              children: cell.children ? tree(cell.children) : undefined,
            },
          };
          const frame = {
            type: "div",
            props: {
              id: `frame:${cell.id}`,
              style: {
                display: "flex",
                flexShrink: 0,
                minWidth: 0,
                minHeight: 0,
                padding: cell.inset - cell.image.strokeWidth,
                borderWidth: cell.image.strokeWidth,
                borderColor: cell.image.stroke,
                borderStyle: "solid",
                borderRadius: cell.image.radius,
                boxSizing: "border-box",
              },
              children: image,
            },
          };
          return {
            type: "div",
            props: {
              id: `cell:${cell.id}`,
              style: {
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
                flexShrink: 0,
                ...(size
                  ? { width: size.width + cell.inset * 2 }
                  : {
                      gridRow: `${cell.row + 1}`,
                      gridColumn: `${cell.column + 1} / span ${cell.columnSpan ?? 1}`,
                    }),
                ...(config.layout === "grid"
                  ? {
                      gridRow: `${cell.row + 1}`,
                      gridColumn: `${cell.column + 1} / span ${cell.columnSpan ?? 1}`,
                    }
                  : {}),
                ...(positions
                  ? {
                      position: "absolute",
                      left: positions.get(cell.id)!.x,
                      top: positions.get(cell.id)!.y,
                    }
                  : {}),
                gap: label ? label.gap : 0,
              },
              children: label?.position === "above" ? [labelNode, frame] : [frame, labelNode],
            },
          };
        }),
      },
    });
    return satori(
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            width,
            height,
            boxSizing: "border-box",
            ...paddingStyle(insets),
            justifyContent: alignment[config.align ?? "center"],
            alignItems: alignment[config.verticalAlign ?? "center"],
            backgroundColor: config.appearance?.background ?? preset.background,
          },
          children: {
            type: "div",
            props: {
              id: "atlas",
              style: {
                display: "flex",
                position: "relative",
                flexShrink: 0,
                boxSizing: "border-box",
                ...paddingStyle(root.padding),
                width: extent?.width ?? width - insets.left - insets.right,
                ...(extent ? { height: extent.height } : {}),
              },
              children: tree(root),
            },
          },
        },
      },
      {
        ...options,
        width,
        height,
        fonts,
        pointScaleFactor,
        onNodeDetected: (node) => {
          if (typeof node.props.id === "string") detected.set(node.props.id, node);
        },
      },
    );
  };
  // Native grid tracks establish preferred widths, including nested grids.
  await render(new Map());
  const initial = new Map(
    cells.map((cell) => {
      const preferred = detected.get(`frame:${cell.id}`)!.width - cell.inset * 2;
      const imageWidth =
        cell.width ??
        (cell.height && !cell.children ? cell.height * ratio(cell.aspectRatio) : preferred);
      return [
        cell.id,
        {
          width: Math.round(imageWidth),
          height: Math.round(cell.height ?? imageWidth / ratio(cell.aspectRatio)),
        },
      ] as const;
    }),
  );
  const available = {
    width: width - insets.left - insets.right,
    height: height - insets.top - insets.bottom,
  };
  const pack = async (scale: number) => {
    // Reflow native tracks so nested gaps stay fixed as image widths change.
    await render(new Map(), undefined, { ...available, width: available.width * scale }, scale);
    const fitted = new Map(
      cells.map((cell) => {
        const size = initial.get(cell.id)!;
        const imageWidth =
          cell.width || (!cell.children && cell.height)
            ? size.width
            : Math.round(detected.get(`frame:${cell.id}`)!.width - cell.inset * 2);
        if (!cell.children && !cell.width && !cell.height && typeof cell.aspectRatio !== "object") {
          const [horizontal, vertical] = (cell.aspectRatio ?? "1:1").split(":").map(Number);
          const units = Math.max(1, Math.floor(imageWidth / horizontal));
          return [cell.id, { width: units * horizontal, height: units * vertical }] as const;
        }
        return [
          cell.id,
          {
            width: imageWidth,
            height: cell.height ?? Math.round(imageWidth / ratio(cell.aspectRatio)),
          },
        ] as const;
      }),
    );
    await render(
      fitted,
      undefined,
      config.layout === "grid" ? { width: available.width * scale } : undefined,
    );
    if (config.layout === "grid") {
      const node = detected.get("atlas")!;
      const extent = { width: Math.ceil(node.width), height: Math.ceil(node.height) };
      return {
        fitted,
        positions: undefined,
        extent,
        fits: extent.width <= available.width && extent.height <= available.height,
      };
    }
    const positions = new Map<string, Rectangle>();
    const prepare = (grid: ResolvedGrid, containerWidth: number): PackedGrid => {
      const prepared = grid.cells.map((cell): PackedCell => {
        const base = fitted.get(cell.id)!;
        const children = cell.children ? prepare(cell.children, base.width) : undefined;
        const contentHeight = children?.size.height ?? base.height;
        const imageWidth =
          children && cell.aspectRatio && !cell.width
            ? Math.max(base.width, Math.ceil(contentHeight * ratio(cell.aspectRatio)))
            : base.width;
        const groupHeight = cell.aspectRatio
          ? Math.round(imageWidth / ratio(cell.aspectRatio))
          : contentHeight;
        const image = (() => {
          if (children && typeof cell.aspectRatio === "string" && !cell.width && !cell.height) {
            const [horizontal, vertical] = cell.aspectRatio.split(":").map(Number);
            const units = Math.ceil(imageWidth / horizontal);
            return { width: units * horizontal, height: units * vertical };
          }
          return {
            width: imageWidth,
            height: children ? (cell.height ?? groupHeight) : base.height,
          };
        })();
        fitted.set(cell.id, image);
        const labelHeight = cell.label
          ? detected.get(`label:${cell.id}`)!.height + (cell.label.gap ?? 12)
          : 0;
        return {
          cell,
          image,
          children,
          size: {
            width: image.width + cell.inset * 2,
            height: image.height + cell.inset * 2 + labelHeight,
          },
        };
      });
      const contentWidth = containerWidth - grid.padding.left - grid.padding.right;
      const layoutWidth = contentWidth + gaps(grid.source).column;
      const packing = stackedLayout(0, 0, layoutWidth, Math.ceil(layoutWidth), 1, 0, 0);
      const placed = prepared.map((item) =>
        packing.next(
          packing.spanForSize(
            item.size.width + gaps(grid.source).column,
            item.size.height + gaps(grid.source).row,
          ),
        ),
      );
      return {
        cells: prepared,
        width: contentWidth,
        size: {
          width:
            Math.max(...placed.map((box, index) => box.x + prepared[index]!.size.width)) +
            grid.padding.left +
            grid.padding.right,
          height:
            Math.max(...placed.map((box, index) => box.y + prepared[index]!.size.height)) +
            grid.padding.top +
            grid.padding.bottom,
        },
      };
    };
    const prepared = prepare(root, available.width);
    // Complete each native child layout before allocating its next sibling.
    const place = (grid: PackedGrid, source: Grid, packing: StackedLayout): Size => {
      const placed = grid.cells.map((item) => {
        const gap = gaps(source);
        const span = packing.spanForSize(item.size.width + gap.column, item.size.height + gap.row);
        const nested = item.children
          ? packing.nest(Math.ceil(item.size.width + gap.column), span, 0, 0)
          : undefined;
        const box = nested ?? packing.next(span);
        const position = { x: box.x - packing.x, y: box.y - packing.y, ...item.size };
        positions.set(item.cell.id, position);
        if (nested && item.children && item.cell.children) {
          const childWidth = item.children.width + gaps(item.cell.children.source).column;
          const child = new StackedLayout(nested, 0, 0, childWidth, Math.ceil(childWidth), 1, 0, 0);
          place(item.children, item.cell.children.source, child);
        }
        return position;
      });
      return {
        width: Math.max(...placed.map((box) => box.x + box.width)),
        height: Math.max(...placed.map((box) => box.y + box.height)),
      };
    };
    const layoutWidth = prepared.width + gaps(root.source).column;
    const occupied = place(
      prepared,
      root.source,
      stackedLayout(0, 0, layoutWidth, Math.ceil(layoutWidth), 1, 0, 0),
    );
    const extent = {
      width: occupied.width + root.padding.left + root.padding.right,
      height: occupied.height + root.padding.top + root.padding.bottom,
    };
    const fits =
      extent.width <= available.width &&
      extent.height <= available.height &&
      cells.every((cell) => {
        const children = cell.children?.cells.map((child) => positions.get(child.id)!);
        const image = fitted.get(cell.id)!;
        return (
          !children ||
          children.every(
            (child) =>
              child.x + child.width + cell.children!.padding.left + cell.children!.padding.right <=
                image.width &&
              child.y + child.height + cell.children!.padding.top + cell.children!.padding.bottom <=
                image.height,
          )
        );
      });
    return { fitted, positions, extent, fits };
  };
  // Search only image scale. Native layout owns all rectangle placement.
  const automatic = cells.filter((cell) => !cell.width && !cell.height);
  let best = await pack(1);
  let lower = best.fits ? 1 : 0;
  let upper = Math.min(
    ...automatic.map((cell) =>
      Math.min(
        available.width / initial.get(cell.id)!.width,
        available.height / initial.get(cell.id)!.height,
      ),
    ),
  );
  for (let step = 0; automatic.length && step < 12; step++) {
    const scale = (lower + upper) / 2;
    const candidate = await pack(scale);
    if (candidate.fits) {
      lower = scale;
      best = candidate;
    } else {
      upper = scale;
    }
  }
  const schematic = await render(best.fitted, best.positions, best.extent, 1, 1);
  const output = (grid: ResolvedGrid): Layout["cells"] =>
    grid.cells.map((cell) => ({
      id: cell.id,
      row: cell.row,
      column: cell.column,
      cell: bounds(detected.get(`cell:${cell.id}`)!),
      image: bounds(detected.get(`image:${cell.id}`)!),
      ...(cell.label
        ? { label: { ...cell.label, bounds: bounds(detected.get(`label:${cell.id}`)!) } }
        : {}),
      context: cell.context,
      ...(cell.children ? { children: output(cell.children) } : {}),
    }));
  const layout = { id: config.id, width, height, cells: output(root) };
  const imageInstructions = (cells: Layout["cells"]): string[] =>
    cells.flatMap((cell) => [
      `${cell.id}: image at (${cell.image.x}, ${cell.image.y}), ${cell.image.width}×${cell.image.height} pixels.`,
      ...(cell.children ? imageInstructions(cell.children) : []),
    ]);
  const instructions = (grid: ResolvedGrid): string[] => [
    ...(grid.source.prompt ? [grid.source.prompt] : []),
    ...(grid.source.defaults?.prompt ? [grid.source.defaults.prompt] : []),
    ...Object.entries(grid.source.rows ?? {}).flatMap(([row, options]) =>
      options.prompt
        ? [
            `Row ${Number(row) + 1} (${grid.cells
              .filter((cell) => cell.row === Number(row))
              .map((cell) => cell.id)
              .join(", ")}): ${options.prompt}`,
          ]
        : [],
    ),
    ...Object.entries(grid.source.columns ?? {}).flatMap(([column, options]) =>
      options.prompt
        ? [
            `Column ${Number(column) + 1} (${grid.cells
              .filter((cell) => cell.column === Number(column))
              .map((cell) => cell.id)
              .join(", ")}): ${options.prompt}`,
          ]
        : [],
    ),
    ...grid.cells.flatMap((cell) => {
      return [
        ...(cell.prompt ? [`${cell.id}: ${cell.prompt}`] : []),
        ...(cell.children ? [`Within ${cell.id}:`, ...instructions(cell.children)] : []),
      ];
    }),
  ];
  const prompt = [
    `Create one ${width}×${height} image.`,
    defaultPrompt,
    ...imageInstructions(layout.cells),
    ...instructions(root),
  ].join("\n");
  return { layout, schematic, prompt };
}
