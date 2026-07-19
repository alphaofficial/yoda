module.exports = {
  apps: [
    // cluster mode allows you to spread your app across all CPUs available.
    // Good for web servers, APIs, services needing HTTP load balancing
    {
      name: "Application",
      script: "./dist/index.js",
      exec_mode: "cluster",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
    {
      name: "Worker",
      script: "./dist/worker.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
    },
  ],
};
