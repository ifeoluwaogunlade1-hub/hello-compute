import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import prompts from 'prompts';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import bip39 from 'bip39';
import pLimit from 'p-limit';
import { deriveEvmAddresses } from './modules/evm.js';
import { deriveBtcAddresses } from './modules/btc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BIP39_WORDS = bip39.wordlists.english;

function parsePattern(patternStr) {
	const words = patternStr.trim().split(/\s+/);
	return words;
}

function applyHints(wordCandidates, hints) {
	if (!hints || Object.keys(hints).length === 0) return wordCandidates;
	const out = new Map();
	for (const [indexStr, list] of wordCandidates.entries()) {
		const idx = Number(indexStr);
		const hint = hints[idx + 1]; // hints are 1-based positions
		if (!hint) {
			out.set(indexStr, list);
			continue;
		}
		const pref = hint.toLowerCase();
		out.set(indexStr, list.filter(w => w.startsWith(pref)));
	}
	return out;
}

function* generateCandidates(pattern, wordCandidates, maxCandidates) {
	const positions = [];
	for (let i = 0; i < pattern.length; i++) {
		if (pattern[i] === '?' || pattern[i] === '*') positions.push(i);
	}
	if (positions.length === 0) {
		yield pattern.join(' ');
		return;
	}
	let yielded = 0;
	const recurse = (posIndex, current) => {
		if (maxCandidates && yielded >= maxCandidates) return;
		if (posIndex >= positions.length) {
			const phrase = current.join(' ');
			if (bip39.validateMnemonic(phrase)) {
				yielded++;
				yield phrase;
			}
			return;
		}
		const slot = positions[posIndex];
		const options = wordCandidates.get(String(slot)) || BIP39_WORDS;
		for (const w of options) {
			current[slot] = w;
			recurse(posIndex + 1, current);
			if (maxCandidates && yielded >= maxCandidates) return;
		}
	};
	const start = [...pattern];
	recurse(0, start);
}

function buildWordCandidates(pattern) {
	const candidates = new Map();
	for (let i = 0; i < pattern.length; i++) {
		const w = pattern[i];
		if (w === '?' || w === '*') {
			candidates.set(String(i), BIP39_WORDS);
		}
	}
	return candidates;
}

function validateKnownWords(pattern) {
	for (const w of pattern) {
		if (w === '?' || w === '*') continue;
		if (!BIP39_WORDS.includes(w)) {
			throw new Error(`Unknown word '${w}'. Ensure it's exact and lowercase.`);
		}
	}
}

function parseHints(hintPairs) {
	// format: 7=ab (position is 1-based)
	const hints = {};
	for (const p of hintPairs || []) {
		const [k, v] = String(p).split('=');
		const pos = Number(k);
		if (!pos || !v) continue;
		hints[pos] = v.toLowerCase();
	}
	return hints;
}

