export const SERVER_EVENTS = {
  FRIEND_REQUEST_RECEIVED: "friend:request:received",
  FRIEND_REQUEST_ACCEPTED: "friend:request:accepted",
  FRIEND_REQUEST_REJECTED: "friend:request:rejected",
  FRIEND_ADDED: "friend:added",
  FRIEND_REMOVED: "friend:removed",
  FRIEND_ONLINE: "friend:online",
  FRIEND_OFFLINE: "friend:offline",
  SYNC: "friend:sync",
} as const;

export const CLIENT_EVENTS = {
  PING: "ping",
} as const;