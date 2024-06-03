const { ethers } = require('hardhat');
const { expect } = require('chai');
const { EventTypes, getEvents } = require('../utils/web3');
const { ERC20Errors, ERC721Errors, ERC404BErrors } = require('../utils/enums');

/**
 * @function getErc20Events - Get the erc20 events from a transaction
 * @param {*} tx  - The transaction to get the events from
 * @param {EventTypes} eventType - The type of event to get
 * @returns The emitted events from the transaction
 */
const getErc20Events = async (tx, eventType) => {
  return getEvents("ERC20", tx, eventType);
};

const shouldBehaveLikeERC20 = (initialSupply) => {

  let expectedAmmount;

  const deployERC20Contract = async () => {
    const ERC404BMock = await ethers.getContractFactory("ERC404BMock");
    const contract = await ERC404BMock.deploy();
    return await contract.waitForDeployment();
  }

  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    const [holder, recipient, other, owner] = accounts;

    const ERC404BMock = await ethers.getContractFactory("ERC404BMock");
    const token = await ERC404BMock.connect(holder).deploy();
    await token.waitForDeployment();
    await token.mint(holder, initialSupply);
    unit = await token.unit();


    Object.assign(this, {
      accounts: { holder, recipient, other, owner },
      token,
      unit,
    });
    expectedAmmount = initialSupply * unit;
  });

  it('total supply: returns the total token value', async () => {
    expect(await this.token.totalSupply()).to.equal(expectedAmmount);
  });

  describe('balanceOf', () => {
    it('returns zero when the requested account has no tokens', async () => {
      expect(await this.token.balanceOf(this.accounts.other)).to.equal(0n);
    });

    it('returns the total token value when the requested account has some tokens', async () => {
      expect(await this.token.balanceOf(this.accounts.holder)).to.equal(expectedAmmount);
    });
  });

  describe('Transfer exempt', ()=> {
    it('For default is false', async ()=> {
      expect(await this.token.connect(this.accounts.owner).isERC721TransferExempt(this.accounts.owner)).to.be.false;
    })
    it('Change to true', async ()=> {
      await this.token.connect(this.accounts.owner).setERC721TransferExempt(true);
      expect(await this.token.connect(this.accounts.owner).isERC721TransferExempt(this.accounts.owner)).to.be.true;
    })
  })

  describe('Transfer ERC20 with ERC721', ()=> {
    const transferValue = 1

    /**
     * @function buildContext - Build the context for the test and modifies 'this' to set utils
     * @param {Object} ERC721TransferExempt - Specifies the transfer exemptions
     * @param {Boolean} holder - account boolean to set ERC721TransferExempt
     * @param {Boolean} recipient - account boolean to set ERC721TransferExempt
     */
    const buildContext = async ({holder, recipient})=> {
      await this.token.connect(this.accounts.holder).setERC721TransferExempt(holder);
      await this.token.connect(this.accounts.recipient).setERC721TransferExempt(recipient);

      this.beforeTokensOfHolder = await this.token.owned(this.accounts.holder);
      this.beforeTokensOfRecipient = await this.token.owned(this.accounts.recipient);

      this.tx = await this.token.connect(this.accounts.holder).transfer(this.accounts.recipient, ethers.parseEther(String(transferValue)))

      this.afterTokensOfHolder = await this.token.owned(this.accounts.holder);
      this.afterTokensOfRecipient = await this.token.owned(this.accounts.recipient);
    }

    describe('Case 1: Both sender and recipient are ERC-721 transfer exempt', ()=> {
      beforeEach(async ()=> {
        await buildContext({ holder: true, recipient: true });
      })
      it('No ERC-721s need to be transferred', async ()=> {
        expect(this.afterTokensOfHolder).to.have.lengthOf(0);
        expect(this.afterTokensOfRecipient).to.have.lengthOf(0);
      })
    })

    describe('Case 2: The sender is ERC-721 transfer exempt, but the recipient is not', ()=> {
      beforeEach(async ()=> {
        await buildContext({ holder: true, recipient: false });
      })
      it('Retrieve from stash to recipient', async ()=> {
        expect(this.afterTokensOfHolder).to.have.lengthOf(0);
        expect(this.afterTokensOfRecipient).to.have.lengthOf(this.beforeTokensOfRecipient.length + Number(transferValue));
      })
    })

    describe('Case 3: The sender is not ERC-721 transfer exempt, but the recipient is', ()=> {
      beforeEach(async ()=> {
        await buildContext({ holder: false, recipient: true });
      })
      it('Stash sender tokens', async ()=> {
        expect(this.afterTokensOfHolder).to.have.lengthOf(this.beforeTokensOfHolder.length - Number(transferValue));
        expect(this.afterTokensOfRecipient).to.have.lengthOf(0);
      })
    })

    describe('Case 4: Neither the sender nor the recipient are ERC-721 transfer exempt', ()=> {
      beforeEach(async ()=> {
        await buildContext({ holder: false, recipient: false });
      })
      it('Batch Transfer ERC721 With Balance Adjustment', async ()=> {
        expect(this.afterTokensOfHolder).to.have.lengthOf(this.beforeTokensOfHolder.length - Number(transferValue));
        expect(this.afterTokensOfRecipient).to.have.lengthOf(this.beforeTokensOfRecipient.length + Number(transferValue));
      })
    })
  })

  describe('transfer', () => {
    beforeEach(async () => {
      this.transfer = (from, to, value) => this.token.connect(from).transfer(to, value);
    });
    shouldBehaveLikeERC20Transfer(initialSupply);
  });

  describe('transfer from', () => {
    describe('when the token owner is not the zero address', () => {
      describe('when the recipient is not the zero address', () => {
        describe('when the spender has enough allowance', () => {
          beforeEach(async () => {
            const tx = await this.token.connect(this.accounts.holder).approve(this.accounts.recipient, initialSupply);
            await tx.wait();
          });

          describe('when the token owner has enough balance', () => {
            const value = initialSupply;

            beforeEach(async () => {
              this.tx = await this.token.connect(this.accounts.recipient).transferFrom(this.accounts.holder, this.accounts.other, value);
            });

            it('transfers the requested value', async () => {
              const unit = await this.token.unit();
              const expectedValue = value * unit;
              expect(await this.token.balanceOf(this.accounts.other) + await this.token.balanceOf(this.accounts.holder)).to.equal(expectedValue);
            });

            it('decreases the spender allowance', async () => {
              expect(await this.token.allowance(this.accounts.holder, this.accounts.recipient)).to.equal(0n);
            });

            it('emits a transfer event', async () => {
              const events = await getErc20Events(this.tx, EventTypes.Transfer);
              expect(events.filter((e) => e.name === EventTypes.Transfer).length == 1).to.be.true;
            });

          });

          it('reverts when the token owner does not have enough balance', async () => {
            const value = await this.token.balanceOf(this.accounts.holder);
            await this.token.connect(this.accounts.holder).transfer(this.accounts.other, 1n);
            await expect(this.token.connect(this.accounts.recipient).transfer(this.accounts.holder, value))
              .to.revertedWithCustomError(this.token, ERC20Errors.ERC20InsufficientBalance);
          });
        });

        describe('when the spender does not have enough allowance', () => {
          const allowance = initialSupply - 1n;

          beforeEach(async () => {
            await this.token.connect(this.accounts.holder).approve(this.accounts.recipient, allowance);
          });

          it('reverts when the token owner has enough balance', async () => {
            const value = initialSupply;
            await expect(this.token.connect(this.accounts.recipient).transferFrom(this.accounts.holder, this.accounts.other, value))
              .to.be.revertedWithCustomError(this.token, ERC721Errors.ERC721InsufficientApproval);
          });

          it('reverts when the token owner does not have enough balance', async () => {
            const value = allowance;
            await this.token.connect(this.accounts.holder).transfer(this.accounts.other, value);
            await expect(this.token.connect(this.accounts.recipient).transferFrom(this.accounts.holder, this.accounts.other, value))
              .to.revertedWithCustomError(this.token, ERC721Errors.ERC721InsufficientApproval);
          });
        });

        describe('when the spender has unlimited allowance', () => {
          let approvalEvents;

          beforeEach(async () => {
            await this.token.connect(this.accounts.holder).approve(this.accounts.recipient, ethers.MaxUint256);
          });

          it('does not decrease the spender allowance', async () => {
            expect(await this.token.allowance(this.accounts.holder, this.accounts.recipient)).to.equal(ethers.MaxUint256);
          });

        });
      });

      it('reverts when the recipient is the zero address', async () => {
        const value = initialSupply;
        await this.token.connect(this.accounts.holder).approve(this.accounts.recipient, value);
        await expect(this.token.connect(this.accounts.recipient).transferFrom(this.accounts.holder, ethers.ZeroAddress, value))
          .to.be.revertedWithCustomError(this.token, ERC721Errors.ERC721InvalidReceiver);
      });
    });

    it('reverts when the token owner is the zero address', async () => {
      const value = 1n;
      await expect(this.token.connect(this.accounts.recipient).transferFrom(ethers.ZeroAddress, this.accounts.recipient, value))
        .to.be.revertedWithCustomError(this.token, ERC721Errors.ERC721InsufficientApproval);
    });
  });

  describe('approve', () => {
    beforeEach(() => {
      this.approve = (owner, spender, value) => this.token.connect(owner).approve(spender, value);
    });

    shouldBehaveLikeERC20Approve(initialSupply);
  });

  describe('allowance', ()=> {
    beforeEach(async ()=> {
      await this.token.connect(this.accounts.holder).approve(this.accounts.recipient, initialSupply);
      await this.token.getApproved(initialSupply)
    })

    describe('when the token owner transfer a part of it to other address', ()=> {
      it('recipient lost the allowance', async ()=> {
        await this.token.connect(this.accounts.holder).transfer(this.accounts.other, ethers.parseEther(String(initialSupply / 2n)));
        
        expect(await this.token.getApproved(initialSupply)).to.not.equal(this.accounts.recipient);
      })
    })

    describe('when the token owner transfer 1 * unit of it to other address', ()=> {
      it('recipient lost the allowance', async ()=> {
        await this.token.connect(this.accounts.holder).transfer(this.accounts.other, 1n * this.unit);

        expect(await this.token.getApproved(initialSupply)).to.not.equal(this.accounts.recipient);
      })
    })
  })

  describe('safeMint', () => {
    it("ERC405 b3: Test _safeMint function", async () => {
      const erc20 = await deployERC20Contract();
      let quantity = 5;

      const zeroAddress = ethers.ZeroAddress;
      await expect(erc20.safeMint(zeroAddress, quantity)).to.be.revertedWithCustomError(erc20, ERC20Errors.ERC20InvalidReceiver);
      const stashAddress = await erc20.stashAddress();
      await expect(erc20.safeMint(stashAddress, quantity)).to.be.revertedWithCustomError(erc20, ERC404BErrors.ERC721ReceiverNotImplemented);

      const totalSupplyBefore = await erc20.totalSupply();
      const initialUserBalance = await erc20.balanceOf(this.accounts.owner);
      expect(totalSupplyBefore).to.be.equal(0);
      expect(initialUserBalance).to.be.equal(0);

      await erc20.safeMint(this.accounts.owner, quantity);

      const events = await getErc20Events(this.tx, EventTypes.Transfer);
      expect(events.filter((e) => e.name === EventTypes.Transfer).length == 1).to.be.true;

      const totalSupplyAfterA = await erc20.totalSupply();
      const unit = await erc20.unit();
      let expectedAmmount = (BigInt(quantity) * unit);
      expect(totalSupplyAfterA).to.be.equal(expectedAmmount + totalSupplyBefore);
      let increasedUserBalance = await erc20.balanceOf(this.accounts.owner);
      expect(increasedUserBalance).to.be.equal(expectedAmmount + initialUserBalance);

      quantity = 10;
      expectedAmmount = (BigInt(quantity) * unit);

      const initialUserBalanceB = await erc20.balanceOf(this.accounts.holder);
      expect(initialUserBalanceB).to.be.equal(0);

      await erc20.safeMint(this.accounts.holder, quantity);
      increasedUserBalance = await erc20.balanceOf(this.accounts.holder);
      expect(increasedUserBalance).to.be.equal(expectedAmmount + initialUserBalanceB);
      expect(await erc20.totalSupply()).to.be.equal(totalSupplyAfterA + expectedAmmount);

      const erc20Events = await getErc20Events(this.tx, EventTypes.Transfer);
      expect(erc20Events.filter((e) => e.name === EventTypes.Transfer).length == 1).to.be.true;
    })
  })
}