async function main() {
	const program = new Command();
	program
		.name('recover')
		.description('Partial BIP-39 recovery with checksum pruning and optional address derivation (offline)')
		.option('-p, --pattern <str>', 'Mnemonic pattern string, use ? for unknown words')
		.option('--pattern-file <file>', 'Path to file containing mnemonic pattern')
		.option('--length <n>', 'Expected mnemonic length (12/15/18/21/24)')
		.option('--hint <pos=prefix...>', 'Hint(s) for unknown word positions (1-based)', (v, acc) => { acc.push(v); return acc; }, [])
		.option('--derive', 'Derive and show sample addresses for recognition', false)
		.option('--chains <list>', 'Comma-separated chains to derive (eth,btc)', 'eth')
		.option('--paths <list>', 'Custom derivation roots, e.g. 44/60;84/0', '')
		.option('--account <range>', 'Account index or range like 0-1', '0')
		.option('--start <n>', 'Start index', '0')
		.option('--count <n>', 'Number of indices per chain to preview', '5')
		.option('--passphrases <file>', 'Optional file with BIP-39 passphrase candidates (one per line)')
		.option('--max-candidates <n>', 'Maximum valid mnemonics to produce', '500')
		.option('--workers <n>', 'Parallelism when deriving addresses', '4')
		.option('--offline', 'Do not make any network calls (default)', true)
		.version('0.1.0');

	program.parse(process.argv);
	const opts = program.opts();

	let patternStr = opts.pattern || '';
	if (!patternStr && opts.patternFile) {
		patternStr = fs.readFileSync(path.resolve(opts.patternFile), 'utf8').trim();
	}
	if (!patternStr) {
		const resp = await prompts({ type: 'text', name: 'pat', message: 'Enter mnemonic pattern (use ? for unknown):' });
		patternStr = (resp.pat || '').trim();
	}
	if (!patternStr) {
		console.error(chalk.red('No pattern provided.'));
		process.exit(1);
	}
	const pattern = parsePattern(patternStr);
	if (opts.length && Number(opts.length) !== pattern.length) {
		console.error(chalk.red(`Pattern length ${pattern.length} != expected ${opts.length}`));
		process.exit(1);
	}
	if (![12,15,18,21,24].includes(pattern.length)) {
		console.error(chalk.red('Mnemonic must be 12/15/18/21/24 words.'));
		process.exit(1);
	}
	validateKnownWords(pattern);

	const hints = parseHints(opts.hint);
	let wordCandidates = buildWordCandidates(pattern);
	wordCandidates = applyHints(wordCandidates, hints);

	const maxCandidates = Number(opts.maxCandidates) || 500;
	const validMnemonics = [];
	const bar = new cliProgress.SingleBar({ format: 'Generating |{bar}| {value}/{total} valid' }, cliProgress.Presets.shades_classic);
	bar.start(maxCandidates, 0);
	for (const phrase of generateCandidates(pattern, wordCandidates, maxCandidates)) {
		validMnemonics.push(phrase);
		bar.update(validMnemonics.length);
		if (validMnemonics.length >= maxCandidates) break;
	}
	bar.stop();

	if (validMnemonics.length === 0) {
		console.log(chalk.yellow('No valid mnemonics found with the given pattern/hints.'));
		process.exit(0);
	}

	console.log(chalk.green(`Valid mnemonics found: ${validMnemonics.length}`));

	let passphrases = [''];
	if (opts.passphrases) {
		const list = fs.readFileSync(path.resolve(opts.passphrases), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
		if (list.length) passphrases = list;
	}

	const showDerive = !!opts.derive;
	const chains = String(opts.chains || 'eth').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
	const accountRange = String(opts.account || '0');
	const [accStart, accEnd] = accountRange.includes('-') ? accountRange.split('-').map(n => Number(n)) : [Number(accountRange), Number(accountRange)];
	const start = Number(opts.start) || 0;
	const count = Number(opts.count) || 5;
	const workers = Math.max(1, Number(opts.workers) || 4);

	const results = [];
	if (showDerive) {
		console.log(chalk.cyan('Deriving sample addresses for recognition...'));
		const limit = pLimit(workers);
		const tasks = [];
		for (const phrase of validMnemonics) {
			for (const pass of passphrases) {
				tasks.push(limit(async () => {
					const entry = { mnemonic: phrase, passphrase: pass, previews: {} };
					if (chains.includes('eth')) {
						entry.previews.eth = await deriveEvmAddresses(phrase, pass, accStart, accEnd, start, count);
					}
					if (chains.includes('btc')) {
						entry.previews.btc = await deriveBtcAddresses(phrase, pass, accStart, accEnd, start, count);
					}
					return entry;
				}));
			}
		}
		const derived = await Promise.all(tasks);
		for (const r of derived) results.push(r);
	} else {
		for (const phrase of validMnemonics) results.push({ mnemonic: phrase });
	}

	// Save results
	const outDir = path.resolve(process.cwd());
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const outFile = path.join(outDir, `recover-results-${ts}.json`);
	fs.writeFileSync(outFile, JSON.stringify({ generated: validMnemonics.length, results }, null, 2));
	console.log(chalk.green(`Saved results to ${outFile}`));

	// Pretty print a small preview
	const showN = Math.min(results.length, 3);
	for (let i = 0; i < showN; i++) {
		const r = results[i];
		console.log('\n' + chalk.bold(`Candidate ${i + 1}:`));
		console.log(r.mnemonic);
		if (r.previews?.eth) {
			console.log(chalk.gray('ETH m/44\'/60\'/acc\'/0/index -> first addresses'));
			for (const [k, v] of Object.entries(r.previews.eth).slice(0, 1)) {
				console.log(`  account ${k}: ${v.slice(0, 3).join(', ')} ...`);
			}
		}
		if (r.previews?.btc) {
			console.log(chalk.gray('BTC m/84\'/0\'/acc\'/0/index -> first addresses'));
			for (const [k, v] of Object.entries(r.previews.btc).slice(0, 1)) {
				console.log(`  account ${k}: ${v.slice(0, 3).join(', ')} ...`);
			}
		}
	}
}

main().catch(err => {
	console.error(chalk.red(err?.stack || String(err)));
	process.exit(1);
});

