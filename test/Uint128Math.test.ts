import {ethers} from "hardhat";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";

describe("Uint128Math", () => {
    async function deployFixture() {
        const contractFactory = await ethers.getContractFactory("Uint128MathTest");
        const uint128Math = await contractFactory.deploy();
        await uint128Math.deployed();
        return {uint128Math};
    }

    describe("min and max", () => {
        const tests = [
            {
                a: 0,
                b: 0,
                expectMin: 0,
                expectMax: 0,
            },
            {
                a: 1,
                b: 1,
                expectMin: 1,
                expectMax: 1,
            },
            {
                a: 10,
                b: 9,
                expectMin: 9,
                expectMax: 10,
            },
            {
                a: 9,
                b: 10,
                expectMin: 9,
                expectMax: 10,
            },
        ];

        for (const test of tests) {
            it(`${test.a} and ${test.b}`, async () => {
                const {uint128Math} = await loadFixture(deployFixture);
                expect(await uint128Math.minUint128(test.a, test.b)).to.equal(test.expectMin);
                expect(await uint128Math.maxUint128(test.a, test.b)).to.equal(test.expectMax);
            });
        }
    });
});
