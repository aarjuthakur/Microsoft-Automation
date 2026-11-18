export function step(msg: string): void {
  console.log(`  -> ${msg}`);
}

export function workflow(title: string, steps: string[]): void {
  const divider = '='.repeat(60);
  console.log(`\n${divider}`);
  console.log(`  ${title}`);
  console.log(divider);
  for (let i = 0; i < steps.length; i++) {
    console.log(`  ${i + 1}. ${steps[i]}`);
  }
  console.log(`${divider}\n`);
}
