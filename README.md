# PerfectP2P-frontend-app
Decentralized WebRTC chating app without a need for a centralized signaling server or any kind of active DHT bootstraping nodes. Uses EVM(currently AVAX) contract as a registration and signaling system. Requires Metamask for communication with the blockchain. The EVM contract repository name is PerfectP2P-backend. You can use it to deploy to arbitrary EVM chain.  

The idea is that this chat will live as long as will the corresponding underlying blockchain. Even if there were absolutely zero active participants, in any time two peers would be able to negotiate connection through the contract and talk to each other.  
## How to run
Download "dist" folder and then run "run-local.bat". Python3 is required.  
As an alternative you can host the folder as a regular web page in any other way.  
Key here is to avoid browser CORS errors, you can't just open index.html, it should be served by some server.
## How to connect  
Currently contract is running under the AVAX testnet blockchain so you will need to add AVAX testnet to your Metmask and fill it with the test currency from the faucet.  
The following is a configuration for AVAX testnet:

    Network Name: Avalanche Testnet C-Chain  
    Network URL: https://api.avax-test.network/ext/bc/C/rpc  
    Chain ID: 43113  
    Currency Symbol: AVAX  
    Block Explorer URL: https://testnet.snowtrace.io/  
    
Faucet link: https://faucet.avax.network/
