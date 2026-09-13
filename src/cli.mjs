const HELP = `vedio-factory — automatic editing and verified video composition

Commands:
  probe
  analyze <video>
  validate-plan <plan.json>
  quote <plan.json> --stage rough|final
  run <plan.json> --stage rough|final --approval <approval.json>
  review-sync <rough-cut> <shots.json>
  status <ledger.json>
  evaluate <artifact> <plan.json>
  recover <ledger.json>
`;

export async function main(argv) {
  const [command] = argv;
  if (!command || command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return 0;
  }
  process.stderr.write(`Command not implemented yet: ${command}\n`);
  return 2;
}
