const EC = require("elliptic").ec;
const ec = new EC("secp256k1");
const keccak256 = require("js-sha3").keccak256;
const crypto = require("crypto");
const eddsa = require("circomlib").eddsa;
const babyJub = require("circomlib").babyJub;
const Scalar = require("ffjavascript").Scalar;
const utilsScalar = require("ffjavascript").utils;

const txUtils = require("./tx-utils");
const utils = require("./utils");

module.exports = class HermezAccount {
    constructor(privateKey) {
        if (privateKey) {
            if (typeof(privateKey) != "string") {
                this.privateKey = Scalar.e(privateKey).toString(16);
            } else {
                this.privateKey = privateKey;
            }
            while (this.privateKey.length < 64) this.privateKey = "0" + this.privateKey;
        } else {
            this.privateKey = crypto.randomBytes(32).toString("hex");
        }

        // Get secp256k1 generator point
        const generatorPoint = ec.g;

        // Public Key Coordinates calculated via Elliptic Curve Multiplication
        // PublicKeyCoordinates = privateKey * generatorPoint
        const pubKeyCoordinates = generatorPoint.mul(this.privateKey);

        const x = pubKeyCoordinates.getX().toString("hex");
        const y = pubKeyCoordinates.getY().toString("hex");

        // Public Key = X and Y concatenated
        const publicKey = x + y;

        // Use Keccak-256 hash function to get public key hash
        const hashOfPublicKey = keccak256(Buffer.from(publicKey, "hex"));

        // Convert hash to buffer
        const ethAddressBuffer = Buffer.from(hashOfPublicKey, "hex");

        // Ethereum Address is '0x' concatenated with last 20 bytes
        // of the public key hash
        const ethAddress = ethAddressBuffer.slice(-20).toString("hex");
        this.ethAddr = `0x${ethAddress}`;

        // Derive a private key wit a hash
        this.rollupPrvKey = Buffer.from(keccak256("HERMEZ_MOCK_ACCOUNT" + this.privateKey), "hex");

        const bjPubKey = eddsa.prv2pub(this.rollupPrvKey);

        this.ax = bjPubKey[0].toString(16);
        this.ay = bjPubKey[1].toString(16);

        const compressedBuff = babyJub.packPoint(bjPubKey);
        
        this.sign = 0;
        if (compressedBuff[31] & 0x80) {
            this.sign = 1;
        }

        this.bjjCompressed = utils.padZeros((utilsScalar.leBuff2int(compressedBuff)).toString(16), 64);
    }

    /**
     * Sign rollup transaction 
     * adds signature to the transaction
     * adds sender data to the transaction
     * @param {Object} tx - Transaction object
     */
    signTx(tx) {
        const h = txUtils.buildHashSig(tx);

        const signature = eddsa.signPoseidon(this.rollupPrvKey, h);
        tx.r8x = signature.R8[0];
        tx.r8y = signature.R8[1];
        tx.s = signature.S;
        tx.fromAx = this.ax;
        tx.fromAy = this.ay;
    }
};
