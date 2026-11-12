export const functionColors = [
  { value: "forest", label: "Forest", hex: "#28594F" },
  { value: "copper", label: "Copper", hex: "#B98265" },
  { value: "marigold", label: "Marigold", hex: "#C18B2D" },
  { value: "rose", label: "Rose", hex: "#AE6473" },
  { value: "plum", label: "Plum", hex: "#80618D" },
  { value: "slate", label: "Slate", hex: "#607D8B" },
] as const;
export const colorValues = [
  "forest",
  "copper",
  "marigold",
  "rose",
  "plum",
  "slate",
] as const;
export function functionColor(value: unknown) {
  return (
    functionColors.find((color) => color.value === value) ?? functionColors[1]
  );
}
