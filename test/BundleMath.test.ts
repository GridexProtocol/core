import {ethers} from "hardhat";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {IGridStructs} from "../typechain-types/contracts/test/BundleMathTest";
import {expect} from "chai";
import {BigNumber} from "ethers";
import BundleStruct = IGridStructs.BundleStruct;

describe("BundleMath", () => {
    async function deployFixture() {
        const contractFactory = await ethers.getContractFactory("BundleMathTest");
        const bundleMath = await contractFactory.deploy();
        await bundleMath.deployed();
        await bundleMath.setBundle(createEmptyBundle(0, false));
        return {bundleMath};
    }

    function createEmptyBundle(boundaryLower: number, zero: boolean): BundleStruct {
        return {
            boundaryLower: boundaryLower,
            zero: zero,
            makerAmountTotal: 0,
            makerAmountRemaining: 0,
            takerAmountRemaining: 0,
            takerFeeAmountRemaining: 0,
        };
    }

    describe("#addLiquidity", () => {
        it("first added", async () => {
            const {bundleMath} = await loadFixture(deployFixture);
            await bundleMath.addLiquidity(1);
            const {makerAmountTotal, makerAmountRemaining} = await bundleMath.bundle();
            expect(makerAmountTotal).to.equal(makerAmountRemaining);
            expect(makerAmountTotal).to.equal(1);
        });

        it("added multiple times", async () => {
            const {bundleMath} = await loadFixture(deployFixture);
            for (let i = 0; i < 10; i++) {
                await bundleMath.addLiquidity(1000);
            }
            const {makerAmountTotal, makerAmountRemaining} = await bundleMath.bundle();
            expect(makerAmountTotal).to.equal(makerAmountRemaining);
            expect(makerAmountTotal).to.equal(10 * 1000);
        });

        it("overflow", async () => {
            const {bundleMath} = await loadFixture(deployFixture);
            await bundleMath.addLiquidity(1000);
            await expect(bundleMath.addLiquidity(BigNumber.from(1).shl(128).sub(1))).to.revertedWithPanic(0x11); // Arithmetic operation underflowed or overflowed outside of an unchecked block
        });
    });

    describe("#removeLiquidity", () => {
        describe("used == false", () => {
            it("1 LP", async () => {
                const {bundleMath} = await loadFixture(deployFixture);
                await bundleMath.addLiquidity(1000);
                await bundleMath.removeLiquidity(1000);

                const {makerAmountTotal, makerAmountRemaining, takerAmountRemaining, takerFeeAmountRemaining} =
                    await bundleMath.bundle();
                expect(makerAmountTotal).to.equal(makerAmountRemaining);
                expect(makerAmountTotal).to.equal(0);
                expect(takerAmountRemaining).to.equal(0);
                expect(takerFeeAmountRemaining).to.equal(0);
                expect(await bundleMath.makerAmountOut()).to.equal(1000);
                expect(await bundleMath.takerAmountOut()).to.equal(0);
                expect(await bundleMath.takerFeeAmountOut()).to.equal(0);
            });

            it("10 LP", async () => {
                const {bundleMath} = await loadFixture(deployFixture);
                for (let i = 0; i < 10; i++) {
                    await bundleMath.addLiquidity(1000);
                }

                await bundleMath.removeLiquidity(1000);
                const {makerAmountTotal, makerAmountRemaining, takerAmountRemaining, takerFeeAmountRemaining} =
                    await bundleMath.bundle();
                expect(makerAmountTotal).to.equal(makerAmountRemaining);
                expect(makerAmountTotal).to.equal(1000 * 9);
                expect(takerAmountRemaining).to.equal(0);
                expect(takerFeeAmountRemaining).to.equal(0);
                expect(await bundleMath.makerAmountOut()).to.equal(1000);
                expect(await bundleMath.takerAmountOut()).to.equal(0);
                expect(await bundleMath.takerFeeAmountOut()).to.equal(0);
            });

            it("1 LP and partial filled", async () => {
                const {bundleMath} = await loadFixture(deployFixture);
                await bundleMath.addLiquidity(1000);

                await bundleMath.updateForTaker(900, 900, 100);

                await bundleMath.removeLiquidity(1000);
                const {makerAmountTotal, makerAmountRemaining, takerAmountRemaining, takerFeeAmountRemaining} =
                    await bundleMath.bundle();
                expect(makerAmountTotal).to.equal(0);
                expect(makerAmountRemaining).to.equal(0);
                expect(takerAmountRemaining).to.equal(0);
                expect(takerFeeAmountRemaining).to.equal(0);
                expect(await bundleMath.takerAmountOut()).to.equal(900);
                expect(await bundleMath.takerFeeAmountOut()).to.equal(100);
            });
        });
    });

    describe("#updateForTaker", () => {
        it("1 LP and fully filled", async () => {
            const {bundleMath} = await loadFixture(deployFixture);
            await bundleMath.addLiquidity(1);

            await bundleMath.updateForTaker(1, 1, 0);

            const {makerAmountTotal, makerAmountRemaining, takerAmountRemaining, takerFeeAmountRemaining} =
                await bundleMath.bundle();
            expect(makerAmountTotal).to.equal(1);
            expect(makerAmountRemaining).to.equal(0);
            expect(takerAmountRemaining).to.equal(1);
            expect(takerFeeAmountRemaining).to.equal(0);

            const {
                amountInUsed,
                amountInRemaining,
                amountOutUsed,
                amountOutRemaining,
                takerFeeForMakerAmountUsed,
                takerFeeForMakerAmountRemaining,
            } = await bundleMath.parameters();
            expect(amountInUsed).to.equal(1);
            expect(amountInRemaining).to.equal(0);
            expect(amountOutUsed).to.equal(1);
            expect(amountOutRemaining).to.equal(0);
            expect(takerFeeForMakerAmountUsed).to.equal(0);
            expect(takerFeeForMakerAmountRemaining).to.equal(0);
        });

        it("1 LP and fully filled (with exceeded current bundle balance)", async () => {
            const {bundleMath} = await loadFixture(deployFixture);
            await bundleMath.addLiquidity(1);

            await bundleMath.updateForTaker(1, 2, 0);

            const {makerAmountTotal, makerAmountRemaining, takerAmountRemaining, takerFeeAmountRemaining} =
                await bundleMath.bundle();
            expect(makerAmountTotal).to.equal(1);
            expect(makerAmountRemaining).to.equal(0);
            expect(takerAmountRemaining).to.equal(0);
            expect(takerFeeAmountRemaining).to.equal(0);

            const {
                amountInUsed,
                amountInRemaining,
                amountOutUsed,
                amountOutRemaining,
                takerFeeForMakerAmountUsed,
                takerFeeForMakerAmountRemaining,
            } = await bundleMath.parameters();
            expect(amountInUsed).to.equal(0);
            expect(amountInRemaining).to.equal(1);
            expect(amountOutUsed).to.equal(1);
            expect(amountOutRemaining).to.equal(1);
            expect(takerFeeForMakerAmountUsed).to.equal(0);
            expect(takerFeeForMakerAmountRemaining).to.equal(0);
        });

        it("1 LP and not fully filled (with receive taker fee)", async () => {
            const {bundleMath} = await loadFixture(deployFixture);
            await bundleMath.addLiquidity(1000);

            await bundleMath.updateForTaker(900, 900, 100);
            const {makerAmountTotal, makerAmountRemaining, takerAmountRemaining, takerFeeAmountRemaining} =
                await bundleMath.bundle();
            expect(makerAmountTotal).to.equal(1000);
            expect(makerAmountRemaining).to.equal(100);
            expect(takerAmountRemaining).to.equal(900);
            expect(takerFeeAmountRemaining).to.equal(100);

            const {
                amountInUsed,
                amountInRemaining,
                amountOutUsed,
                amountOutRemaining,
                takerFeeForMakerAmountUsed,
                takerFeeForMakerAmountRemaining,
            } = await bundleMath.parameters();
            expect(amountInUsed).to.equal(900);
            expect(amountInRemaining).to.equal(0);
            expect(amountOutUsed).to.equal(900);
            expect(amountOutRemaining).to.equal(0);
            expect(takerFeeForMakerAmountUsed).to.equal(100);
            expect(takerFeeForMakerAmountRemaining).to.equal(0);
        });

        it("1 LP and not fully filled (with receive taker fee, with exceeded current bundle balance)", async () => {
            const {bundleMath} = await loadFixture(deployFixture);
            await bundleMath.addLiquidity(1000);

            await bundleMath.updateForTaker(1100, 1100, 110);
            const {makerAmountTotal, makerAmountRemaining, takerAmountRemaining, takerFeeAmountRemaining} =
                await bundleMath.bundle();
            expect(makerAmountTotal).to.equal(1000);
            expect(makerAmountRemaining).to.equal(0);
            expect(takerAmountRemaining).to.equal(1000);
            expect(takerFeeAmountRemaining).to.equal(100);

            const {
                amountInUsed,
                amountInRemaining,
                amountOutUsed,
                amountOutRemaining,
                takerFeeForMakerAmountUsed,
                takerFeeForMakerAmountRemaining,
            } = await bundleMath.parameters();
            expect(amountInUsed).to.equal(1000);
            expect(amountInRemaining).to.equal(100);
            expect(amountOutUsed).to.equal(1000);
            expect(amountOutRemaining).to.equal(100);
            expect(takerFeeForMakerAmountUsed).to.equal(100);
            expect(takerFeeForMakerAmountRemaining).to.equal(10);
        });
    });
});
