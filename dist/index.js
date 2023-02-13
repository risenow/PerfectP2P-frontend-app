import "./ejs.min.js";

import { getContract } from "./contract-constants.js";
import * as CustomElements from "./custom-elements.js";
import { ChatEncryption } from "./chat-encryption.js";
import { ChatManager } from "./chat.js";
import "./elliptic.min.js";

let loggedIn = false;
const bodyElement = document.body;

//callbacks
const chatSessionCallbacks = {
  onPeerConnectionError: onPeerConnectionError,
  logChat: logChat,
  onAnsweringSideConnectionEstablished: (chatSession) => {
    selectChatWith(chatSession.oppositeAddr);
  },
  onInvalidDataChannelInSendMsg: () => {
    Swal.fire({
      title: "Error",
      text: "Connection is still at negotiating stage or failed!",
      icon: "error",
      confirmButtonText: "Ok",
    });
  },
};
const contractEventHandlers = {
  onOfferAcquired: onOfferAcquired,
  onAnswerAcquired: onAnswerAcquired,
};

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
const showAnsweringMachineMsgsButton = document.getElementById(
  "left-msgs-dropdown-button"
);
const answeringMachineMsgsListElement = document.getElementById(
  "left-msgs-dropdown-list"
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
  const swalInOnScreen =
    document.getElementsByClassName("swal2-container").length != 0;

  if (
    !swalInOnScreen &&
    !contactsListElement.contains(event.target) &&
    !showContactsButton.contains(event.target)
  ) {
    contactsListElement.style.display = "none";
  }
  if (
    !swalInOnScreen &&
    !connectionRequestsListElement.contains(event.target) &&
    !showConnectionRequestsButton.contains(event.target)
  ) {
    connectionRequestsListElement.style.display = "none";
  }
  if (
    !swalInOnScreen &&
    !answeringMachineMsgsListElement.contains(event.target) &&
    !showAnsweringMachineMsgsButton.contains(event.target)
  ) {
    answeringMachineMsgsListElement.style.display = "none";
  }
};
showAnsweringMachineMsgsButton.onclick = showAnsweringMachineMsgsList;

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
/**current chat */
let currentChatSession = null;
let chatEncryption = null;
let chatManager = null;

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

