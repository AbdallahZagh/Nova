export const WhiteboardActivityType = {
  CREATED: 'CREATED',
  DUPLICATED: 'DUPLICATED',
  TITLE_CHANGED: 'TITLE_CHANGED',
  MEMBER_ADDED: 'MEMBER_ADDED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
  PAGE_ADDED: 'PAGE_ADDED',
  PAGE_DELETED: 'PAGE_DELETED',
  COMMENT_ADDED: 'COMMENT_ADDED',
  SNAPSHOT_SAVED: 'SNAPSHOT_SAVED',
  EXPORTED: 'EXPORTED',
  EDITED: 'EDITED',
} as const;

export type WhiteboardActivityType =
  (typeof WhiteboardActivityType)[keyof typeof WhiteboardActivityType];

export const EDIT_ACTIVITY_WINDOW_MS = 60 * 60 * 1000;
