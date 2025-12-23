const { startCli } = require("./ui/cli");

startCli().catch((err) => {
  console.error(err);
  process.exit(1);
});
