import Route from "express";
import {validateLogin, validatePlayerResigterSchema} from "../zod/validator.js"
import { getPlayerInfo, loginPlayer, logoutPlayer, signupPlayer } from "../controller/playermanagment.controller.js";
import {apiKeyMiddleware} from "../middleware/apiKey.middleware.js"
import { authPlayer } from "../middleware/playerAuth.middleware.js";
const playerRoute = Route();

playerRoute.post("/players/signup",apiKeyMiddleware,validatePlayerResigterSchema,signupPlayer);
playerRoute.post("/players/login",apiKeyMiddleware,validateLogin,loginPlayer);
playerRoute.post("/players/logout",apiKeyMiddleware,authPlayer,logoutPlayer);
playerRoute.get("/players/:playerId",apiKeyMiddleware,authPlayer,getPlayerInfo);

