import "./ejs.min.js";
import { ethers } from "./ethers-5.1.esm.min.js";
import { contractAddress, abi } from "./contract-constants.js";
import "./elliptic.min.js";

const UseTokenCompression = true;
const tokenAESIVSize = 64;
const chatAESIVSize = 128;

let loggedIn = false;
const bodyElement = document.body;

//windows
const overlayElement = document.getElementById("overlay");
const registrationPopupWindow = document.getElementById("registration-window");
const signInPopupWindow = document.getElementById("signin-window");

const popupWindows = [registrationPopupWindow]; //signinPopup should not be closed by clicking on background

//elements
const connectButtonElement = document.getElementById("connectButton");
const signinButtonElement = document.getElementById("signinButton");
const downloadKeysButtonElement = document.getElementById("downloadKeysButton");
const proceedSignupButtonElement = document.getElementById("proceed-signup");
const showConnectionRequestsButton = document.getElementById(
  "connection-requests-dropdown-button"
);
const showContactsButton = document.getElementById("contacts-dropdown-button");
const connectionRequestsListElement = document.getElementById(
  "connection-requests-dropdown-list"
);
const contactsListElement = document.getElementById("contacts-dropdown-list");
const addContactButtonElement = document.getElementById("add-contact-button");
const chatHistoryElement = document.getElementById("chat-history");
const msgInputElement = document.getElementById("chat-input");
const msgSendButtonElement = document.getElementById("chat-send-message");
const chatLabelElement = document.getElementById("chat-selected-title");
const chatSelectListElement = document.getElementById("chat-select-list");
const openChatSelectListElemet = document.getElementById("chat-select-button");
const chatSelectArrow = document.getElementById("chat-select-arrow");
const singinKeysFileElement = document.getElementById("signin-keys-file");
const signinPasswordInputElement = document.getElementById(
  "signin-password-input"
);
const signinProceedButtonElement = document.getElementById("proceed-signin");

//events
connectButtonElement.onclick = connectMetamask;
showConnectionRequestsButton.onclick = showConnectionRequestsList;
overlayElement.onclick = hideAllWindowElements;
proceedSignupButtonElement.onclick = signUp;
downloadKeysButtonElement.onclick = downloadKeys;
showContactsButton.onclick = showContactsList;
addContactButtonElement.onclick = onAddContact;
openChatSelectListElemet.onclick = showChatSelectList;
singinKeysFileElement.onchange = readKeys;
signinProceedButtonElement.onclick = signIn;
msgSendButtonElement.onclick = function () {
  sendMsg(currentChatSession);
};
//msgInputElement.onkeypress somehow deprecated
document.addEventListener("keypress", function (event) {
  if (!event.altKey && !event.shiftKey && !event.ctrlKey)
    msgInputElement.focus({ focusVisible: true });
});
msgInputElement.addEventListener("keypress", function (event) {
  if (event.key == "Enter") {
    sendMsg(currentChatSession);
  }
});
document.onclick = function (event) {
  if (
    !contactsListElement.contains(event.target) &&
    !showContactsButton.contains(event.target)
  ) {
    console.log("close contacts!");
    contactsListElement.style.display = "none";
  }
  if (
    !connectionRequestsListElement.contains(event.target) &&
    !showConnectionRequestsButton.contains(event.target)
  ) {
    console.log("close conn reqs!");
    connectionRequestsListElement.style.display = "none";
  }
};

//state
let contactsAddresses = [];
let accountName = null;
let accountAddress = null;
let signalingMediumContract;
let accounts;
let encKeys = null;
let passwordedPrKey;
let passwordedPrKeyPromise = null;
const correctDecryptionSignature = "correct output";

let chatSessionsPerContactAddress = new Map();
let currentChatSession = null;

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

/**
 * Encrypts token by ECIES(ECDH shared key => AES)
 * @param {string} to Ethereum address
 * @param {string} token
 * @returns {Array.<UInt8>}
 */
