import { Router } from "express";
import { apiKeyMiddleware } from "../middleware/apiKey.middleware.js";
import { authPlayer } from "../middleware/playerAuth.middleware.js";
import {
  sendFriendRequest,
  handleFriendRequest,
  removeFriend,
  listFriends,
  listFriendRequests,
} from "../controller/friend.controller.js";

const friendRoute = Router();

friendRoute.use(apiKeyMiddleware, authPlayer);

friendRoute.post("/friends/request/:playerId", sendFriendRequest);
friendRoute.patch("/friends/request/:requestId", handleFriendRequest);
friendRoute.delete("/friends/:playerId", removeFriend);
friendRoute.get("/friends", listFriends);
friendRoute.get("/friends/requests", listFriendRequests);

export default friendRoute;