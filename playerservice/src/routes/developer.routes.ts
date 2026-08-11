import Route from "express";
import {validateSignUp,validateLogin} from "../zod/validator.js"
import {handleDeveloperLogin,handleDeveloperSignUp} from "../controller/developer.controller.js"

const devRoute = Route();

devRoute.post("/signup",validateSignUp,handleDeveloperSignUp);
devRoute.post("/login",validateLogin,handleDeveloperLogin);

export default devRoute;