// Winston-based logger. Export logger to be used across the app.
const { createLogger, transports, format } = require('winston');
const config = require('./env');

const logger = createLogger({
  level: config.log.level,
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: [
    new transports.Console({
      handleExceptions: true,
      format: format.combine(
        format.colorize({ all: true }),
        format.simple()
      )
    })
  ],
  exitOnError: false
});

module.exports = logger;
