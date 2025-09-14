import { Wallet } from 'ethers';

export async function deriveEvmAddresses(mnemonic, passphrase, accStart, accEnd, start, count) {
	const previews = {};
	for (let acc = accStart; acc <= accEnd; acc++) {
		const addrs = [];
		for (let i = start; i < start + count; i++) {
			const path = `m/44'/60'/${acc}'/0/${i}`;
			const w = Wallet.fromPhrase(mnemonic, path, passphrase || undefined);
			addrs.push(w.address);
		}
		previews[acc] = addrs;
	}
	return previews;
}

