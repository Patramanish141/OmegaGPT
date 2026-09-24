import express from "express";
import { Signup, Login, Logout } from "../controllers/AuthController.js";
import { userVerification } from "../middlewares/AuthMiddleware.js";

const router = express.Router();

router.post("/signup", Signup);
router.post("/login", Login);
router.post("/logout", Logout);

// POST / is SigmaGPT's original session-check endpoint; /verify is the same
// handler under a name that survives being proxied at a path prefix.
router.post("/verify", userVerification);
router.post("/", userVerification);

export default router;
