require("dotenv/config");
require("hardhat-deploy");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-ethers");
require("hardhat-abi-exporter");
require("hardhat-gas-reporter");
require("hardhat-contract-sizer");
require("@nomicfoundation/hardhat-verify");
require('solidity-coverage');


const privateKey = process.env.PRIVATE_KEY || "0000000000000000000000000000000000000000000000000000000000000001";

module.exports = {
  solidity: {
    version: "0.8.25",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
        details: {
          yulDetails: {
            optimizerSteps: "u",
          },
        },
      },
    },
  },
  abiExporter: {
    runOnCompile: true,
    clear: true,
    flat: true,
    only: [],
    spacing: 2,
  },
  gasReporter: {
    gasPrice: 6,
    currency: "USD",
    ...(process.env.COINMARKETCAP_API_KEY ? { coinmarketcap: process.env.COINMARKETCAP_API_KEY } : {}),
  },
  contractSizer: {
    runOnCompile: true,
    strict: true,
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
    },
    mainnet: {
      blockGasLimit: 30000000,
      url: process.env.WEB3_RPC_URL,
      accounts: [`0x${privateKey}`],
    },
    polygon: {
      blockGasLimit: 30000000,
      url: process.env.WEB3_RPC_URL,
      accounts: [`0x${privateKey}`],
    },
    sepolia: {
      blockGasLimit: 30000000,
      url: process.env.WEB3_RPC_URL,
      accounts: [`0x${privateKey}`],
    },
  },
};