async function encryptTokenTo(to, token) {
  const contract = await getContract();

  const receiverPublicEncKey = (await contract.getEncryptionKeyByAddress(to))
    .toString()
    .substring(2);

  const ec = new elliptic.ec("secp256k1");
  const sharedKey = encKeys
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
 * @returns {string} ready to use token
 */
async function decryptTokenFrom(from, token) {
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

  const receiverPublicEncKey = (await contract.getEncryptionKeyByAddress(from))
    .toString()
    .substring(2);

  const ec = new elliptic.ec("secp256k1");
  const sharedKey = encKeys
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
/**
 * Currently only removes local candidates
 * TODO: to compress ip adresses to 32bit number, mb replace candidates strings byt
 * @param {RTCSessionDescription} desc
 */
function minifyDesc(desc) {
  const sdp = desc.sdp;
  const lines = sdp.split("/r/n");

  // TODO
}
/**
 * Is invoked after WebRTC offer generation. Ecnrypts it and sends by contract to the counteragent(interlocutor)
 * @param {string} token
 * @param {string} to Ethereum address
 */
async function onRequestTokenGenerated(token, to) {
  console.log(`Request token aquired, offer is being sent: ${token}`);

  const contract = await getContract();

  const nameHash = await contract.getParticipantNameHashByAddress(to);

  const tokenBlob = token; //to pack desc here (TODO)
  const encryptedToken = await encryptTokenTo(to, tokenBlob);

  const txResp = await contract.initiateConnection(nameHash, encryptedToken);
  await txResp.wait(1);
}
/**
 * Is invoked after WebRTC answer generation. Ecnrypts it and sends by contract to the counteragent(interlocutor)
 * @param {string} token
 * @param {string} to Ethereum address
 */
async function onRequestAnswerTokenGenerated(token, to) {
  console.log(`Answer token aquired, answer is being sent: ${token}`);

  const contract = await getContract();

  const nameHash = await contract.getParticipantNameHashByAddress(to);

  const tokenBlob = token; // to pack desc (TODO)

  const encryptedToken = await encryptTokenTo(to, tokenBlob);

  const txResp = await contract.acceptConnection(nameHash, encryptedToken);
  await txResp.wait(1);
}

/**
 * Sets up a peer connection with all the event handlers
 * @param {ChatSession} chatSession chat session that the RTCPeerConnection is constructed for
 * @param {*} isOfferSide if the client offers connection
 * @returns RTCPeerConnection
 */
function makePeerConnection(chatSession, isOfferSide) {
  let peerConnection = undefined;
  let configuration = {
      //iceServers: [{ url: "stun:stun.gmx.net" }],
      iceServers: [{ url: "stun:stun.l.google.com:19302" }],
    },
    con = { optional: [{ DtlsSrtpKeyAgreement: true }] };
  try {
    peerConnection = new RTCPeerConnection(configuration, con);
  } catch (err) {
    Swal.fire({
      title: "Error!",
      text: "Cannot create peer connection!",
      icon: "error",
      confirmButtonText: "Cool",
    });
  }

  peerConnection.onicecandidate = async function (e) {
    if (e.candidate == null) {
      if (isOfferSide) {
        await onRequestTokenGenerated(
          JSON.stringify(peerConnection.localDescription),
          chatSession.answerAddr
        );
      } else {
        await onRequestAnswerTokenGenerated(
          JSON.stringify(peerConnection.localDescription),
          chatSession.offerAddr
        );
      }
    }
  };

  peerConnection.onconnectionstatechange = function (event) {
    switch (peerConnection.connectionState) {
      case "new":
      case "checking":
        logChat(null, "Connecting...", chatSession);
        break;
      case "connecting":
        logChat(null, "Connecting...", chatSession);
        break;
      case "connected":
        logChat(null, "Connection established!", chatSession);
        break;
      case "disconnected":
        logChat(null, "Oops, disconnected!", chatSession);
        break;
      case "closed":
        logChat(null, "Oops, disconnected!", chatSession);
        break;
      case "failed":
        logChat(null, "Connection failed!", chatSession);
        break;
      default:
        console.log(peerConnection.connectionState);
        logChat(null, "Looks like something gone wrong!", chatSession);
        break;
    }
  };
  //peerConnection.oniceconnectionstatechange = ;

  return peerConnection;
}
/**
 * Object that handles a chat state(1 object per chat). Also manages a corresponding WebRTC connection.
 * @param {string} offerAddr Ethereum address
 * @param {string} answerAddr Ethereum address
 * @param {string} offer WebRTC offer
 */
function ChatSession(offerAddr, answerAddr, offer = null) {
  const isOfferSide = offer == null;

  let chatSession = this;

  this.answerAddr = answerAddr;
  this.offerAddr = offerAddr;
  this.oppositeAddr = isOfferSide ? answerAddr : offerAddr;

  this.dataChannel = null;

  this.chatHistory = "";
  this.unreadMsgs = 0;

  this.peerConnection = makePeerConnection(this, isOfferSide);

  this.changed = false;
}

/**
 * Can't make the constructor async. Should be called after ChatSession object is constructed.
 * Initializes datachannel and most of the event handlers.
 * @param {ChatSession} chatSession
 * @param {string} offer WebRTC offer from the potential interlocutor
 */
async function initChatSession(chatSession, offer = null) {
  var sdpConstraints = {
    optional: [],
  };

  chatSession.changed = true;

  let isOfferSide = chatSession.answerAddr == chatSession.oppositeAddr;
  let peerConnection = chatSession.peerConnection;

  const dcOnMessage = async function (msg) {
    console.log("got message: " + msg.data);

    const contract = await getContract();

    const name = await contract.getParticipantNameByAddress(
      chatSession.oppositeAddr
    );

    let textMsg = msg.data;
    const msgStruct = JSON.parse(msg.data);
    if (typeof msgStruct.message != "undefined") {
      textMsg = msgStruct.message;
    }

    console.log("got message processed: " + textMsg);

    logChat(name, textMsg, chatSession);
  };

  if (isOfferSide) {
    console.log("initing offering part");

    chatSession.dataChannel = chatSession.peerConnection.createDataChannel(
      chatSession.offerAddr + chatSession.answerAddr,
      {
        reliable: true,
      }
    );
    chatSession.dataChannel.onmessage = dcOnMessage;

    await chatSession.peerConnection.createOffer(
      async function (desc) {
        await chatSession.peerConnection.setLocalDescription(
          desc,
          function () {},
          function () {}
        );
      },
      function () {},
      sdpConstraints
    );
  } else {
    console.log("initing answering part");

    var offerDesc = new RTCSessionDescription(JSON.parse(offer));
    await chatSession.peerConnection.setRemoteDescription(offerDesc);
    await chatSession.peerConnection.createAnswer(
      async function (answerDesc) {
        console.log("Setting local description");
        await chatSession.peerConnection.setLocalDescription(answerDesc);
      },
      function () {},
      sdpConstraints
    );

    console.log("initing answering part 2");

    chatSession.peerConnection.ondatachannel = function (event) {
      console.log("Got data channel!");

      chatSession.dataChannel = event.channel;
      chatSession.dataChannel.onmessage = dcOnMessage;

      selectChatWith(chatSession.oppositeAddr);

      console.log(chatSession.dataChannel);
      console.log(event);
    };
  }

  console.log(JSON.stringify(chatSession));
}

/**
 * Escape html characters
 * @param {string} unsafe string potentially containing html code
 * @returns
 */
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
/**
 * Removes all childs from HTML element
 * @param {HTMLElement} element
 */
function clearElement(element) {
  var node = element;

  while (node.hasChildNodes()) {
    node.removeChild(node.firstChild);
  }
}

/**
 * Changes active chat both in state and UI
 * @param {string} address Ethereum address
 * @returns
 */
async function selectChatWith(address) {
  let activeChatSession = chatSessionsPerContactAddress.get(address);
  if (typeof activeChatSession == undefined) {
    console.log("Selected invalid chat");
    return;
  }

  currentChatSession = activeChatSession;

  clearElement(chatHistoryElement);
  chatHistoryElement.insertAdjacentHTML(
    "afterbegin",
    currentChatSession.chatHistory
  );
  chatHistoryElement.scrollTo(0, chatHistoryElement.scrollHeight);

  const contract = await getContract();
  const name = await contract.getParticipantNameByAddress(address);

  chatLabelElement.firstChild.nodeValue = name;
}

function addConnectionRequestToElementList(nickname, address) {
  const connectionRequestsListElElTemplate = document.querySelector(
    "#connection-request-list-element-ejs-template"
  ).innerHTML;

  showConnectionRequestsButton.classList.add("new-notification");

  connectionRequestsListElement.insertAdjacentHTML(
    "beforeend",
    ejs.compile(connectionRequestsListElElTemplate)({
      username: escapeHtml(nickname),
      address: address,
    })
  );

  document.getElementById(nickname + "-respond-button").onclick = function () {
    answerConnectionRequest(address);

    document.getElementById(address + "-connection-list-div").remove();

    connectionRequestsListElement.style.display = "none";
  };
}

/**
 * Make notification of connection request in the browser
 * @param {string} name name of the contact who is requesting connection
 */
function sendConnectionRequestNotification(name) {
  Notification.requestPermission().then((perm) => {
    if (perm === "granted") {
      new Notification("New connection request", {
        body: `Connection request from ${name}`,
      });
    }
  });
}
/**
 * Initialize handlers for contract events: OfferMade and AnswerMade.
 * These handlers perform WebRTC connection negotiation steps.
 */
async function initializeSignalingHandlers() {
  const contract = await getContract();

  const requestsFilter = contract.filters.OfferMade(accountAddress, null);
  const answersFilter = contract.filters.AnswerMade(accountAddress, null);

  contract.on(requestsFilter, async function (to, from) {
    console.log("Got request event");
    console.log(to);

    const address = from;
    const name = await contract.getParticipantNameByAddress(address);

    addConnectionRequestToElementList(name, address);
    sendConnectionRequestNotification(name);
  });
  contract.on(answersFilter, async function (to, from) {
    console.log("Got answer event");
    console.log(to);

    const address = from; //
    const name = await contract.getParticipantNameByAddress(address);

    const chatSession = chatSessionsPerContactAddress.get(address);
    if (typeof chatSession == "undefined") {
      console.log(
        "Invalid address. Answer is not expected since connection was not offered."
      );
      return;
    }

    const encryptedAnswer =
      await contract.getConnectionRequestAnswerTokenByAddresses(
        accountAddress,
        address
      );
    const answerRawBlob = await decryptTokenFrom(from, encryptedAnswer);

    const answerRaw = answerRawBlob; // to unpack desc TODO

    console.log("Type of answer raw", typeof answerRaw);
    console.log("Answer raw", answerRaw);
    let answer = JSON.parse(answerRaw);
    console.log("Got answer, setting remote: " + answerRaw);
    let answerDesc = new RTCSessionDescription(answer);
    await chatSession.peerConnection.setRemoteDescription(answerDesc);

    selectChatWith(chatSession.oppositeAddr);
  });
}

/**
 * Adds contact to UI contact list
 * @param {string} nickname contact name
 * @param {*} addr contact address
 * @param {*} emptyPlaceholder is placeholder when there are no contacts in list
 * @returns
 */
function addContactToElementList(nickname, addr, emptyPlaceholder = false) {
  const contactsListElElTemplate = document.querySelector(
    "#contact-list-element-ejs-template"
  ).innerHTML;

  //contact
  contactsListElement.insertAdjacentHTML(
    "beforeend",
    ejs.compile(contactsListElElTemplate)({
      username: nickname,
      address: "0x.." + addr.substr(37, 5),
      emptyPlaceholder: emptyPlaceholder,
    })
  );

  if (emptyPlaceholder) return;

  document.getElementById(nickname + "-request-button").onclick = function () {
    requestConnectionTo(addr);

    contactsListElement.style.display = "none";
  };
  const copyAddressButtonEl = document.getElementById(
    nickname + "-address-copy-button"
  );
  copyAddressButtonEl.onclick = function () {
    const tipEl = document.getElementById(nickname + "-address-copy-tip");

    tipEl.textContent = "Copied!";
    setTimeout(() => {
      tipEl.textContent = "Copy";
    }, 2500);

    navigator.clipboard.writeText(addr);
  };
}

/**
 * Add new selectable chat to the chat select menu
 * @param {string} nickname Name of the participant registered in the contract
 * @param {string} address Hex-like ethereum address
 */
function addChatToElementList(nickname, address) {
  const chatListElElTemplate = document.querySelector(
    "#chat-list-element-ejs-template"
  ).innerHTML;

  chatSelectListElement.insertAdjacentHTML(
    "beforeend",
    ejs.compile(chatListElElTemplate)({
      username: escapeHtml(nickname),
      address: address,
    })
  );

  const chatListElement = document.getElementById(address + "-chat-list-div");
  chatListElement.onclick = function () {
    selectChatWith(address);
    chatListElement.classList.remove("new-notification");
    showChatSelectList();
  };
}
/**
 * Add new selectable chat to the chat select menu if such option doesn't already exist(in html)
 * @param {string} address Hex-like ethereum address of the corresponding participant(interlocutor)
 * @returns
 */
async function addChatToElementListByAddressIfNotExists(address) {
  const alreadyExists = document.getElementById(address + "-chat-list-div");
  if (alreadyExists) return;

  const contract = await getContract();

  const nickname = await contract.getParticipantNameByAddress(address);
  addChatToElementList(nickname, address);
}

function onMetamaskConnect() {
  if (document.cookie) {
    initContactsFromCookies(); //todo: move to "onSignIn", silly to load contacts without beign signed in
  }
}

/**
 * Adds a cookie with specified params
 * @param {string} name
 * @param {string} value
 * @param {int} days
 */
function createCookie(name, value, days) {
  if (days) {
    var date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    var expires = "; expires=" + date.toGMTString();
  } else var expires = "";
  document.cookie = name + "=" + value + expires + "; path=/";
}

/**
 * Read the value of the specified cookie
 * @param {string} name
 * @returns {string|null}
 */
function readCookie(name) {
  var nameEQ = name + "=";
  var ca = document.cookie.split(";");
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == " ") c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}
/**
 * Erase specified cookie
 * @param {string} name
 */
function eraseCookie(name) {
  createCookie(name, "", -1);
}

/**
 * Load all the contacts stored in cookies
 */
async function initContactsFromCookies() {
  const keyBase = "contact";
  let currentIndex = 0;
  let currentContactAddress;
  let emptyRemoved = false;
  while (
    (currentContactAddress = readCookie(keyBase + currentIndex.toString())) !=
    null
  ) {
    const contract = await getContract();
    const isParticipant = await contract.isParticipantAddress(
      currentContactAddress
    );
    if (isParticipant) {
      const contactName = await contract.getParticipantNameByAddress(
        currentContactAddress
      );

      console.log("Contact added from cookies");
      addContactInner(currentContactAddress, false);
      addContactToElementList(contactName, currentContactAddress);

      if (!emptyRemoved) {
        const emptyEl = document.getElementById(
          "empty-placeholder-contact-list-element"
        );
        if (typeof emptyEl != "undefined" && emptyEl != null) {
          emptyEl.remove();
        }

        emptyRemoved = true;
      }
    } else {
      eraseCookie(keyBase + currentIndex.toString());
    }
    currentIndex++;
  }
}

/**
 * Downloads locally made file in browser
 * @param {string} filename Name of the file to save
 * @param {*} text File content
 */
function download(filename, text) {
  var element = document.createElement("a");
  element.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(text)
  );
  element.setAttribute("download", filename);

  element.style.display = "none";
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

/**
 * Adds contact(in Model side of things), saving contact to state, both dynamic and permament(cookies)
 * @param {string} contactAddr Ethereum address of the contact
 * @param {*} addCookie Specifies wether to add corresponding cookie
 */
function addContactInner(contactAddr, addCookie = true) {
  if (addCookie) {
    createCookie(`contact${contactsAddresses.length}`, contactAddr, 1000);
  }
  contactsAddresses.push(contactAddr);
}
/**
 * Show the element with smooth effect of opacity transition(not working yet)
 * @param {HTMLElement} hiddenElement Supposed to be popup element that is hidden(by display property)
 */
function showWindowElement(hiddenElement) {
  hiddenElement.style.display = "block";
  hiddenElement.style.opacity = 0;
  hiddenElement.style.opacity = 1;
}
/**
 * Hide the element with smooth effect of opacity transition
 * @param {HTMLElement} element Supposed to be popup element that is hidden(by display property)
 */
function hideWindowElement(element) {
  element.style.opacity = 0;

  element.ontransitionend = function () {
    element.style.display = "none";
  };
}
/**
 * Unused
 * @param {HTMLElement} fromWindow
 * @param {HTMLElement} toWindow
 */
function transitionFromToWindow(fromWindow, toWindow) {
  hideWindowElement(fromWindow);
  showWindowElement(toWindow);
}
/**
 * Hides all popup windows(except sign in)
 */
function hideAllWindowElements() {
  for (let i = 0; i < popupWindows.length; i++) {
    hideWindowElement(popupWindows[i]);
  }
  overlayElement.style.display = "none";
}
/**
 * Returns true if metamask is installed otherwise returns false
 * @returns {bool}
 */
function metamaskInstalled() {
  return typeof window.ethereum != "undefined";
}
/**
 * Request access to metamask accounts, initializes contract event handlers(to move to sign in?) and unblocks sign in
 * @returns
 */
async function connectMetamask() {
  if (!metamaskInstalled()) {
    Swal.fire({
      title: "Error!",
      text: "You need to install Metamask to run this app!",
      icon: "error",
      confirmButtonText: "Cool",
    });
    console.log("Metamask is not installed!");
    return;
  }
  try {
    accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    connectButtonElement.disabled = true;
    connectButtonElement.style.backgroundColor = "#bdd4bc"; //"#00ff00"
    connectButtonElement.textContent = "0x..." + accounts[0].substr(35, 7);

    accountAddress = accounts[0];

    signinButtonElement.style.display = "block";
    signinButtonElement.onclick = onTrySignIn;

    await initializeSignalingHandlers();
  } catch (err) {
    console.log(err);
  }

  onMetamaskConnect();
}
/**
 * Returns signaling and registration smart-contract
 * @returns ethers.Contract
 */
async function getContract() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  return new ethers.Contract(contractAddress, abi, signer);
}
/**
 * Saves encryption keys as "keys.key" on the user's machine
 */
