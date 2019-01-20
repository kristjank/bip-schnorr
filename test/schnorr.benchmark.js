const bipSchnorr = require('../src/bip-schnorr');
const Benchmark = require('benchmark');
const microtime = require('microtime');
const randomBytes = require('random-bytes');
const BigInteger = require('bigi');
const Buffer = require('safe-buffer').Buffer;
const ecurve = require('ecurve');

const BATCH_SIZES = [1, 2, 4, 8, 16, 32, 64];
const curve = ecurve.getCurveByName('secp256k1');
const G = curve.G;
const n = curve.n;

let startTime = 0;
let numberOfRuns = 0;
let processedSignatures = 0;

function benchmarkSign(size, privateKeys, messages) {
  return function () {
    try {
      for (let i = 0; i < size; i++) {
        const result = bipSchnorr.sign(privateKeys[i], messages[i]);
        if (!result || result.length !== 64) {
          console.error('Signing failed!');
        }
      }
      processedSignatures += size;
      numberOfRuns++;
    } catch (e) {
      console.error(e);
    }
  };
}

function benchmarkVerify(size, publicKeys, messages, signatures) {
  return function () {
    try {
      for (let i = 0; i < size; i++) {
        bipSchnorr.verify(publicKeys[i], messages[i], signatures[i]);
      }
      processedSignatures += size;
      numberOfRuns++;
    } catch (e) {
      console.error(e);
    }
  };
}

function benchmarkBatchVerify(size, publicKeys, messages, signatures) {
  return function () {
    try {
      bipSchnorr.batchVerify(publicKeys, messages, signatures);
      processedSignatures += size;
      numberOfRuns++;
    } catch (e) {
      console.error(e);
    }
  };
}

function benchmarkAggregateSignatures(size, privateKeys, messages) {
  return function () {
    try {
      const result = bipSchnorr.aggregateSignatures(privateKeys, messages[0]);
      if (!result || result.length !== 64) {
        console.error('Aggregating signatures failed!');
      }
      processedSignatures += size;
      numberOfRuns++;
    } catch (e) {
      console.error(e);
    }
  }
}

function randomBuffer(bytes) {
  return Buffer.from(randomBytes.sync(bytes));
}

const onStart = () => {
  startTime = microtime.now();
  processedSignatures = 0;
  numberOfRuns = 0;
};
const onComplete = (event) => {
  const elapsedTime = microtime.now() - startTime;
  const signaturesPerSecond = Math.round(processedSignatures / (elapsedTime / 1000000));
  const microsecondsPerRun = Math.round(elapsedTime / numberOfRuns);
  console.log(`${event.target} ${microsecondsPerRun} us/op ${signaturesPerSecond} sig/s`);
};

// Sign
BATCH_SIZES.forEach(size => {
  const privateKeys = new Array(size);
  const messages = new Array(size);
  for (let i = 0; i < size; i++) {
    privateKeys[i] = BigInteger.fromBuffer(randomBuffer(32)).mod(n);
    messages[i] = randomBuffer(32);
  }
  new Benchmark('Sign (batch size: ' + size + ')', benchmarkSign(size, privateKeys, messages), {
    onStart,
    onComplete,
  }).run();
});

// Verify
BATCH_SIZES.forEach(size => {
  const privateKeys = new Array(size);
  const publicKeys = new Array(size);
  const messages = new Array(size);
  const signatures = new Array(size);
  for (let i = 0; i < size; i++) {
    privateKeys[i] = BigInteger.fromBuffer(randomBuffer(32)).mod(n);
    publicKeys[i] = G.multiply(privateKeys[i]).getEncoded(true);
    messages[i] = randomBuffer(32);
    signatures[i] = bipSchnorr.sign(privateKeys[i], messages[i]);
  }
  new Benchmark('Verify (batch size: ' + size + ')', benchmarkVerify(size, publicKeys, messages, signatures), {
    onStart,
    onComplete,
  }).run();
});

// Batch Verify
BATCH_SIZES.forEach(size => {
  const privateKeys = new Array(size);
  const publicKeys = new Array(size);
  const messages = new Array(size);
  const signatures = new Array(size);
  for (let i = 0; i < size; i++) {
    privateKeys[i] = BigInteger.fromBuffer(randomBuffer(32)).mod(n);
    publicKeys[i] = G.multiply(privateKeys[i]).getEncoded(true);
    messages[i] = randomBuffer(32);
    signatures[i] = bipSchnorr.sign(privateKeys[i], messages[i]);
  }
  new Benchmark('Batch Verify (batch size: ' + size + ')', benchmarkBatchVerify(size, publicKeys, messages, signatures), {
    onStart,
    onComplete,
  }).run();
});

// Aggregate Signatures
BATCH_SIZES.forEach(size => {
  const privateKeys = new Array(size);
  const publicKeys = new Array(size);
  const messages = new Array(size);
  const signatures = new Array(size);
  for (let i = 0; i < size; i++) {
    privateKeys[i] = BigInteger.fromBuffer(randomBuffer(32)).mod(n);
    publicKeys[i] = G.multiply(privateKeys[i]).getEncoded(true);
    messages[i] = randomBuffer(32);
    signatures[i] = bipSchnorr.sign(privateKeys[i], messages[i]);
  }
  new Benchmark('Aggregate Signatures (batch size: ' + size + ')', benchmarkAggregateSignatures(size, privateKeys, messages), {
    onStart,
    onComplete,
  }).run();
});