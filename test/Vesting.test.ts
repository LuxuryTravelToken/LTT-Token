import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers"
import { Token__factory } from "../typechain-types/factories/contracts/Token__factory";
import { Token } from "../typechain-types/contracts/Token";
import { Vesting__factory } from "../typechain-types/factories/contracts/Vesting__factory";
import { Vesting } from "../typechain-types/contracts/Vesting";
import { BUSDMock__factory } from "../typechain-types/factories/contracts/test/BUSDMock__factory";
import { BUSDMock } from "../typechain-types/contracts/test/BUSDMock";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

async function incrementNextBlockTimestamp(amount: number): Promise<void> {
    return ethers.provider.send("evm_increaseTime", [amount]);
}

async function getBlockTimestamp(tx: any): Promise<number> {
    const minedTx = await tx.wait();
    const txBlock = await ethers.provider.getBlock(minedTx.blockNumber);
    return txBlock?.timestamp || 0;
}

async function getLatestBlockTimestamp(): Promise<number> {
    const block = await ethers.provider.getBlock('latest', true);
    return block?.timestamp || 0;
}

describe('Vesting contract', () => {
    let token: Token;
    let Vesting: Vesting__factory;
    let vesting: Vesting;
    let busdMock: BUSDMock;
    let owner: HardhatEthersSigner;
    let addr1: HardhatEthersSigner;
    let addr2: HardhatEthersSigner;
    let addr3: HardhatEthersSigner;
    const name = "Orange Token";
    const symbol = "OT";
    const zeroAddress = '0x0000000000000000000000000000000000000000';
    const totalSupply = ethers.parseUnits("100000000000");

    enum Direction {
        PUBLIC_ROUND,
        STAKING,
        TEAM,
        LIQUIDITY,
        MARKETING,
        TREASURY
    }

    beforeEach(async () => {
        [owner, addr1, addr2, addr3] = await ethers.getSigners();

        const Token = (await ethers.getContractFactory('Token')) as Token__factory;
        token = await Token.deploy(name, symbol, owner.address);

        Vesting = (await ethers.getContractFactory('Vesting')) as Vesting__factory;

        const BUSDMock = (await ethers.getContractFactory('BUSDMock')) as BUSDMock__factory;
        busdMock = await BUSDMock.deploy();
    });

    describe('Deployment', async () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);
        });

        it('should successfully deploy the contract with valid constructor parameters', async () => {
            /* ASSERT */
            expect(owner.address).to.equal(await vesting.admin());
            expect(token.target).to.equal(await vesting.token());
        })
    });

    describe('setVestingStartTimestamp', async () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);
        });

        it('should set the vesting start timestamp', async () => {
            /* EXECUTE */
            await vesting.setVestingStartTimestamp();

            /* ASSERT */
            expect(await vesting.vestingStartTimestamp()).to.equal(await getLatestBlockTimestamp());
        });

        it('rejects if already set', async () => {
            /* EXECUTE */
            await vesting.setVestingStartTimestamp();

            /* ASSERT */
            const promise = vesting.setVestingStartTimestamp();

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "VestingAlreadyStarted()"
            );
        });

        it('rejects if not default admin role', async () => {
            /* SETUP */
            const nonAdmin = addr1;

            /* EXECUTE */
            const promise = vesting.connect(nonAdmin).setVestingStartTimestamp()

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                vesting, "AccessIsDenied()")
        });
    });

    describe('vestingStartTimestamp', async () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);
        });

        it('should return the correct start timestamp', async () => {
            /* SETUP */
            await vesting.setVestingStartTimestamp();

            /* EXECUTE */
            const startTimestamp = await vesting.vestingStartTimestamp();

            /* ASSERT */
            expect(await getLatestBlockTimestamp()).to.equal(startTimestamp);
        });
    });

    describe('rescueERC20', async () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);
        });

        it('should allow the owner to rescue ERC20', async function () {
            /* SETUP */
            const to = owner.address;
            const amount = ethers.parseUnits('1', 18);

            // Transfer some tokens to the contract
            await busdMock.mint(vesting.target, amount);

            /* ASSERT */
            const ownerBalanceBefore = await busdMock.balanceOf(to);

            expect(await busdMock.balanceOf(vesting.target)).to.equal(amount);

            /* EXECUTE */
            await vesting.connect(owner).rescueERC20(busdMock.target, to, amount);

            /* ASSERT */
            const ownerBalanceAfter = await busdMock.balanceOf(to);

            expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + amount);
            expect(await busdMock.balanceOf(vesting.target)).to.equal(0);
        });

        it('should prevent zero address from withdrawing stuck tokens', async function () {
            /* SETUP */
            const amount = ethers.parseUnits('1', 18);

            /* EXECUTE */
            const promise = vesting.rescueERC20(zeroAddress, addr2.address, amount);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                `ZeroAddress()`
            );
        });

        it('should prevent own contract address from withdrawing stuck tokens', async function () {
            /* SETUP */
            const amount = ethers.parseUnits('1', 18);

            /* EXECUTE */
            const promise = vesting.rescueERC20(token.target, addr2.address, amount);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                `ForbiddenWithdrawalFromOwnContract()`
            );
        });

        it('rejects if not default admin role', async function () {
            /* SETUP */
            const amount = ethers.parseUnits('1', 18);

            /* EXECUTE */
            const promise = vesting.connect(addr3).rescueERC20(busdMock.target, addr2.address, amount);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                vesting, "AccessIsDenied()");
        });
    });

    describe('sets public round vest for', async () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);
            await vesting.setVestingStartTimestamp();
        });

        it('distributes tokens if available amount is less than total amount', async () => {
            // 1. 50% of tokens has been claimed by addr1
            const accounts = [addr1.address];
            let amounts = [totalSupply / 2n];
            await vesting.connect(owner).setPublicRoundVestFor(accounts, amounts)
            await vesting.connect(addr1).claim();

            // 2. allocate 1 more token to addr1
            amounts = [(totalSupply / 2n) + 1n];
            await vesting.connect(owner).setPublicRoundVestFor(accounts, amounts)
            await vesting.connect(addr1).claim();

            expect(await token.balanceOf(addr1.address)).to.equal((totalSupply / 2n) + 1n);
        });

        it(`sets public round vest for successfully`, async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("200", 18)];
            const totalAmountBefore = 0n;
            const totalAmountAfter = ethers.parseUnits("100", 18) + ethers.parseUnits("200", 18);
            const direction = Direction.PUBLIC_ROUND;
            const cliffSeconds = 0n;
            const vestingSeconds = 0n;

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountBefore);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target)) - totalAmountBefore);

            /* EXECUTE */
            const tx = await vesting.connect(owner).setPublicRoundVestFor(accounts, amounts)
            const createdAt = await getBlockTimestamp(tx);

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                const vestedScheduleAfter = await vesting.vestingSchedules(accounts[i], direction);
                expect(vestedScheduleAfter.cliffInSeconds).to.equal(cliffSeconds);
                expect(vestedScheduleAfter.vestingInSeconds).to.equal(vestingSeconds);
                expect(vestedScheduleAfter.totalAmount).to.equal(amounts[i]);
                expect(vestedScheduleAfter.claimed).to.equal(0);

                await expect(tx)
                    .to.emit(vesting, 'VestingCreated')
                    .withArgs(accounts[i], amounts[i], cliffSeconds, vestingSeconds, createdAt, direction);
            }
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountAfter);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountAfter));
        });

        it('sets public round vest for again successfully', async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amountsA = [ethers.parseUnits("100", 18)];
            const amountsB = [ethers.parseUnits("200", 18)];
            const cliffSeconds = 0n;
            const vestingSeconds = 0n;
            const direction = Direction.PUBLIC_ROUND;
            const totalAmountBefore = 0n;
            const totalAmountAfter = ethers.parseUnits("200", 18);

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountBefore);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountBefore));

            /* EXECUTE */
            await vesting.connect(owner).setPublicRoundVestFor(accounts, amountsA);
            const tx = await vesting.connect(owner).setPublicRoundVestFor(accounts, amountsB);
            const createdAt = await getBlockTimestamp(tx);

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                const vestedScheduleAfter = await vesting.vestingSchedules(accounts[i], direction);

                expect(vestedScheduleAfter.cliffInSeconds).to.equal(cliffSeconds);
                expect(vestedScheduleAfter.vestingInSeconds).to.equal(vestingSeconds);
                expect(vestedScheduleAfter.totalAmount).to.equal(amountsB[i]);
                expect(vestedScheduleAfter.claimed).to.equal(0);

                await expect(tx)
                    .to.emit(vesting, 'VestingCreated')
                    .withArgs(accounts[i], amountsB[i], cliffSeconds, vestingSeconds, createdAt, direction);
            }

            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountAfter);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountAfter));
        });

        it('rejects if accounts and amounts lengths is zero', async () => {
            const promise = vesting.connect(owner).setPublicRoundVestFor([], []);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "DataLengthsIsZero()"
            );
        });

        it('rejects if accounts and amounts lengths not match', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setPublicRoundVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "DataLengthsNotMatch()"
            );
        });

        it('rejects if not sufficient tokens', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [totalSupply, ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setPublicRoundVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "InsufficientTokens()"
            );
        });

        it('rejects if incorrect amount', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("0", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setPublicRoundVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "IncorrectAmount()"
            );
        });

        it('rejects if new totalAmount less than claimed', async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("10000", 18)];

            await vesting.connect(owner).setPublicRoundVestFor(accounts, amounts);

            await vesting.connect(addr1).claim();

            const [, , claimedBefore,] = await vesting.getTotalVestingInfo(accounts[0]);

            /* EXECUTE */
            const promise = vesting.connect(owner).setPublicRoundVestFor(accounts, [claimedBefore - ethers.parseUnits("1", 18)]);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "TotalAmountLessThanClaimed()"
            );
        });

        it('rejects if zero vester address', async () => {
            /* SETUP */
            const accounts = [zeroAddress, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setPublicRoundVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "ZeroAddress()"
            );
        });

        it('rejects if not default admin role', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(addr1).setPublicRoundVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                vesting, "AccessIsDenied()");
        });
    });

    describe('sets staking round vest for', async () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);


            await vesting.setVestingStartTimestamp();
        });

        it(`sets staking round vest for successfully`, async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("200", 18)];
            const totalAmountBefore = 0n;
            const totalAmountAfter = ethers.parseUnits("100", 18) + ethers.parseUnits("200", 18);
            const direction = Direction.STAKING;
            const cliffSeconds = 15768000n;
            const vestingSeconds = 78840000n;

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountBefore);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target)) - totalAmountBefore);

            /* EXECUTE */
            const tx = await vesting.connect(owner).setStakingVestFor(accounts, amounts)
            const createdAt = await getBlockTimestamp(tx);

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                const vestedScheduleAfter = await vesting.vestingSchedules(accounts[i], direction);
                expect(vestedScheduleAfter.cliffInSeconds).to.equal(cliffSeconds);
                expect(vestedScheduleAfter.vestingInSeconds).to.equal(vestingSeconds);
                expect(vestedScheduleAfter.totalAmount).to.equal(amounts[i]);
                expect(vestedScheduleAfter.claimed).to.equal(0);

                await expect(tx)
                    .to.emit(vesting, 'VestingCreated')
                    .withArgs(accounts[i], amounts[i], cliffSeconds, vestingSeconds, createdAt, direction);
            }
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountAfter);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountAfter));
        });

        it('sets staking round vest for again successfully', async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amountsA = [ethers.parseUnits("100", 18)];
            const amountsB = [ethers.parseUnits("200", 18)];
            const cliffSeconds = 15768000n;
            const vestingSeconds = 78840000n;
            const direction = Direction.STAKING;
            const totalAmountBefore = 0n;
            const totalAmountAfter = ethers.parseUnits("200", 18);

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountBefore);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountBefore));

            /* EXECUTE */
            await vesting.connect(owner).setStakingVestFor(accounts, amountsA);
            const tx = await vesting.connect(owner).setStakingVestFor(accounts, amountsB);
            const createdAt = await getBlockTimestamp(tx);

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                const vestedScheduleAfter = await vesting.vestingSchedules(accounts[i], direction);

                expect(vestedScheduleAfter.cliffInSeconds).to.equal(cliffSeconds);
                expect(vestedScheduleAfter.vestingInSeconds).to.equal(vestingSeconds);
                expect(vestedScheduleAfter.totalAmount).to.equal(amountsB[i]);
                expect(vestedScheduleAfter.claimed).to.equal(0);

                await expect(tx)
                    .to.emit(vesting, 'VestingCreated')
                    .withArgs(accounts[i], amountsB[i], cliffSeconds, vestingSeconds, createdAt, direction);
            }

            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountAfter);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountAfter));
        });

        it('rejects if accounts and amounts lengths is zero', async () => {
            const promise = vesting.connect(owner).setStakingVestFor([], []);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "DataLengthsIsZero()"
            );
        });

        it('rejects if accounts and amounts lengths not match', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setStakingVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "DataLengthsNotMatch()"
            );
        });

        it('rejects if not sufficient tokens', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [totalSupply, ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setStakingVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "InsufficientTokens()"
            );
        });

        it('rejects if incorrect amount', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("0", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setStakingVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "IncorrectAmount()"
            );
        });

        it('rejects if new totalAmount less than claimed', async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("10000", 18)];

            await vesting.connect(owner).setStakingVestFor(accounts, amounts);

            await incrementNextBlockTimestamp(15768000 + 78840000);
            await mine();

            await vesting.connect(addr1).claim();

            const [, , claimedBefore,] = await vesting.getTotalVestingInfo(accounts[0]);

            /* EXECUTE */
            const promise = vesting.connect(owner).setStakingVestFor(accounts, [claimedBefore - ethers.parseUnits("1", 18)]);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "TotalAmountLessThanClaimed()"
            );
        });

        it('rejects if zero vester address', async () => {
            /* SETUP */
            const accounts = [zeroAddress, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setStakingVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "ZeroAddress()"
            );
        });

        it('rejects if not default admin role', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(addr1).setStakingVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                vesting, "AccessIsDenied()");
        });
    });

    describe('sets team round vest for', async () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);

            await vesting.setVestingStartTimestamp();
        });

        it(`sets team round vest for successfully`, async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("200", 18)];
            const totalAmountBefore = 0n;
            const totalAmountAfter = ethers.parseUnits("100", 18) + ethers.parseUnits("200", 18);
            const direction = Direction.TEAM;
            const cliffSeconds = 31536000n;
            const vestingSeconds = 63072000n;

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountBefore);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target)) - totalAmountBefore);

            /* EXECUTE */
            const tx = await vesting.connect(owner).setTeamVestFor(accounts, amounts)
            const createdAt = await getBlockTimestamp(tx);

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                const vestedScheduleAfter = await vesting.vestingSchedules(accounts[i], direction);
                expect(vestedScheduleAfter.cliffInSeconds).to.equal(cliffSeconds);
                expect(vestedScheduleAfter.vestingInSeconds).to.equal(vestingSeconds);
                expect(vestedScheduleAfter.totalAmount).to.equal(amounts[i]);
                expect(vestedScheduleAfter.claimed).to.equal(0);

                await expect(tx)
                    .to.emit(vesting, 'VestingCreated')
                    .withArgs(accounts[i], amounts[i], cliffSeconds, vestingSeconds, createdAt, direction);
            }
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountAfter);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountAfter));
        });

        it('sets team round vest for again successfully', async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amountsA = [ethers.parseUnits("100", 18)];
            const amountsB = [ethers.parseUnits("200", 18)];
            const cliffSeconds = 31536000n;
            const vestingSeconds = 63072000n;
            const direction = Direction.TEAM;
            const totalAmountBefore = 0n;
            const totalAmountAfter = ethers.parseUnits("200", 18);

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountBefore);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountBefore));

            /* EXECUTE */
            await vesting.connect(owner).setTeamVestFor(accounts, amountsA);
            const tx = await vesting.connect(owner).setTeamVestFor(accounts, amountsB);
            const createdAt = await getBlockTimestamp(tx);

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                const vestedScheduleAfter = await vesting.vestingSchedules(accounts[i], direction);

                expect(vestedScheduleAfter.cliffInSeconds).to.equal(cliffSeconds);
                expect(vestedScheduleAfter.vestingInSeconds).to.equal(vestingSeconds);
                expect(vestedScheduleAfter.totalAmount).to.equal(amountsB[i]);
                expect(vestedScheduleAfter.claimed).to.equal(0);

                await expect(tx)
                    .to.emit(vesting, 'VestingCreated')
                    .withArgs(accounts[i], amountsB[i], cliffSeconds, vestingSeconds, createdAt, direction);
            }

            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountAfter);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountAfter));
        });

        it('rejects if accounts and amounts lengths is zero', async () => {
            const promise = vesting.connect(owner).setTeamVestFor([], []);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "DataLengthsIsZero()"
            );
        });

        it('rejects if accounts and amounts lengths not match', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setTeamVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "DataLengthsNotMatch()"
            );
        });

        it('rejects if not sufficient tokens', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [totalSupply, ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setTeamVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "InsufficientTokens()"
            );
        });

        it('rejects if incorrect amount', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("0", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setTeamVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "IncorrectAmount()"
            );
        });

        it('rejects if new totalAmount less than claimed', async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("10000", 18)];

            await vesting.connect(owner).setTeamVestFor(accounts, amounts);

            await incrementNextBlockTimestamp(31536000 + 63072000);
            await mine();

            await vesting.connect(addr1).claim();

            const [, , claimedBefore,] = await vesting.getTotalVestingInfo(accounts[0]);

            /* EXECUTE */
            const promise = vesting.connect(owner).setTeamVestFor(accounts, [claimedBefore - ethers.parseUnits("1", 18)]);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "TotalAmountLessThanClaimed()"
            );
        });

        it('rejects if zero vester address', async () => {
            /* SETUP */
            const accounts = [zeroAddress, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setTeamVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "ZeroAddress()"
            );
        });

        it('rejects if not default admin role', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(addr1).setTeamVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                vesting, "AccessIsDenied()");
        });
    });

    describe('sets liquidity round vest for', async () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);


            await vesting.setVestingStartTimestamp();
        });

        it(`sets liquidity round vest for successfully`, async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("200", 18)];
            const totalAmountBefore = 0n;
            const totalAmountAfter = ethers.parseUnits("100", 18) + ethers.parseUnits("200", 18);
            const direction = Direction.LIQUIDITY;
            const cliffSeconds = 0n;
            const vestingSeconds = 15768000n;

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountBefore);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target)) - totalAmountBefore);

            /* EXECUTE */
            const tx = await vesting.connect(owner).setLiquidityVestFor(accounts, amounts)
            const createdAt = await getBlockTimestamp(tx);

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                const vestedScheduleAfter = await vesting.vestingSchedules(accounts[i], direction);
                expect(vestedScheduleAfter.cliffInSeconds).to.equal(cliffSeconds);
                expect(vestedScheduleAfter.vestingInSeconds).to.equal(vestingSeconds);
                expect(vestedScheduleAfter.totalAmount).to.equal(amounts[i]);
                expect(vestedScheduleAfter.claimed).to.equal(0);

                await expect(tx)
                    .to.emit(vesting, 'VestingCreated')
                    .withArgs(accounts[i], amounts[i], cliffSeconds, vestingSeconds, createdAt, direction);
            }
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountAfter);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountAfter));
        });

        it('sets liquidity round vest for again successfully', async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amountsA = [ethers.parseUnits("100", 18)];
            const amountsB = [ethers.parseUnits("200", 18)];
            const cliffSeconds = 0n;
            const vestingSeconds = 15768000n;
            const direction = Direction.LIQUIDITY;
            const totalAmountBefore = 0n;
            const totalAmountAfter = ethers.parseUnits("200", 18);

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountBefore);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountBefore));

            /* EXECUTE */
            await vesting.connect(owner).setLiquidityVestFor(accounts, amountsA);
            const tx = await vesting.connect(owner).setLiquidityVestFor(accounts, amountsB);
            const createdAt = await getBlockTimestamp(tx);

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                const vestedScheduleAfter = await vesting.vestingSchedules(accounts[i], direction);

                expect(vestedScheduleAfter.cliffInSeconds).to.equal(cliffSeconds);
                expect(vestedScheduleAfter.vestingInSeconds).to.equal(vestingSeconds);
                expect(vestedScheduleAfter.totalAmount).to.equal(amountsB[i]);
                expect(vestedScheduleAfter.claimed).to.equal(0);

                await expect(tx)
                    .to.emit(vesting, 'VestingCreated')
                    .withArgs(accounts[i], amountsB[i], cliffSeconds, vestingSeconds, createdAt, direction);
            }

            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountAfter);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountAfter));
        });

        it('rejects if accounts and amounts lengths is zero', async () => {
            const promise = vesting.connect(owner).setLiquidityVestFor([], []);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "DataLengthsIsZero()"
            );
        });

        it('rejects if accounts and amounts lengths not match', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setLiquidityVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "DataLengthsNotMatch()"
            );
        });

        it('rejects if not sufficient tokens', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [totalSupply, ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setLiquidityVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "InsufficientTokens()"
            );
        });

        it('rejects if incorrect amount', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("0", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setLiquidityVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "IncorrectAmount()"
            );
        });

        it('rejects if new totalAmount less than claimed', async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("10000", 18)];

            await vesting.connect(owner).setLiquidityVestFor(accounts, amounts);

            await incrementNextBlockTimestamp(15768000);
            await mine();

            await vesting.connect(addr1).claim();

            const [, , claimedBefore,] = await vesting.getTotalVestingInfo(accounts[0]);

            /* EXECUTE */
            const promise = vesting.connect(owner).setLiquidityVestFor(accounts, [claimedBefore - ethers.parseUnits("1", 18)]);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "TotalAmountLessThanClaimed()"
            );
        });

        it('rejects if zero vester address', async () => {
            /* SETUP */
            const accounts = [zeroAddress, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setLiquidityVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "ZeroAddress()"
            );
        });

        it('rejects if not default admin role', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(addr1).setLiquidityVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                vesting, "AccessIsDenied()");
        });
    });

    describe('sets marketing round vest for', async () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);

            await vesting.setVestingStartTimestamp();
        });

        it(`sets marketing round vest for successfully`, async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("200", 18)];
            const totalAmountBefore = 0n;
            const totalAmountAfter = ethers.parseUnits("100", 18) + ethers.parseUnits("200", 18);
            const direction = Direction.MARKETING;
            const cliffSeconds = 0n;
            const vestingSeconds = 78840000n;

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountBefore);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target)) - totalAmountBefore);

            /* EXECUTE */
            const tx = await vesting.connect(owner).setMarketingVestFor(accounts, amounts)
            const createdAt = await getBlockTimestamp(tx);

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                const vestedScheduleAfter = await vesting.vestingSchedules(accounts[i], direction);
                expect(vestedScheduleAfter.cliffInSeconds).to.equal(cliffSeconds);
                expect(vestedScheduleAfter.vestingInSeconds).to.equal(vestingSeconds);
                expect(vestedScheduleAfter.totalAmount).to.equal(amounts[i]);
                expect(vestedScheduleAfter.claimed).to.equal(0);

                await expect(tx)
                    .to.emit(vesting, 'VestingCreated')
                    .withArgs(accounts[i], amounts[i], cliffSeconds, vestingSeconds, createdAt, direction);
            }
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountAfter);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountAfter));
        });

        it('sets marketing round vest for again successfully', async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amountsA = [ethers.parseUnits("100", 18)];
            const amountsB = [ethers.parseUnits("200", 18)];
            const cliffSeconds = 0n;
            const vestingSeconds = 78840000n;
            const direction = Direction.MARKETING;
            const totalAmountBefore = 0n;
            const totalAmountAfter = ethers.parseUnits("200", 18);

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountBefore);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountBefore));

            /* EXECUTE */
            await vesting.connect(owner).setMarketingVestFor(accounts, amountsA);
            const tx = await vesting.connect(owner).setMarketingVestFor(accounts, amountsB);
            const createdAt = await getBlockTimestamp(tx);

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                const vestedScheduleAfter = await vesting.vestingSchedules(accounts[i], direction);

                expect(vestedScheduleAfter.cliffInSeconds).to.equal(cliffSeconds);
                expect(vestedScheduleAfter.vestingInSeconds).to.equal(vestingSeconds);
                expect(vestedScheduleAfter.totalAmount).to.equal(amountsB[i]);
                expect(vestedScheduleAfter.claimed).to.equal(0);

                await expect(tx)
                    .to.emit(vesting, 'VestingCreated')
                    .withArgs(accounts[i], amountsB[i], cliffSeconds, vestingSeconds, createdAt, direction);
            }

            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountAfter);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountAfter));
        });

        it('rejects if accounts and amounts lengths is zero', async () => {
            const promise = vesting.connect(owner).setMarketingVestFor([], []);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "DataLengthsIsZero()"
            );
        });

        it('rejects if accounts and amounts lengths not match', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setMarketingVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "DataLengthsNotMatch()"
            );
        });

        it('rejects if not sufficient tokens', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [totalSupply, ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setMarketingVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "InsufficientTokens()"
            );
        });

        it('rejects if incorrect amount', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("0", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setMarketingVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "IncorrectAmount()"
            );
        });

        it('rejects if new totalAmount less than claimed', async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("10000", 18)];

            await vesting.connect(owner).setMarketingVestFor(accounts, amounts);

            await incrementNextBlockTimestamp(78840000);
            await mine();

            await vesting.connect(addr1).claim();

            const [, , claimedBefore,] = await vesting.getTotalVestingInfo(accounts[0]);

            /* EXECUTE */
            const promise = vesting.connect(owner).setMarketingVestFor(accounts, [claimedBefore - ethers.parseUnits("1", 18)]);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "TotalAmountLessThanClaimed()"
            );
        });

        it('rejects if zero vester address', async () => {
            /* SETUP */
            const accounts = [zeroAddress, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setMarketingVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "ZeroAddress()"
            );
        });

        it('rejects if not default admin role', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(addr1).setMarketingVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                vesting, "AccessIsDenied()");
        });
    });

    describe('sets treasury round vest for', async () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);
            await vesting.setVestingStartTimestamp();
        });

        it(`sets treasury round vest for successfully`, async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("200", 18)];
            const totalAmountBefore = 0n;
            const totalAmountAfter = ethers.parseUnits("100", 18) + ethers.parseUnits("200", 18);
            const direction = Direction.TREASURY;
            const cliffSeconds = 15768000n;
            const vestingSeconds = 78840000n;

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountBefore);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target)) - totalAmountBefore);

            /* EXECUTE */
            const tx = await vesting.connect(owner).setTreasuryVestFor(accounts, amounts)
            const createdAt = await getBlockTimestamp(tx);

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                const vestedScheduleAfter = await vesting.vestingSchedules(accounts[i], direction);
                expect(vestedScheduleAfter.cliffInSeconds).to.equal(cliffSeconds);
                expect(vestedScheduleAfter.vestingInSeconds).to.equal(vestingSeconds);
                expect(vestedScheduleAfter.totalAmount).to.equal(amounts[i]);
                expect(vestedScheduleAfter.claimed).to.equal(0);

                await expect(tx)
                    .to.emit(vesting, 'VestingCreated')
                    .withArgs(accounts[i], amounts[i], cliffSeconds, vestingSeconds, createdAt, direction);
            }
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountAfter);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountAfter));
        });

        it('sets treasury round vest for again successfully', async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amountsA = [ethers.parseUnits("100", 18)];
            const amountsB = [ethers.parseUnits("200", 18)];
            const cliffSeconds = 15768000n;
            const vestingSeconds = 78840000n;
            const direction = Direction.TREASURY;
            const totalAmountBefore = 0n;
            const totalAmountAfter = ethers.parseUnits("200", 18);

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountBefore);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountBefore));

            /* EXECUTE */
            await vesting.connect(owner).setTreasuryVestFor(accounts, amountsA);
            const tx = await vesting.connect(owner).setTreasuryVestFor(accounts, amountsB);
            const createdAt = await getBlockTimestamp(tx);

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                const vestedScheduleAfter = await vesting.vestingSchedules(accounts[i], direction);

                expect(vestedScheduleAfter.cliffInSeconds).to.equal(cliffSeconds);
                expect(vestedScheduleAfter.vestingInSeconds).to.equal(vestingSeconds);
                expect(vestedScheduleAfter.totalAmount).to.equal(amountsB[i]);
                expect(vestedScheduleAfter.claimed).to.equal(0);

                await expect(tx)
                    .to.emit(vesting, 'VestingCreated')
                    .withArgs(accounts[i], amountsB[i], cliffSeconds, vestingSeconds, createdAt, direction);
            }

            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountAfter);
            expect(await vesting.getAvailableAmount()).to.equal((await token.balanceOf(vesting.target) - totalAmountAfter));
        });

        it('rejects if accounts and amounts lengths is zero', async () => {
            const promise = vesting.connect(owner).setTreasuryVestFor([], []);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "DataLengthsIsZero()"
            );
        });

        it('rejects if accounts and amounts lengths not match', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setTreasuryVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "DataLengthsNotMatch()"
            );
        });

        it('rejects if not sufficient tokens', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [totalSupply, ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setTreasuryVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "InsufficientTokens()"
            );
        });

        it('rejects if incorrect amount', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("0", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setTreasuryVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "IncorrectAmount()"
            );
        });

        it('rejects if new totalAmount less than claimed', async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("10000", 18)];

            await vesting.connect(owner).setTreasuryVestFor(accounts, amounts);

            await incrementNextBlockTimestamp(15768000 + 78840000);
            await mine();

            await vesting.connect(addr1).claim();

            const [, , claimedBefore,] = await vesting.getTotalVestingInfo(accounts[0]);

            /* EXECUTE */
            const promise = vesting.connect(owner).setTreasuryVestFor(accounts, [claimedBefore - ethers.parseUnits("1", 18)]);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "TotalAmountLessThanClaimed()"
            );
        });

        it('rejects if zero vester address', async () => {
            /* SETUP */
            const accounts = [zeroAddress, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setTreasuryVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(vesting,
                "ZeroAddress()"
            );
        });

        it('rejects if not default admin role', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(addr1).setTreasuryVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise).to.be.revertedWithCustomError(
                vesting, "AccessIsDenied()");
        });
    });

    describe('gets vesting total amount', async () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);

            const startTimestamp = await getLatestBlockTimestamp();
            await vesting.setVestingStartTimestamp();
        });

        it('gets vesting total amount successfully', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("200", 18)];
            const totalAmountBefore = 0n;
            const totalAmountAfter = ethers.parseUnits("100", 18) + ethers.parseUnits("200", 18);

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountBefore);

            /* EXECUTE */
            await vesting.connect(owner).setPublicRoundVestFor(accounts, amounts)

            /* ASSERT */
            expect(await vesting.vestingTotalAmount()).to.equal(totalAmountAfter);
        });

        it('should set vestingTotalAmount correctly if multiple distributions', async () => {
            const accounts = [addr1.address];

            // 1st distribution
            let amounts = [ethers.parseUnits("20000000000", 18)];
            await vesting.connect(owner).setPublicRoundVestFor(accounts, amounts)

            expect(await vesting.vestingTotalAmount()).to.equal(amounts[0]);

            await vesting.connect(addr1).claim();
            expect(await vesting.vestingTotalAmount()).to.equal(0);

            // 2nd distribution
            amounts = [ethers.parseUnits("40000000000", 18)];
            await vesting.connect(owner).setPublicRoundVestFor(accounts, amounts)

            const [, , claimedAmountA,] = await vesting.getTotalVestingInfo(accounts[0]);
            expect(await vesting.vestingTotalAmount()).to.equal(amounts[0] - claimedAmountA);

            await vesting.connect(addr1).claim();
            expect(await vesting.vestingTotalAmount()).to.equal(0);

            // 3rd distribution
            amounts = [ethers.parseUnits("50000000000", 18)];
            await vesting.connect(owner).setPublicRoundVestFor(accounts, amounts)

            const [, , claimedAmountB,] = await vesting.getTotalVestingInfo(accounts[0]);
            expect(await vesting.vestingTotalAmount()).to.equal(amounts[0] - claimedAmountB);

            await vesting.connect(addr1).claim();
            expect(await vesting.vestingTotalAmount()).to.equal(0);
        });
    });

    describe('gets vesting schedule', async () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);

            const startTimestamp = await getLatestBlockTimestamp();
            await vesting.setVestingStartTimestamp();
        });

        it('gets vesting schedule successfully', async () => {
            /* SETUP */
            const accounts = [addr1.address, addr2.address];
            const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("200", 18)];
            const cliffSeconds = 0;
            const vestingSeconds = 0;
            const direction = Direction.PUBLIC_ROUND;

            /* EXECUTE */
            await vesting.connect(owner).setPublicRoundVestFor(accounts, amounts)

            /* ASSERT */
            for (let i = 0; i < accounts.length; i++) {
                const vestedScheduleAfter = await vesting.vestingSchedules(accounts[i], direction);

                expect(vestedScheduleAfter.cliffInSeconds).to.equal(cliffSeconds);
                expect(vestedScheduleAfter.vestingInSeconds).to.equal(vestingSeconds);
                expect(vestedScheduleAfter.totalAmount).to.equal(amounts[i]);
                expect(vestedScheduleAfter.claimed).to.equal(0);
            }
        });
    });

    describe('gets total vesting info', () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);

            const startTimestamp = await getLatestBlockTimestamp();
            await vesting.setVestingStartTimestamp();
        });

        it("gets info if cliff doesn't finish, cliff - 15768000, vesting - 78840000", async function () {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("100", 18)];

            /* EXECUTE */
            await vesting.connect(owner).setTreasuryVestFor(accounts, amounts);

            const [totalAmount, unlockedAmount, claimedAmount, lockedAmount] = await vesting.getTotalVestingInfo(accounts[0]);

            /* ASSERT */
            expect(totalAmount).to.be.equal(amounts[0]);
            expect(unlockedAmount).to.be.equal(0);
            expect(claimedAmount).to.be.equal(0);
            expect(lockedAmount).to.be.equal(amounts[0]);
        });

        it("gets info if vesting completed fully, cliff - 15768000, vesting - 78840000", async function () {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("100", 18)];

            /* EXECUTE */
            await vesting.connect(owner).setTreasuryVestFor(accounts, amounts);

            await incrementNextBlockTimestamp(15768000 + 78840000);
            await mine();

            const [totalAmount, unlockedAmount, claimedAmount, lockedAmount] = await vesting.getTotalVestingInfo(accounts[0]);

            /* ASSERT */
            expect(totalAmount).to.be.equal(amounts[0]);
            expect(unlockedAmount).to.be.not.equal(0);
            expect(unlockedAmount).to.be.equal(amounts[0]);
            expect(claimedAmount).to.be.equal(0);
            expect(lockedAmount).to.be.equal(0);
        });

        it("gets info if claimed = totalAmount, cliff - 0, vesting - 0", async function () {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("10000", 18)];

            /* EXECUTE */
            await vesting.connect(owner).setPublicRoundVestFor(accounts, amounts);
            await vesting.connect(addr1).claim();

            const [, , claimedBefore,] = await vesting.getTotalVestingInfo(accounts[0]);

            await vesting.connect(owner).setPublicRoundVestFor(accounts, [claimedBefore]);

            const [totalAmount, unlockedAmount, claimedAmount, lockedAmount] = await vesting.getTotalVestingInfo(accounts[0]);

            /* ASSERT */
            expect(totalAmount).to.be.equal(claimedBefore);
            expect(unlockedAmount).to.be.equal(0);
            expect(claimedAmount).to.be.equal(claimedBefore);
            expect(lockedAmount).to.be.equal(0);
        });
    });

    describe('sets round vest for before vesting has started', async () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);
        });

        it('should revert when trying to set round vest for before vesting has started', async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("100", 18)];

            /* EXECUTE */
            const promise = vesting.connect(owner).setTreasuryVestFor(accounts, amounts);

            /* ASSERT */
            await expect(promise)
                .to.be.revertedWithCustomError(vesting, "NotStarted()");
        });
    });

    describe('claims', () => {
        beforeEach(async () => {
            vesting = await Vesting.deploy(token.target, owner.address);
            await token.executeTGE(vesting.target);

            await vesting.setVestingStartTimestamp();
        });

        it("claims with 50% rewards successfully for liquidity pool", async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("100", 18)];
            const vestingSeconds = 15768000n;
            const direction = Direction.LIQUIDITY;

            /* EXECUTE */
            await vesting.connect(owner).setLiquidityVestFor(accounts, amounts);
            const startAt = await vesting.vestingStartTimestamp();

            await incrementNextBlockTimestamp(7884000);
            await mine();

            const addr1BalanceBefore = await token.balanceOf(accounts[0]);
            const vestingTotalAmountBefore = await vesting.vestingTotalAmount();
            const vestingSchedulesBefore = await vesting.vestingSchedules(accounts[0], direction);

            const tx = await vesting.connect(addr1).claim();
            const timestampAfter = await getBlockTimestamp(tx);

            const vestingSchedulesAfter = await vesting.vestingSchedules(accounts[0], direction);
            const [totalAmount, unlockedAmount, claimedAmount, lockedAmount] = await vesting.getTotalVestingInfo(accounts[0]);

            const vestedAmount = amounts[0] / 2n;
            const addr1BalanceAfter = await token.balanceOf(accounts[0]);

            /* ASSERT */
            expect(totalAmount).to.be.equal(amounts[0]);
            expect(unlockedAmount).to.be.equal(0);
            expect(claimedAmount).to.be.equal(vestedAmount);
            expect(lockedAmount).to.be.equal(amounts[0] - vestedAmount);
            expect(addr1BalanceAfter).to.be.equal(addr1BalanceBefore + vestedAmount);
            expect(await vesting.vestingTotalAmount()).to.equal(vestingTotalAmountBefore - vestedAmount);
            expect(vestingSchedulesAfter.claimed).to.be.equal(vestingSchedulesBefore.claimed + vestedAmount);

            await expect(tx).to.emit(vesting, 'Claimed')
                .withArgs(addr1.address, vestedAmount, timestampAfter, direction);
        });

        it("claims with 100% rewards successfully for liquidity pool", async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("100", 18)];
            const vestingSeconds = 15768000n;
            const direction = Direction.LIQUIDITY;

            /* EXECUTE */
            await vesting.connect(owner).setLiquidityVestFor(accounts, amounts);
            const startAt = await vesting.vestingStartTimestamp();

            await incrementNextBlockTimestamp(15768000);
            await mine();

            const addr1BalanceBefore = await token.balanceOf(accounts[0]);
            const vestingTotalAmountBefore = await vesting.vestingTotalAmount();
            const vestingSchedulesBefore = await vesting.vestingSchedules(accounts[0], direction);

            const tx = await vesting.connect(addr1).claim();
            const timestampAfter = await getBlockTimestamp(tx);

            const vestingSchedulesAfter = await vesting.vestingSchedules(accounts[0], direction);
            const [totalAmount, unlockedAmount, claimedAmount, lockedAmount] = await vesting.getTotalVestingInfo(accounts[0]);

            const vestedAmount = amounts[0];
            const addr1BalanceAfter = await token.balanceOf(accounts[0]);

            /* ASSERT */
            expect(totalAmount).to.be.equal(amounts[0]);
            expect(unlockedAmount).to.be.equal(0);
            expect(claimedAmount).to.be.equal(vestedAmount);
            expect(lockedAmount).to.be.equal(amounts[0] - vestedAmount);
            expect(addr1BalanceAfter).to.be.equal(addr1BalanceBefore + vestedAmount);
            expect(await vesting.vestingTotalAmount()).to.equal(vestingTotalAmountBefore - vestedAmount);
            expect(vestingSchedulesAfter.claimed).to.be.equal(vestingSchedulesBefore.claimed + vestedAmount);

            await expect(tx).to.emit(vesting, 'Claimed')
                .withArgs(addr1.address, vestedAmount, timestampAfter, direction);
        });

        it("claims with part rewards successfully", async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("100", 18)];
            const vestingSeconds = 78840000n;
            const direction = Direction.MARKETING;

            /* EXECUTE */
            await vesting.connect(owner).setMarketingVestFor(accounts, amounts);
            const startAt = await vesting.vestingStartTimestamp();

            await incrementNextBlockTimestamp(15768000);
            await mine();

            const addr1BalanceBefore = await token.balanceOf(accounts[0]);
            const vestingTotalAmountBefore = await vesting.vestingTotalAmount();
            const vestingSchedulesBefore = await vesting.vestingSchedules(accounts[0], direction);

            const tx = await vesting.connect(addr1).claim();
            const timestampAfter = await getBlockTimestamp(tx);

            const vestingSchedulesAfter = await vesting.vestingSchedules(accounts[0], direction);
            const [totalAmount, unlockedAmount, claimedAmount, lockedAmount] = await vesting.getTotalVestingInfo(accounts[0]);

            const vestedAmount = amounts[0] * (BigInt(timestampAfter) - startAt) / vestingSeconds;
            const addr1BalanceAfter = await token.balanceOf(accounts[0]);

            /* ASSERT */
            expect(totalAmount).to.be.equal(amounts[0]);
            expect(unlockedAmount).to.be.equal(0);
            expect(claimedAmount).to.be.equal(vestedAmount);
            expect(lockedAmount).to.be.equal(amounts[0] - vestedAmount);
            expect(addr1BalanceAfter).to.be.equal(addr1BalanceBefore + vestedAmount);
            expect(await vesting.vestingTotalAmount()).to.equal(vestingTotalAmountBefore - vestedAmount);
            expect(vestingSchedulesAfter.claimed).to.be.equal(vestingSchedulesBefore.claimed + vestedAmount);

            await expect(tx).to.emit(vesting, 'Claimed')
                .withArgs(addr1.address, vestedAmount, timestampAfter, direction);
        });

        it("claims with all rewards successfully", async function () {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("200", 18)];
            const direction = Direction.MARKETING;

            /* EXECUTE */
            let tx = await vesting.connect(owner).setMarketingVestFor(accounts, amounts)

            await incrementNextBlockTimestamp(78840000);
            await mine();

            const addr1BalanceBefore = await token.balanceOf(accounts[0]);

            const vestingTotalAmountBefore = await vesting.vestingTotalAmount();
            const vestingSchedulesBefore = await vesting.vestingSchedules(accounts[0], direction);

            tx = await vesting.connect(addr1).claim();
            const timestampAfter = await getBlockTimestamp(tx);

            const vestingSchedulesAfter = await vesting.vestingSchedules(accounts[0], direction);
            const [totalAmount, unlockedAmount, claimedAmount, lockedAmount] = await vesting.getTotalVestingInfo(accounts[0]);

            const vestedAmount = amounts[0];
            const addr1BalanceAfter = await token.balanceOf(accounts[0]);

            /* ASSERT */
            expect(addr1BalanceAfter).to.be.equal(addr1BalanceBefore + vestedAmount);
            expect(await vesting.vestingTotalAmount()).to.equal(vestingTotalAmountBefore - vestedAmount);
            expect(vestingSchedulesAfter.claimed).to.be.equal(vestingSchedulesBefore.claimed + vestedAmount);
            expect(totalAmount).to.be.equal(vestedAmount);
            expect(unlockedAmount).to.be.equal(0);
            expect(claimedAmount).to.be.equal(vestedAmount);
            expect(lockedAmount).to.be.equal(0);
            await expect(tx).to.emit(vesting, 'Claimed')
                .withArgs(accounts[0], vestedAmount, timestampAfter, direction);
        });

        it("claims from 2 directions successfully", async function () {
            /* SETUP */
            const accounts = [addr1.address];
            const amountsA = [ethers.parseUnits("100", 18)];
            const amountsB = [ethers.parseUnits("200", 18)];
            const directionA = Direction.PUBLIC_ROUND;
            const directionB = Direction.STAKING;

            /* EXECUTE */
            await vesting.connect(owner).setPublicRoundVestFor(accounts, amountsA);
            await vesting.connect(owner).setStakingVestFor(accounts, amountsB);

            await incrementNextBlockTimestamp(15768000 + 78840000);
            await mine();

            const addr1BalanceBefore = await token.balanceOf(accounts[0]);

            const vestingTotalAmountBefore = await vesting.vestingTotalAmount();

            const tx = await vesting.connect(addr1).claim();
            const timestampAfter = await getBlockTimestamp(tx);

            const [totalAmount, unlockedAmount, claimedAmount, lockedAmount] = await vesting.getTotalVestingInfo(accounts[0]);

            const vestedAmount = amountsA[0] + amountsB[0];
            const addr1BalanceAfter = await token.balanceOf(accounts[0]);

            /* ASSERT */
            expect(addr1BalanceAfter).to.be.equal(addr1BalanceBefore + vestedAmount);
            expect(await vesting.vestingTotalAmount()).to.equal(vestingTotalAmountBefore - vestedAmount);
            expect(totalAmount).to.be.equal(vestedAmount);
            expect(unlockedAmount).to.be.equal(0);
            expect(claimedAmount).to.be.equal(vestedAmount);
            expect(lockedAmount).to.be.equal(0);
            await expect(tx).to.emit(vesting, 'Claimed')
                .withArgs(accounts[0], amountsA[0], timestampAfter, directionA)
                .to.emit(vesting, 'Claimed')
                .withArgs(accounts[0], amountsB[0], timestampAfter, directionB);
        });

        it("rejects if claming amount - 0, cliff - 0, vesting 15768000 for liquidity pool", async () => {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("100", 18)];

            await vesting.connect(owner).setLiquidityVestFor(accounts, amounts);
            await vesting.connect(addr1).claim();

            /* ASSERT */
            await expect(vesting.connect(addr1).claim()).to.be.revertedWithCustomError(vesting,
                "ClaimAmountIsZero()"
            );
        });

        it("rejects if claming amount - 0, cliff - 15768000, vesting - 78840000", async function () {
            /* SETUP */
            const accounts = [addr1.address];
            const amounts = [ethers.parseUnits("100", 18)];

            /* EXECUTE */
            await vesting.connect(owner).setTreasuryVestFor(accounts, amounts)

            /* ASSERT */
            await expect(vesting.connect(addr1).claim()).to.be.revertedWithCustomError(vesting,
                "ClaimAmountIsZero()"
            );
        });

        it("rejects if claming amount - 0, address is not in any of directions", async function () {
            /* ASSERT */
            await expect(vesting.connect(addr1).claim()).to.be.revertedWithCustomError(vesting,
                "ClaimAmountIsZero()"
            );
        });

        it("rejects if claming amount - 0, cliff - 0, vesting - 0, claimed = totalAmount", async function () {
            /* SETUP */
            const accounts = [addr1.address];
            const amountsA = [ethers.parseUnits("10000", 18)];

            /* EXECUTE */
            await vesting.connect(owner).setPublicRoundVestFor(accounts, amountsA);
            await vesting.connect(addr1).claim();

            /* ASSERT */
            await expect(vesting.connect(addr1).claim()).to.be.revertedWithCustomError(vesting,
                "ClaimAmountIsZero()"
            );
        });
    });
});
