import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
dotenv.config();

const defaultPrivateKey = "0x0000000000000000000000000000000000000000000000000000000000000000";
const defaultRpc = "http://127.0.0.1"

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 1000000,
      },
    },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_URL || defaultRpc,
      accounts: [ process.env.PRIVATE_KEY || defaultPrivateKey],
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || defaultRpc,
      accounts: [ process.env.PRIVATE_KEY || defaultPrivateKey],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || ""
  },
};

export default config;
