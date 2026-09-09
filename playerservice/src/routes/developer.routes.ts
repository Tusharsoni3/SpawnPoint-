import Route from "express";
import {validateSignUp,validateLogin,validateGameRegisterScehma} from "../zod/validator.js"
import {developerSignUp,developerLogout,developerLogin} from "../controller/developer.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js";
import {addCustomField, changeActiveStatus, getAllGames, getApiKey, getGame, getPlayers, registerGame, updateGame} from "../controller/gameManagment.controller.js";

const devRoute = Route();

devRoute.post("/auth/signup",validateSignUp,developerSignUp);
devRoute.post("/auth/login",validateLogin,developerLogin);
devRoute.post("/auth/logout",authMiddleware,developerLogout);
devRoute.post("/games/register",authMiddleware,validateGameRegisterScehma,registerGame);
devRoute.get("/games/getApiKey/:gameId",authMiddleware,getApiKey);
devRoute.post("/games/:gameId",authMiddleware,addCustomField);
devRoute.get("/games",authMiddleware,getAllGames);
devRoute.get("/games/:gameId",authMiddleware,getGame);
devRoute.patch("/games/:gameId",authMiddleware,updateGame);
devRoute.patch("/games/:gameId/status",authMiddleware,changeActiveStatus);
devRoute.get("/games/:gameId/players",authMiddleware,getPlayers);

export default devRoute;