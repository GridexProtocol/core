import {ethers} from "hardhat";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";

describe("FeeMath", () => {
    async function deployFixture() {
        const contractFactory = await ethers.getContractFactory("FeeMathTest");
        const feeMath = await contractFactory.deploy();
        await feeMath.deployed();
        return {feeMath};
    }

    describe("#computeFees", () => {
        describe("maker fee pips less than 0", () => {
            it("taker fee pips equal to abs(maker fee pips)", async () => {
                const {feeMath} = await loadFixture(deployFixture);
                const {takerFeeForMakerAmount, takerFeeForProtocolAmount} = await feeMath.computeFees(
                    1000,
                    10000,
                    -10000
                );
                expect(takerFeeForMakerAmount).to.equal(1000);
                expect(takerFeeForProtocolAmount).to.equal(0);
            });

            it("taker fee pips greater than abs(maker fee pips)", async () => {
                const {feeMath} = await loadFixture(deployFixture);
                const {takerFeeForMakerAmount, takerFeeForProtocolAmount} = await feeMath.computeFees(
                    1000,
                    10000,
                    -4999
                );
                expect(takerFeeForMakerAmount).to.equal(499);
                expect(takerFeeForProtocolAmount).to.equal(501);
            });
        });

        it("maker fee pips equal to 0", async () => {
            const {feeMath} = await loadFixture(deployFixture);
            const {takerFeeForMakerAmount, takerFeeForProtocolAmount} = await feeMath.computeFees(1000, 10000, 0);
            expect(takerFeeForMakerAmount).to.equal(0);
            expect(takerFeeForProtocolAmount).to.equal(1000);
        });
    });
});
