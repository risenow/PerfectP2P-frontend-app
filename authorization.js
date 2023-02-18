import { getContract } from "./contract-constants.js";

const correctDecryptionSignature = "correct output";

/**
 *
 * @param {string} name name of the registrant
 * @param {string} password password for keys encryption
 * @param {*} callbacks onAlreadyRegistered, onBeforeRegistrationTx, onRegistrationTxReverted
 * @returns {user, encKeys} registered account name and corresponding encryption keys
 */
export async function registerUser(name, password, callbacks) {
  let ec = new elliptic.ec("secp256k1");
  const elEncKeys = ec.genKeyPair();

  passwordedPrKey = CryptoJS.AES.encrypt(
    correctDecryptionSignature + elEncKeys.getPrivate("hex").toString(), //couple with signature so that we can know that password used for decryption was correct
    password
  ).toString();

  const publicEncKeyInStringBytes = "0x" + elEncKeys.getPublic(true, "hex");
  console.log(publicEncKeyInStringBytes);
  const contract = await getContract();

  const nameHash = CryptoJS.SHA256(name);
  const nameAlreadyRegistered = await contract.isParticipantNameHash(
    "0x" + nameHash
  );

  if (nameAlreadyRegistered) {
    callbacks.onAlreadyRegistered();

    return null;
  }

  callbacks.onBeforeRegistrationTx();

  let txResp;
  try {
    txResp = await contract.register(name, publicEncKeyInStringBytes);
  } catch (e) {
    callbacks.onRegistrationTxReverted();
    return null;
  }

  await txResp.wait(1);

  return { user: name, encKeys: elEncKeys };
}

/**
 *
 * @param {*} password
 * @param {*} keysContent .keys file content
 * @param {*} callbacks onInvalidPassword, onInvalidKey
 * @returns {user:string, encKeys:EllipticKeys}
 */
export async function authorizeUser(password, keysContent, callbacks) {
  console.log("got keys content");
  console.log(keysContent);

  const addr = window.ethereum.accounts[0];

  const contract = await getContract();

  let res;

  const bytes = CryptoJS.AES.decrypt(keysContent, password);
  let plainPrKey = bytes.toString(CryptoJS.enc.Utf8);
  if (!plainPrKey.includes(correctDecryptionSignature)) {
    callbacks.onInvalidPassword();

    return null;
  }
  plainPrKey = plainPrKey.substring(correctDecryptionSignature.length); //remove signature
  console.log("decrypted pr key:");
  console.log(plainPrKey);
  let ec = new elliptic.ec("secp256k1");
  let elEncKeys = ec.keyFromPrivate(plainPrKey, "hex");

  console.log(elEncKeys);

  const publicEncKeyInStringBytesExpected =
    await contract.getEncryptionKeyByAddress(addr);
  const publicEncKeyInStringBytesActual =
    "0x" + elEncKeys.getPublic(true, "hex");

  if (publicEncKeyInStringBytesExpected != publicEncKeyInStringBytesActual) {
    callbacks.onInvalidKey();

    return null;
  }

  const name = await contract.getParticipantNameByAddress(addr);

  return { user: name, encKeys: elEncKeys };
}
