/**
 * @deprecated Prefer `npm run setup:seasonal-table` (direct DATABASE_URL, no MCP).
 */
const { main } = require('./create-seasonal-scores-table');

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
