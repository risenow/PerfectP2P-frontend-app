import "./ejs.min.js";
import { ethers } from "./ethers-5.1.esm.min.js";
import { contractAddress, abi } from "./contract-constants.js";
import "./elliptic.min.js";

let loggedIn = false;

const bodyElement = document.body;

//windows
const overlayElement = document.getElementById("overlay");
const registrationPopupWindow = document.getElementById("registration-window");
const signInPopupWindow = document.getElementById("signin-window");

const popupWindows = [registrationPopupWindow, signInPopupWindow];

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

async function onRequestTokenGenerated(token, to) {
  console.log(`Request token aquired, offer sent: ${token}`);

  const contract = await getContract();

  const nameHash = await contract.getParticipantNameHashByAddress(to);

  const txResp = await contract.initiateConnection(
    nameHash,
    ethers.utils.toUtf8Bytes(token)
  );
  await txResp.wait(1);
}
async function onRequestAnswerTokenGenerated(token, to) {
  console.log(`Answer token aquired, answer sent: ${token}`);

  const contract = await getContract();

  const nameHash = await contract.getParticipantNameHashByAddress(to);

  const txResp = await contract.acceptConnection(
    nameHash,
    ethers.utils.toUtf8Bytes(token)
  );
  await txResp.wait(1);
}

//WebRTC
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

//logic
//escape shit from chatters and contacts
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function clearElement(element) {
  var node = element;

  while (node.hasChildNodes()) {
    node.removeChild(node.firstChild);
  }
}

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
  };
}

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

    const answerRaw = ethers.utils.toUtf8String(
      await contract.getConnectionRequestAnswerTokenByAddresses(
        accountAddress,
        address
      )
    );
    console.log("Answer raw", answerRaw);
    let answer = JSON.parse(answerRaw);
    console.log("Got answer, setting remote: " + answerRaw);
    let answerDesc = new RTCSessionDescription(answer);
    await chatSession.peerConnection.setRemoteDescription(answerDesc);

    selectChatWith(chatSession.oppositeAddr);
  });
}

function addContactToElementList(nickname, addr, emptyPlaceholder = false) {
  const contactsListElElTemplate = document.querySelector(
    "#contact-list-element-ejs-template"
  ).innerHTML;

  //contact
  contactsListElement.insertAdjacentHTML(
    "beforeend",
    ejs.compile(contactsListElElTemplate)({
      username: escapeHtml(nickname),
      emptyPlaceholder: emptyPlaceholder,
    })
  );

  if (emptyPlaceholder) return;
  document.getElementById(nickname + "-request-button").onclick = function () {
    requestConnectionTo(addr);
  };
}

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
async function addChatToElementListByAddressIfNotExists(address) {
  const alreadyExists = document.getElementById(address + "-chat-list-div");
  if (alreadyExists) return;

  const contract = await getContract();

  const nickname = await contract.getParticipantNameByAddress(address);
  addChatToElementList(nickname, address);
}

function onMetamaskConnect() {
  if (document.cookie) {
    initContactsFromCookies();
  }
}

function createCookie(name, value, days) {
  if (days) {
    var date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    var expires = "; expires=" + date.toGMTString();
  } else var expires = "";
  document.cookie = name + "=" + value + expires + "; path=/";
}

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

function eraseCookie(name) {
  createCookie(name, "", -1);
}

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

function addContactInner(contactAddr, addCookie = true) {
  if (addCookie) {
    createCookie(`contact${contactsAddresses.length}`, contactAddr, 1000);
  }
  contactsAddresses.push(contactAddr);
}

