/* global describe, it, beforeEach */
const assert = require('assert');
const Buffer = require('safe-buffer').Buffer;
const BigInteger = require('bigi');
const bipSchnorr = require('../src/bip-schnorr');
const convert = require('../src/convert');
const randomBytes = require('random-bytes');
const ecurve = require('ecurve');

const curve = ecurve.getCurveByName('secp256k1');
const G = curve.G;
const n = curve.n;

const NUM_RANDOM_TESTS = 64;
const RANDOM_TEST_TIMEOUT = 20000;

const randomInt = (len) => BigInteger.fromBuffer(Buffer.from(randomBytes.sync(len))).mod(n);
const randomBuffer = (len) => Buffer.from(randomBytes.sync(len));

describe('random tests', () => {
  describe('verify', () => {
    it('can verify ' + NUM_RANDOM_TESTS + ' random messages with random keys', (done) => {
      // given
      const privateKeys = [];
      const pubKeys = [];
      const messages = [];
      for (let i = 0; i < NUM_RANDOM_TESTS; i++) {
        const d = randomInt(32);
        const pubKey = convert.pointToBuffer(G.multiply(d));
        const message = randomBuffer(32);
        privateKeys.push(d);
        pubKeys.push(pubKey);
        messages.push(message);
      }

      // when / then
      for (let i = 0; i < NUM_RANDOM_TESTS; i++) {
        let result = true;
        let error = null;
        const signature = bipSchnorr.sign(privateKeys[i], messages[i]);
        try {
          bipSchnorr.verify(pubKeys[i], messages[i], signature);
        } catch (e) {
          result = false;
          error = e;
        }

        // then
        assert.strictEqual(result, true, error);
        assert.strictEqual(error, null);
      }
      done();
    }).timeout(RANDOM_TEST_TIMEOUT);
  });

  describe('batchVerify', () => {
    it('can batch verify ' + NUM_RANDOM_TESTS + ' random messages and signatures', (done) => {
      // given
      const pubKeys = [];
      const messages = [];
      const signatures = [];
      for (let i = 0; i < NUM_RANDOM_TESTS; i++) {
        const d = randomInt(32);
        const pubKey = convert.pointToBuffer(G.multiply(d));
        const message = randomBuffer(32);
        const signature = bipSchnorr.sign(d, message);
        pubKeys.push(pubKey);
        messages.push(message);
        signatures.push(signature);
      }

      // when
      let result = true;
      let error = null;
      try {
        bipSchnorr.batchVerify(pubKeys, messages, signatures);
      } catch (e) {
        result = false;
        error = e;
      }

      // then
      assert.strictEqual(result, true, error);
      assert.strictEqual(error, null);
      done();
    }).timeout(RANDOM_TEST_TIMEOUT);
  });

  describe('naiveKeyAggregation', () => {
    for (let i = 1; i <= NUM_RANDOM_TESTS / 2; i++) {
      it('can aggregate signatures of two random private keys over same message, run #' + i, () => {
        // given
        const d1 = randomInt(32);
        const d2 = randomInt(32);
        const pubKey1 = G.multiply(d1);
        const pubKey2 = G.multiply(d2);
        const message = randomBuffer(32);
        const signature = bipSchnorr.naiveKeyAggregation([d1, d2], message);

        // when
        let result = true;
        let error = null;
        try {
          bipSchnorr.verify(convert.pointToBuffer(pubKey1.add(pubKey2)), message, signature);
        } catch (e) {
          result = false;
          error = e;
        }

        // then
        assert.strictEqual(result, true, error);
        assert.strictEqual(error, null);
      });
    }

    for (let i = 1; i <= NUM_RANDOM_TESTS / 8; i++) {
      const message = randomBuffer(32);

      it('can aggregate signatures of ' + NUM_RANDOM_TESTS + ' random private keys over the same message, run #' + i, (done) => {
        // given
        const privateKeys = [];
        let sumPubKey = null;
        for (let i = 0; i < NUM_RANDOM_TESTS; i++) {
          const d = randomInt(32);
          const P = G.multiply(d);
          if (i === 0) {
            sumPubKey = P;
          } else {
            sumPubKey = sumPubKey.add(P);
          }
          privateKeys.push(d);
        }
        const signature = bipSchnorr.naiveKeyAggregation(privateKeys, message);

        // when
        let result = true;
        let error = null;
        try {
          bipSchnorr.verify(convert.pointToBuffer(sumPubKey), message, signature);
        } catch (e) {
          result = false;
          error = e;
        }

        // then
        assert.strictEqual(result, true, error);
        assert.strictEqual(error, null);

        done();
      }).timeout(RANDOM_TEST_TIMEOUT);
    }
  });

  describe('muSigNonInteractive', () => {
    for (let i = 1; i <= NUM_RANDOM_TESTS / 2; i++) {
      it('can aggregate signatures of two random private keys over same message, run #' + i, () => {
        // given
        const x1 = randomInt(32);
        const x2 = randomInt(32);
        const X1 = G.multiply(x1);
        const X2 = G.multiply(x2);
        const L = convert.hash(Buffer.concat([convert.pointToBuffer(X1), convert.pointToBuffer(X2)]));
        const a1 = convert.bufferToInt(convert.hash(Buffer.concat([L, convert.pointToBuffer(X1)])));
        const a2 = convert.bufferToInt(convert.hash(Buffer.concat([L, convert.pointToBuffer(X2)])));
        const X = X1.multiply(a1).add(X2.multiply(a2));
        const message = randomBuffer(32);
        const signature = bipSchnorr.muSigNonInteractive([x1, x2], message);

        // when
        let result = true;
        let error = null;
        try {
          bipSchnorr.verify(convert.pointToBuffer(X), message, signature);
        } catch (e) {
          result = false;
          error = e;
        }

        // then
        assert.strictEqual(result, true, error);
        assert.strictEqual(error, null);
      });
    }

    for (let i = 1; i <= NUM_RANDOM_TESTS / 8; i++) {
      const message = randomBuffer(32);

      it('can aggregate signatures of ' + NUM_RANDOM_TESTS + ' random private keys over the same message, run #' + i, (done) => {
        // given
        const privateKeys = [];
        const publicKeys = [];
        let pubKeyBuf = null;
        for (let i = 0; i < NUM_RANDOM_TESTS; i++) {
          const xi = randomInt(32);
          const Xi = G.multiply(xi);
          if (i === 0) {
            pubKeyBuf = convert.pointToBuffer(Xi);
          } else {
            pubKeyBuf = Buffer.concat([pubKeyBuf, convert.pointToBuffer(Xi)]);
          }
          privateKeys.push(xi);
          publicKeys.push(Xi);
        }
        const L = convert.hash(pubKeyBuf);
        let X = null;
        for (let i = 0; i < NUM_RANDOM_TESTS; i++) {
          const a = convert.bufferToInt(convert.hash(Buffer.concat([L, convert.pointToBuffer(publicKeys[i])])));
          if (i === 0) {
            X = publicKeys[i].multiply(a);
          } else {
            X = X.add(publicKeys[i].multiply(a));
          }
        }
        const signature = bipSchnorr.muSigNonInteractive(privateKeys, message);

        // when
        let result = true;
        let error = null;
        try {
          bipSchnorr.verify(convert.pointToBuffer(X), message, signature);
        } catch (e) {
          result = false;
          error = e;
        }

        // then
        assert.strictEqual(result, true, error);
        assert.strictEqual(error, null);

        done();
      }).timeout(RANDOM_TEST_TIMEOUT);
    }
  });
});
