import * as bitcoin from 'bitcoinjs-lib';
import * as bip32 from 'bip32';
import bip39 from 'bip39';
import ecc from 'tiny-secp256k1';

bitcoin.initEccLib(ecc);

export async function deriveBtcAddresses(mnemonic, passphrase, accStart, accEnd, start, count) {
	const previews = {};
	const seed = await bip39.mnemonicToSeed(mnemonic, passphrase || undefined);
	for (let acc = accStart; acc <= accEnd; acc++) {
		const addrs = [];
		for (let i = start; i < start + count; i++) {
			const path = `m/84'/0'/${acc}'/0/${i}`; // BIP84 P2WPKH
			const root = bip32.BIP32Factory(ecc).fromSeed(seed, bitcoin.networks.bitcoin);
			const child = root.derivePath(path);
			const { address } = bitcoin.payments.p2wpkh({ pubkey: child.publicKey, network: bitcoin.networks.bitcoin });
			addrs.push(address);
		}
		previews[acc] = addrs;
	}
	return previews;
}

