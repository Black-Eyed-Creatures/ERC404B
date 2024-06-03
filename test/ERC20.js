
const { ethers } = require("hardhat");
const { expect } = require("chai");

const { shouldBehaveLikeERC20, shouldBehaveLikeERC20Transfer, shouldBehaveLikeERC20Approve } = require("./behaviors/ERC20.behavior");
const { EventTypes, getEvents } = require("./utils/web3");
const { ERC20Errors, ERC721Errors, ERC404BErrors } = require("./utils/enums");
const { signERC2612Permit } = require("eth-permit");

/**
 * @function getErc20Events - Get the erc20 events from a transaction
 * @param {*} tx  - The transaction to get the events from
 * @param {EventTypes} eventType - The type of event to get
 * @returns The emitted events from the transaction
 */
const getErc20Events = async (tx, eventType) => {
  return getEvents("ERC20", tx, eventType);
};

const name = "ERC404B Token";
const symbol = "B3";
const initialSupply = 100n;

describe("ERC20", () => {

  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    const [owner, holder, recipient, other] = accounts;

    const ERC404BMock = await ethers.getContractFactory("ERC404BMock");
    const token = await ERC404BMock.connect(owner).deploy();
    await token.waitForDeployment();

    await token.mint(holder, initialSupply);

    const info = {
      accounts: { holder, recipient, other },
      token,
    }

    Object.assign(this, info);
  });

  shouldBehaveLikeERC20(initialSupply);

  it("has a name", async () => {
    expect(await this.token.name()).to.equal(name);
  });

  it("has a symbol", async () => {
    expect(await this.token.symbol()).to.equal(symbol);
  });

  it("has 18 decimals", async () => {
    expect(await this.token.decimals()).to.equal(18n);
  });

  describe("_mint", () => {
    const value = 50n;
    it("rejects a null account", async () => {
      await expect(this.token.mint(ethers.ZeroAddress, value))
        .to.be.revertedWithCustomError(this.token, ERC20Errors.ERC20InvalidReceiver);
    });

    describe("for a non zero account", () => {
      beforeEach("minting", async () => {
        this.tx = await this.token.mint(this.accounts.recipient, value);
      });

      it("increments totalSupply", async () => {
        await expect(await this.token.totalSupply()).to.equal((initialSupply + value) * BigInt(await this.token.unit()));
      });

      it("increments recipient balance", async () => {
        await expect(this.tx).to.changeTokenBalance(this.token, this.accounts.recipient, value * BigInt(await this.token.unit()));
      });

      it("emits Transfer event", async () => {
        const events = await getErc20Events(this.tx, EventTypes.Transfer);
        expect(events.filter((e) => e.name === EventTypes.Transfer).length == 1).to.be.true;
      });
    });
  });

  describe("_burn", () => {
    it("rejects a null account", async () => {
      await this.token.connect(ethers.ZeroAddress)
      expect(this.token.burn(1n))
        .to.not.fulfilled;
    });

    describe("for a non zero account", () => {
      it("rejects burning more than balance", async () => {
        await expect(this.token.burn(initialSupply + 1n))
          .to.be.revertedWithCustomError(this.token, ERC721Errors.ERC721NonexistentToken);
      });

      const describeBurn = (description, value) => {
        describe(description, () => {

          beforeEach("burning", async () => {
            this.supplyBeforeBurn = await this.token.totalSupply();
            this.holderBalance = await this.token.balanceOf(this.accounts.holder);
            this.tx = await this.token.burn(value);
          });

          it("decrements totalSupply", async () => {
            expect(await this.token.totalSupply()).to.equal(this.supplyBeforeBurn - 1n * await this.token.unit());
          });

          it("decrements holder balance", async () => {
            await expect(this.holderBalance > await this.token.balanceOf(this.accounts.holder)).to.be.true;
          });

          it("emits Transfer event", async () => {
            const events = await getErc20Events(this.tx, EventTypes.Transfer);
            expect(events.filter((e) => e.name === EventTypes.Transfer).length == 1).to.be.true;
          });
        });
      };

      describeBurn("for entire balance", initialSupply);
      describeBurn("for less value than balance", initialSupply - 1n);
    });
  });

  describe("_transfer", () => {
    shouldBehaveLikeERC20Transfer(initialSupply);
  });

  describe("_approve", () => {
    shouldBehaveLikeERC20Approve(initialSupply);

    it("reverts when the owner is the zero address", async () => {
      await this.token.connect(ethers.ZeroAddress);
      expect(await this.token.approve(this.accounts.recipient, initialSupply * BigInt(await this.token.unit())))
        .to.be.revertedWithCustomError(this.token, ERC20Errors.ERC20InvalidReceiver)
        .withArgs(ethers.ZeroAddress);
    });
  });

  describe("Permit", () => {
    const value = ethers.parseEther("1");

    beforeEach(async () => {
      this.result = await signERC2612Permit(
        ethers.provider,
        this.token.target,
        this.accounts.holder.address,
        this.accounts.recipient.address,
        String(value)
      );
    })

    describe("with valid arguments", () => {
      it("recipient has allowance to permited value", async () => {
        await this.token.permit(
          this.accounts.holder,
          this.accounts.recipient,
          value,
          this.result.deadline,
          this.result.v,
          this.result.r,
          this.result.s
        )

        expect(await this.token.allowance(this.accounts.holder, this.accounts.recipient)).to.equal(value);
      })
    })

    describe("with invalid", () => {
      describe("dead line", () => {
        it("reverts", async () => {
          const futureDate = new Date()
          futureDate.setFullYear(futureDate.getFullYear() - 1)

          await expect(this.token.permit(
            this.accounts.holder,
            this.accounts.recipient,
            value,
            0,
            this.result.v,
            this.result.r,
            this.result.s
          )).to.be.revertedWithCustomError(this.token, ERC404BErrors.EIP2612PermitDeadlineExpired).withArgs(
            this.accounts.holder,
            this.accounts.recipient,
            value,
            0,
            this.result.v,
            this.result.r,
            this.result.s
          )
        })
      })

      describe("value", () => {
        it("reverts", async () => {
          await expect(this.token.permit(
            this.accounts.holder,
            this.accounts.recipient,
            initialSupply,
            this.result.deadline,
            this.result.v,
            this.result.r,
            this.result.s
          )).to.be.revertedWithCustomError(this.token, ERC404BErrors.ERC404InvalidTransferValue).withArgs(initialSupply)
        })
      })

      describe("spender", () => {
        it("zero address: reverts", async () => {
          await expect(this.token.permit(
            this.accounts.holder,
            ethers.ZeroAddress,
            value,
            this.result.deadline,
            this.result.v,
            this.result.r,
            this.result.s
          )).to.be.revertedWithCustomError(this.token, ERC20Errors.ERC20InvalidSpender).withArgs(ethers.ZeroAddress)
        })

        it("stash address: reverts", async () => {
          const stashAddress = await this.token.stashAddress()
          await expect(this.token.permit(
            this.accounts.holder,
            stashAddress,
            value,
            this.result.deadline,
            this.result.v,
            this.result.r,
            this.result.s
          )).to.be.revertedWithCustomError(this.token, ERC20Errors.ERC20InvalidSpender).withArgs(stashAddress)
        })
      })

      describe("signer", () => {
        it("zero address: reverts", async () => {
          await expect(this.token.permit(
            ethers.ZeroAddress,
            this.accounts.recipient,
            value,
            this.result.deadline,
            this.result.v,
            this.result.r,
            this.result.s
          )).to.be.revertedWithCustomError(this.token, ERC404BErrors.EIP2612InvalidSigner)
        })

        it("invalid v sign: reverts", async () => {
          await expect(this.token.permit(
            this.accounts.holder,
            this.accounts.recipient,
            value,
            this.result.deadline,
            0,
            this.result.r,
            this.result.s
          )).to.be.revertedWithCustomError(this.token, ERC404BErrors.EIP2612InvalidSigner)
        })
      })
    })
  });
});