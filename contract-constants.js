const hhContractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const goerliContractAddress = "0xb9571544Fa2EcdE4b3E32962FBBa392D48b46985"; //old
const avaxTstContractAddress = "0x6e1c79EE3360f02EfCda5015fBD80d8052Abe644"; //old "0x6710EA1caffb03d51E8A3c32e14965d92AD30EC1";
export const contractAddress = hhContractAddress; //"0x5FbDB2315678afecb367f032d93F642f64180aa3";
export const abi = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "ChatSignalingMedium__CallerIsNotAParticipant",
    type: "error",
  },
  {
    inputs: [],
    name: "ChatSignalingMedium__CannotConnectToItself",
    type: "error",
  },
  {
    inputs: [],
    name: "ChatSignalingMedium__EncKeyTooLong",
    type: "error",
  },
  {
    inputs: [],
    name: "ChatSignalingMedium__NameAlreadyRegistered",
    type: "error",
  },
  {
    inputs: [],
    name: "ChatSignalingMedium__NameTooLong",
    type: "error",
  },
  {
    inputs: [],
    name: "ChatSignalingMedium__RecipientIsNotAParticipant",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "from",
        type: "address",
      },
    ],
    name: "AnswerMade",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "leftMsgIdx",
        type: "uint256",
      },
    ],
    name: "OfferMade",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "from",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "responseToken",
        type: "bytes",
      },
    ],
    name: "acceptConnection",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "to",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "from",
        type: "bytes32",
      },
    ],
    name: "getConnectionRequestAnswerToken",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
    ],
    name: "getConnectionRequestAnswerTokenByAddresses",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "to",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "from",
        type: "bytes32",
      },
    ],
    name: "getConnectionRequestToken",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
    ],
    name: "getConnectionRequestTokenByAddresses",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "to",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "from",
        type: "bytes32",
      },
    ],
    name: "getConnectionRequestTokenWithSubject",
    outputs: [
      {
        internalType: "bytes",
        name: "requestToken",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "subjectMsgIdx",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "addr",
        type: "address",
      },
    ],
    name: "getEncryptionKeyByAddress",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "nameHash",
        type: "bytes32",
      },
    ],
    name: "getParticipantAddressByNameHash",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "msgIdx",
        type: "uint256",
      },
    ],
    name: "getParticipantLeftMsg",
    outputs: [
      {
        internalType: "bytes",
        name: "",
        type: "bytes",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "msgIdx",
        type: "uint256",
      },
    ],
    name: "getParticipantLeftMsgSenderAddress",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "msgIdx",
        type: "uint256",
      },
    ],
    name: "getParticipantLeftMsgTimestamp",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
    ],
    name: "getParticipantLeftMsgsCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "addr",
        type: "address",
      },
    ],
    name: "getParticipantNameByAddress",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "addr",
        type: "address",
      },
    ],
    name: "getParticipantNameHashByAddress",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "to",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "requestToken",
        type: "bytes",
      },
      {
        internalType: "bytes",
        name: "subjectMsg",
        type: "bytes",
      },
    ],
    name: "initiateConnection",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "addr",
        type: "address",
      },
    ],
    name: "isParticipantAddress",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "msgIdx",
        type: "uint256",
      },
    ],
    name: "isParticipantLeftMsgAnswered",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "nameHash",
        type: "bytes32",
      },
    ],
    name: "isParticipantNameHash",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "name",
        type: "string",
      },
      {
        internalType: "bytes",
        name: "publicEncryptionKey",
        type: "bytes",
      },
    ],
    name: "register",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];
