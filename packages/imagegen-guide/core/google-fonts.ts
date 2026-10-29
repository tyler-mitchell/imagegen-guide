import { find, parse } from "css-tree";
import { ofetch } from "ofetch";
import type { FontStyle, FontWeight, SatoriOptions } from "satori";

export async function loadGoogleFont({
  family,
  weight,
  style,
  text,
}: {
  family: string;
  weight: FontWeight;
  style: FontStyle;
  text: string;
}): Promise<SatoriOptions["fonts"][number]> {
  const stylesheet = new URL("https://fonts.googleapis.com/css2");
  stylesheet.searchParams.set(
    "family",
    `${family}:ital,wght@${style === "italic" ? 1 : 0},${weight}`,
  );
  stylesheet.searchParams.set("text", text);
  const css = await ofetch(stylesheet.toString(), { responseType: "text" });
  const font = find(parse(css), (node) => node.type === "Url");
  if (font?.type !== "Url") throw new Error(`Google Fonts did not return a font for "${family}".`);

  return {
    name: family,
    data: await ofetch(font.value, { responseType: "arrayBuffer" }),
    weight,
    style,
  };
}
