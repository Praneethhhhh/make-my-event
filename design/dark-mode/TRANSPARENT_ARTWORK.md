# Transparent landing artwork

16 November 2026. This replaces the rejected dark-only negative/filter treatment. Both themes use the same colorful PNGs with real alpha transparency; no theme-dependent filter, blend mode, opaque card or background image is needed. Original JPG sources and the palace artwork remain unchanged.

## Source and generation

Retrieved the original IMAGE screen metadata through Stitch MCP in project 2696754814529935110:
- 20bd031c6ce846caacea4de47f9a53c7: modern celebration/toasting couple, local source public/images/celebration-pixels.jpg.
- f2bef6f54f8a4306ae19ea04075b439d: Indian wedding couple and arch, local source public/images/wedding-pixels.jpg.

Used image editing to regenerate each reference separately with genuine transparent output. Requested the recognizable pixel-art compositions, natural warm skin and dark brown hair, muted slate/coral/saffron clothing, sage foliage and gold details visible on both ivory and dark forest. Removed cream backdrops, haze and dense halftone fields, including the spaces inside arches. No text, frame, glow, checkerboard or negative colors.

Production assets:
- public/images/celebration-transparent.png
- public/images/wedding-transparent.png

Both are 1672×941 RGBA PNGs. File inspection confirmed real alpha ranging 0–255 and nonopaque output. The hero remains eagerly loaded; the closing illustration retains responsive image loading and uses contain rather than cropping bodies or arches. No account, guest capability or data behavior changes.

Actual route verification and remaining coverage are recorded in docs/PROJECT_STATUS.md.
