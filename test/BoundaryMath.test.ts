import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {ethers} from "hardhat";
import {encodePrice, MAX_BOUNDARY, MAX_RATIO, MIN_BOUNDARY, MIN_RATIO, Resolution, RESOLUTION_X96} from "./shared/util";
import "decimal.js";
import Decimal from "decimal.js";
import {BigNumber} from "ethers";

describe("BoundaryMath", () => {
    async function deployFixture() {
        const boundaryMathTestFactory = await ethers.getContractFactory("BoundaryMathTest");
        const boundaryMathTest = await boundaryMathTestFactory.deploy();
        return {boundaryMathTest};
    }

    describe("#isValidBoundary", () => {
        it("should return false", async function () {
            const {boundaryMathTest} = await loadFixture(deployFixture);
            expect(await boundaryMathTest.isValidBoundary(-100, 30)).to.false;
            expect(await boundaryMathTest.isValidBoundary(100, 30)).to.false;
        });
        it("should return true", async function () {
            const {boundaryMathTest} = await loadFixture(deployFixture);
            expect(await boundaryMathTest.isValidBoundary(-100, 10)).to.true;
            expect(await boundaryMathTest.isValidBoundary(100, 10)).to.true;
        });
    });

    describe("#isInRange", () => {
        it("should return false", async function () {
            const {boundaryMathTest} = await loadFixture(deployFixture);
            expect(await boundaryMathTest.isInRange(MIN_BOUNDARY - 1)).to.false;
            expect(await boundaryMathTest.isInRange(MAX_BOUNDARY + 1)).to.false;
        });
        it("should return true", async function () {
            const {boundaryMathTest} = await loadFixture(deployFixture);
            expect(await boundaryMathTest.isInRange(MIN_BOUNDARY)).to.true;
            expect(await boundaryMathTest.isInRange(MIN_BOUNDARY + 1)).to.true;
            expect(await boundaryMathTest.isInRange(0)).to.true;
            expect(await boundaryMathTest.isInRange(MAX_BOUNDARY)).to.true;
            expect(await boundaryMathTest.isInRange(MAX_BOUNDARY - 1)).to.true;
        });
    });

    describe("#isPriceX96InRange", function () {
        it("should return false", async function () {
            const {boundaryMathTest} = await loadFixture(deployFixture);
            expect(await boundaryMathTest.isPriceX96InRange(MIN_RATIO - 1n)).to.false;
            expect(await boundaryMathTest.isPriceX96InRange(MAX_RATIO + 1n)).to.false;
        });
        it("should return true", async function () {
            const {boundaryMathTest} = await loadFixture(deployFixture);
            expect(await boundaryMathTest.isPriceX96InRange(await boundaryMathTest.getPriceX96AtBoundary(MIN_BOUNDARY)))
                .to.true;
            expect(await boundaryMathTest.isPriceX96InRange(await boundaryMathTest.getPriceX96AtBoundary(MAX_BOUNDARY)))
                .to.true;
        });
    });

    describe("#getBoundaryAtPriceX96", () => {
        it("boundary is zero", async function () {
            const {boundaryMathTest} = await loadFixture(deployFixture);
            expect(await boundaryMathTest.getBoundaryAtPriceX96(RESOLUTION_X96)).to.equal(0);
        });
        it("should get boundary success", async function () {
            const {boundaryMathTest} = await loadFixture(deployFixture);
            expect(await boundaryMathTest.getBoundaryAtPriceX96(MIN_RATIO)).to.equal(MIN_BOUNDARY);
            expect(await boundaryMathTest.getBoundaryAtPriceX96("989413")).to.equal(MIN_BOUNDARY + 1);
            expect(await boundaryMathTest.getBoundaryAtPriceX96(MAX_RATIO)).to.equal(MAX_BOUNDARY);
            expect(
                await boundaryMathTest.getBoundaryAtPriceX96("1461154457982069109660872690047936117497446526938")
            ).to.equal(MAX_BOUNDARY - 1);
        });
    });

    for (const ratio of [
        MIN_RATIO,
        encodePrice(BigNumber.from(10).pow(12), 1),
        encodePrice(BigNumber.from(10).pow(6), 1),
        encodePrice(1, 64),
        encodePrice(1, 8),
        encodePrice(1, 2),
        encodePrice(1, 1),
        encodePrice(2, 1),
        encodePrice(8, 1),
        encodePrice(64, 1),
        encodePrice(1, BigNumber.from(10).pow(6)),
        encodePrice(1, BigNumber.from(10).pow(12)),
        MAX_RATIO,
    ]) {
        describe(`ratio ${ratio}`, () => {
            it("is at most off by 1", async () => {
                const {boundaryMathTest} = await loadFixture(deployFixture);
                const jsResult = new Decimal(ratio.toString()).div(new Decimal(2).pow(96)).log(1.0001).floor();
                const result = await boundaryMathTest.getBoundaryAtPriceX96(ratio);
                const absDiff = new Decimal(result.toString()).sub(jsResult).abs();
                expect(absDiff.toNumber()).to.be.lte(1);
            });
            it("ratio is between the boundary and boundary+1", async () => {
                const {boundaryMathTest} = await loadFixture(deployFixture);
                const boundary = await boundaryMathTest.getBoundaryAtPriceX96(ratio);
                const ratioOfBoundary = await boundaryMathTest.getPriceX96AtBoundary(boundary);
                const ratioOfBoundaryPlusOne = await boundaryMathTest.getPriceX96AtBoundary(
                    Math.min(boundary + 1, MAX_BOUNDARY)
                );
                expect(ratio).to.be.gte(ratioOfBoundary);
                expect(ratio).to.be.lte(ratioOfBoundaryPlusOne);
            });
        });
    }

    describe("#getPriceX96AtBoundary", () => {
        it("boundary is zero", async () => {
            const {boundaryMathTest} = await loadFixture(deployFixture);
            let priceX96AtBoundary0 = await boundaryMathTest.getPriceX96AtBoundary(0);
            expect(priceX96AtBoundary0).to.equal(RESOLUTION_X96);
            expect(priceX96AtBoundary0.toHexString()).to.equal("0x01000000000000000000000000");
        });
        it("should get price success", async () => {
            const {boundaryMathTest} = await loadFixture(deployFixture);
            expect(await boundaryMathTest.getPriceX96AtBoundary(MIN_BOUNDARY)).to.equal(MIN_RATIO);
            expect(await boundaryMathTest.getPriceX96AtBoundary(MIN_BOUNDARY + 1)).to.equal("989413");
            expect(await boundaryMathTest.getPriceX96AtBoundary(MAX_BOUNDARY - 1)).to.equal(
                "1461154457982069109660872690047936117497446526938"
            );
            expect(await boundaryMathTest.getPriceX96AtBoundary(MAX_BOUNDARY)).to.equal(MAX_RATIO);
        });
        const boundaries = [
            50,
            100,
            250,
            500,
            1_000,
            2_500,
            3_000,
            4_000,
            5_000,
            50_000,
            150_000,
            250_000,
            350_000,
            440_000,
            MAX_BOUNDARY,
        ]
            .flatMap((t) => [-t, t])
            .concat([-500_000, -510_000, -520_000, MIN_BOUNDARY]);
        for (const boundary of boundaries) {
            describe(`boundary: ${boundary}`, () => {
                it("is at most off by 1/100th of a bips", async function () {
                    const {boundaryMathTest} = await loadFixture(deployFixture);
                    const jsResult = new Decimal(1.0001).pow(boundary).mul(new Decimal(2).pow(96));
                    const result = await boundaryMathTest.getPriceX96AtBoundary(boundary);
                    const absDiff = new Decimal(result.toString()).sub(jsResult).abs();
                    expect(absDiff.div(jsResult).toNumber()).to.be.lt(0.000001);
                });
            });
        }
    });

    describe("#getBoundaryLowerAtBoundary", () => {
        const resolutions = [1, 10, 25, 50, 75, 100, 500];
        const tests = [
            {
                boundary: -659245,
                expectBoundaryLowers: [-659245, -659250, -659250, -659250, -659250, -659300, -659500],
            },
            {
                boundary: -1,
                expectBoundaryLowers: [-1, -10, -25, -50, -75, -100, -500],
            },
            {
                boundary: 0,
                expectBoundaryLowers: [0, 0, 0, 0, 0, 0, 0],
            },
            {
                boundary: 554539,
                expectBoundaryLowers: [554539, 554530, 554525, 554500, 554475, 554500, 554500],
            },
        ];

        tests.forEach((test) => {
            it(`boundary: ${test.boundary}`, async () => {
                const {boundaryMathTest} = await loadFixture(deployFixture);

                for (let i = 0; i < resolutions.length; i++) {
                    expect(await boundaryMathTest.getBoundaryLowerAtBoundary(test.boundary, resolutions[i])).to.equal(
                        test.expectBoundaryLowers[i]
                    );
                }
            });
        });
    });

    describe("#rewriteToValidBoundaryLower", () => {
        const tests = [
            {
                name: "boundary lower is less than MIN_BOUNDARY",
                boundaryLower: MIN_BOUNDARY - 10,
                expectValidBoundaryLower: MIN_BOUNDARY - 10 + Resolution.HIGH,
            },
            {
                name: "boundary lower is greater than MAX_BOUNDARY",
                boundaryLower: MAX_BOUNDARY + 10,
                expectValidBoundaryLower: MAX_BOUNDARY + 10 - Resolution.HIGH,
            },
            {
                name: "boundary lower plus resolution is greater than MAX_BOUNDARY",
                boundaryLower: MAX_BOUNDARY,
                expectValidBoundaryLower: MAX_BOUNDARY - Resolution.HIGH,
            },
            {
                name: "boundary lower is valid",
                boundaryLower: 0,
                expectValidBoundaryLower: 0,
            },
        ];
        tests.forEach((test) => {
            it(`${test.name}`, async () => {
                const {boundaryMathTest} = await loadFixture(deployFixture);
                expect(
                    await boundaryMathTest.rewriteToValidBoundaryLower(test.boundaryLower, Resolution.HIGH)
                ).to.equal(test.expectValidBoundaryLower);
            });
        });
    });
});
