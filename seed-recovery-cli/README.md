# seed-recovery-cli

Partial BIP-39 recovery CLI that:
- generates valid mnemonics from a pattern using checksum pruning (offline)
- optionally derives sample ETH/BTC addresses for recognition (offline)
- exports results to JSON

## Install

```bash
cd /workspace/seed-recovery-cli
npm install
```

## Usage

```bash
# show help
npm start

# basic: 12-word pattern with unknowns
node bin/recover.js --pattern "abandon abandon abandon ? ? ? abandon abandon abandon abandon abandon about" --length 12

# with hints and address previews
node bin/recover.js -p "abandon abandon ? ? abandon ? abandon abandon abandon abandon abandon about" \
  --hint 3=let --hint 4=ab --derive --chains eth,btc --account 0-1 --start 0 --count 5

# using pattern file and passphrase list
node bin/recover.js --pattern-file seed_pattern.txt --passphrases pass.txt --derive --chains eth --count 10
```

## Notes
- This tool does not recover from only a few known words; you must keep the unknown count small (ideally 1–3) and provide hints.
- No network calls are made; everything runs locally. You can visually recognize derived addresses if familiar.
- Never share recovered seeds. Use at your own risk.

MIT License

