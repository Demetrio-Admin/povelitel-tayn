// Node loader: подменяет 'phaser' заглушкой (tools/ui/fake-phaser.mjs) для стенда интерфейса.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'phaser') return { url: new URL('./fake-phaser.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
