// pm2.config.js
// ✅ SAFE TO CLUSTER: Since we are now using MongoDB Atlas rather than a local JSON file,
// we can safely enable Cluster Mode to handle high traffic (1000+ users).

module.exports = {
    apps: [{
        name: 'solmates-backend',
        script: 'server.js',

        instances: 'max',      // Utilizes all available CPU cores
        exec_mode: 'cluster',  // Enables load balancing across processes

        watch: false,
        max_memory_restart: '512M',

        env: {
            NODE_ENV: 'development',
            PORT: 3000
        },
        env_production: {
            NODE_ENV: 'production',
            PORT: 10000
        },

        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,

        min_uptime: '10s',
        max_restarts: 5,
        restart_delay: 4000
    }]
};
