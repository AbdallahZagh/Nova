import type { WhiteboardActivity } from "@/lib/api/whiteboards";

function actorName(item: WhiteboardActivity) {
  return item.actor?.fullName || "Someone";
}

function metaString(item: WhiteboardActivity, key: string) {
  const value = item.metadata?.[key];
  return typeof value === "string" ? value : "";
}

export function whiteboardActivityMessage(item: WhiteboardActivity) {
  const name = actorName(item);
  switch (item.type) {
    case "CREATED":
      return `${name} created this board`;
    case "DUPLICATED":
      return `${name} duplicated this board`;
    case "TITLE_CHANGED":
      return `${name} renamed the board to ${metaString(item, "title") || "Untitled board"}`;
    case "MEMBER_ADDED":
      return `${name} added ${metaString(item, "name") || "a collaborator"} as ${metaString(item, "role").toLowerCase() || "member"}`;
    case "ROLE_CHANGED":
      return `${name} changed ${metaString(item, "name") || "a collaborator"} to ${metaString(item, "role").toLowerCase() || "member"}`;
    case "MEMBER_REMOVED":
      return `${name} removed ${metaString(item, "name") || "a collaborator"}`;
    case "PAGE_ADDED":
      return `${name} added a page`;
    case "PAGE_DELETED":
      return `${name} deleted a page`;
    case "COMMENT_ADDED": {
      const mentioned = item.metadata?.mentionedNames;
      if (Array.isArray(mentioned) && mentioned.length) {
        return `${name} mentioned ${mentioned.join(", ")}`;
      }
      return `${name} commented`;
    }
    case "SNAPSHOT_SAVED":
      return `${name} saved a snapshot`;
    case "EXPORTED":
      return `${name} exported the board as ${metaString(item, "format") || "a file"}`;
    case "EDITED":
      return `${name} drew on the board`;
    default:
      return `${name} updated the board`;
  }
}
