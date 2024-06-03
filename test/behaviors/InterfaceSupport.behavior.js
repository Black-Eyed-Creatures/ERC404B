const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * @function selector helper method function from openzeppelin-contracts
 * @dev https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/test/helpers/methods.js
 */
const selector = (signature) => ethers.FunctionFragment.from(signature).selector;
const interfaceId = (signatures) =>
  ethers.toBeHex(
    signatures.reduce((acc, signature) => acc ^ ethers.toBigInt(selector(signature)), 0n),
    4
  );

/**
 * @function mapValues helper iterator function from openzeppelin-contracts
 * @dev https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/test/helpers/iterate.js
 */
const mapValues = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));

// the base of this code is from openzeppelin-contracts
// https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/test/utils/introspection/SupportsInterface.behavior.js

const INVALID_ID = "0xffffffff";

/**
 * @constant {Object} SIGNATURES
 * @note add more signatures as needed
 */
const SIGNATURES = {
  ERC165: ["supportsInterface(bytes4)"],
  ERC721: [
    "balanceOf(address)",
    "ownerOf(uint256)",
    "approve(address,uint256)",
    "getApproved(uint256)",
    "setApprovalForAll(address,bool)",
    "isApprovedForAll(address,address)",
    "transferFrom(address,address,uint256)",
    "safeTransferFrom(address,address,uint256)",
    "safeTransferFrom(address,address,uint256,bytes)",
  ],
  IERC404: [
    "name()",
    "symbol()",
    "decimals()",
    "totalSupply()",
    "balanceOf(address)",
    "isApprovedForAll(address,address)",
    "allowance(address,address)",
    "owned(address)",
    "ownerOf(uint256)",
    "tokenURI(uint256)",
    "approve(address,uint256)",
    "_erc20Approve(address,uint256)",
    "_erc721Approve(address,uint256)",
    "setApprovalForAll(address,bool)",
    "transferFrom(address,address,uint256)",
    "_transferFromERC20(address,address,uint256)",
    "transfer(address,uint256)",
    "setERC721TransferExempt(bool)",
    "safeTransferFrom(address,address,uint256)",
    "safeTransferFrom(address,address,uint256,bytes)",
    "DOMAIN_SEPARATOR()",
    "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
  ],
};

const INTERFACE_IDS = mapValues(SIGNATURES, interfaceId);

const exceptionInterfaceIds = ['IERC404'];

/**
 * @function shouldSupportInterfaces
 * @param {string[]} interfaces array of interfaces names to test
 * @param {*} fixture the fixture to load that contains the contract to test
 * @note Add your own interfaces as needed in the SIGNATURES constant on the function file
 * @requires this.contractSupportITest to be defined on the fixture
 */
const shouldSupportInterfaces = (interfaces = [], fixture) => {
  describe("Supports interfaces", () => {
    interfaces.unshift("ERC165");

    describe("ERC165", () => {
      beforeEach(async () => {
        Object.assign(this, await loadFixture(fixture));
      });

      describe("When the interfaceId is supported:", () => {
        describe("uses less than 30k gas", async () => {
          for (const k of interfaces) {
            it(k, async () => {
              const interface = INTERFACE_IDS[k] ?? k;
              expect(await this.contractSupportITest.supportsInterface.estimateGas(interface)).to.lte(30_000n);
            });
          }
        });

        describe("support interface id", async () => {
          for (const k of interfaces) {
            if (exceptionInterfaceIds.includes(k)) continue;

            it(k, async () => {
              const interfaceId = INTERFACE_IDS[k] ?? k;
              expect(await this.contractSupportITest.supportsInterface(interfaceId)).to.be.true;
            });
          }
        });
      });

      describe("When the interfaceId is not supported:", () => {
        it("uses less than 30k", async () => {
          expect(await this.contractSupportITest.supportsInterface.estimateGas(INVALID_ID)).to.lte(30_000n);
        });

        it("returns false", async () => {
          expect(await this.contractSupportITest.supportsInterface(INVALID_ID)).to.be.false;
        });
      });

      describe("All interface functions are in ABI", async () => {
        for (const k of interfaces) {
          // skip interfaces for which we don't have a function list
          if (SIGNATURES[k] === undefined) continue;

          it(k, async () => {
            // Check the presence of each function in the contract's interface
            for (const fnSig of SIGNATURES[k]) {
              expect(this.contractSupportITest.interface.hasFunction(fnSig), `did not find ${fnSig}`).to.be.true;
            }
          });
        }
      });
    });
  });
};

module.exports = {
  shouldSupportInterfaces,
};
