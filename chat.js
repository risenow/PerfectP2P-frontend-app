import { getContract } from "./contract-constants.js";
import { ChatEncryption } from "./chat-encryption.js";

/**
 * Is invoked after WebRTC offer generation. Ecnrypts it and sends by contract to the counteragent(interlocutor)
 * @param {string} token
 * @param {string} to Ethereum address
 * @param {ChatEncryption} chatEncryption
 * @param {string} plain subject text
 */
async function onRequestTokenGenerated(token, to, chatEncryption, subject) {
  console.log(`Request token aquired, offer is being sent: ${token}`);

  const contract = await getContract();

  const nameHash = await contract.getParticipantNameHashByAddress(to);

  const tokenBlob = token; //to pack desc here (TODO)
  const encryptedToken = await chatEncryption.encryptTokenTo(to, tokenBlob);

  const encryptedSubject = await chatEncryption.encryptTokenTo(to, subject);

  const txResp = await contract.initiateConnection(
    nameHash,
    encryptedToken,
    encryptedSubject
  );
  await txResp.wait(1);
}

/**
 * Is invoked after WebRTC answer generation. Ecnrypts it and sends by contract to the counteragent(interlocutor)
 * @param {string} token
 * @param {string} to Ethereum address
 * @param {ChatEncryption} chatEncryption
 */
async function onRequestAnswerTokenGenerated(token, to, chatEncryption) {
  console.log(`Answer token aquired, answer is being sent: ${token}`);

  const contract = await getContract();

  const nameHash = await contract.getParticipantNameHashByAddress(to);

  const tokenBlob = token; // to pack desc (TODO)

  const encryptedToken = await chatEncryption.encryptTokenTo(to, tokenBlob);

  const txResp = await contract.acceptConnection(nameHash, encryptedToken);
  await txResp.wait(1);
}

/**
 * Sets up a peer connection with all the event handlers
 * @param {ChatSession} chatSession chat session that the RTCPeerConnection is constructed for
 * @param {bool} isOfferSide if the client offers connection
 * @param {*} callbacks onPeerConnectionError() - happens if RTCPeerConnection fails to construct,
 *  logChat(from, msg, chatSession) - logs info in the chat window
 * @param {ChatEncryption} chatEncryption
 * @param {string} subject describes subject of the chat
 * @returns RTCPeerConnection
 */
function makePeerConnection(
  chatSession,
  isOfferSide,
  callbacks,
  chatEncryption,
  subject = null
) {
  let peerConnection = undefined;
  let configuration = {
      //iceServers: [{ url: "stun:stun.gmx.net" }],
      iceServers: [{ url: "stun:stun.l.google.com:19302" }],
    },
    con = { optional: [{ DtlsSrtpKeyAgreement: true }] };
  try {
    peerConnection = new RTCPeerConnection(configuration, con);
  } catch (err) {
    callbacks.onPeerConnectionError();
  }

  peerConnection.onicecandidate = async function (e) {
    if (e.candidate == null) {
      if (isOfferSide) {
        await onRequestTokenGenerated(
          JSON.stringify(peerConnection.localDescription),
          chatSession.answerAddr,
          chatEncryption,
          subject
        );
      } else {
        await onRequestAnswerTokenGenerated(
          JSON.stringify(peerConnection.localDescription),
          chatSession.offerAddr,
          chatEncryption
        );
      }
    }
  };

  peerConnection.onconnectionstatechange = function (event) {
    switch (peerConnection.connectionState) {
      case "new":
      case "checking":
        callbacks.logChat(null, "Connecting...", chatSession);
        break;
      case "connecting":
        callbacks.logChat(null, "Connecting...", chatSession);
        break;
      case "connected":
        callbacks.logChat(null, "Connection established!", chatSession);
        break;
      case "disconnected":
        callbacks.logChat(null, "Oops, disconnected!", chatSession);
        break;
      case "closed":
        callbacks.logChat(null, "Oops, disconnected!", chatSession);
        break;
      case "failed":
        callbacks.logChat(null, "Connection failed!", chatSession);
        break;
      default:
        console.log(peerConnection.connectionState);
        callbacks.logChat(
          null,
          "Looks like something gone wrong!",
          chatSession
        );
        break;
    }
  };
  //peerConnection.oniceconnectionstatechange = ;

  return peerConnection;
}
/**
 * Object that handles a chat state(1 object per chat). Also manages a corresponding WebRTC connection.
 * After construction, an <initChatSession> call is mandatory.
 * @param {string} offerAddr Ethereum address
 * @param {string} answerAddr Ethereum address
 * @param {*} callbacks onPeerConnectionError() - happens if RTCPeerConnection fails to construct,
 *  logChat(from, msg, chatSession) - logs info in the chat window,
 *  onInvalidDataChannelInSendMsg - if data channel for data transmission isn't ready yet or is invalid
 * @param {ChatEncryption} chatEncryption
 * @param {string} subject plain subject text
 * @param {string} offer WebRTC offer
 */
