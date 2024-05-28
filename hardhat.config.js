require("dotenv/config");
require("hardhat-deploy");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-ethers");
require("hardhat-abi-exporter");
require("hardhat-gas-reporter");
require("hardhat-contract-sizer");
require("@nomicfoundation/hardhat-verify");


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
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  gasReporter: {
    gasPrice: 6,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    currency: "USD",
  },
  contractSizer: {
    runOnCompile: true,
    strict: true,
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      blockGasLimit: 800000000,
      accounts: {
        count: 200,
      }
    },
    mainnet: {
      blockGasLimit: 30000000,
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_TOKEN}`,
      accounts: [`0x${privateKey}`],
    },
    polygon: {
      blockGasLimit: 30000000,
      url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_TOKEN}`,
      accounts: [`0x${privateKey}`],
    },
    sepolia: {
      blockGasLimit: 30000000,
      url: `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_TOKEN}`,
      accounts: [`0x${privateKey}`],
    },
  },
  mocha: {
    timeout: 100000000
  },
};
