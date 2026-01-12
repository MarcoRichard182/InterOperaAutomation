// scripts/test-all.js
const { spawn } = require("child_process");

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: true });
    p.on("close", (code) => resolve(code ?? 1));
  });
}

(async () => {
  // pass through extra args: npm run test:all -- tests/solutions
  const extraArgs = process.argv.slice(2);

  const devCode = await run("npm", ["run", "test:dev", "--", ...extraArgs]);
  const prodCode = await run("npm", ["run", "test:prod", "--", ...extraArgs]);

  // exit 1 if any failed, but only AFTER running both
  process.exit(devCode === 0 && prodCode === 0 ? 0 : 1);
})();
