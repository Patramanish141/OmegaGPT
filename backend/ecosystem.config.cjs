// PM2 process definition for the OmegaGPT API.
//
// The file is .cjs rather than .js because backend/package.json sets
// "type": "module", and PM2 loads its ecosystem file with require().
//
//   sudo pm2 startOrRestart ecosystem.config.cjs --update-env
//   sudo pm2 save

module.exports = {
  apps: [
    {
      name: "omegachat-backend",
      script: "server.js",
      // Resolves to wherever the repo is checked out, so the self-hosted
      // runner does not need a hardcoded workspace path.
      cwd: __dirname,
      instances: 1,
      // Socket.IO keeps per-connection state in memory, so a single process
      // stays correct; clustering would need a Redis adapter first.
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        PORT: 8080,
      },
    },
  ],
};
