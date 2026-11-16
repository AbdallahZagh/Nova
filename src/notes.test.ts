import assert from "node:assert/strict";
import test from "node:test";
import {
  checklistProgress,
  editedLabel,
  filterNotes,
  isBlankDraft,
  noteSurface,
  noteTitle,
  searchNotes,
  sortNotes,
  upsertNote,
  type Note,
} from "./notes.ts";

const note = (overrides: Partial<Note> = {}): Note => ({
  id: "1",
  title: "Plan",
  body: "Write it down",
  checklist: [{ id: "a", text: "One", done: true }, { id: "b", text: "Two", done: false }],
  color: "AMBER",
  pinned: false,
  floating: false,
  preview: "Write it down",
  projectId: null,
  project: null,
  createdAt: "",
  updatedAt: "2026-11-12T08:00:00.000Z",
  ...overrides,
});

test("uses the preview when a note has no title", () => {
  assert.equal(noteTitle(note({ title: "  " })), "Write it down");
});

test("counts finished checklist items", () => {
  assert.equal(checklistProgress(note().checklist), "1/2");
});

test("filters personal, project and pinned notes", () => {
  const notes = [note(), note({ id: "2", projectId: "p", pinned: true })];
  assert.equal(filterNotes(notes, "personal").length, 1);
  assert.equal(filterNotes(notes, "project")[0]?.id, "2");
  assert.equal(filterNotes(notes, "pinned")[0]?.id, "2");
});

test("search looks at the title, text, checklist and project name", () => {
  const notes = [
    note({ id: "1", title: "Groceries", body: "", checklist: [] }),
    note({ id: "2", title: null, body: "Call the client", checklist: [] }),
    note({ id: "3", title: "Plan", checklist: [{ id: "x", text: "Buy milk", done: false }] }),
    note({ id: "4", title: "Kickoff", project: { id: "p", name: "Atlas" } }),
  ];
  assert.deepEqual(searchNotes(notes, "client").map((item) => item.id), ["2"]);
  assert.deepEqual(searchNotes(notes, "MILK").map((item) => item.id), ["3"]);
  assert.deepEqual(searchNotes(notes, "atlas").map((item) => item.id), ["4"]);
  assert.equal(searchNotes(notes, "  ").length, 4);
});

test("pinned notes come first, then the most recently edited", () => {
  const sorted = sortNotes([
    note({ id: "old", updatedAt: "2026-11-01T00:00:00.000Z" }),
    note({ id: "new", updatedAt: "2026-11-10T00:00:00.000Z" }),
    note({ id: "pin", pinned: true, updatedAt: "2026-10-01T00:00:00.000Z" }),
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ["pin", "new", "old"]);
});

test("upsert replaces an existing note and adds a new one", () => {
  const first = note({ id: "1" });
  const replaced = upsertNote([first], note({ id: "1", title: "Renamed" }));
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0]?.title, "Renamed");
  assert.equal(upsertNote(replaced, note({ id: "2" })).length, 2);
});

test("a draft with only whitespace is blank", () => {
  assert.equal(isBlankDraft({ title: " ", body: "\n", checklist: [{ id: "a", text: " ", done: false }] }), true);
  assert.equal(isBlankDraft({ body: "hi" }), false);
  assert.equal(isBlankDraft({ checklist: [{ id: "a", text: "milk", done: false }] }), false);
});

test("edited label says Yesterday and falls back to a date", () => {
  const now = new Date("2026-11-12T12:00:00.000Z");
  assert.equal(editedLabel("2026-11-11T09:00:00.000Z", now), "Yesterday");
  assert.match(editedLabel("2026-10-01T09:00:00.000Z", now), /Oct/);
  assert.equal(editedLabel("not a date", now), "");
});

test("every colour has a light and a dark surface", () => {
  assert.notEqual(noteSurface("AMBER", "light"), noteSurface("AMBER", "dark"));
});
