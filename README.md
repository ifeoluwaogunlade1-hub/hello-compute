# bip39-recover-cli

Offline helper to recover missing BIP-39 words by generating candidates that pass checksum and (optionally) deriving first ETH/BTC addresses to help you identify the correct phrase.

## Install

```bash
cd /workspace/bip39-recover-cli
npm install
```

## Usage

```bash
# Show help
npm run help

# 12-word with 2 unknowns
node bin/recover.js --pattern "abandon abandon abandon ? ? abandon abandon abandon abandon abandon abandon about" \
  --max-candidates 100000

# With letter hints and a custom subset
node bin/recover.js --pattern-file pattern.txt --hint 7=ab --hint 9=to --subset-file subset.txt \
  --out results.jsonl
```

- Unknowns are `?` or `*`.
- `--hint N=prefix` narrows word N (1-based) to words starting with `prefix`.
- Results are written as JSONL (one JSON per line) with optional ETH/BTC first addresses.

## Notes
- Feasible for 1–2 unknown words; 3+ explodes quickly. Use hints or subsets.
- No network calls by default. Keep your machine offline for safety if desired.
- This tool cannot recover a wallet if too many words are unknown. No guarantees.
