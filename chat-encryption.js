import { getContract } from "./contract-constants.js";

const UseTokenCompression = true;
const tokenAESIVSize = 64;
const chatAESIVSize = 128;
let localKeys = null;

/**
 * Converts bytes array to CryptoJS word array
 * @param {Array.<Uint8>} ba array of bytes
 * @returns {CryptoJS.lib.WordArray}
 */
function byteArrayToWordArray(ba) {
  var wa = [],
    i;
  for (i = 0; i < ba.length; i++) {
    const currIndex = (i / 4) | 0;
    if (wa.length == currIndex) wa.push(0);
    wa[(i / 4) | 0] += ba[i] << (24 - 8 * (i % 4));
  }

  return CryptoJS.lib.WordArray.create(wa, ba.length);
}
/**
 * Deconstructs int in 4(max) bytes
 * @param {int} word 32-bit int
 * @param {int} length sig bytes
 * @returns
 */
function wordToByteArray(word, length) {
  var ba = [],
    i,
    xFF = 0xff;
  if (length > 0) ba.push((word >>> 24) & xFF);
  if (length > 1) ba.push((word >>> 16) & xFF);
  if (length > 2) ba.push((word >>> 8) & xFF);
  if (length > 3) ba.push((word >>> 0) & xFF);

  return ba;
}
/**
 * Transforms CryptoJS word array to byte array
 * @param {Array.<CryptoJS.lib.WordArray>} wordArray
 * @param {int} length may be get rid of it?
 * @returns {Array.<UInt8>}
 */
function wordArrayToByteArray(wordArray, length) {
  if (
    wordArray.hasOwnProperty("sigBytes") &&
    wordArray.hasOwnProperty("words")
  ) {
    length = wordArray.sigBytes;
    wordArray = wordArray.words;
  }

  var result = [],
    bytes,
    i = 0;
  while (length > 0) {
    bytes = wordToByteArray(wordArray[i], Math.min(4, length));
    length -= bytes.length;
    result.push(bytes);
    i++;
  }
  return [].concat.apply([], result);
}

export class ChatEncryption {
  constructor(keys) {
    this.encKeys = keys;
  }
  /**
   * Encrypts token by ECIES(ECDH shared key => AES)
   * @param {string} to Ethereum address
   * @param {string} token
   * @param {*} encKeys elliptic secp256k1 key pair
   * @returns {Array.<UInt8>}
   */
  async encryptTokenTo(to, token) {
    const contract = await getContract();

    const receiverPublicEncKey = (await contract.getEncryptionKeyByAddress(to))
      .toString()
      .substring(2);

    const ec = new elliptic.ec("secp256k1");
    const sharedKey = this.encKeys
      .derive(ec.keyFromPublic(receiverPublicEncKey, "hex").getPublic())
      .toString(16);
    const sharedKeyBytes = CryptoJS.enc.Hex.parse(sharedKey);

    const iv = CryptoJS.lib.WordArray.random(tokenAESIVSize / 8); //arg in bytes

    const encryptedToken = CryptoJS.AES.encrypt(
      token, //attach signature?
      sharedKeyBytes,
      { iv: iv, mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.AnsiX923 }
    ); //add to bytes

    let len1 = 0,
      len2 = 0;
    const bytesRes = wordArrayToByteArray(iv, len1).concat(
      wordArrayToByteArray(encryptedToken.ciphertext, len2)
    );

    return bytesRes;
  }

  /**
   * Decrypts token by ECIES(ECDH shared key => AES)
   * @param {string} from Ethereum address
   * @param {string} token hex bytes string(ethers style)
   * @paran {*} encKeys elliptic secp256k1 key pair
   * @returns {string} ready to use token
   */
  async decryptTokenFrom(from, token) {
    const contract = await getContract();

    const tokenByteStr = token.substring(2);
    const tokenWordArray = CryptoJS.enc.Hex.parse(tokenByteStr); // words array

    const iv = CryptoJS.lib.WordArray.create(
      tokenWordArray.words.slice(0, tokenAESIVSize / 32)
    );
    const tokenWords = CryptoJS.lib.WordArray.create(
      //token
      tokenWordArray.words.slice(tokenAESIVSize / 32)
    );
    iv.words[0] = iv.words[0] >>> 0; //convert to unsigned
    iv.words[1] = iv.words[1] >>> 0;

    const receiverPublicEncKey = (
      await contract.getEncryptionKeyByAddress(from)
    )
      .toString()
      .substring(2);

    const ec = new elliptic.ec("secp256k1");
    const sharedKey = this.encKeys
      .derive(ec.keyFromPublic(receiverPublicEncKey, "hex").getPublic())
      .toString(16);
    const sharedKeyBytes = CryptoJS.enc.Hex.parse(sharedKey);

    const decryptedToken = CryptoJS.AES.decrypt(
      { ciphertext: tokenWords },
      sharedKeyBytes,
      { iv: iv, mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.AnsiX923 }
    ).toString(CryptoJS.enc.Utf8);

    return decryptedToken;
  }
}
