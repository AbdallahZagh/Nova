import { BadRequestException } from '@nestjs/common';

const FORBIDDEN_STROKE_KEYS = new Set([
  'path',
  'svg',
  'outline',
  'segments',
  'bezier',
  'curves',
  'd',
  'points3d',
]);

export type StrokePoint = {
  x: number;
  y: number;
  pressure?: number;
  t: number;
};

export type Stroke = {
  id: string;
  points: StrokePoint[];
  color: string;
  width: number;
  tool: 'pen' | 'eraser' | 'highlighter';
};

export type SemanticRegion = {
  id: string;
  kind: 'project' | 'task' | 'subtask' | 'assignee' | 'note';
  bounds: { x: number; y: number; w: number; h: number };
  parentRegionId?: string;
  strokeIds?: string[];
};

export type WhiteboardDocumentContent = {
  canvas: { width: number; height: number };
  strokes: Stroke[];
  regions: SemanticRegion[];
};

function assertPlainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectForbiddenKeys(obj: Record<string, unknown>, context: string) {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_STROKE_KEYS.has(key)) {
      throw new BadRequestException(
        `Render-only field "${key}" is not allowed in ${context}. Store raw points only.`,
      );
    }
  }
}

function parseStrokePoint(raw: unknown, index: number): StrokePoint {
  const point = assertPlainObject(raw, `strokes[].points[${index}]`);
  rejectForbiddenKeys(point, `strokes[].points[${index}]`);

  if (typeof point.x !== 'number' || typeof point.y !== 'number') {
    throw new BadRequestException(
      `strokes[].points[${index}] requires numeric x and y`,
    );
  }
  if (typeof point.t !== 'number') {
    throw new BadRequestException(
      `strokes[].points[${index}] requires numeric t (timestamp)`,
    );
  }

  return {
    x: point.x,
    y: point.y,
    t: point.t,
    ...(typeof point.pressure === 'number'
      ? { pressure: point.pressure }
      : {}),
  };
}

function parseStroke(raw: unknown, index: number): Stroke {
  const stroke = assertPlainObject(raw, `strokes[${index}]`);
  rejectForbiddenKeys(stroke, `strokes[${index}]`);

  if (typeof stroke.id !== 'string' || !stroke.id) {
    throw new BadRequestException(`strokes[${index}].id is required`);
  }
  if (!Array.isArray(stroke.points)) {
    throw new BadRequestException(`strokes[${index}].points must be an array`);
  }
  if (typeof stroke.color !== 'string') {
    throw new BadRequestException(`strokes[${index}].color is required`);
  }
  if (typeof stroke.width !== 'number') {
    throw new BadRequestException(`strokes[${index}].width is required`);
  }
  if (
    stroke.tool !== 'pen' &&
    stroke.tool !== 'eraser' &&
    stroke.tool !== 'highlighter'
  ) {
    throw new BadRequestException(`strokes[${index}].tool is invalid`);
  }

  return {
    id: stroke.id,
    points: stroke.points.map((p, i) => parseStrokePoint(p, i)),
    color: stroke.color,
    width: stroke.width,
    tool: stroke.tool,
  };
}

function parseRegion(raw: unknown, index: number): SemanticRegion {
  const region = assertPlainObject(raw, `regions[${index}]`);

  if (typeof region.id !== 'string' || !region.id) {
    throw new BadRequestException(`regions[${index}].id is required`);
  }
  const kind = region.kind;
  if (
    kind !== 'project' &&
    kind !== 'task' &&
    kind !== 'subtask' &&
    kind !== 'assignee' &&
    kind !== 'note'
  ) {
    throw new BadRequestException(`regions[${index}].kind is invalid`);
  }

  const bounds = assertPlainObject(region.bounds, `regions[${index}].bounds`);
  for (const key of ['x', 'y', 'w', 'h']) {
    if (typeof bounds[key] !== 'number') {
      throw new BadRequestException(
        `regions[${index}].bounds.${key} must be a number`,
      );
    }
  }

  return {
    id: region.id,
    kind,
    bounds: {
      x: bounds.x as number,
      y: bounds.y as number,
      w: bounds.w as number,
      h: bounds.h as number,
    },
    ...(typeof region.parentRegionId === 'string'
      ? { parentRegionId: region.parentRegionId }
      : {}),
    ...(Array.isArray(region.strokeIds)
      ? { strokeIds: region.strokeIds.filter((id) => typeof id === 'string') }
      : {}),
  };
}

export function validateWhiteboardDocument(
  raw: unknown,
): WhiteboardDocumentContent {
  const doc = assertPlainObject(raw, 'documentJson');
  rejectForbiddenKeys(doc, 'documentJson');

  const canvas = assertPlainObject(doc.canvas, 'canvas');
  if (typeof canvas.width !== 'number' || typeof canvas.height !== 'number') {
    throw new BadRequestException('canvas.width and canvas.height are required');
  }

  if (!Array.isArray(doc.strokes)) {
    throw new BadRequestException('strokes must be an array');
  }
  if (!Array.isArray(doc.regions)) {
    throw new BadRequestException('regions must be an array');
  }

  return {
    canvas: { width: canvas.width, height: canvas.height },
    strokes: doc.strokes.map((s, i) => parseStroke(s, i)),
    regions: doc.regions.map((r, i) => parseRegion(r, i)),
  };
}

export function emptyWhiteboardDocument(): WhiteboardDocumentContent {
  return {
    canvas: { width: 2000, height: 1500 },
    strokes: [],
    regions: [],
  };
}
