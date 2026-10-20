import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function offlineApp() {
  let output;
  return {
    name: 'multik-offline-app',
    apply: 'build',
    configResolved(config) { output = join(config.root, config.build.outDir); },
    async closeBundle() {
      const files = (await readdir(output, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath ?? entry.path, entry.name).slice(output.length + 1).replaceAll('\\', '/'))
        // Keep recovery outside the app cache so a broken worker cannot trap it.
        .filter((file) => file !== 'sw.js' && file !== 'recover.html').sort();
      const hash = createHash('sha256');
      const source = await readFile(join(output, 'sw.js'), 'utf8');
      hash.update(source);
      for (const file of files) hash.update(file).update(await readFile(join(output, file)));
      const worker = source.replace('__BUILD_VERSION__', hash.digest('hex').slice(0, 16))
        .replace('__PRECACHE_FILES__', JSON.stringify(files.map((file) => './' + file)));
      await writeFile(join(output, 'sw.js'), worker);
    },
  };
}
