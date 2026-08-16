export function fitBoard(
  viewW: number,
  viewH: number,
  boardW: number,
  boardH: number,
  mode: "contain" | "fill" = "contain",
) {
  const width = Math.max(1, boardW);
  const height = Math.max(1, boardH);
  if (mode === "fill") {
    return {
      zoom: viewW / width,
      zoomX: viewW / width,
      zoomY: viewH / height,
      panX: 0,
      panY: 0,
    };
  }
  const zoom = Math.min(viewW / width, viewH / height);
  return {
    zoom,
    zoomX: zoom,
    zoomY: zoom,
    panX: (viewW - width * zoom) / 2,
    panY: (viewH - height * zoom) / 2,
  };
}

/** Visible document rect for a contain-fit, including letterbox space. */
export function boardViewWorld(
  viewW: number,
  viewH: number,
  boardW: number,
  boardH: number,
) {
  const fitted = fitBoard(viewW, viewH, boardW, boardH);
  const zoom = Math.max(0.0001, fitted.zoom);
  return {
    ...fitted,
    x: -fitted.panX / zoom,
    y: -fitted.panY / zoom,
    w: viewW / zoom,
    h: viewH / zoom,
  };
}
