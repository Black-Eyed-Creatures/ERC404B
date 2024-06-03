/**
 * @function ERC721Fixture
 * @description Deploys a ERC721Mock contract and set help functions to interact with it
 * @returns {Object} Returns the values used on the ERC721Fixture
 *
 * @example
 *      const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
 *      const { ERC721Fixture } = require("./Fixture");
 *      await loadFixture(ERC721Fixture)
 */
const ERC721Fixture = async () => {
  const [owner, newOwner, approved, operator, other] = await ethers.getSigners();

  const tokenName = "ERC404B Token";
  const tokenSymbol = "B3";

  const ERC404BMock = await ethers.getContractFactory("ERC404BMock");
  const contract = await ERC404BMock.connect(owner).deploy();
  await contract.waitForDeployment();

  const unit = await contract.unit();

  const info = {
    name: tokenName,
    symbol: tokenSymbol,
    decimals: await contract.decimals(),
  };

  const helpers = {
    nonExistentTokenId: async () => (await contract.getLastTokenId()) + BigInt(1),
    parseToBalance: (balance) => BigInt(balance) * unit,
  };

  return {
    accounts: { owner, newOwner, approved, operator, other },
    contract,
    helpers,
    info,
    contractSupportITest: contract,
  };
};

module.exports = {
  ERC721Fixture,
};
