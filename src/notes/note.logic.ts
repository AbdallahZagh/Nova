export const NOTE_COLORS = [
  'SLATE',
  'AMBER',
  'CORAL',
  'SAGE',
  'SKY',
  'VIOLET',
] as const;

export type NoteColorName = (typeof NOTE_COLORS)[number];

export const MAX_FLOATING_NOTES = 6;
export const MAX_CHECKLIST_ITEMS = 100;

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export function isNoteColor(value: string): value is NoteColorName {
  return (NOTE_COLORS as readonly string[]).includes(value);
}

export function normalizeChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) {
    throw new Error('Checklist must be a list.');
  }
  const items: ChecklistItem[] = [];
  for (const entry of value.slice(0, MAX_CHECKLIST_ITEMS)) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as { id?: unknown; text?: unknown; done?: unknown };
    const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, 240) : '';
    if (!text) continue;
    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim().slice(0, 80)
        : `item-${items.length + 1}`;
    items.push({ id, text, done: Boolean(raw.done) });
  }
  return items;
}

export function noteIsEmpty(input: {
  title?: string | null;
  body?: string | null;
  checklist?: ChecklistItem[];
}) {
  const title = input.title?.trim() ?? '';
  const body = input.body?.trim() ?? '';
  return !title && !body && (input.checklist?.length ?? 0) === 0;
}

export function previewText(body: string, checklist: ChecklistItem[]) {
  const line = body.trim().split(/\n/).find((part) => part.trim()) ?? '';
  if (line) return line.slice(0, 140);
  const first = checklist.find((item) => item.text)?.text ?? '';
  return first.slice(0, 140);
}