function downloadKeys() {
  download("keys.key", passwordedPrKey);

  downloadKeysButtonElement.style.opacity = 0;
  downloadKeysButtonElement.ontransitionend = () =>
    (downloadKeysButtonElement.style.display = "none");
}
/**
 * Opens Sign Up window
 */
function openRegistrationMenu() {
  overlayElement.style.display = "block";

  showWindowElement(registrationPopupWindow);
}
/**
 * Registers participant to smart contract using data from input fiels of registration window
 * @returns
 */
async function signUp() {
  const pwdEl = document.getElementById("password-input");
  const usernameEl = document.getElementById("username-input");

  let ec = new elliptic.ec("secp256k1");
  encKeys = ec.genKeyPair();

  console.log(encKeys.getPrivate("hex").toString());
  passwordedPrKey = CryptoJS.AES.encrypt(
    correctDecryptionSignature + encKeys.getPrivate("hex").toString(), //couple with signature so that we can know that password used for decryption was correct
    pwdEl.value
  ).toString();

  const publicEncKeyInStringBytes = "0x" + encKeys.getPublic(true, "hex");
  console.log(publicEncKeyInStringBytes);
  const contract = await getContract();

  const nameHash = CryptoJS.SHA256(usernameEl.value);
  const nameAlreadyRegistered = await contract.isParticipantNameHash(
    "0x" + nameHash
  );

  if (nameAlreadyRegistered) {
    Swal.fire({
      title: "Error!",
      text: "Name already registered!",
      icon: "error",
      confirmButtonText: "Cool",
    });

    return;
  }

  proceedSignupButtonElement.disabled = true;

  let txResp;
  try {
    txResp = await contract.register(
      usernameEl.value,
      publicEncKeyInStringBytes
    );
  } catch (e) {
    Swal.fire({
      title: "Error!",
      text: "Transaction error. Try shorter name.",
      icon: "error",
      confirmButtonText: "Cool",
    });
    proceedSignupButtonElement.disabled = false;
    return;
  }

  await txResp.wait(1);

  await trySignIn();

  downloadKeysButtonElement.style.display = "block";
  Swal.fire({
    title: "Warning",
    text: "Please, download the keys, otherwise you won't be able to sign in next time!",
    icon: "warning",
    confirmButtonText: "I understand",
  });
  hideAllWindowElements();
}
/**
 * Reads encrypted keys from the file input
 * @param {Event} event
 */
