module.exports = {
  testEnvironment: "node",
  testTimeout: 30000,
  collectCoverageFrom: [
    "app.js",
    "config/**/*.js",
    "controllers/**/*.js",
    "middlewares/**/*.js",
    "realtime/**/*.js",
    "routes/**/*.js",
    "services/**/*.js",
    "utils/**/*.js",
  ],
  coverageDirectory: "coverage",
};