const shouldBehaveLikeERC20Transfer = (balance) => {
  describe('when the recipient is not the zero address', () => {
    it('reverts when the sender does not have enough balance', async () => {
      const value = balance * await this.token.unit() + 1n;
      await expect(this.transfer(this.accounts.holder, this.accounts.recipient, value))
        .to.be.revertedWithCustomError(this.token, ERC20Errors.ERC20InsufficientBalance);
    });

    describe('when the sender transfers all balance', async () => {
      const value = balance * await this.token.unit();

      beforeEach(async () => {
        this.tx = await this.transfer(this.accounts.holder, this.accounts.recipient, value);
      });

      it('transfers the requested value', async () => {
        await expect(this.tx).to.changeTokenBalances(this.token, [this.accounts.holder, this.accounts.recipient], [-value, value]);
      });

      it('emits a transfer event', async () => {
        const events = await getErc20Events(tx, EventTypes.Transfer);
        expect(events.filter((e) => e.name === EventTypes.Transfer).length == 1).to.be.true;
      });
    });

    describe('when the sender transfers zero tokens', () => {
      const value = 0n;

      beforeEach(async () => {
        this.tx = await this.transfer(this.accounts.holder, this.accounts.recipient, value);
      });

      it('transfers the requested value', async () => {
        await expect(this.tx).to.changeTokenBalances(this.token, [this.accounts.holder, this.accounts.recipient], [0n, 0n]);
      });

      it('emits a transfer event', async () => {
        const events = await getErc20Events(this.tx, EventTypes.Transfer);
        expect(events.filter((e) => e.name === EventTypes.Transfer).length == 1).to.be.true;
      });
    });
  });

  it('reverts when the recipient is the zero address', async () => {
    const holder = this.accounts.holder;
    await expect(this.transfer(holder, ethers.ZeroAddress, balance))
      .to.be.revertedWithCustomError(this.token, ERC721Errors.ERC721InvalidReceiver);
  });
}

