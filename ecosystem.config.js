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
    // fork mode runs your script as a single Node.js process.
    // Good for workers, background jobs, scripts not needing HTTP load balancing
  ],
};
