import {cpSync, mkdirSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'dist');

// Build into a clean directory so repeated deployments cannot retain stale files.
rmSync(output, {recursive: true, force: true});
mkdirSync(output, {recursive: true});
cpSync(path.join(root, 'index.html'), path.join(output, 'index.html'));
cpSync(path.join(root, 'src'), path.join(output, 'src'), {recursive: true});
