module.exports = {
  apps: [
    {
      name: 'cross-platform-web',
      cwd: __dirname,
      script: 'npm',
      args: 'run dev',
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/Users/gongyangyu/.pm2/logs/cross-platform-web-error.log',
      out_file: '/Users/gongyangyu/.pm2/logs/cross-platform-web-out.log',
      merge_logs: true,
    },
  ],
};
