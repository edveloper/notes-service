// Minimal data layer. In production these wrap a SQL connection pool.
module.exports = {
  query: async (sql) => [],
  logRateCheck: async (userId, allowed) => {},
  audit: async (userId, path) => {},
};