function showWindowElement(hiddenElement) {
  hiddenElement.style.display = "block";
  hiddenElement.style.opacity = 0;
  hiddenElement.style.opacity = 1;
}
overlayElement.ontransitionend;
function hideWindowElement(element) {
  element.style.opacity = 0;

  element.ontransitionend = function () {
    element.style.display = "none";
  };
}
function transitionFromToWindow(fromWindow, toWindow) {
  hideWindowElement(fromWindow);
  showWindowElement(toWindow);
}
function hideAllWindowElements() {
  for (let i = 0; i < popupWindows.length; i++) {
    hideWindowElement(popupWindows[i]);
  }
  overlayElement.style.display = "none";
}
function metamaskInstalled() {
  return typeof window.ethereum != "undefined";
}
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
async function getContract() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  return new ethers.Contract(contractAddress, abi, signer);
}
function downloadKeys() {
  download("keys.key", passwordedPrKey);

  downloadKeysButtonElement.style.opacity = 0;
  downloadKeysButtonElement.ontransitionend = () =>
    (downloadKeysButtonElement.style.display = "none");
}

function openRegistrationMenu() {
  overlayElement.style.display = "block";

  showWindowElement(registrationPopupWindow);
}
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
    icon: "error",
    confirmButtonText: "I understand",
  });
  hideAllWindowElements();
  //let bytes = CryptoJS.AES.decrypt(passwordedPrKey, pwdEl.value);
  //console.log(bytes.toString(CryptoJS.enc.Utf8));
}
async function readKeys(event) {
  const file = event.target.files.item(0);
  passwordedPrKeyPromise = file.text();

  document.getElementById("signin-keys-file-label").textContent = file.name;
}
function setSignedInState(name) {
  signinButtonElement.textContent = name;
  signinButtonElement.disabled = true;
  accountName = name;
  encKeys = encKeys; //enc keys should be initialized for correct sign in
}
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

  setSignedInState(participantName);

  hideWindowElement(signInPopupWindow);
  overlayElement.style.display = "none";
}
async function onTrySignIn() {
  /*var ciphertext = CryptoJS.AES.encrypt(
    "JSON.stringify(data)",
    "shared1"
  ).toString();

  // Decrypt
  try {
    var bytes = CryptoJS.AES.decrypt(ciphertext, "shared1");
    console.log(bytes);
    var decryptedData = bytes.toString(CryptoJS.enc.Utf8);

    console.log(decryptedData);
  } catch (e) {
    console.log(e);
  }*/

  if (!(await trySignIn())) {
    openRegistrationMenu();
    return;
  }
}
//may be create seperate util function that will not depend on html representation

async function answerConnectionRequest(address) {
  console.log(`connected to ${address}`);

  const contract = await getContract();

  const offer = ethers.utils.toUtf8String(
    await contract.getConnectionRequestTokenByAddresses(accountAddress, address)
  );
  console.log("offer: " + offer);
  let chatSession = new ChatSession(address, accountAddress, offer);
  await initChatSession(chatSession, offer);
  chatSessionsPerContactAddress.set(address, chatSession);

  addChatToElementListByAddressIfNotExists(address);
  selectChatWith(address);
  logChat(null, "Answering connection request...", chatSession);
}
async function requestConnectionTo(address) {
  let chatSession = new ChatSession(accountAddress, address);
  await initChatSession(chatSession);
  chatSessionsPerContactAddress.set(address, chatSession);

  addChatToElementListByAddressIfNotExists(address);
  selectChatWith(address);
  logChat(null, "Requested connection...", chatSession);

  console.log(`requested connection to ${address}`);
}
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
function showContactsList() {
  if (!onShowActiveChatLists()) return;

  contactsListElement.style.display =
    contactsListElement.style.display == "block" ? "none" : "block";
}

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

async function onAddContact() {
  console.log("doing contact addition");

  const newContactNameInputEl = document.getElementById("nickname-input");
  const contactName = newContactNameInputEl.value;
  const contactNameHash = "0x" + CryptoJS.SHA256(contactName).toString();

  const contract = await getContract();

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
function onChatSessionMsg(chatSession) {
  if (chatSession != currentChatSession) {
    chatSelectArrow.classList.add("arrow-new-notification");

    document
      .getElementById(chatSession.oppositeAddr + "-chat-list-div")
      .classList.add("new-notification");
  }
}
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