const shouldBehaveLikeERC20Approve = (supply) => {
  describe('when the spender is not the zero address', () => {
    describe('when the sender has enough balance', () => {
      const value = supply;

      it('emits an approval event', async () => {
        const tx = await this.approve(this.accounts.holder, this.accounts.recipient, ethers.parseEther(value.toString()));
        await tx.wait();
      
        const events = await getErc20Events(tx, EventTypes.Approval);
        expect(events.filter((e) => e.name === EventTypes.Approval).length == 1).to.be.true;
      });

      it('approves the requested value when there was no approved value before', async () => {
        await this.approve(this.accounts.holder, this.accounts.recipient, ethers.parseEther(value.toString()));

        expect(await this.token.allowance(this.accounts.holder, this.accounts.recipient)).to.equal(ethers.parseEther(value.toString()));
      });

      it('approves the requested value and replaces the previous one when the spender had an approved value', async () => {
        await this.approve(this.accounts.holder, this.accounts.recipient, 1n);
        await this.approve(this.accounts.holder, this.accounts.recipient, ethers.parseEther(value.toString()));

        expect(await this.token.allowance(this.accounts.holder, this.accounts.recipient)).to.equal(ethers.parseEther(value.toString()));
      });
    });

    describe('when the sender does not have enough balance', () => {
      const value = supply + 1n;

      it('emits an approval event', async () => {
        const tx = await this.approve(this.accounts.holder, this.accounts.recipient, ethers.parseEther(value.toString()));
        await tx.wait();
        
        const events = await getErc20Events(tx, EventTypes.Approval);
        expect(events.filter((e) => e.name === EventTypes.Approval).length == 1).to.be.true;
      });

      it('approves the requested value when there was no approved value before', async () => {
        await this.approve(this.accounts.holder, this.accounts.recipient, value);

        expect(await this.token.allowance(this.accounts.holder, this.accounts.recipient)).to.equal(value);
      });

      it('approves the requested value and replaces the previous one when the spender had an approved value', async () => {
        await this.approve(this.accounts.holder, this.accounts.recipient, 1n);
        await this.approve(this.accounts.holder, this.accounts.recipient, value);

        expect(await this.token.allowance(this.accounts.holder, this.accounts.recipient)).to.equal(value);
      });
    });
  });

  it('reverts when the spender is the zero address', async () => {
    expect(this.approve(this.accounts.holder, ethers.ZeroAddress, supply))
      .to.not.fulfilled;
  });
}

module.exports = {
  shouldBehaveLikeERC20,
  shouldBehaveLikeERC20Transfer,
  shouldBehaveLikeERC20Approve,
};