function ChatSession(
  offerAddr,
  answerAddr,
  callbacks,
  chatEncryption,
  subject = null,
  offer = null
) {
  const isOfferSide = offer == null;

  let chatSession = this;

  this.answerAddr = answerAddr;
  this.offerAddr = offerAddr;
  this.oppositeAddr = isOfferSide ? answerAddr : offerAddr;

  this.dataChannel = null;

  /** HTML representation of chat history */
  this.chatHistory = "";
  this.unreadMsgs = 0;

  this.peerConnection = makePeerConnection(
    this,
    isOfferSide,
    callbacks,
    chatEncryption,
    subject
  ); //mb just take subject from ChatSession?

  this.sendMsg = function (msg) {
    if (
      !chatSession.dataChannel ||
      chatSession.dataChannel.readyState != "open"
    ) {
      callbacks.onInvalidDataChannelInSendMsg();
    }
    chatSession.dataChannel.send(JSON.stringify({ message: msg }));
  };

  this.changed = false;
}
/**
 * Can't make the constructor async. Should be called after ChatSession object is constructed.
 * Initializes datachannel and most of the event handlers.
 * @param {ChatSession} chatSession
 * @param {*} callbacks onPeerConnectionError() - happens if RTCPeerConnection fails to construct,
 *  logChat(from, msg, chatSession) - logs info in the chat window,
 *  onAnsweringSideConnectionEstablished(chatSession) - happens only on the answering side when connection is established
 * @param {string} offer WebRTC offer from the potential interlocutor
 */
async function initChatSession(chatSession, callbacks, offer = null) {
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

    callbacks.logChat(name, textMsg, chatSession);
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
    console.log(offer);

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

      callbacks.onAnsweringSideConnectionEstablished(chatSession);

      console.log(chatSession.dataChannel);
      console.log(event);
    };
  }

  console.log(JSON.stringify(chatSession));
}

export class ChatManager {
  /**
   *
   * @param {string} address Ethereum address
   * @param {ChatEncryption} chatEncryption
   */
  constructor(address, chatEncryption) {
    this.accountAddress = address;
    console.log("account addr");
    console.log(this.accountAddress);

    this.chatEncryption = chatEncryption;
    this.chatSessionsPerContactAddress = new Map();
  }

  /**
   *
   * @param {string} address Ethereum address
   * @returns {ChatSession} chat session where address is an interlocutor
   */
  getSession(address) {
    return this.chatSessionsPerContactAddress.get(address);
  }

  /**
   * Initialize handlers for contract events: OfferMade and AnswerMade.
   * These handlers perform WebRTC connection negotiation steps.
   * @param {*} handlers onOfferAcquired, onAnswerAcquired
   */
  async initializeSignalingHandlers(handlers) {
    const contract = await getContract();

    const requestsFilter = contract.filters.OfferMade(
      this.accountAddress,
      null
    );
    const answersFilter = contract.filters.AnswerMade(
      this.accountAddress,
      null
    );

    const chatEncryption = this.chatEncryption;
    const chatSessionsPerContactAddress = this.chatSessionsPerContactAddress;

    const accountAddress = this.accountAddress;

    contract.on(requestsFilter, async function (to, from, idx) {
      handlers.onOfferAcquired(to, from, idx);
    });
    contract.on(answersFilter, async function (to, from) {
      const contract = await getContract();

      console.log("Got answer event");
      console.log(to);

      const address = from; //
      const name = await contract.getParticipantNameByAddress(address);
      console.log("we r here");
      console.log(accountAddress);

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
      console.log("we r here2");
      console.log(address);
      const answerRawBlob = await chatEncryption.decryptTokenFrom(
        from,
        encryptedAnswer
      );
      console.log("we r here3");

      const answerRaw = answerRawBlob; // to unpack desc TODO

      console.log("Answer raw", answerRaw);
      let answer = JSON.parse(answerRaw);
      console.log("Got answer, setting remote: " + answerRaw);
      let answerDesc = new RTCSessionDescription(answer);
      await chatSession.peerConnection.setRemoteDescription(answerDesc);

      handlers.onAnswerAcquired(to, from);
    });
  }

  /**
   * Makes encrypted WebRTC answer and writes it to the contract
   * Is only applicable if <address> offered connection(the corresponing WebRTC offer is written to the contract).
   * @param {string} address Ethereum address
   * @param {*} callbacks onPeerConnectionError() - happens if RTCPeerConnection fails to construct,
   *  logChat(from, msg, chatSession) - logs info in the chat window,
   *  onAnsweringSideConnectionEstablished(chatSession) - happens only on the answering side when connection is established
   */
  async answerConnectionRequest(address, callbacks) {
    console.log(`connected to ${address}`);

    const contract = await getContract();

    const encryptedOffer = await contract.getConnectionRequestTokenByAddresses(
      this.accountAddress,
      address
    );
    const offerBlob = await this.chatEncryption.decryptTokenFrom(
      address,
      encryptedOffer
    );

    const offer = offerBlob; // to unpack desc (TODO)

    console.log(typeof offer);
    console.log("offer: " + offer);
    let chatSession = new ChatSession(
      address,
      this.accountAddress,
      callbacks,
      this.chatEncryption,
      null,
      offer
    );
    await initChatSession(chatSession, callbacks, offer);

    this.chatSessionsPerContactAddress.set(
      chatSession.oppositeAddr,
      chatSession
    );

    callbacks.logChat(null, "Answering connection request...", chatSession);

    return chatSession;
  }
  /**
   * Makes encrypted WebRTC offer and writes it to the contract
   * @param {string} address Ethereum address
   * @param {string} describes subject of the chat
   * @param {*} callbacks onPeerConnectionError() - happens if RTCPeerConnection fails to construct,
   *  logChat(from, msg, chatSession) - logs info in the chat window,
   *  onAnsweringSideConnectionEstablished(chatSession) - happens only on the answering side when connection is established
   */
  async requestConnectionTo(address, subject, callbacks) {
    let chatSession = new ChatSession(
      this.accountAddress,
      address,
      callbacks,
      this.chatEncryption,
      subject
    );
    await initChatSession(chatSession, callbacks);

    this.chatSessionsPerContactAddress.set(
      chatSession.oppositeAddr,
      chatSession
    );

    callbacks.logChat(null, "Requested connection...", chatSession);

    console.log(`requested connection to ${address}`);

    return chatSession;
  }
}
