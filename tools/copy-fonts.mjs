/**
 * Refreshes the self-hosted font subsets in public/fonts from the fontsource
 * packages.
 *
 * The woff2 files are committed so a production deploy does not need
 * node_modules to serve them, and so the filenames stay stable — the layout
 * emits <link rel="preload"> for a fixed path rather than reading the Vite
 * manifest. Run this after bumping either font package.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'public/fonts');

// Only the subsets actually rendered: Persian pages use Vazirmatn arabic+latin,
// English pages use Inter latin. Cyrillic, Greek and Vietnamese are not shipped.
const files = [
    ['@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2', 'vazirmatn-arabic.woff2'],
    ['@fontsource-variable/vazirmatn/files/vazirmatn-latin-wght-normal.woff2', 'vazirmatn-latin.woff2'],
    ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter-latin.woff2'],
    ['@fontsource-variable/vazirmatn/LICENSE', 'LICENSE-Vazirmatn.txt'],
    ['@fontsource-variable/inter/LICENSE', 'LICENSE-Inter.txt'],
];

await mkdir(target, { recursive: true });

for (const [from, to] of files) {
    const source = resolve(root, 'node_modules', from);

    try {
        await copyFile(source, resolve(target, to));
        console.log(`copied ${to}`);
    } catch (error) {
        console.error(`FAILED ${to}: ${error.message}`);
        process.exitCode = 1;
    }
}
