const chai = require("chai");
const { ethers } = require("hardhat");
const { expect } = chai;

describe("ERC404", async () => {
  const DEFAULT_MINT_PRICE = BigInt(10 ** 18);
  let b3Contract;
  let owner;
  let holder;
  let other;

  beforeEach(async () => {
    [owner, holder, other, one, two, three, four, five, six] = await ethers.getSigners();

    const ERC404BMock = await ethers.getContractFactory("ERC404BMock");
    b3Contract = await ERC404BMock.connect(owner).deploy();
    await b3Contract.waitForDeployment();
  });

  /**
   * @param erc404 The ERC404 contract
   * @dev set up minted tokens for one, two, three and four address owners
   * @example // result of set up - tokens minted map
   * one = [ 1n, 2n, 3n, 4n, 11n, 19n ]
   * two = [ 5n, 6n, 7n, 8n, 9n, 10n, 17n, 18n ]
   * three = [ 12n, 13n ]
   * four = [ 14n, 15n, 16n ]
   */
  const setUpErc404 = async (erc404) => {
    await erc404.connect(owner).mint(one, 4);
    await erc404.connect(owner).mint(two, 6);
    await erc404.connect(owner).mint(one, 1);
    await erc404.connect(owner).mint(three, 2);
    await erc404.connect(owner).mint(four, 3);
    await erc404.connect(owner).mint(two, 2);
    await erc404.connect(owner).mint(one, 1);
  };


  it("ERC404: should mint 1 token", async () => {
    await b3Contract.connect(owner).safeMint(holder, 1);
    const balance = await b3Contract.connect(holder).balanceOf(holder);
    expect(balance).to.be.equal(BigInt(10) ** BigInt(18));
  });

  it("ERC404: should mint 1 token multiple times", async () => {
    for (i = 0; i < 33; i++) {
      await b3Contract.connect(owner).safeMint(holder, 1);
    }
    const balance = await b3Contract.connect(holder).balanceOf(holder);
    expect(balance).to.be.equal(BigInt(33) * BigInt(10) ** BigInt(18));
  });

  it("ERC404: should mint 3 token", async () => {
    await b3Contract.connect(owner).safeMint(holder, 3);
    const balance = await b3Contract.connect(holder).balanceOf(holder);
    expect(balance).to.be.equal(BigInt(3) * BigInt(10) ** BigInt(18));
  });

  it("ERC404: should mint 3 tokens 3 times", async () => {
    await b3Contract.connect(owner).safeMint(holder, 3);
    await b3Contract.connect(owner).safeMint(holder, 3);
    await b3Contract.connect(owner).safeMint(holder, 3);
    const balance = await b3Contract.connect(holder).balanceOf(holder);
    expect(balance).to.be.equal(BigInt(3 * 3) * BigInt(10) ** BigInt(18));
  });

  it("ERC404: should mint 3 tokens 3 time different users", async () => {
    await b3Contract.connect(owner).safeMint(owner, 3);
    await b3Contract.connect(owner).safeMint(other, 3);
    await b3Contract.connect(owner).safeMint(holder, 3);
    const balance = await b3Contract.connect(owner).balanceOf(owner);
    expect(balance).to.be.equal(BigInt(3) * BigInt(10) ** BigInt(18));
  });

  it("ERC404: should mint 9 tokens 9 times", async () => {
    for (i = 0; i < 9; i++) {
      await b3Contract.connect(owner).safeMint(holder, 9);
    }
    const balance = await b3Contract.connect(holder).balanceOf(holder);
    expect(balance).to.be.equal(BigInt(9 * 9) * BigInt(10) ** BigInt(18));
  });

  it("ERC404: should check transfer type A", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    const bBalance = await erc404.connect(two).balanceOf(two);
    const ownerOf = await erc404.connect(two).ownerOf(11);
    expect(ownerOf).to.be.equal(one);
    await erc404.connect(one).transferFrom(one, two, 11);
    const aBalance = await erc404.connect(two).balanceOf(two);

    expect(aBalance).to.be.equal(bBalance + BigInt(10 ** 18));
  });

  it("ERC404: should check transfer type A2", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    const bBalance = await erc404.connect(two).balanceOf(two);
    await erc404.connect(one).transferFrom(one, two, 19);
    const aBalance = await erc404.connect(two).balanceOf(two);

    expect(aBalance).to.be.equal(bBalance + BigInt(10 ** 18));
  });

  it("ERC404: should check transfer type B", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    const bBalance = await erc404.connect(two).balanceOf(two);
    await erc404.connect(three).transferFrom(three, two, 12);
    const aBalance = await erc404.connect(two).balanceOf(two);

    expect(aBalance).to.be.equal(bBalance + BigInt(10 ** 18));
  });

  it("ERC404: should check transfer type B2", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    const bBalance = await erc404.connect(two).balanceOf(two);
    await erc404.connect(one).transferFrom(one, two, 1);
    const aBalance = await erc404.connect(two).balanceOf(two);

    expect(aBalance).to.be.equal(bBalance + BigInt(10 ** 18));
  });

  it("ERC404: should check transfer type B3", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    const bBalance = await erc404.connect(two).balanceOf(two);
    await erc404.connect(four).transferFrom(four, two, 14);
    const aBalance = await erc404.connect(two).balanceOf(two);

    expect(aBalance).to.be.equal(bBalance + BigInt(10 ** 18));
  });

  it("ERC404: should check transfer type C", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    const bBalance = await erc404.connect(two).balanceOf(two);
    await erc404.connect(four).transferFrom(four, two, 16);
    const aBalance = await erc404.connect(two).balanceOf(two);

    expect(aBalance).to.be.equal(bBalance + BigInt(10 ** 18));
  });

  it("ERC404: should check transfer type D", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    const bBalance = await erc404.connect(one).balanceOf(one);
    await erc404.connect(two).transferFrom(two, one, 8);
    const aBalance = await erc404.connect(one).balanceOf(one);

    expect(aBalance).to.be.equal(bBalance + BigInt(10 ** 18));
  });

  it("ERC404: should check transfer type D2", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    const bBalance = await erc404.connect(one).balanceOf(one);
    await erc404.connect(two).transferFrom(two, one, 6);
    const aBalance = await erc404.connect(one).balanceOf(one);

    expect(aBalance).to.be.equal(bBalance + BigInt(10 ** 18));
  });

  it("ERC404: should transfer 0.5 tokens", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    const value = BigInt(10 ** 18) / BigInt(2);

    const bBalance = await erc404.connect(one).balanceOf(one);
    await erc404.connect(two).transferFrom(two, one, value);
    const aBalance = await erc404.connect(one).balanceOf(one);

    expect(aBalance).to.be.equal(bBalance + value);
  });

  it("ERC404: should transfer 1.5 tokens", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    const value = (BigInt(10 ** 18) * BigInt(3)) / BigInt(2);

    const bBalance = await erc404.connect(one).balanceOf(one);
    await erc404.connect(two).transferFrom(two, one, value);
    const aBalance = await erc404.connect(one).balanceOf(one);

    expect(aBalance).to.be.equal(bBalance + value);
  });

  it("ERC404: should transfer 2.5 tokens", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    const value = (BigInt(10 ** 18) * BigInt(5)) / BigInt(2);

    const bBalance = await erc404.connect(one).balanceOf(one);
    await erc404.connect(two).transferFrom(two, one, value);
    const aBalance = await erc404.connect(one).balanceOf(one);

    expect(aBalance).to.be.equal(bBalance + value);
  });

  it("ERC404: should transfer 4.5 tokens", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    const value = (BigInt(10 ** 18) * BigInt(9)) / BigInt(2);

    const bBalance = await erc404.connect(one).balanceOf(one);
    await erc404.connect(two).transferFrom(two, one, value);
    const aBalance = await erc404.connect(one).balanceOf(one);

    expect(aBalance).to.be.equal(bBalance + value);
  });

  it("ERC404: should transfer 1.5 from transfer excempt", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    await erc404.connect(two).setERC721TransferExempt(true);

    const value = (BigInt(10 ** 18) * BigInt(3)) / BigInt(2);

    const bBalance = await erc404.connect(one).balanceOf(one);
    await erc404.connect(two).transferFrom(two, one, value);
    const aBalance = await erc404.connect(one).balanceOf(one);

    expect(aBalance).to.be.equal(bBalance + value);
  });

  it("ERC404: add transfer excempt", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    await erc404.connect(owner).setERC721TransferExempt(true);

    const isExempt = await erc404.connect(owner).isERC721TransferExempt(owner);

    expect(isExempt).to.be.equal(true);
  });

  it("ERC404: add transfer excempt, and transfer 1.5 to that address", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    await erc404.connect(owner).setERC721TransferExempt(true);
    const isExempt = await erc404.connect(owner).isERC721TransferExempt(owner);
    expect(isExempt).to.be.equal(true);

    const value = (BigInt(10 ** 18) * BigInt(3)) / BigInt(2);
    const bBalance = await erc404.connect(owner).balanceOf(owner);
    await erc404.connect(two).transferFrom(two, owner, value);
    const aBalance = await erc404.connect(owner).balanceOf(owner);

    expect(aBalance).to.be.equal(bBalance + value);
  });

  it("ERC404: add transfer excempt, and transfer 4.5 to that address", async () => {
    const erc404 = b3Contract;

    await setUpErc404(erc404);

    await erc404.connect(owner).setERC721TransferExempt(true);
    const isExempt = await erc404.connect(owner).isERC721TransferExempt(owner);
    expect(isExempt).to.be.equal(true);

    const value = (BigInt(10 ** 18) * BigInt(9)) / BigInt(2);
    const bBalance = await erc404.connect(owner).balanceOf(owner);
    await erc404.connect(two).transferFrom(two, owner, value);
    const aBalance = await erc404.connect(owner).balanceOf(owner);

    expect(aBalance).to.be.equal(bBalance + value);
  });

  it("ERC404: add both to exempt and transfer 4.5 to that address", async () => {
    const erc404 = b3Contract;
    await setUpErc404(erc404);

    await erc404.connect(owner).setERC721TransferExempt(true);
    const isExempt = await erc404.connect(owner).isERC721TransferExempt(owner);
    expect(isExempt).to.be.equal(true);
    await erc404.connect(two).setERC721TransferExempt(true);
    const isExempt2 = await erc404.connect(two).isERC721TransferExempt(two);
    expect(isExempt2).to.be.equal(true);

    const value = (BigInt(10 ** 18) * BigInt(9)) / BigInt(2);
    const bBalance = await erc404.connect(owner).balanceOf(owner);
    await erc404.connect(two).transferFrom(two, owner, value);
    const aBalance = await erc404.connect(owner).balanceOf(owner);

    expect(aBalance).to.be.equal(bBalance + value);
  });

});