async function readKeys(event) {
  const file = event.target.files.item(0);
  passwordedPrKeyPromise = file.text();

  document.getElementById("signin-keys-file-label").textContent = file.name;
}
/**
 * Changes html and js states to indicate that person has signed in
 * @param {string} name
 */
function setSignedInState(name) {
  signinButtonElement.textContent = name;
  signinButtonElement.disabled = true;
  accountName = name;
  encKeys = encKeys; //enc keys should be initialized for correct sign in
}
/**
 * Starts sign in routine and returns true, if Metamask address is registered, otherwise returns false
 * @returns {bool}
 */
async function trySignIn() {
  const contract = await getContract();

  const isParticipantAddress = await contract.isParticipantAddress(accounts[0]);

  if (isParticipantAddress) {
    const participantName = await contract.getParticipantNameByAddress(
      accounts[0]
    );

    if (encKeys == null) {
      const greetingEl = document.getElementById("signin-greetings");
      greetingEl.textContent = "Welcome, " + participantName + "!";
      overlayElement.style.display = "block";
      showWindowElement(signInPopupWindow); //only do this if key uninitialized

      return true;
    }

    setSignedInState(participantName);

    return true;
  }

  return false;
}
/**
 * Performs sign in using user's input in Sign In window,
 * which means loading encrypted keys and decrypting them by user input password
 * @returns
 */
