const { expect } = require("chai");
const { ethers } = require("hardhat");

const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { PANIC_CODES } = require("@nomicfoundation/hardhat-chai-matchers/panic");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ERC721Fixture } = require("./Fixture");

const { RevertTypes, ERC721Errors, ERC404BErrors, ERC20Errors } = require("./utils/enums");
const { EventTypes, getEvents, findEvent } = require("./utils/web3");
const { shouldSupportInterfaces } = require("./behaviors/InterfaceSupport.behavior");

/*constants*/
const TOKENS_AMOUNT_TO_MINT = 5;
const MOCK_DATA = "0x42";

/*receiver*/
const RECEIVER_MAGIC_VALUE = "0x150b7a02";

/*events*/
/**
 * @function getErc721Events - Get the events from a transaction
 * @param {*} tx  - The transaction to get the events from
 * @param {EventTypes} eventType - The type of event to get
 * @returns The emitted events from the transaction
 */
const getErc721Events = async (tx, eventType) => {
  return getEvents("ERC721", tx, eventType);
};

/*tests*/
/**
 * @test ERC721Mock contract
 * @description Test behavior of the contract, following the ERC721 standard with openzeppelin
 */
describe("ERC721", () => {
  //#region Supports interfaces
  shouldSupportInterfaces(["ERC721"], ERC721Fixture);

  beforeEach(async () => {
    Object.assign(this, await loadFixture(ERC721Fixture));
  });

  //#region With minted tokens - balance of
  describe("With minted tokens:", () => {
    /*exists*/
    describe("Exists", () => {
      it("token does not exist before mint", async () => {
        const firstTokenId = await this.contract.getLastTokenId();
        expect(await this.contract.exists(firstTokenId)).to.be.false;
      });

      it("token exist after mint", async () => {
        const firstTokenId = await this.contract.getLastTokenId();
        await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);
        expect(await this.contract.exists(firstTokenId)).to.be.true;
      });
    });

    /*balance of*/
    describe("BalanceOf", () => {
      describe("when the given address owns some tokens", () => {
        it("returns the amount of tokens owned by the given address", async () => {
          await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);

          expect(await this.contract.balanceOf(this.accounts.owner)).to.equal(
            this.helpers.parseToBalance(TOKENS_AMOUNT_TO_MINT)
          );
        });
      });

      describe("when the given address does not own any tokens", async () => {
        it("returns 0", async () => {
          expect(await this.contract.balanceOf(this.accounts.other)).to.equal(0n);
        });
      });

      describe("when querying the zero address", () => {
        it("returns 0", async () => {
          expect(await this.contract.balanceOf(ethers.ZeroAddress)).to.equal(0n);
        });
      });

      describe("when querying the stash address", () => {
        it("returns 0", async () => {
          expect(await this.contract.balanceOf(await this.contract.stashAddress())).to.equal(0n);
        });
      });
    });

    /*owner of*/
    describe("OwnerOf", () => {
      describe("when the given token ID was tracked by this token", () => {
        it("returns the owner of the given token ID", async () => {
          const tokenId = await this.contract.getLastTokenId();
          await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);

          expect(await this.contract.ownerOf(tokenId)).to.equal(this.accounts.owner);
        });
      });

      describe("when the given token ID was not tracked by this token", () => {
        it("reverts", async () => {
          const nonExistentTokenId = await this.helpers.nonExistentTokenId();
          await expect(this.contract.ownerOf(nonExistentTokenId))
            .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721NonexistentToken)
            .withArgs(nonExistentTokenId);
        });
      });

      describe('when the given token ID moves to the stash', ()=> {
        it('returns the stash address', async ()=> {
          const tokenId = await this.contract.getLastTokenId();
          await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);
          await this.contract.connect(this.accounts.owner).setERC721TransferExempt(true);

          expect(await this.contract.ownerOf(tokenId)).to.equal(await this.contract.stashAddress());
        })
      })
    });

    /*tokens in stash*/
    describe("tokens In Stash", ()=> {
      it('returns an empty array when there are no tokens in the stash', async ()=> {
        expect(await this.contract.tokensInStash()).to.have.lengthOf(0);
      })

      it('returns the amount of tokens in the stash', async ()=> {
        await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);
        await this.contract.connect(this.accounts.owner).setERC721TransferExempt(true);
        expect(await this.contract.tokensInStash()).to.have.lengthOf(TOKENS_AMOUNT_TO_MINT);
      })
    })

    /*owned*/
    describe("Owned tokens", () => {
      it("returns the owned tokens after mint", async () => {
        await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);
        const tokens = await this.contract.owned(this.accounts.owner);

        expect(tokens).to.have.lengthOf(TOKENS_AMOUNT_TO_MINT);
      });

      it('does not return the tokens of the stash', async ()=> {
        await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);
        await this.contract.connect(this.accounts.owner).setERC721TransferExempt(true);

        const tokens = await this.contract.owned(this.accounts.owner);
        expect(tokens).to.have.lengthOf(0);
      })
    });

    //#region transfers
    describe("Transfers:", () => {
      beforeEach(async () => {
        this.firstTokenId = await this.contract.getLastTokenId();
        await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);
        await this.contract.connect(this.accounts.owner).approve(this.accounts.approved, this.firstTokenId);
        await this.contract.connect(this.accounts.owner).setApprovalForAll(this.accounts.operator, true);

        this.to = this.accounts.other;
        this.toAddress = this.to.address;
      });

      //#region transfer was successful f()
      const transferWasSuccessful = () => {
        it("transfers the ownership of the given token ID to the given address", async () => {
          await this.tx();
          expect(await this.contract.ownerOf(this.firstTokenId)).to.equal(this.to);
        });

        it("emits a Transfer event", async () => {
          const events = await getErc721Events(this.tx(), EventTypes.Transfer);
          const event = findEvent(events, {
            name: EventTypes.Transfer,
            from: this.accounts.owner.address,
            to: this.toAddress,
            value: this.firstTokenId,
          });
          expect(event).to.not.be.undefined;
        });

        it("clears the approval for the token ID with no event", async () => {
          const events = await getErc721Events(this.tx(), EventTypes.Approval);

          expect(events.filter((e) => e.name === EventTypes.Approval)).to.have.lengthOf(0);

          expect(await this.contract.getApproved(this.firstTokenId)).to.equal(ethers.ZeroAddress);
        });

        it("adjusts owners balances", async () => {
          const balanceBefore = await this.contract.balanceOf(this.accounts.owner);
          await this.tx();
          expect(await this.contract.balanceOf(this.accounts.owner)).to.equal(
            balanceBefore - this.helpers.parseToBalance(1)
          );
        });
      };

      //#region should transfer tokens f()
      /**
       *
       * @function shouldTransferTokensByUsers
       * @param {'transfer' | 'transferFrom' | 'safeTransferFrom'} fragment - The function of the contract to test dynamically
       * @param {Object} opts - Any options to pass to the function
       */
      const shouldTransferTokensByUsers = (fragment, opts = {}) => {
        const isTransfer = fragment === "transfer";
        const isTransferFrom = fragment === "transferFrom";
        const isSafeTransferFrom = fragment === "safeTransferFrom";

        if (!opts?.extra) opts.extra = [];

        const buildArgs = (...props) => {
          const arr = [...props, ...opts.extra];
          if (isTransfer) arr.shift();
          return arr;
        };

        describe("when called by the owner", () => {
          beforeEach(async () => {
            const args = buildArgs(this.accounts.owner, this.to, this.firstTokenId);
            this.tx = () => this.contract.connect(this.accounts.owner)[fragment](...args);
          });

          transferWasSuccessful();
        });

        describe("when called by the approved individual", () => {
          beforeEach(async () => {
            const args = buildArgs(this.accounts.owner, this.to, this.firstTokenId);
            this.tx = () => this.contract.connect(this.accounts.approved)[fragment](...args);
          });

          if (!isTransfer) return transferWasSuccessful();

          it("reverts", async () => {
            expect(transferWasSuccessful())
              .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721InvalidReceiver)
              .withArgs(this.to);
          });
        });

        describe("when called by the operator", () => {
          beforeEach(async () => {
            const args = buildArgs(this.accounts.owner, this.to, this.firstTokenId);
            this.tx = () => this.contract.connect(this.accounts.operator)[fragment](...args);
          });

          if (!isTransfer) return transferWasSuccessful();

          it("reverts", async () => {
            expect(transferWasSuccessful())
              .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721InvalidReceiver)
              .withArgs(this.to);
          });
        });

        describe("when called by the owner without an approved user", () => {
          beforeEach(async () => {
            await this.contract.connect(this.accounts.owner).approve(ethers.ZeroAddress, this.firstTokenId);
            const args = buildArgs(this.accounts.owner, this.to, this.firstTokenId);
            this.tx = () => this.contract.connect(this.accounts.operator)[fragment](...args);
          });

          if (!isTransfer) return transferWasSuccessful();

          it("reverts", async () => {
            expect(transferWasSuccessful())
              .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721InvalidReceiver)
              .withArgs(this.to);
          });
        });

        describe("when sent to the owner", () => {
          it("reverts", async () => {
            const args = buildArgs(this.accounts.owner, this.accounts.owner, this.firstTokenId);
            expect(this.contract.connect(this.accounts.owner)[fragment](...args))
              .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721InvalidReceiver)
              .withArgs(this.accounts.owner);
          });
        });

        if (isTransferFrom || isSafeTransferFrom) {
          describe("when the address of the previous owner is incorrect", () => {
            it("reverts", async () => {
              await expect(
                this.contract
                  .connect(this.accounts.owner)
                  [fragment](this.accounts.other, this.accounts.other, this.firstTokenId, ...opts.extra)
              )
                .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721InvalidReceiver)
                .withArgs(this.accounts.other);
            });
          });
        }

        describe("when the sender is not authorized for the token id", () => {
          if (opts.unrestricted) {
            it("does not revert", async () => {
              const args = buildArgs(this.accounts.owner, this.accounts.other, this.firstTokenId);
              await this.contract.connect(this.accounts.other)[fragment](...args);
            });
          } else {
            it("reverts", async () => {
              const args = buildArgs(this.accounts.owner, this.accounts.other, this.firstTokenId);
              await expect(this.contract.connect(this.accounts.other)[fragment](...args))
                .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721InsufficientApproval)
                .withArgs(this.accounts.other, this.firstTokenId);
            });
          }
        });

        if (isSafeTransferFrom) {
          describe("when the given token ID does not exist", () => {
            it("reverts", async () => {
              const nonExistentTokenId = await this.helpers.nonExistentTokenId();
              const args = buildArgs(this.accounts.owner, this.accounts.other, nonExistentTokenId);
              await expect(this.contract.connect(this.accounts.owner)[fragment](...args))
                .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721NonexistentToken)
                .withArgs(nonExistentTokenId);
            });
          });
        }

        describe("when the address to transfer the token to is the zero address", () => {
          it("reverts", async () => {
            const args = buildArgs(this.accounts.owner, ethers.ZeroAddress, this.firstTokenId);
            await expect(this.contract.connect(this.accounts.owner)[fragment](...args))
              .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721InvalidReceiver)
              .withArgs(ethers.ZeroAddress);
          });
        });

        describe("when the address to transfer the token to is the stash address", () => {
          it("reverts", async () => {
            const stashAddress = await this.contract.stashAddress();
            const args = buildArgs(this.accounts.owner, stashAddress, this.firstTokenId);
            await expect(this.contract.connect(this.accounts.owner)[fragment](...args)).to.be.revertedWithCustomError(
              this.contract,
              ERC404BErrors.ERC721ReceiverNotImplemented
            );
          });
        });

        describe("when receiver is ERC721 Transfer Exempt", () => {
          beforeEach(async () => {
            await this.contract.connect(this.accounts.other).setERC721TransferExempt(true);
            this.beforeOwnedTokens = await this.contract.owned(this.accounts.other);
            const args = buildArgs(this.accounts.owner, this.accounts.other, this.firstTokenId);
            await this.contract.connect(this.accounts.owner)[fragment](...args);
            this.afterOwnedTokens = await this.contract.owned(this.accounts.other);
          });

          it("receiver dont receive the token", async () => {
            expect(this.afterOwnedTokens).to.have.lengthOf(this.beforeOwnedTokens.length);
          });
        });
      };

      //#region transfer/transfer from
      for (const { fnName, opts } of [
        { fnName: "transferFrom", opts: {} },
        { fnName: "transfer", opts: {} },
      ]) {
        describe(`Via ${fnName}`, () => {
          shouldTransferTokensByUsers(fnName, opts);
        });
      }

      //#region should transfer safely f()
      const shouldTransferSafely = (fragment, data, opts = {}) => {
        // sanity
        it("function exists", async () => {
          expect(this.contract.interface.hasFunction(fragment)).to.be.true;
        });

        describe("to a user account", () => {
          shouldTransferTokensByUsers(fragment, opts);
        });

        describe("to a valid receiver contract", () => {
          beforeEach(async () => {
            const data = await ethers.deployContract("ERC721ReceiverMock", [RECEIVER_MAGIC_VALUE, RevertTypes.None]);
            this.to = data;
            this.toAddress = data.target;
          });

          shouldTransferTokensByUsers(fragment, opts);

          it("calls onERC721Received", async () => {
            await expect(
              this.contract
                .connect(this.accounts.owner)
                [fragment](this.accounts.owner, this.to, this.firstTokenId, ...(opts.extra ?? []))
            )
              .to.emit(this.to, "Received")
              .withArgs(this.accounts.owner, this.accounts.owner, this.firstTokenId, data, anyValue);
          });

          it("calls onERC721Received from approved", async () => {
            await expect(
              this.contract
                .connect(this.accounts.approved)
                [fragment](this.accounts.owner, this.to, this.firstTokenId, ...(opts.extra ?? []))
            )
              .to.emit(this.to, "Received")
              .withArgs(this.accounts.approved, this.accounts.owner, this.firstTokenId, data, anyValue);
          });

          describe("with an invalid token id", () => {
            it("reverts", async () => {
              const nonExistentTokenId = await this.helpers.nonExistentTokenId();
              await expect(
                this.contract
                  .connect(this.accounts.approved)
                  [fragment](this.accounts.owner, this.to, nonExistentTokenId, ...(opts.extra ?? []))
              )
                .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721NonexistentToken)
                .withArgs(nonExistentTokenId);
            });
          });
        });
      };

      //#region safe transfer from
      //posible to extend to other method like safeTransfer
      for (const { fnName, opts } of [{ fnName: "safeTransferFrom", opts: {} }]) {
        describe(`Via ${fnName}`, () => {
          describe("with data", () => {
            shouldTransferSafely(fnName, MOCK_DATA, { ...opts, extra: [ethers.Typed.bytes(MOCK_DATA)] });
          });

          describe("without data", () => {
            shouldTransferSafely(fnName, "0x", opts);
          });

          describe("to a receiver contract returning unexpected value", () => {
            it("reverts", async () => {
              const invalidReceiver = await ethers.deployContract("ERC721ReceiverMock", [
                "0xdeadbeef",
                RevertTypes.None,
              ]);

              await expect(
                this.contract
                  .connect(this.accounts.owner)
                  [fnName](this.accounts.owner, invalidReceiver, this.firstTokenId)
              )
                .to.be.revertedWithCustomError(this.contract, ERC404BErrors.ERC721ReceiverNotImplemented)
                .withArgs(invalidReceiver, this.firstTokenId, 1, "0x");
            });
          });

          describe("to a receiver contract that reverts with message", () => {
            it("reverts", async () => {
              const revertingReceiver = await ethers.deployContract("ERC721ReceiverMock", [
                RECEIVER_MAGIC_VALUE,
                RevertTypes.RevertWithMessage,
              ]);

              await expect(
                this.contract
                  .connect(this.accounts.owner)
                  [fnName](this.accounts.owner, revertingReceiver, this.firstTokenId)
              ).to.be.revertedWith("ERC721ReceiverMock: reverting");
            });
          });

          describe("to a receiver contract that reverts without message", () => {
            it("reverts", async () => {
              const revertingReceiver = await ethers.deployContract("ERC721ReceiverMock", [
                RECEIVER_MAGIC_VALUE,
                RevertTypes.RevertWithoutMessage,
              ]);

              await expect(
                this.contract
                  .connect(this.accounts.owner)
                  [fnName](this.accounts.owner, revertingReceiver, this.firstTokenId)
              )
                .to.be.revertedWithCustomError(this.contract, ERC404BErrors.ERC721ReceiverNotImplemented)
                .withArgs(revertingReceiver, this.firstTokenId, 1, "0x");
            });
          });

          describe("to a receiver contract that reverts with custom error", () => {
            it("reverts", async () => {
              const revertingReceiver = await ethers.deployContract("ERC721ReceiverMock", [
                RECEIVER_MAGIC_VALUE,
                RevertTypes.RevertWithCustomError,
              ]);

              await expect(
                this.contract
                  .connect(this.accounts.owner)
                  [fnName](this.accounts.owner, revertingReceiver, this.firstTokenId)
              )
                .to.be.revertedWithCustomError(revertingReceiver, "CustomError")
                .withArgs(RECEIVER_MAGIC_VALUE);
            });
          });

          describe("to a receiver contract that panics", () => {
            it("reverts", async () => {
              const revertingReceiver = await ethers.deployContract("ERC721ReceiverMock", [
                RECEIVER_MAGIC_VALUE,
                RevertTypes.Panic,
              ]);

              await expect(
                this.contract
                  .connect(this.accounts.owner)
                  [fnName](this.accounts.owner, revertingReceiver, this.firstTokenId)
              ).to.be.revertedWithPanic(PANIC_CODES.DIVISION_BY_ZERO);
            });
          });

          describe("to a contract that does not implement the required function", () => {
            it("reverts", async () => {
              const nonReceiver = await ethers.deployContract("Mock");

              await expect(
                this.contract.connect(this.accounts.owner)[fnName](this.accounts.owner, nonReceiver, this.firstTokenId)
              )
                .to.be.revertedWithCustomError(this.contract, ERC404BErrors.ERC721ReceiverNotImplemented)
                .withArgs(nonReceiver, this.firstTokenId, 1, "0x");
            });
          });
        });
      }
    });

    //#region safe mint
    describe("Safe mint:", () => {
      describe("Via safeMint", () => {
        it("- calls onERC721Received — with data", async () => {
          const receiver = await ethers.deployContract("ERC721ReceiverMock", [RECEIVER_MAGIC_VALUE, RevertTypes.None]);

          const data = ethers.Typed.bytes(MOCK_DATA);
          await expect(this.contract.safeMint(receiver, TOKENS_AMOUNT_TO_MINT, data)).to.emit(receiver, "Received");
        });

        it("- calls onERC721Received — without data", async () => {
          const receiver = await ethers.deployContract("ERC721ReceiverMock", [RECEIVER_MAGIC_VALUE, RevertTypes.None]);
          await expect(this.contract.safeMint(receiver, TOKENS_AMOUNT_TO_MINT)).to.emit(receiver, "Received");
        });

        describe("to a receiver contract returning unexpected value", () => {
          it("reverts", async () => {
            const invalidReceiver = await ethers.deployContract("ERC721ReceiverMock", ["0xdeadbeef", RevertTypes.None]);

            await expect(this.contract.safeMint(invalidReceiver, TOKENS_AMOUNT_TO_MINT))
              .to.be.revertedWithCustomError(this.contract, ERC404BErrors.ERC721ReceiverNotImplemented)
              .withArgs(invalidReceiver, this.firstTokenId, TOKENS_AMOUNT_TO_MINT, "0x");
          });
        });

        describe("to a receiver contract that reverts with message", () => {
          it("reverts", async () => {
            const revertingReceiver = await ethers.deployContract("ERC721ReceiverMock", [
              RECEIVER_MAGIC_VALUE,
              RevertTypes.RevertWithMessage,
            ]);

            await expect(this.contract.safeMint(revertingReceiver, TOKENS_AMOUNT_TO_MINT)).to.be.revertedWith(
              "ERC721ReceiverMock: reverting"
            );
          });
        });

        describe("to a receiver contract that reverts without message", () => {
          it("reverts", async () => {
            const revertingReceiver = await ethers.deployContract("ERC721ReceiverMock", [
              RECEIVER_MAGIC_VALUE,
              RevertTypes.RevertWithoutMessage,
            ]);

            await expect(this.contract.safeMint(revertingReceiver, TOKENS_AMOUNT_TO_MINT))
              .to.be.revertedWithCustomError(this.contract, ERC404BErrors.ERC721ReceiverNotImplemented)
              .withArgs(revertingReceiver, this.firstTokenId, TOKENS_AMOUNT_TO_MINT, "0x");
          });
        });

        describe("to a receiver contract that reverts with custom error", () => {
          it("reverts", async () => {
            const revertingReceiver = await ethers.deployContract("ERC721ReceiverMock", [
              RECEIVER_MAGIC_VALUE,
              RevertTypes.RevertWithCustomError,
            ]);

            await expect(this.contract.safeMint(revertingReceiver, TOKENS_AMOUNT_TO_MINT))
              .to.be.revertedWithCustomError(revertingReceiver, "CustomError")
              .withArgs(RECEIVER_MAGIC_VALUE);
          });
        });

        describe("to a receiver contract that panics", () => {
          it("reverts", async () => {
            const revertingReceiver = await ethers.deployContract("ERC721ReceiverMock", [
              RECEIVER_MAGIC_VALUE,
              RevertTypes.Panic,
            ]);

            await expect(this.contract.safeMint(revertingReceiver, TOKENS_AMOUNT_TO_MINT)).to.be.revertedWithPanic(
              PANIC_CODES.DIVISION_BY_ZERO
            );
          });
        });

        describe("to a contract that does not implement the required function", () => {
          it("reverts", async () => {
            const nonReceiver = await ethers.deployContract("Mock");

            await expect(this.contract.safeMint(nonReceiver, TOKENS_AMOUNT_TO_MINT))
              .to.be.revertedWithCustomError(this.contract, ERC404BErrors.ERC721ReceiverNotImplemented)
              .withArgs(nonReceiver, this.firstTokenId, TOKENS_AMOUNT_TO_MINT, "0x");
          });
        });
      });
    });

    //#region approve
    describe("approve", () => {
      beforeEach(async () => {
        this.firstTokenId = await this.contract.getLastTokenId();
        await this.contract.connect(this.accounts.owner).mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);
      });

      const itClearsApproval = () => {
        it("clears approval for the token", async () => {
          expect(await this.contract.getApproved(this.firstTokenId)).to.equal(ethers.ZeroAddress);
        });
      };

      const itEmitsApprovalEvent = () => {
        it("emits an approval event", async () => {
          const events = await getErc721Events(this.tx, EventTypes.Approval);
          const event = findEvent(events, {
            name: EventTypes.Approval,
            from: this.accounts.owner.address,
            to: this.approved,
            value: this.firstTokenId,
          });
          expect(events).to.have.lengthOf(1);
          expect(event).to.not.be.undefined;
        });
      };

      describe("when clearing approval", () => {
        describe("when there was no prior approval", () => {
          beforeEach(async () => {
            this.approved = ethers.ZeroAddress;
            this.tx = await this.contract.connect(this.accounts.owner).approve(this.approved, this.firstTokenId);
          });

          itClearsApproval();
          itEmitsApprovalEvent();
        });

        describe("when there was a prior approval", () => {
          beforeEach(async () => {
            await this.contract.connect(this.accounts.owner).approve(this.accounts.other, this.firstTokenId);
            this.approved = ethers.ZeroAddress;
            this.tx = await this.contract.connect(this.accounts.owner).approve(this.approved, this.firstTokenId);
          });

          itClearsApproval();
          itEmitsApprovalEvent();
        });
      });

      const itApproves = () => {
        it("sets the approval for the target address", async () => {
          expect(await this.contract.getApproved(this.firstTokenId)).to.equal(this.approved ?? this.approved);
        });
      };

      describe("when approving a non-zero/stash address", () => {
        describe("when there was no prior approval", () => {
          beforeEach(async () => {
            this.tx = await this.contract.connect(this.accounts.owner).approve(this.approved, this.firstTokenId);
          });

          itApproves();
          itEmitsApprovalEvent();
        });

        describe("when there was a prior approval to the same address", () => {
          beforeEach(async () => {
            this.tx = await this.contract.connect(this.accounts.owner).approve(this.approved, this.firstTokenId);
          });

          itApproves();
          itEmitsApprovalEvent();
        });

        describe("when there was a prior approval to a different address", () => {
          beforeEach(async () => {
            await this.contract.connect(this.accounts.owner).approve(this.accounts.other, this.firstTokenId);
            this.tx = await this.contract.connect(this.accounts.owner).approve(this.approved, this.firstTokenId);
          });

          itApproves();
          itEmitsApprovalEvent();
        });
      });

      describe("when the sender does not own the given token ID", () => {
        it("reverts", async () => {
          await expect(this.contract.connect(this.accounts.other).approve(this.approved, this.firstTokenId))
            .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721InvalidApprover)
            .withArgs(this.accounts.other);
        });
      });

      describe("when the sender is approved for the given token ID", () => {
        it("reverts", async () => {
          await this.contract.connect(this.accounts.owner).approve(this.approved, this.firstTokenId);

          expect(this.contract.connect(this.approved).approve(this.accounts.other, this.firstTokenId)).to.be
            .revertedWithoutReason;
        });
      });

      describe("when the sender is an operator", () => {
        beforeEach(async () => {
          await this.contract.connect(this.accounts.owner).setApprovalForAll(this.accounts.operator, true);

          this.tx = await this.contract.connect(this.accounts.operator).approve(this.approved, this.firstTokenId);
        });

        itApproves();
        itEmitsApprovalEvent();
      });

      describe("when the given token ID does not exist", () => {
        it("reverts", async () => {
          await expect(
            this.contract
              .connect(this.accounts.operator)
              .approve(this.approved, await this.helpers.nonExistentTokenId())
          )
            .to.be.revertedWithCustomError(this.contract, ERC20Errors.ERC20InvalidSpender)
            .withArgs(this.approved);
        });
      });
    });

    //#region set approval for all
    describe("setApprovalForAll", () => {
      describe("when the operator willing to approve is not the owner", () => {
        describe("when there is no operator approval set by the sender", () => {
          it("approves the operator", async () => {
            await this.contract.connect(this.accounts.owner).setApprovalForAll(this.accounts.operator, true);

            expect(await this.contract.isApprovedForAll(this.accounts.owner, this.accounts.operator)).to.be.true;
          });

          it("emits an approval event", async () => {
            const approvalValue = true;

            const tx = await this.contract
              .connect(this.accounts.owner)
              .setApprovalForAll(this.accounts.operator, approvalValue);

            const events = await getErc721Events(tx, EventTypes.ApprovalForAll);
            const event = findEvent(events, {
              name: EventTypes.ApprovalForAll,
              from: this.accounts.owner.address,
              to: this.accounts.operator.address,
              value: approvalValue,
            });

            expect(events).to.have.lengthOf(1);
            expect(event).to.not.be.undefined;
          });
        });

        describe("when the operator was set as not approved", () => {
          beforeEach(async () => {
            await this.contract.connect(this.accounts.owner).setApprovalForAll(this.accounts.operator, false);
          });

          it("approves the operator", async () => {
            await this.contract.connect(this.accounts.owner).setApprovalForAll(this.accounts.operator, true);

            expect(await this.contract.isApprovedForAll(this.accounts.owner, this.accounts.operator)).to.be.true;
          });

          it("emits an approval event", async () => {
            const approvalValue = true;

            const tx = await this.contract
              .connect(this.accounts.owner)
              .setApprovalForAll(this.accounts.operator, approvalValue);

            const events = await getErc721Events(tx, EventTypes.ApprovalForAll);
            const event = findEvent(events, {
              name: EventTypes.ApprovalForAll,
              from: this.accounts.owner.address,
              to: this.accounts.operator.address,
              value: approvalValue,
            });

            expect(events).to.have.lengthOf(1);
            expect(event).to.not.be.undefined;
          });

          it("can unset the operator approval", async () => {
            await this.contract.connect(this.accounts.owner).setApprovalForAll(this.accounts.operator, false);

            expect(await this.contract.isApprovedForAll(this.accounts.owner, this.accounts.operator)).to.be.false;
          });
        });

        describe("when the operator was already approved", () => {
          beforeEach(async () => {
            await this.contract.connect(this.accounts.owner).setApprovalForAll(this.accounts.operator, true);
          });

          it("keeps the approval to the given address", async () => {
            await this.contract.connect(this.accounts.owner).setApprovalForAll(this.accounts.operator, true);

            expect(await this.contract.isApprovedForAll(this.accounts.owner, this.accounts.operator)).to.be.true;
          });

          it("emits an approval event", async () => {
            const approvalValue = true;

            const tx = await this.contract
              .connect(this.accounts.owner)
              .setApprovalForAll(this.accounts.operator, approvalValue);

            const events = await getErc721Events(tx, EventTypes.ApprovalForAll);
            const event = findEvent(events, {
              name: EventTypes.ApprovalForAll,
              from: this.accounts.owner.address,
              to: this.accounts.operator.address,
              value: approvalValue,
            });

            expect(events).to.have.lengthOf(1);
            expect(event).to.not.be.undefined;
          });
        });
      });

      describe("when the operator is address zero", () => {
        it("keeps the approval", async () => {
          await this.contract.connect(this.accounts.owner).setApprovalForAll(ethers.ZeroAddress, true);

          expect(await this.contract.isApprovedForAll(this.accounts.owner, ethers.ZeroAddress)).to.be.true;
        });
      });
    });

    //#region get approved
    describe("getApproved", () => {
      describe("when token is not minted", () => {
        it("reverts", async () => {
          const nonExistentTokenId = await this.helpers.nonExistentTokenId();
          await expect(this.contract.getApproved(nonExistentTokenId))
            .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721NonexistentToken)
            .withArgs(nonExistentTokenId);
        });
      });

      describe("when token has been minted ", () => {
        it("should return the zero address", async () => {
          await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);
          expect(await this.contract.getApproved(TOKENS_AMOUNT_TO_MINT)).to.equal(ethers.ZeroAddress);
        });

        describe("when account has been approved", () => {
          beforeEach(async () => {
            await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);
            await this.contract.connect(this.accounts.owner).approve(this.accounts.approved, TOKENS_AMOUNT_TO_MINT);
          });

          it("returns approved account", async () => {
            expect(await this.contract.getApproved(TOKENS_AMOUNT_TO_MINT)).to.equal(this.accounts.approved);
          });
        });
      });
    });
  });

  //#region _mint(address, uint256)
  describe("_mint(address, uint256)", () => {
    describe("reverts with a null destination address", () => {
      it("zero address", async () => {
        await expect(this.contract.mint(ethers.ZeroAddress, TOKENS_AMOUNT_TO_MINT))
          .revertedWithCustomError(this.contract, ERC20Errors.ERC20InvalidReceiver)
          .withArgs(ethers.ZeroAddress);
      });

      it("stash address", async () => {
        const stashAddress = await this.contract.stashAddress();
        await expect(this.contract.mint(stashAddress, TOKENS_AMOUNT_TO_MINT))
          .revertedWithCustomError(this.contract, ERC20Errors.ERC20InvalidReceiver)
          .withArgs(stashAddress);
      });
    });

    describe("with minted token", () => {
      beforeEach(async () => {
        this.firstTokenId = await this.contract.getLastTokenId();
        this.tx = await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);
      });

      it("emits a Transfer event", async () => {
        const events = await getErc721Events(this.tx, EventTypes.Transfer);
        const event = findEvent(events, {
          name: EventTypes.Transfer,
          from: ethers.ZeroAddress,
          to: this.accounts.owner.address,
          value: this.firstTokenId,
        });
        expect(event).to.not.be.undefined;
      });

      it("creates the token", async () => {
        expect(await this.contract.balanceOf(this.accounts.owner)).to.equal(
          this.helpers.parseToBalance(TOKENS_AMOUNT_TO_MINT)
        );
        expect(await this.contract.ownerOf(this.firstTokenId)).to.equal(this.accounts.owner);
      });
    });
  });

  //#region _burn
  describe("_burn", () => {
    it("reverts when burning a non-existent token id", async () => {
      const nonExistentTokenId = await this.helpers.nonExistentTokenId();
      await expect(this.contract.burn(nonExistentTokenId))
        .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721NonexistentToken)
        .withArgs(nonExistentTokenId);
    });

    describe("with minted tokens", () => {
      beforeEach(async () => {
        this.firstTokenId = await this.contract.getLastTokenId();
        await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);

        this.secondTokenId = await this.contract.getLastTokenId();
        await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);
      });

      describe("with burnt token", () => {
        beforeEach(async () => {
          this.tx = await this.contract.burn(this.firstTokenId);
        });

        it("emits a Transfer event", async () => {
          const events = await getErc721Events(this.tx, EventTypes.Transfer);
          const event = findEvent(events, {
            name: EventTypes.Transfer,
            from: this.accounts.owner.address,
            to: ethers.ZeroAddress,
            value: this.firstTokenId,
          });
          expect(event).to.not.be.undefined;
        });

        it("deletes the token", async () => {
          expect(await this.contract.balanceOf(this.accounts.owner)).to.equal(
            this.helpers.parseToBalance((await this.contract.getTotalMinted()) - BigInt(1))
          );

          await expect(this.contract.ownerOf(this.firstTokenId))
            .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721NonexistentToken)
            .withArgs(this.firstTokenId);
        });

        it("after burn, zero address dont have any token", async () => {
          expect(await this.contract.balanceOf(ethers.ZeroAddress)).to.equal(0n);
        });

        it("reverts when burning a token id that has been deleted", async () => {
          await expect(this.contract.burn(this.firstTokenId))
            .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721NonexistentToken)
            .withArgs(this.firstTokenId);
        });
      });
    });
  });

  //#region metadata
  describe("metadata", () => {
    it("has a name", async () => {
      expect(await this.contract.name()).to.equal(this.info.name);
    });

    it("has a symbol", async () => {
      expect(await this.contract.symbol()).to.equal(this.info.symbol);
    });

    describe("token URI", () => {
      beforeEach(async () => {
        this.firstTokenId = await this.contract.getLastTokenId();
        await this.contract.mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);
      });

      it("return empty string by default", async () => {
        expect(await this.contract.tokenURI(this.firstTokenId)).to.equal("");
      });

      it("reverts when queried for non existent token id", async () => {
        const nonExistentTokenId = await this.helpers.nonExistentTokenId();
        await expect(this.contract.tokenURI(nonExistentTokenId))
          .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721NonexistentToken)
          .withArgs(nonExistentTokenId);
      });
    });
  });

  //#region exchange with stash
  describe("exchangeWithStash", () => {
    beforeEach(async () => {
      this.firstTokenId = await this.contract.getLastTokenId();
      await this.contract.connect(this.accounts.owner).mint(this.accounts.other, TOKENS_AMOUNT_TO_MINT);

      // the tokens save on stash in reverse order, the first token id is the last token minted position
      this.firstTokenIdStashIndex = (await this.contract.owned(this.accounts.other)).length - 1;

      //move tokens to stash
      await this.contract.connect(this.accounts.other).setERC721TransferExempt(true);

      this.secondTokenId = await this.contract.getLastTokenId();
      await this.contract.connect(this.accounts.owner).mint(this.accounts.owner, TOKENS_AMOUNT_TO_MINT);
    });

    describe("with stash index is valid and the caller:", () => {
      describe("is the owner of the token", () => {
        it("the caller lost his token and receive the token of the stash", async () => {
          await this.contract
            .connect(this.accounts.owner)
            .exchangeWithStash(this.secondTokenId, this.firstTokenIdStashIndex);
          const tokens = await this.contract.owned(this.accounts.owner);

          expect(tokens).to.include(this.firstTokenId);
          expect(tokens).to.not.include(this.secondTokenId);
        });
      });

      describe("has approval to transfer the token", () => {
        it("the caller lost his token and receive the token of the stash", async () => {
          await this.contract.connect(this.accounts.owner).approve(this.accounts.approved, this.secondTokenId);
          await this.contract
            .connect(this.accounts.approved)
            .exchangeWithStash(this.secondTokenId, this.firstTokenIdStashIndex);
          const tokens = await this.contract.owned(this.accounts.owner);

          expect(tokens).to.include(this.firstTokenId);
          expect(tokens).to.not.include(this.secondTokenId);
        });
      });

      describe("hasn`t approval to transfer the token", () => {
        it("reverts", async () => {
          await expect(
            this.contract
              .connect(this.accounts.newOwner)
              .exchangeWithStash(this.secondTokenId, this.firstTokenIdStashIndex)
          )
            .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721InsufficientApproval)
            .withArgs(this.accounts.newOwner, this.secondTokenId);
        });
      });
    });

    describe("with a valid case:", () => {
      describe("when token id is invalid", () => {
        it("reverts", async () => {
          const nonExistentTokenId = await this.helpers.nonExistentTokenId();
          await expect(
            this.contract
              .connect(this.accounts.owner)
              .exchangeWithStash(nonExistentTokenId, this.firstTokenIdStashIndex)
          )
            .to.be.revertedWithCustomError(this.contract, ERC721Errors.ERC721NonexistentToken)
            .withArgs(nonExistentTokenId);
        });
      });

      describe("when index of stash is invalid", () => {
        it("reverts", async () => {
          await expect(
            this.contract.connect(this.accounts.owner).exchangeWithStash(this.secondTokenId, 10)
          ).to.be.revertedWithCustomError(this.contract, ERC404BErrors.QueueOutOfBounds);
        });
      });

      describe("Emits event for the token exchanged from:", () => {
        beforeEach(async () => {
          this.tx = await this.contract
            .connect(this.accounts.owner)
            .exchangeWithStash(this.secondTokenId, this.firstTokenIdStashIndex);
        });

        it("the stash to the caller", async () => {
          const events = await getErc721Events(this.tx, EventTypes.Transfer);
          const event = findEvent(events, {
            name: EventTypes.Transfer,
            from: await this.contract.stashAddress(),
            to: this.accounts.owner.address,
            value: this.firstTokenId,
          });
          expect(event).to.not.be.undefined;
        });

        it("the caller to the stash", async () => {
          const events = await getErc721Events(this.tx, EventTypes.Transfer);
          const event = findEvent(events, {
            name: EventTypes.Transfer,
            from: this.accounts.owner.address,
            to: await this.contract.stashAddress(),
            value: this.secondTokenId,
          });
          expect(event).to.not.be.undefined;
        });
      });
    });
  });
});
