import express from "express";
import { Signup, Login, Logout } from "../controllers/AuthController.js";
import { userVerification } from "../middlewares/AuthMiddleware.js";

const router = express.Router();

router.post("/signup", Signup);
router.post("/login", Login);
router.post("/logout", Logout);

// The session-check handler is mounted at both POST / and POST /verify so it
// survives being proxied at a path prefix.
router.post("/verify", userVerification);
router.post("/", userVerification);

export default router;
