import { isEntryPoint } from "#lib/cli.mjs";
import { installGitHooks } from "#lib/git-hooks.mjs";

function main(argv) {
  const root = argv[0] || process.cwd();
  installGitHooks(root);
  console.log(`git hooks installed into ${root}`);
}

if (isEntryPoint(import.meta.url)) {
  main(process.argv.slice(2));
}
