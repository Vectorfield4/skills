import { isEntryPoint } from "#lib/cli.mjs";
import { installVersionHook } from "#lib/version-hook.mjs";

function main(argv) {
  const root = argv[0] || process.cwd();
  installVersionHook(root);
  console.log(`version hook installed into ${root}`);
}

if (isEntryPoint(import.meta.url)) {
  main(process.argv.slice(2));
}