async function signIn() {
  const contract = await getContract();

  const participantName = await contract.getParticipantNameByAddress(
    accounts[0]
  );

  if (passwordedPrKeyPromise == null) {
    Swal.fire({
      title: "Error!",
      text: "You should first choose .keys file!",
      icon: "error",
      confirmButtonText: "Cool",
    });

    return;
  }

  const password = signinPasswordInputElement.value;

  passwordedPrKey = await passwordedPrKeyPromise;
  const bytes = CryptoJS.AES.decrypt(passwordedPrKey, password);
  let plainPrKey = bytes.toString(CryptoJS.enc.Utf8);
  if (!plainPrKey.includes(correctDecryptionSignature)) {
    Swal.fire({
      title: "Error!",
      text: "Wrong password",
      icon: "error",
      confirmButtonText: "Cool",
    });

    return;
  }
  plainPrKey = plainPrKey.substring(correctDecryptionSignature.length); //remove signature
  let ec = new elliptic.ec("secp256k1");
  encKeys = ec.keyFromPrivate(plainPrKey, "hex");

  const publicEncKeyInStringBytesExpected =
    await contract.getEncryptionKeyByAddress(accounts[0]);
  const publicEncKeyInStringBytesActual = "0x" + encKeys.getPublic(true, "hex");

  if (publicEncKeyInStringBytesExpected != publicEncKeyInStringBytesActual) {
    Swal.fire({
      title: "Error!",
      text: "Invalid key!",
      icon: "error",
      confirmButtonText: "Cool",
    });

    return;
  }

  setSignedInState(participantName);

  hideWindowElement(signInPopupWindow);
  overlayElement.style.display = "none";
}
/**
 * Starts Sign In routine if Metamsk address is registered, otherwise starts registration routine
 * @returns
 */
