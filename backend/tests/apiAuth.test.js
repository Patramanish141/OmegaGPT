import request from "supertest";
import app from "../app.js";
import { connect, clearDatabase, closeDatabase } from "./db.js";

process.env.TOKEN_KEY = process.env.TOKEN_KEY || "test-secret-key-for-jest";

beforeAll(async () => {
  await connect();
}, 120000);

afterEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

const user = {
  email: "dora@example.com",
  username: "dora",
  password: "explorer2026",
};

// The Angular client calls auth under /api/auth so that nginx can proxy a
// single /api prefix and leave the bare /login and /signup paths to the SPA.
describe("auth mounted under /api/auth", () => {
  test("POST /api/auth/signup registers a user and sets the JWT cookie", async () => {
    const res = await request(app).post("/api/auth/signup").send(user);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.username).toBe(user.username);
    expect(res.headers["set-cookie"].some((c) => c.startsWith("token="))).toBe(true);
  });

  test("the token cookie is httpOnly, so no script can read it", async () => {
    const res = await request(app).post("/api/auth/signup").send(user);

    const tokenCookie = res.headers["set-cookie"].find((c) => c.startsWith("token="));
    expect(tokenCookie).toMatch(/HttpOnly/i);
  });

  test("signup never returns the password hash", async () => {
    const res = await request(app).post("/api/auth/signup").send(user);

    expect(res.body.user.password).toBeUndefined();
  });

  test("POST /api/auth/login authenticates an existing user", async () => {
    await request(app).post("/api/auth/signup").send(user);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: user.password });

    expect(res.status).toBe(201);
    expect(res.body.username).toBe(user.username);
  });

  test("POST /api/auth/verify reports the session behind a valid cookie", async () => {
    const signup = await request(app).post("/api/auth/signup").send(user);
    const cookie = signup.headers["set-cookie"];

    const res = await request(app).post("/api/auth/verify").set("Cookie", cookie);

    expect(res.body).toMatchObject({ status: true, username: user.username });
  });

  test("POST /api/auth/verify reports no session without a cookie", async () => {
    const res = await request(app).post("/api/auth/verify");

    expect(res.body).toEqual({ status: false });
  });

  test("POST /api/auth/logout clears the cookie and ends the session", async () => {
    const signup = await request(app).post("/api/auth/signup").send(user);
    const cookie = signup.headers["set-cookie"];

    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(200);

    const cleared = logout.headers["set-cookie"].find((c) => c.startsWith("token="));
    expect(cleared).toMatch(/token=;/);

    // Replaying the cleared cookie value must not restore the session.
    const after = await request(app).post("/api/auth/verify").set("Cookie", "token=");
    expect(after.body.status).toBe(false);
  });

  // The /api/auth mount sits in front of the chat router, whose requireAuth
  // middleware would otherwise reject an unauthenticated login attempt.
  test("the chat router's auth guard does not swallow /api/auth requests", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever123" });

    expect(res.status).not.toBe(401);
    expect(res.body.message).toBe("Incorrect password or email");
  });

  test("chat routes under /api are still guarded", async () => {
    const res = await request(app).get("/api/thread");
    expect(res.status).toBe(401);
  });
});
