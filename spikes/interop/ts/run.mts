// Interop spike orchestrator: TS party lives in memory here, the Dart party
// runs as a CLI subprocess with file-backed state.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  Direction, KeyHelper, KeyPairType, SessionBuilder, SessionCipher,
  SignalProtocolAddress, StorageType, setWebCrypto,
} from '@privacyresearch/libsignal-protocol-typescript';

setWebCrypto(globalThis.crypto as Crypto);

const DART_DIR = resolve(import.meta.dirname, '../dart');
const tmp = mkdtempSync(join(tmpdir(), 'interop-'));

function dart(state: string, ...args: string[]): any {
  const out = execFileSync(join(DART_DIR, 'cli.exe'), [join(tmp, state), ...args], {
    cwd: DART_DIR, encoding: 'utf8'
  });
  return JSON.parse(out.trim().split('\n').pop()!);
}

const toB64 = (b: ArrayBuffer) => Buffer.from(b).toString('base64');
const fromB64 = (s: string): ArrayBuffer => { const b = Buffer.from(s, 'base64'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const binToB64 = (s: string) => Buffer.from(s, 'binary').toString('base64');
const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const dec = (b: ArrayBuffer) => new TextDecoder().decode(b);

class MemStore implements StorageType {
  m = new Map<string, any>();
  constructor(public identity: KeyPairType, public regId: number) {}
  async getIdentityKeyPair() { return this.identity; }
  async getLocalRegistrationId() { return this.regId; }
  async isTrustedIdentity() { return true; }
  async saveIdentity(a: string, k: ArrayBuffer) { this.m.set('id' + a, k); return false; }
  async loadPreKey(id: string | number) { return this.m.get('pk' + id); }
  async storePreKey(id: string | number, kp: KeyPairType) { this.m.set('pk' + id, kp); }
  async removePreKey(id: string | number) { this.m.delete('pk' + id); }
  async storeSession(a: string, r: string) { this.m.set('s' + a, r); }
  async loadSession(a: string) { return this.m.get('s' + a); }
  async loadSignedPreKey(id: string | number) { return this.m.get('spk' + id); }
  async storeSignedPreKey(id: string | number, kp: KeyPairType) { this.m.set('spk' + id, kp); }
  async removeSignedPreKey(id: string | number) { this.m.delete('spk' + id); }
}

async function makeTsParty() {
  const identity = await KeyHelper.generateIdentityKeyPair();
  const regId = KeyHelper.generateRegistrationId();
  const store = new MemStore(identity, regId);
  const spk = await KeyHelper.generateSignedPreKey(identity, 1);
  const pk = await KeyHelper.generatePreKey(1);
  await store.storeSignedPreKey(1, spk.keyPair);
  await store.storePreKey(1, pk.keyPair);
  const bundle = {
    registrationId: regId,
    identityKey: toB64(identity.pubKey),
    signedPreKey: { keyId: 1, publicKey: toB64(spk.keyPair.pubKey), signature: toB64(spk.signature) },
    preKey: { keyId: 1, publicKey: toB64(pk.keyPair.pubKey) },
  };
  return { store, bundle };
}

async function tsDecrypt(c: SessionCipher, m: { type: string; body: string }) {
  const buf = fromB64(m.body);
  return dec(m.type === 'prekey' ? await c.decryptPreKeyWhisperMessage(buf) : await c.decryptWhisperMessage(buf));
}
async function tsEncrypt(c: SessionCipher, text: string) {
  const r = await c.encrypt(enc(text));
  return { type: r.type === 3 ? 'prekey' : 'whisper', body: binToB64(r.body!) };
}

let failures = 0;
function check(label: string, got: string, want: string) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ` (got ${JSON.stringify(got)})`}`);
}

// Flow A: TS initiates to Dart (TS fetched Dart's bundle).
{
  const dartBundle = dart('bob.json', 'init');
  writeFileSync(join(tmp, 'bob-bundle.json'), JSON.stringify(dartBundle));
  const { store } = await makeTsParty();
  const bob = new SignalProtocolAddress('bob', 1);
  await new SessionBuilder(store, bob).processPreKey({
    registrationId: dartBundle.registrationId,
    identityKey: fromB64(dartBundle.identityKey),
    signedPreKey: { keyId: dartBundle.signedPreKey.keyId, publicKey: fromB64(dartBundle.signedPreKey.publicKey), signature: fromB64(dartBundle.signedPreKey.signature) },
    preKey: { keyId: dartBundle.preKey.keyId, publicKey: fromB64(dartBundle.preKey.publicKey) },
  });
  const cipher = new SessionCipher(store, bob);
  const m1 = await tsEncrypt(cipher, 'hello from ts 👋');
  check('A1 ts→dart prekey msg type', m1.type, 'prekey');
  check('A1 ts→dart decrypt', dart('bob.json', 'decrypt', 'alice', m1.type, m1.body).plaintext, 'hello from ts 👋');
  const r1 = dart('bob.json', 'encrypt', 'alice', 'reply from dart');
  check('A2 dart→ts whisper type', r1.type, 'whisper');
  check('A2 dart→ts decrypt', await tsDecrypt(cipher, r1), 'reply from dart');
  for (let i = 0; i < 3; i++) {
    const m = await tsEncrypt(cipher, `ts ratchet ${i}`);
    check(`A3.${i} ts→dart after ratchet`, dart('bob.json', 'decrypt', 'alice', m.type, m.body).plaintext, `ts ratchet ${i}`);
  }
  const r2 = dart('bob.json', 'encrypt', 'alice', 'dart again');
  check('A4 dart→ts again', await tsDecrypt(cipher, r2), 'dart again');
}

// Flow B: Dart initiates to TS (Dart fetched TS's bundle).
{
  const { store, bundle } = await makeTsParty();
  writeFileSync(join(tmp, 'ts-bundle.json'), JSON.stringify(bundle));
  dart('carol.json', 'init');
  const carol = new SignalProtocolAddress('carol', 1);
  const cipher = new SessionCipher(store, carol);
  const m1 = dart('carol.json', 'encrypt', 'dave', 'hello from dart 🎯', join(tmp, 'ts-bundle.json'));
  check('B1 dart→ts prekey msg type', m1.type, 'prekey');
  check('B1 dart→ts decrypt', await tsDecrypt(cipher, m1), 'hello from dart 🎯');
  const r1 = await tsEncrypt(cipher, 'reply from ts');
  check('B2 ts→dart decrypt', dart('carol.json', 'decrypt', 'dave', r1.type, r1.body).plaintext, 'reply from ts');
  const m2 = dart('carol.json', 'encrypt', 'dave', 'dart ratchet');
  check('B3 dart→ts after ratchet', await tsDecrypt(cipher, m2), 'dart ratchet');
}

console.log(failures === 0 ? '\nINTEROP OK' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
