import {ethers} from "hardhat";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";

describe("Uint160Math", () => {
    async function deployFixture() {
        const contractFactory = await ethers.getContractFactory("Uint160MathTest");
        const uint160Math = await contractFactory.deploy();
        await uint160Math.deployed();
        return {uint160Math};
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
                const {uint160Math} = await loadFixture(deployFixture);
                expect(await uint160Math.minUint160(test.a, test.b)).to.equal(test.expectMin);
                expect(await uint160Math.maxUint160(test.a, test.b)).to.equal(test.expectMax);
            });
        }
    });
});