function onPeerConnectionError() {
  Swal.fire({
    title: "Error!",
    text: "Cannot create peer connection!",
    icon: "error",
    confirmButtonText: "Cool",
  });
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
  let activeChatSession = chatManager.getSession(address);
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

/**
 *
 * @param {string} nickname
 * @param {string} address Ethereum address
 * @param {string} msg
 * @param {number} to make different ids for elements
 */
function addAnsweringMachineMsgToElementList(nickname, address, msg, uniq) {
  const answeringMachineMsgsListElElTemplate = document.querySelector(
    "#left-msgs-list-element-ejs-template"
  ).innerHTML;

  //showAnsweringMachineMsgsButton.classList.add("new-notification");
  const shortMsg = msg.substring(0, 40) + (msg.length > 41 ? ".." : "");

  answeringMachineMsgsListElement.insertAdjacentHTML(
    "beforeend",
    ejs.compile(answeringMachineMsgsListElElTemplate)({
      username: escapeHtml(nickname),
      shortAddress: "0x.." + address.substring(37, 37 + 5),
      address: address,
      msg: shortMsg,
      fullMsg: msg,
      uniq: uniq,
    })
  );

  if (msg.length > 41) {
    const shortMsgEl = document.getElementById(
      uniq.toString() + "-" + address + "-left-msgs-shortmsg"
    );

    shortMsgEl.classList.add("pointer-cursor");

    shortMsgEl.onclick = function () {
      Swal.fire({
        title: "Subject",
        text: msg,
        customClass: { title: "swal-title swal-title-for-subject" },
      });
    };
  }
}

/**
 * UI reaction to new connection request
 * @param {string} nickname
 * @param {string} address Ethrereum address
 * @param {string} subject Subject of requested chat
 */
function addConnectionRequestToElementList(nickname, address, subject) {
  const oldRequestEl = document.getElementById(
    `${address}-connection-list-div`
  );
  if (oldRequestEl != null) {
    oldRequestEl.remove();
  }

  const connectionRequestsListElElTemplate = document.querySelector(
    "#connection-request-list-element-ejs-template"
  ).innerHTML;

  showConnectionRequestsButton.classList.add("new-notification");

  const shortMsg = subject.substring(0, 20) + (subject.length > 21 ? ".." : "");
  connectionRequestsListElement.insertAdjacentHTML(
    "beforeend",
    ejs.compile(connectionRequestsListElElTemplate)({
      username: escapeHtml(nickname),
      address: address,
      msg: shortMsg,
      fullMsg: subject,
    })
  );

  const copyAddressCol = document.getElementById(
    `${address}-connection-address-copy-col`
  );

  CustomElements.insertCopyableAddressElement(
    copyAddressCol,
    address,
    "connection",
    0
  );

  if (subject.length > 21) {
    const shortMsgEl = document.getElementById(
      address + "-connection-shortmsg"
    );

    shortMsgEl.classList.add("pointer-cursor");

    shortMsgEl.onclick = function () {
      Swal.fire({
        title: "Subject",
        text: subject,
      });
    };
  }

  document.getElementById(nickname + "-respond-button").onclick =
    async function () {
      const chatSession = await chatManager.answerConnectionRequest(
        address,
        chatSessionCallbacks
      );

      addChatToElementListByAddressIfNotExists(chatSession.oppositeAddr);
      selectChatWith(chatSession.oppositeAddr);

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
 *
 * @param {string} to Ethereum address
 * @param {string} from Ethereum address
 * @param {number} msgIdx
 */
async function onOfferAcquired(to, from, msgIdx) {
  const contract = await getContract();

  console.log("Got request event");
  console.log(to);

  const address = from;
  const name = await contract.getParticipantNameByAddress(address);
  const encryptedMsg = await contract.getParticipantLeftMsg(to, msgIdx);
  addConnectionRequestToElementList(
    name,
    address,
    await chatEncryption.decryptTokenFrom(from, encryptedMsg, encKeys)
  );
  sendConnectionRequestNotification(name);
}
async function onAnswerAcquired(to, from) {
  selectChatWith(from);
}

/**
 * Adds contact to UI contact list
 * @param {string} nickname contact name
 * @param {string} addr Ethereum address
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

  const addressCopyColEl = document.getElementById(
    nickname + "-contact-address-copy-col"
  );

  CustomElements.insertCopyableAddressElement(
    addressCopyColEl,
    addr,
    "contact",
    0
  );

  document.getElementById(nickname + "-request-button").onclick =
    async function () {
      const { value: subject } = await Swal.fire({
        title: "Enter subject for the chat",
        input: "text",
        inputLabel: "Subject",
        inputValue: "",
        showCancelButton: true,

        inputValidator: (value) => {
          if (!value) {
            return "You need to write something!";
          }
        },
      });

      const chatSession = await chatManager.requestConnectionTo(
        addr,
        subject,
        chatSessionCallbacks
      );

      addChatToElementListByAddressIfNotExists(chatSession.oppositeAddr);
      selectChatWith(chatSession.oppositeAddr);

      contactsListElement.style.display = "none";
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
      confirmButtonText: "OK",
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
  } catch (err) {
    console.log(err);
  }

  onMetamaskConnect();
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
  chatEncryption = new ChatEncryption(encKeys);
  chatManager = new ChatManager(accountAddress, chatEncryption);

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
async function setSignedInState(name) {
  signinButtonElement.textContent = name;
  signinButtonElement.disabled = true;
  accountName = name; //to redesign with multiple owned names in mind
  encKeys = encKeys; //enc keys should be initialized for correct sign in
  chatEncryption = new ChatEncryption(encKeys);
  chatManager = new ChatManager(accountAddress, chatEncryption);

  await chatManager.initializeSignalingHandlers(contractEventHandlers);
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

    await setSignedInState(participantName);

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

  await setSignedInState(participantName);

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
 * Opens custom dropdown list for answering machine msgs list
 * @returns
 */
async function showAnsweringMachineMsgsList() {
  if (!onShowActiveChatLists()) return;

  //showAnsweringMachineMsgsButton.classList.remove("new-notification");

  const el = answeringMachineMsgsListElement;

  el.style.display = el.style.display == "block" ? "none" : "block";

  if (el.style.display == "block") {
    await populateAnsweringMachineMsgsList();

    if (el.childNodes.length == 0) {
      el.style.display = "none";
      return;
    }
  }
}

async function populateAnsweringMachineMsgsList() {
  clearElement(answeringMachineMsgsListElement);

  const contract = await getContract();
  const msgsCount = await contract.getParticipantLeftMsgsCount(accountAddress);

  console.log("Msgs count: " + msgsCount);

  const maxLoadedEntries = 30;
  const firstEntryIndex = msgsCount - maxLoadedEntries;
  const entriesCount = Math.min(maxLoadedEntries, msgsCount); //loading only last 30 msgs

  let i = msgsCount - 1;
  let count = 0;
  for (; i >= 0; i--) {
    const timestamp = await contract.getParticipantLeftMsgTimestamp(
      accountAddress,
      i
    );
    //to uncomment
    //if ((Date.now() - timestamp) / 1000 < 60*3) {
    //  continue;
    //}
    const isAnswered = await contract.isParticipantLeftMsgAnswered(
      accountAddress,
      i
    );
    console.log("is answered: " + isAnswered);
    if (isAnswered) {
      continue;
    }
    const senderAddress = await contract.getParticipantLeftMsgSenderAddress(
      accountAddress,
      i
    );

    const encryptedMsg = await contract.getParticipantLeftMsg(
      accountAddress,
      i
    );
    const msg = await chatEncryption.decryptTokenFrom(
      senderAddress,
      encryptedMsg,
      encKeys
    );
    console.log(msg);
    const senderName = await contract.getParticipantNameByAddress(
      senderAddress
    );

    addAnsweringMachineMsgToElementList(senderName, senderAddress, msg, i);

    console.log(senderAddress + "-left-msgs-msg-tip-wrapper");
    const msgTooltipElement = document.getElementById(
      senderAddress + "-left-msgs-msg-tip-wrapper"
    );
    console.log(msgTooltipElement);

    console.log("Added left msg");

    if (count == entriesCount) break;

    count++;
  }
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
    const chatEl = document.getElementById(
      chatSession.oppositeAddr + "-chat-list-div"
    );
    if (chatEl != null) {
      chatEl.classList.add("new-notification");
    }
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

  chatSession.sendMsg(msg);

  logChat(accountName, msg, chatSession);
  msgInputElement.value = "";
}
/**
 * Logs message in the UI part
 * @param {string} from Participant name or "null" if system message
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
