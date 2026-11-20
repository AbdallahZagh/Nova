import { noteIsEmpty, normalizeChecklist, previewText } from './note.logic';

describe('note logic', () => {
  it('keeps checklist items and drops blanks', () => {
    expect(
      normalizeChecklist([
        { id: 'a', text: '  Ship it  ', done: true },
        { text: '   ', done: false },
        { text: 'Next', done: false },
      ]),
    ).toEqual([
      { id: 'a', text: '  Ship it  ', done: true },
      { id: 'item-2', text: 'Next', done: false },
    ]);
  });

  it('preserves long checklist items and lists', () => {
    const items = Array.from({ length: 110 }, (_, i) => ({
      id: `item-${i}`,
      text: 'Review this item '.repeat(30) + '\n',
      done: false,
    }));
    expect(normalizeChecklist(items)).toEqual(items);
  });

  it('rejects a checklist that is not a list', () => {
    expect(() => normalizeChecklist('nope')).toThrow('Checklist must be a list.');
  });

  it('treats a note as empty only when every field is blank', () => {
    expect(noteIsEmpty({ title: '  ', body: '', checklist: [] })).toBe(true);
    expect(noteIsEmpty({ title: null, body: '', checklist: [{ id: '1', text: 'One', done: false }] })).toBe(false);
  });

  it('previews the first body line, then the first checklist item', () => {
    expect(previewText('Hello\nworld', [])).toBe('Hello');
    expect(previewText('   ', [{ id: '1', text: 'Buy milk', done: false }])).toBe('Buy milk');
  });
});
