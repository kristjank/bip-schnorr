/* global describe, it, beforeEach */
const assert = require('assert');
const Buffer = require('safe-buffer').Buffer;
const BigInteger = require('bigi');
const bipSchnorr = require('../src/bip-schnorr');
const convert = require('../src/convert');
const ecurve = require('ecurve');

const curve = ecurve.getCurveByName('secp256k1');
const G = curve.G;

const testVectors = require('./test-vectors.json');

describe('test vectors', () => {
  describe('sign', () => {
    testVectors
      .filter(vec => vec.d !== null)
      .forEach(vec => {
        it('can sign ' + vec.d, () => {
          // given
          const d = BigInteger.fromHex(vec.d);
          const m = Buffer.from(vec.m, 'hex');

          // when
          const result = bipSchnorr.sign(d, m);

          // then
          assert.strictEqual(result.toString('hex'), vec.sig.toLowerCase());
        });
      });
  });

  describe('verify', () => {
    testVectors
      .forEach(vec => {
        it('can verify ' + (vec.comment || vec.d), () => {
          // given
          const pk = Buffer.from(vec.pk, 'hex');
          const m = Buffer.from(vec.m, 'hex');
          const sig = Buffer.from(vec.sig, 'hex');
          const expectedResult = vec.result;

          // when
          let result = true;
          let error = null;
          try {
            bipSchnorr.verify(pk, m, sig);
          } catch (e) {
            result = false;
            error = e;
          }

          // then
          assert.strictEqual(result, expectedResult, error);
          if (!expectedResult) {
            assert.strictEqual(error.message, vec.expectedError);
          }
        });
      });
  });

  describe('batchVerify', () => {
    it('can batch verify all positive test cases', () => {
      // given
      const positiveVectors = testVectors.filter(vec => vec.result);
      const pubKeys = positiveVectors.map(vec => Buffer.from(vec.pk, 'hex'));
      const messages = positiveVectors.map(vec => Buffer.from(vec.m, 'hex'));
      const signatures = positiveVectors.map(vec => Buffer.from(vec.sig, 'hex'));

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
    });

    it('fails on one invalid signature', () => {
      // given
      const positiveVectors = testVectors.filter(vec => vec.result);
      const pubKeys = positiveVectors.map(vec => Buffer.from(vec.pk, 'hex'));
      const messages = positiveVectors.map(vec => Buffer.from(vec.m, 'hex'));
      const signatures = positiveVectors.map(vec => Buffer.from(vec.sig, 'hex'));
      const nagativeVector = testVectors.filter(vec => !vec.result)[0];
      pubKeys.push(Buffer.from(nagativeVector.pk, 'hex'));
      messages.push(Buffer.from(nagativeVector.m, 'hex'));
      signatures.push(Buffer.from(nagativeVector.sig, 'hex'));

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
      assert.strictEqual(result, false, error);
      assert.strictEqual(error.message, 'signature verification failed');
    });
  });

  describe('naiveKeyAggregation', () => {
    const vectorsWithPrivateKeys = testVectors
      .filter(vec => vec.d !== null)
      .filter(vec => BigInteger.fromHex(vec.d).compareTo(BigInteger.ONE) > 0);
    const vec1 = vectorsWithPrivateKeys[0];
    const d1 = BigInteger.fromHex(vectorsWithPrivateKeys[0].d);
    const d2 = BigInteger.fromHex(vectorsWithPrivateKeys[1].d);
    const d3 = BigInteger.fromHex(vectorsWithPrivateKeys[2].d);
    const P1 = G.multiply(d1);
    const P2 = G.multiply(d2);
    const P3 = G.multiply(d3);
    const P = P1.add(P2).add(P3);

    it('can sign and verify two aggregated signatures over same message', () => {
      // given
      const m = Buffer.from(vec1.m, 'hex');
      const signature = bipSchnorr.naiveKeyAggregation([d1, d2], m);

      // when
      let result = false;
      try {
        bipSchnorr.verify(convert.pointToBuffer(P1.add(P2)), m, signature);
        result = true;
      } catch (e) {
        result = false;
      }
      assert.strictEqual(result, true);
    });

    it('can sign and verify two more aggregated signatures over same message', () => {
      // given
      const m = Buffer.from(vec1.m, 'hex');
      const signature = bipSchnorr.naiveKeyAggregation([d2, d3], m);

      // when
      let result = false;
      try {
        bipSchnorr.verify(convert.pointToBuffer(P2.add(P3)), m, signature);
        result = true;
      } catch (e) {
        result = false;
      }
      assert.strictEqual(result, true);
    });

    it('can sign and verify three aggregated signatures over same message', () => {
      // given
      const m = Buffer.from(vec1.m, 'hex');
      const signature = bipSchnorr.naiveKeyAggregation([d1, d2, d3], m);

      // when
      let result = false;
      try {
        bipSchnorr.verify(convert.pointToBuffer(P), m, signature);
        result = true;
      } catch (e) {
        result = false;
      }
      assert.strictEqual(result, true);
    });

    it('can aggregate and verify example in README', () => {
      const privateKey1 = BigInteger.fromHex('B7E151628AED2A6ABF7158809CF4F3C762E7160F38B4DA56A784D9045190CFEF');
      const privateKey2 = BigInteger.fromHex('C90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B14E5C7');
      const message = Buffer.from('243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89', 'hex');
      const aggregatedSignature = bipSchnorr.naiveKeyAggregation([privateKey1, privateKey2], message);
      assert.strictEqual(aggregatedSignature.toString('hex'), 'd60d7f81c15d57b04f8f6074de17f1b9eef2e0a9c9b2e93550c15b45d6998dc24ef5e393b356e7c334f36cee15e0f5f1e9ce06e7911793ddb9bd922d545b7525');

      // verifying an aggregated signature
      const publicKey1 = Buffer.from('02DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659', 'hex');
      const publicKey2 = Buffer.from('03FAC2114C2FBB091527EB7C64ECB11F8021CB45E8E7809D3C0938E4B8C0E5F84B', 'hex');
      const sumOfPublicKeys = convert.pubKeyToPoint(publicKey1).add(convert.pubKeyToPoint(publicKey2));
      let result = false;
      try {
        bipSchnorr.verify(convert.pointToBuffer(sumOfPublicKeys), message, aggregatedSignature);
        result = true;
      } catch (e) {
        result = false;
      }
      assert.strictEqual(convert.pointToBuffer(sumOfPublicKeys).toString('hex'), '03f0a6305d39a34582ba49a78bdf38ced935b3efce1e889d6820103665f35ee45b');
      assert.strictEqual(result, true);
    });
  });

  describe('muSigNonInteractive', () => {
    const vectorsWithPrivateKeys = testVectors
      .filter(vec => vec.d !== null)
      .filter(vec => BigInteger.fromHex(vec.d).compareTo(BigInteger.ONE) > 0);
    const vec1 = vectorsWithPrivateKeys[0];
    const x1 = BigInteger.fromHex(vectorsWithPrivateKeys[0].d);
    const x2 = BigInteger.fromHex(vectorsWithPrivateKeys[1].d);
    const x3 = BigInteger.fromHex(vectorsWithPrivateKeys[2].d);
    const X1 = G.multiply(x1);
    const X2 = G.multiply(x2);
    const X3 = G.multiply(x3);

    it('can sign and verify two aggregated signatures over same message', () => {
      // given
      const m = Buffer.from(vec1.m, 'hex');
      const L = convert.hash(Buffer.concat([convert.pointToBuffer(X1), convert.pointToBuffer(X2)]));
      const a1 = convert.bufferToInt(convert.hash(Buffer.concat([L, convert.pointToBuffer(X1)])));
      const a2 = convert.bufferToInt(convert.hash(Buffer.concat([L, convert.pointToBuffer(X2)])));
      const X = X1.multiply(a1).add(X2.multiply(a2));
      const signature = bipSchnorr.muSigNonInteractive([x1, x2], m);

      // when
      let result = false;
      try {
        bipSchnorr.verify(convert.pointToBuffer(X), m, signature);
        result = true;
      } catch (e) {
        result = false;
      }
      assert.strictEqual(result, true);
    });

    it('can sign and verify two more aggregated signatures over same message', () => {
      // given
      const L = convert.hash(Buffer.concat([convert.pointToBuffer(X2), convert.pointToBuffer(X3)]));
      const a2 = convert.bufferToInt(convert.hash(Buffer.concat([L, convert.pointToBuffer(X2)])));
      const a3 = convert.bufferToInt(convert.hash(Buffer.concat([L, convert.pointToBuffer(X3)])));
      const X = X2.multiply(a2).add(X3.multiply(a3));
      const m = Buffer.from(vec1.m, 'hex');
      const signature = bipSchnorr.muSigNonInteractive([x2, x3], m);

      // when
      let result = false;
      try {
        bipSchnorr.verify(convert.pointToBuffer(X), m, signature);
        result = true;
      } catch (e) {
        result = false;
      }
      assert.strictEqual(result, true);
    });

    it('can sign and verify three aggregated signatures over same message', () => {
      // given
      const L = convert.hash(Buffer.concat([convert.pointToBuffer(X1), convert.pointToBuffer(X2), convert.pointToBuffer(X3)]));
      const a1 = convert.bufferToInt(convert.hash(Buffer.concat([L, convert.pointToBuffer(X1)])));
      const a2 = convert.bufferToInt(convert.hash(Buffer.concat([L, convert.pointToBuffer(X2)])));
      const a3 = convert.bufferToInt(convert.hash(Buffer.concat([L, convert.pointToBuffer(X3)])));
      const X = X1.multiply(a1).add(X2.multiply(a2)).add(X3.multiply(a3));
      const m = Buffer.from(vec1.m, 'hex');
      const signature = bipSchnorr.muSigNonInteractive([x1, x2, x3], m);

      // when
      let result = false;
      try {
        bipSchnorr.verify(convert.pointToBuffer(X), m, signature);
        result = true;
      } catch (e) {
        result = false;
      }
      assert.strictEqual(result, true);
    });

    it('can aggregate and verify example in README', () => {
      const privateKey1 = BigInteger.fromHex('B7E151628AED2A6ABF7158809CF4F3C762E7160F38B4DA56A784D9045190CFEF');
      const privateKey2 = BigInteger.fromHex('C90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B14E5C7');
      const message = Buffer.from('243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89', 'hex');
      const aggregatedSignature = bipSchnorr.muSigNonInteractive([privateKey1, privateKey2], message);
      assert.strictEqual(aggregatedSignature.toString('hex'), 'd60d7f81c15d57b04f8f6074de17f1b9eef2e0a9c9b2e93550c15b45d6998dc298fde09fcea69e99b195a371d7a7e879a40474c67e4b63fb2cd5c6b7a3058156');

      // verifying an aggregated signature
      const publicKey1 = Buffer.from('02DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659', 'hex');
      const publicKey2 = Buffer.from('03FAC2114C2FBB091527EB7C64ECB11F8021CB45E8E7809D3C0938E4B8C0E5F84B', 'hex');
      const L = convert.hash(Buffer.concat([publicKey1, publicKey2]));
      const a1 = convert.bufferToInt(convert.hash(Buffer.concat([L, publicKey1])));
      const a2 = convert.bufferToInt(convert.hash(Buffer.concat([L, publicKey2])));
      const X = convert.pubKeyToPoint(publicKey1).multiply(a1).add(convert.pubKeyToPoint(publicKey2).multiply(a2));
      let result = false;
      try {
        bipSchnorr.verify(convert.pointToBuffer(X), message, aggregatedSignature);
        result = true;
      } catch (e) {
        result = false;
      }
      assert.strictEqual(convert.pointToBuffer(X).toString('hex'), '03a6c519a533b1e8ff578672af695a6f7f8cebb29b7d391e5c5fcfb91dcd597fb8');
      assert.strictEqual(result, true);
    });
  });
});
