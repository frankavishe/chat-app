// Interop spike CLI: a Signal party whose state persists in a JSON file.
// Usage:
//   dart run bin/cli.dart <state.json> init
//   dart run bin/cli.dart <state.json> encrypt <peer> <plaintext> [bundle.json]
//   dart run bin/cli.dart <state.json> decrypt <peer> <prekey|whisper> <base64>
// Output: one JSON object on stdout.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:libsignal_protocol_dart/libsignal_protocol_dart.dart';

Uint8List b64(String s) => base64Decode(s);
String e64(List<int> b) => base64Encode(b);

class FileStore {
  FileStore(this.path);
  final String path;
  late InMemorySignalProtocolStore store;
  late IdentityKeyPair identity;
  late int registrationId;
  final Map<String, String> prekeys = {};
  final Map<String, String> signedPrekeys = {};
  final Map<String, String> sessions = {}; // "name.dev" -> record
  final Map<String, String> identities = {}; // "name.dev" -> identity key

  Future<void> load() async {
    final j = jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;
    identity = IdentityKeyPair.fromSerialized(b64(j['identity'] as String));
    registrationId = j['registrationId'] as int;
    store = InMemorySignalProtocolStore(identity, registrationId);
    for (final e in (j['prekeys'] as Map).entries) {
      await store.storePreKey(
          int.parse(e.key as String), PreKeyRecord.fromBuffer(b64(e.value as String)));
    }
    for (final e in (j['signedPrekeys'] as Map).entries) {
      await store.storeSignedPreKey(int.parse(e.key as String),
          SignedPreKeyRecord.fromSerialized(b64(e.value as String)));
    }
    for (final e in (j['sessions'] as Map).entries) {
      await store.storeSession(
          _addr(e.key as String), SessionRecord.fromSerialized(b64(e.value as String)));
    }
    for (final e in (j['identities'] as Map).entries) {
      await store.saveIdentity(
          _addr(e.key as String), IdentityKey.fromBytes(b64(e.value as String), 0));
    }
  }

  static SignalProtocolAddress _addr(String k) {
    final i = k.lastIndexOf('.');
    return SignalProtocolAddress(k.substring(0, i), int.parse(k.substring(i + 1)));
  }

  Future<void> save(List<SignalProtocolAddress> peers) async {
    // Prekeys: keep only those still present (consumed ones are removed).
    final pk = <String, String>{};
    for (var id = 1; id <= 5; id++) {
      if (await store.containsPreKey(id)) {
        pk['$id'] = e64((await store.loadPreKey(id)).serialize());
      }
    }
    final spk = <String, String>{
      for (final r in await store.loadSignedPreKeys()) '${r.id}': e64(r.serialize())
    };
    for (final a in peers) {
      final k = '${a.getName()}.${a.getDeviceId()}';
      if (await store.containsSession(a)) {
        sessions[k] = e64((await store.loadSession(a)).serialize());
      }
      final id = await store.getIdentity(a);
      if (id != null) identities[k] = e64(id.serialize());
    }
    File(path).writeAsStringSync(jsonEncode({
      'identity': e64(identity.serialize()),
      'registrationId': registrationId,
      'prekeys': pk,
      'signedPrekeys': spk,
      'sessions': sessions,
      'identities': identities,
    }));
  }
}

Future<void> main(List<String> args) async {
  final path = args[0];
  final cmd = args[1];
  if (cmd == 'init') {
    final identity = generateIdentityKeyPair();
    final regId = generateRegistrationId(false);
    final prekeys = generatePreKeys(1, 5);
    final spk = generateSignedPreKey(identity, 1);
    File(path).writeAsStringSync(jsonEncode({
      'identity': e64(identity.serialize()),
      'registrationId': regId,
      'prekeys': {for (final p in prekeys) '${p.id}': e64(p.serialize())},
      'signedPrekeys': {'${spk.id}': e64(spk.serialize())},
      'sessions': {},
      'identities': {},
    }));
    stdout.write(jsonEncode({
      'registrationId': regId,
      'identityKey': e64(identity.getPublicKey().serialize()),
      'signedPreKey': {
        'keyId': spk.id,
        'publicKey': e64(spk.getKeyPair().publicKey.serialize()),
        'signature': e64(spk.signature),
      },
      'preKey': {
        'keyId': prekeys.first.id,
        'publicKey': e64(prekeys.first.getKeyPair().publicKey.serialize()),
      },
    }));
    return;
  }

  final fs = FileStore(path);
  await fs.load();
  final peer = SignalProtocolAddress(args[2], 1);

  if (cmd == 'encrypt') {
    if (args.length > 4) {
      final b = jsonDecode(File(args[4]).readAsStringSync()) as Map<String, dynamic>;
      final spk = b['signedPreKey'] as Map<String, dynamic>;
      final pk = b['preKey'] as Map<String, dynamic>;
      await SessionBuilder.fromSignalStore(fs.store, peer).processPreKeyBundle(
        PreKeyBundle(
          b['registrationId'] as int,
          1,
          pk['keyId'] as int,
          Curve.decodePoint(b64(pk['publicKey'] as String), 0),
          spk['keyId'] as int,
          Curve.decodePoint(b64(spk['publicKey'] as String), 0),
          b64(spk['signature'] as String),
          IdentityKey.fromBytes(b64(b['identityKey'] as String), 0),
        ),
      );
    }
    final msg = await SessionCipher.fromStore(fs.store, peer)
        .encrypt(Uint8List.fromList(utf8.encode(args[3])));
    await fs.save([peer]);
    stdout.write(jsonEncode({
      'type': msg.getType() == CiphertextMessage.prekeyType ? 'prekey' : 'whisper',
      'body': e64(msg.serialize()),
    }));
  } else if (cmd == 'decrypt') {
    final cipher = SessionCipher.fromStore(fs.store, peer);
    final bytes = b64(args[4]);
    final plain = args[3] == 'prekey'
        ? await cipher.decrypt(PreKeySignalMessage(bytes))
        : await cipher.decryptFromSignal(SignalMessage.fromSerialized(bytes));
    await fs.save([peer]);
    stdout.write(jsonEncode({'plaintext': utf8.decode(plain)}));
  } else {
    throw ArgumentError('unknown command $cmd');
  }
}