async function onTrySignIn() {
  if (!(await trySignIn())) {
    openRegistrationMenu();
    return;
  }
}
//may be create seperate util function that will not depend on html representation
/**
 * Makes encrypted WebRTC answer and writes it to the contract
 * Is only applicable if <address> offered connection(the corresponing WebRTC offer is written to the contract).
 * @param {string} address Ethereum address
 */
async function answerConnectionRequest(address) {
  console.log(`connected to ${address}`);

  const contract = await getContract();

  const encryptedOffer = await contract.getConnectionRequestTokenByAddresses(
    accountAddress,
    address
  );
  const offerBlob = await decryptTokenFrom(address, encryptedOffer);

  const offer = offerBlob; // to unpack desc (TODO)

  console.log(typeof offer);
  console.log("offer: " + offer);
  let chatSession = new ChatSession(address, accountAddress, offer);
  await initChatSession(chatSession, offer);
  chatSessionsPerContactAddress.set(address, chatSession);

  addChatToElementListByAddressIfNotExists(address);
  selectChatWith(address);
  logChat(null, "Answering connection request...", chatSession);
}
/**
 * Makes encrypted WebRTC offer and writes it to the contract
 * @param {string} address Ethereum address
 */
async function requestConnectionTo(address) {
  let chatSession = new ChatSession(accountAddress, address);
  await initChatSession(chatSession);
  chatSessionsPerContactAddress.set(address, chatSession);

  addChatToElementListByAddressIfNotExists(address);
  selectChatWith(address);
  logChat(null, "Requested connection...", chatSession);

  console.log(`requested connection to ${address}`);
}
/**
 * Called in app clickable elements events. Shows alerts if not all requirements are met.
 * Returns the bool that specifies whether the sign in was correctly performed.
 * @returns {bool}
 */
