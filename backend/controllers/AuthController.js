import User from "../models/UserModel.js";
import createSecretToken from "../utils/SecretToken.js";
import { cookieOptions } from "../config/index.js";
import bcrypt from "bcryptjs";

// Never hand the password hash back to the client.
const publicUser = (user) => ({
  _id: user._id,
  email: user.email,
  username: user.username,
  createdAt: user.createdAt,
});

export const Signup = async (req, res) => {
  try {
    const { email, password, username, createdAt } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.json({ message: "User already exists" });
    }

    const user = await User.create({ email, password, username, createdAt });
    const token = createSecretToken(user._id);
    res.cookie("token", token, cookieOptions);

    return res.status(201).json({
      message: "User signed in successfully",
      success: true,
      user: publicUser(user),
      username: user.username,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Signup failed" });
  }
};

export const Login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.json({ message: "All fields are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: "Incorrect password or email" });
    }

    const auth = await bcrypt.compare(password, user.password);
    if (!auth) {
      return res.json({ message: "Incorrect password or email" });
    }

    const token = createSecretToken(user._id);
    res.cookie("token", token, cookieOptions);

    return res.status(201).json({
      message: "User logged in successfully",
      success: true,
      user: user.username,
      username: user.username,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Login failed" });
  }
};

// The token cookie is httpOnly, so the browser cannot clear it itself —
// logout has to happen server-side.
export const Logout = (req, res) => {
  const { maxAge, ...clearOptions } = cookieOptions;
  res.clearCookie("token", clearOptions);
  return res.status(200).json({ success: true, message: "Logged out" });
};
