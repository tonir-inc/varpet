/** Private fast-selector bridge: same checked MCP image response as the general designer. */
import {readFileSync} from 'node:fs';
import {candidateSheet} from './catalog-vision.js';
process.stdout.write(JSON.stringify(await candidateSheet(JSON.parse(readFileSync(process.argv[2]!, 'utf8')))));