function onShowActiveChatLists() {
  if (typeof accounts == "undefined") {
    Swal.fire({
      title: "Error!",
      text: "You should first connect to Metamask!",
      icon: "error",
      confirmButtonText: "Cool",
    });
    return false;
  }
  if (accountName == null) {
    Swal.fire({
      title: "Error!",
      text: "You should sign in!",
      icon: "error",
      confirmButtonText: "Cool",
    });
    return false;
  }

  return true;
}
/**
 * Opens custom dropdown list for connection requests list
 * @returns
 */
function showConnectionRequestsList() {
  if (!onShowActiveChatLists()) return;

  if (connectionRequestsListElement.childNodes.length == 0) {
    return;
  }

  showConnectionRequestsButton.classList.remove("new-notification");

  const el = connectionRequestsListElement;

  if (el.childNodes.length == 0) {
    el.style.display = "none";
    return;
  }

  el.style.display = el.style.display == "block" ? "none" : "block";
}
/**
 * Opens custom dropdown list for contacts list
 * @returns
 */
function showContactsList() {
  if (!onShowActiveChatLists()) return;

  contactsListElement.style.display =
    contactsListElement.style.display == "block" ? "none" : "block";
}

/**
 * Opens custom dropdown list for chat selection list
 * @returns
 */
