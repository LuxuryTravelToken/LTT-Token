import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { Token__factory } from "../typechain-types/factories/contracts/Token__factory";
import { Token } from "../typechain-types/contracts/Token";
import { Vesting__factory } from "../typechain-types/factories/contracts/Vesting__factory";
import { Vesting } from "../typechain-types/contracts/Vesting";

describe('Token contract', () => {
    let token: Token;
    let vesting: Vesting;
    let owner: HardhatEthersSigner;
    let addr1: HardhatEthersSigner;
    let addr2: HardhatEthersSigner;
    let addr3: HardhatEthersSigner;
    const name = "Orange Token";
    const symbol = "OT";
    const totalSupply = ethers.parseUnits("100000000000");

    beforeEach(async () => {
        [owner, addr1, addr2, addr3] = await ethers.getSigners();
        const Token = (await ethers.getContractFactory('Token')) as Token__factory;
        token = await Token.deploy(name, symbol, owner);

        const Vesting = (await ethers.getContractFactory('Vesting')) as Vesting__factory;
        vesting = await Vesting.deploy(token.target, owner.address);
    });

    describe('Deployment', async () => {
        it('should successfully deploy the contract with valid constructor parameters', async () => {
            /* ASSERT */
            expect(await token.name()).to.equal(name);
            expect(await token.symbol()).to.equal(symbol);
            expect(await token.admin()).to.equal(owner.address);
        });
    });

    describe('executes TGE', async () => {
        it('executes TGE successfully', async () => {
            /* ASSERT */
            expect(await token.isExecuted()).to.equal(false);

            /* EXECUTE */
            const tx = await token.connect(owner).executeTGE(vesting.target);

            /* ASSERT */
            expect(await token.isExecuted()).to.equal(true);
            expect(await token.balanceOf(vesting.target)).to.equal(totalSupply);

            await expect(tx).to.emit(token, "Transfer")
                .withArgs(ethers.ZeroAddress, vesting.target, totalSupply);
        });

        it('rejects if TGE executed', async () => {
            /* SETUP */
            await token.connect(owner).executeTGE(vesting.target);

            /* EXECUTE */
            const promise = token.connect(owner).executeTGE(vesting.target);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(token, "TGEExecuted()");
        });

        it('rejects if not owner', async () => {
            /* EXECUTE */
            const promise = token.connect(addr1).executeTGE(vesting.target);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(token, "AccessIsDenied()");
        });
    });
});