function showChatSelectList() {
  console.log("chats displayed");
  if (!onShowActiveChatLists()) return;
  console.log("chats displayed");
  if (chatSelectListElement.childNodes.length == 0) {
    return;
  }

  const el = chatSelectListElement;
  const arrow = chatSelectArrow;
  arrow.classList.remove("arrow-new-notification");
  if (el.style.display == "block") {
    arrow.classList.remove("chat-select-arrow-up");
    arrow.classList.add("chat-select-arrow-down");
    el.style.display = "none";
  } else {
    arrow.classList.add("chat-select-arrow-up");
    arrow.classList.remove("chat-select-arrow-down");
    el.style.display = "block";
  }
  console.log("chats displayed");
}

/**
 * Performs contact addition, both in the UI part and app state part
 */
async function onAddContact() {
  console.log("doing contact addition");

  const contract = await getContract();

  const newContactNameInputEl = document.getElementById("nickname-input");
  let contactName = newContactNameInputEl.value;

  if (contactName.substring(0, 2) === "0x" && contactName.length == 42) {
    contactName = await contract.getParticipantNameByAddress(contactName);
  }

  const contactNameHash = "0x" + CryptoJS.SHA256(contactName).toString();

  const isParticipant = await contract.isParticipantNameHash(contactNameHash);
  if (!isParticipant) {
    Swal.fire({
      title: "Error!",
      text: "Contact with such name is not registered!",
      icon: "error",
      confirmButtonText: "Cool",
    });
    return;
  }
  const contactAddress = await contract.getParticipantAddressByNameHash(
    contactNameHash
  );
  for (let i = 0; i < contactsAddresses.length; i++) {
    if (contactsAddresses[i] == contactAddress) {
      Swal.fire({
        title: "Error!",
        text: "Contact is already in your contacts list",
        icon: "error",
        confirmButtonText: "Cool",
      });

      return;
    }
  }

  //if okay
  //no such contact by address

  const emptyEl = document.getElementById(
    "empty-placeholder-contact-list-element"
  );
  if (typeof emptyEl != "undefined" && emptyEl != null) {
    emptyEl.remove();
  }

  addContactInner(contactAddress, true);
  addContactToElementList(contactName, contactAddress);
}
/**
 * Called when the message is written to the ChatSession history
 * @param {ChatSession} chatSession
 */
function onChatSessionMsg(chatSession) {
  if (chatSession != currentChatSession) {
    chatSelectArrow.classList.add("arrow-new-notification");

    document
      .getElementById(chatSession.oppositeAddr + "-chat-list-div")
      .classList.add("new-notification");
  }
}
/**
 * Sends message to the ChatSession's interlocutor
 * @param {ChatSession} chatSession
 * @returns
 */
function sendMsg(chatSession) {
  if (accountName == null) {
    Swal.fire({
      title: "Error!",
      text: "You need to sign in first!",
      icon: "error",
      confirmButtonText: "Cool",
    });
    return;
  }

  const msg = msgInputElement.value;

  console.log(JSON.stringify(chatSession));
  console.log(JSON.stringify(chatSession.peerConnection));
  console.log(JSON.stringify(chatSession.dataChannel));
  console.log(chatSession.peerConnection.ondatachannel);
  chatSession.dataChannel.send(JSON.stringify({ message: msg }));

  logChat(accountName, msg, chatSession);
  msgInputElement.value = "";
}
/**
 * Logs message in the UI part
 * @param {string} from Participant name or <null> if system message
 * @param {string} msg Message
 * @param {ChatSession} chatSession
 */
function logChat(from, msg, chatSession) {
  const msgTemplate =
    '<p > <span style="color:<%if (system){%>rgb(150,150,150) <%} else if (!self){%>red  <%}else{%> green <%}%>"> <%=from%>:</span> <span <%if (system){%> style="color:rgb(150,150,150)" <%}%> ><%=msg%></span> </p>';

  const isSystemMsg = from == null;

  //ejs is doing html escape
  const resultingElement = ejs.compile(msgTemplate)({
    from: isSystemMsg ? "system" : from,
    self: from == accountName,
    system: isSystemMsg,
    msg: msg,
  });
  chatSession.chatHistory += resultingElement; //may be just rerender all messages?
  onChatSessionMsg(chatSession);
  if (chatSession == currentChatSession) {
    chatHistoryElement.insertAdjacentHTML("beforeend", resultingElement);
    chatHistoryElement.scrollTo(0, chatHistoryElement.scrollHeight);
  }
  console.log(resultingElement);
}

Notification.requestPermission();
