import {ethers} from "hardhat";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {Resolution, RESOLUTION_X96} from "./shared/util";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import Decimal from "decimal.js";
import {BoundaryBitmapTest} from "../typechain-types";

describe("BoundaryBitmap", () => {
    async function deployFixture() {
        const contractFactory = await ethers.getContractFactory("BoundaryBitmapTest");
        const boundaryBitmapLow = await contractFactory.deploy(Resolution.LOW);
        const boundaryBitmapMedium = await contractFactory.deploy(Resolution.MEDIUM);
        const boundaryBitmapHigh = await contractFactory.deploy(Resolution.HIGH);

        const boundaryMathFactory = await ethers.getContractFactory("BoundaryMathTest");
        const boundaryMath = await boundaryMathFactory.deploy();

        await Promise.all([
            boundaryBitmapLow.deployed(),
            boundaryBitmapMedium.deployed(),
            boundaryBitmapHigh.deployed(),
            boundaryMath.deployed(),
        ]);
        return {boundaryBitmapLow, boundaryBitmapMedium, boundaryBitmapHigh, boundaryMath};
    }

    describe("#position", () => {
        it("boundary=-256", async () => {
            const {boundaryBitmapLow} = await loadFixture(deployFixture);
            const {wordPos, bitPos} = await boundaryBitmapLow.position(BigNumber.from(-256));
            expect(wordPos).to.equal(-1);
            expect(bitPos).to.equal(0);
        });

        it("boundary=256", async () => {
            const {boundaryBitmapLow, boundaryBitmapMedium, boundaryBitmapHigh} = await loadFixture(deployFixture);
            const tests = [
                {
                    boundaryBitmap: boundaryBitmapLow,
                    expectWordPos: 1,
                    expectBitPos: 0,
                },
                {
                    boundaryBitmap: boundaryBitmapMedium,
                    expectWordPos: 1,
                    expectBitPos: 0,
                },
                {
                    boundaryBitmap: boundaryBitmapHigh,
                    expectWordPos: 1,
                    expectBitPos: 0,
                },
            ];
            for (const test of tests) {
                const {wordPos, bitPos} = await test.boundaryBitmap.position(256);
                expect(wordPos).to.equal(test.expectWordPos);
                expect(bitPos).to.equal(test.expectBitPos);
            }
        });
    });

    describe("#flipBoundary", () => {
        it("flip boundary 0", async () => {
            const {boundaryBitmapLow} = await loadFixture(deployFixture);
            const boundary = BigNumber.from(0);
            await boundaryBitmapLow.flipBoundary(boundary);
            let word = await boundaryBitmapLow.getWord(boundary);
            expect(word).to.equal(BigNumber.from(1));

            await boundaryBitmapLow.flipBoundary(boundary);
            word = await boundaryBitmapLow.getWord(boundary);
            expect(word).to.equal(BigNumber.from(0));
        });

        it("flip boundary 10", async () => {
            const {boundaryBitmapLow} = await loadFixture(deployFixture);
            const boundary = BigNumber.from(10);
            await boundaryBitmapLow.flipBoundary(boundary);
            let word = await boundaryBitmapLow.getWord(boundary);
            expect(word).to.equal(BigNumber.from(1).shl(10));

            await boundaryBitmapLow.flipBoundary(boundary);
            word = await boundaryBitmapLow.getWord(boundary);
            expect(word).to.equal(BigNumber.from(0));
        });

        it("flip boundary 255", async () => {
            const {boundaryBitmapLow} = await loadFixture(deployFixture);
            const boundary = BigNumber.from(255);
            await boundaryBitmapLow.flipBoundary(boundary);
            let word = await boundaryBitmapLow.getWord(boundary);
            expect(word).to.equal(BigNumber.from(1).shl(255));

            await boundaryBitmapLow.flipBoundary(boundary);
            word = await boundaryBitmapLow.getWord(boundary);
            expect(word).to.equal(BigNumber.from(0));
        });

        it("flip boundary 256", async () => {
            const {boundaryBitmapLow} = await loadFixture(deployFixture);
            const boundary = BigNumber.from(256);
            await boundaryBitmapLow.flipBoundary(boundary);
            let word = await boundaryBitmapLow.getWord(boundary);
            expect(word).to.equal(BigNumber.from(1));

            await boundaryBitmapLow.flipBoundary(boundary);
            word = await boundaryBitmapLow.getWord(boundary);
            expect(word).to.equal(BigNumber.from(0));
        });
    });

    describe("#nextInitializedBoundary", () => {
        describe("current boundary initialized is true", () => {
            describe("current price is greater than the price at which the boundary Lower is located", () => {
                it("lte == true", async () => {
                    const {boundaryBitmapMedium} = await loadFixture(deployFixture);
                    await boundaryBitmapMedium.flipBoundary(0);
                    const {next, initialized} = await boundaryBitmapMedium.nextInitializedBoundary(
                        1,
                        BigNumber.from(new Decimal(1.0001).mul(new Decimal(2).pow(96)).toFixed(0)),
                        true,
                        0,
                        true
                    );
                    expect(next).to.equal(0);
                    expect(initialized).to.true;
                });

                it("lte == false", async () => {
                    const {boundaryBitmapMedium} = await loadFixture(deployFixture);
                    await boundaryBitmapMedium.flipBoundary(0);
                    const {next, initialized} = await boundaryBitmapMedium.nextInitializedBoundary(
                        1,
                        BigNumber.from(new Decimal(1.0001).mul(new Decimal(2).pow(96)).toFixed(0)),
                        true,
                        0,
                        false
                    );
                    expect(next).to.equal(0);
                    expect(initialized).to.true;
                });
            });

            describe("current price is equal to the price where the boundary Lower is located", () => {
                it("lte == true", async () => {
                    const {boundaryBitmapMedium} = await loadFixture(deployFixture);
                    await boundaryBitmapMedium.flipBoundary(0);
                    await boundaryBitmapMedium.flipBoundary(-10);
                    const {next, initialized} = await boundaryBitmapMedium.nextInitializedBoundary(
                        0,
                        RESOLUTION_X96,
                        true,
                        0,
                        true
                    );
                    expect(next).to.equal(-10);
                    expect(initialized).to.true;
                });

                it("lte == false", async () => {
                    const {boundaryBitmapMedium} = await loadFixture(deployFixture);
                    await boundaryBitmapMedium.flipBoundary(0);
                    const {next, initialized} = await boundaryBitmapMedium.nextInitializedBoundary(
                        0,
                        RESOLUTION_X96,
                        true,
                        0,
                        false
                    );
                    expect(next).to.equal(0);
                    expect(initialized).to.true;
                });
            });

            describe("current price is equal to the price where the boundary Upper is located", () => {
                it("lte == true", async () => {
                    const {boundaryBitmapMedium} = await loadFixture(deployFixture);
                    await boundaryBitmapMedium.flipBoundary(0);
                    const {next, initialized} = await boundaryBitmapMedium.nextInitializedBoundary(
                        10,
                        BigNumber.from("79291567866855013031014398182"),
                        true,
                        0,
                        true
                    );
                    expect(next).to.equal(0);
                    expect(initialized).to.true;
                });

                it("lte == false", async () => {
                    const {boundaryBitmapMedium} = await loadFixture(deployFixture);
                    await boundaryBitmapMedium.flipBoundary(0);
                    await boundaryBitmapMedium.flipBoundary(10);
                    const {next, initialized} = await boundaryBitmapMedium.nextInitializedBoundary(
                        0,
                        BigNumber.from("79291567866855013031014398182"),
                        true,
                        0,
                        false
                    );
                    expect(next).to.equal(10);
                    expect(initialized).to.true;
                });
            });
        });

        describe("current boundary initialized is false", () => {
            let boundaryBitmap: BoundaryBitmapTest;
            beforeEach("flip boundary", async () => {
                const {boundaryBitmapMedium} = await loadFixture(deployFixture);
                boundaryBitmap = boundaryBitmapMedium;
                await Promise.all([
                    boundaryBitmap.flipBoundary(-300000),
                    boundaryBitmap.flipBoundary(-200000),
                    boundaryBitmap.flipBoundary(-100000),
                    boundaryBitmap.flipBoundary(-30000),
                    boundaryBitmap.flipBoundary(-20000),
                    boundaryBitmap.flipBoundary(-10000),
                    boundaryBitmap.flipBoundary(-3000),
                    boundaryBitmap.flipBoundary(-2000),
                    boundaryBitmap.flipBoundary(-1000),
                    boundaryBitmap.flipBoundary(-30),
                    boundaryBitmap.flipBoundary(-20),
                    boundaryBitmap.flipBoundary(-10),
                    boundaryBitmap.flipBoundary(0),
                    boundaryBitmap.flipBoundary(10),
                    boundaryBitmap.flipBoundary(20),
                    boundaryBitmap.flipBoundary(30),
                    boundaryBitmap.flipBoundary(1000),
                    boundaryBitmap.flipBoundary(2000),
                    boundaryBitmap.flipBoundary(3000),
                    boundaryBitmap.flipBoundary(10000),
                    boundaryBitmap.flipBoundary(20000),
                    boundaryBitmap.flipBoundary(30000),
                    boundaryBitmap.flipBoundary(100000),
                    boundaryBitmap.flipBoundary(200000),
                    boundaryBitmap.flipBoundary(300000),
                ]);
            });
            const tests = [
                {
                    boundary: -29,
                    priceX96: 78998745129634034104723536524n,
                    boundaryLower: -30,
                    lte: false,
                    expectNext: -20,
                    expectInitialized: true,
                },
                {
                    boundary: -21,
                    priceX96: 79061966249810860392253787324n,
                    boundaryLower: -25,
                    lte: false,
                    expectNext: -20,
                    expectInitialized: true,
                },
                {
                    boundary: -20,
                    priceX96: 79069872446435841478293012703n,
                    boundaryLower: -25,
                    lte: false,
                    expectNext: -20,
                    expectInitialized: true,
                },
                {
                    boundary: -10,
                    priceX96: 79148977909814923576066331265n,
                    boundaryLower: -10,
                    lte: false,
                    expectNext: 0,
                    expectInitialized: true,
                },
                {
                    boundary: -9,
                    priceX96: 79156892807605905068423937898n,
                    boundaryLower: -10,
                    lte: false,
                    expectNext: 0,
                    expectInitialized: true,
                },
                {
                    boundary: 0,
                    priceX96: 79228162514264337593543950336n,
                    boundaryLower: -5,
                    lte: false,
                    expectNext: 0,
                    expectInitialized: true,
                },
                {
                    boundary: 0,
                    priceX96: 79228162514264337593543950336n,
                    boundaryLower: 0,
                    lte: false,
                    expectNext: 10,
                    expectInitialized: true,
                },
                {
                    boundary: 1,
                    priceX96: 79236085330515764027303304732n,
                    boundaryLower: 0,
                    lte: false,
                    expectNext: 10,
                    expectInitialized: true,
                },
                {
                    boundary: 10,
                    priceX96: 79307426338960776842885539845n,
                    boundaryLower: 5,
                    lte: false,
                    expectNext: 10,
                    expectInitialized: true,
                },
                {
                    boundary: 443000,
                    priceX96: 1371397122569968606776343525546573138518859445618n,
                    boundaryLower: 443000,
                    lte: false,
                    expectNext: 444155,
                    expectInitialized: false,
                },
                {
                    boundary: 443600,
                    priceX96: 1456195216270955103206513029158776779468408838535n,
                    boundaryLower: 443600,
                    lte: false,
                    expectNext: 444155,
                    expectInitialized: false,
                },
                {
                    boundary: 443625,
                    priceX96: 1459840076248373162167899255275506587012164559123n,
                    boundaryLower: 443625,
                    lte: false,
                    expectNext: 444155,
                    expectInitialized: false,
                },

                {
                    boundary: -31,
                    priceX96: 78982947750254505701038271859n,
                    boundaryLower: -35,
                    lte: true,
                    expectNext: -1000,
                    expectInitialized: true,
                },
                {
                    boundary: -30,
                    priceX96: 78990846045029531151608375686n,
                    boundaryLower: -30,
                    lte: true,
                    expectNext: -1000,
                    expectInitialized: true,
                },
                {
                    boundary: -527000,
                    priceX96: 1029686n,
                    boundaryLower: -52700,
                    lte: true,
                    expectNext: -528640,
                    expectInitialized: false,
                },
                {
                    boundary: -527400,
                    priceX96: 989314n,
                    boundaryLower: -527400,
                    lte: true,
                    expectNext: -528640,
                    expectInitialized: false,
                },
                {
                    boundary: 0,
                    priceX96: 79228162514264337593543950336n,
                    boundaryLower: 0,
                    lte: true,
                    expectNext: -10,
                    expectInitialized: true,
                },
                {
                    boundary: -1,
                    priceX96: 79220240490215316061937756561n,
                    boundaryLower: -5,
                    lte: true,
                    expectNext: -10,
                    expectInitialized: true,
                },
                {
                    boundary: 301001,
                    priceX96: 934401112160121441608134483081198905447837n,
                    boundaryLower: 301000,
                    lte: true,
                    expectNext: 300000,
                    expectInitialized: true,
                },
            ];
            tests.forEach((test) => {
                it(`boundary: ${test.boundary}, lte: ${test.lte}`, async () => {
                    const {next, initialized} = await boundaryBitmap.nextInitializedBoundary(
                        test.boundary,
                        test.priceX96,
                        false,
                        test.boundaryLower,
                        test.lte
                    );
                    expect(next).to.equal(test.expectNext);
                    expect(initialized).to.equal(test.expectInitialized);
                });
            });
        });
    });

    describe("#nextInitializedBoundaryWithinOneWord", () => {
        describe("lte=true", () => {
            const tests = [
                {
                    boundary: 256,
                    expect: 0,
                },
                {
                    boundary: 255,
                    expect: 0,
                },
                {
                    boundary: 100,
                    expect: 0,
                },
                {
                    boundary: 10,
                    expect: 0,
                },
                {
                    boundary: 0,
                    expect: -256,
                },
                {
                    boundary: -256,
                    expect: -256 * 2,
                },
            ];
            tests.forEach((test) => {
                it(`current boundary is not initialized, boundary: ${test.boundary}`, async () => {
                    const {boundaryBitmapLow} = await loadFixture(deployFixture);
                    const {next, initialized} = await boundaryBitmapLow.nextInitializedBoundaryWithinOneWord(
                        test.boundary,
                        true
                    );
                    expect(initialized).to.false;
                    expect(next).to.equal(test.expect);
                });

                it(`current boundary is initialized, boundary: ${test.boundary}`, async () => {
                    const {boundaryBitmapLow} = await loadFixture(deployFixture);
                    await boundaryBitmapLow.flipBoundary(test.boundary);
                    const {next, initialized} = await boundaryBitmapLow.nextInitializedBoundaryWithinOneWord(
                        test.boundary,
                        true
                    );
                    expect(initialized).to.false;
                    expect(next).to.equal(test.expect);
                });
            });
        });

        describe("lte=false", () => {
            const tests = [
                {
                    boundary: 0,
                    expect: 255,
                },
                {
                    boundary: 10,
                    expect: 255,
                },
                {
                    boundary: 100,
                    expect: 255,
                },
                {
                    boundary: 254,
                    expect: 255,
                },
                {
                    boundary: 255,
                    expect: 255 + 256,
                },
                {
                    boundary: 256,
                    expect: 255 + 256,
                },
            ];
            tests.forEach((test) => {
                it(`current boundary is not initialized, boundary: ${test.boundary}`, async () => {
                    const {boundaryBitmapLow} = await loadFixture(deployFixture);
                    const {next, initialized} = await boundaryBitmapLow.nextInitializedBoundaryWithinOneWord(
                        test.boundary,
                        false
                    );
                    expect(initialized).to.false;
                    expect(next).to.equal(test.expect);
                });

                it(`current boundary is initialized, boundary: ${test.boundary}`, async () => {
                    const {boundaryBitmapLow} = await loadFixture(deployFixture);
                    await boundaryBitmapLow.flipBoundary(test.boundary);
                    const {next, initialized} = await boundaryBitmapLow.nextInitializedBoundaryWithinOneWord(
                        test.boundary,
                        false
                    );
                    expect(initialized).to.false;
                    expect(next).to.equal(test.expect);
                });
            });
        });

        describe("resolution is 10", () => {
            const tests = [
                {
                    lte: true,
                    boundary: -87,
                    flipBoundary: -90,
                    expectNextBoundary: -90,
                    expectInitialized: true,
                },
                {
                    lte: true,
                    boundary: -10,
                    flipBoundary: -90,
                    expectNextBoundary: -90,
                    expectInitialized: true,
                },
                {
                    lte: true,
                    boundary: -10,
                    flipBoundary: 20,
                    expectNextBoundary: -1280,
                    expectInitialized: false,
                },
                {
                    lte: true,
                    boundary: -1234,
                    flipBoundary: -5680,
                    expectNextBoundary: -1280,
                    expectInitialized: false,
                },
                {
                    lte: true,
                    boundary: 1234,
                    flipBoundary: 1000,
                    expectNextBoundary: 1000,
                    expectInitialized: true,
                },
                {
                    lte: true,
                    boundary: 1230,
                    flipBoundary: 1000,
                    expectNextBoundary: 1000,
                    expectInitialized: true,
                },
                {
                    lte: false,
                    boundary: 11,
                    flipBoundary: 20,
                    expectNextBoundary: 20,
                    expectInitialized: true,
                },
                {
                    lte: false,
                    boundary: 10,
                    flipBoundary: 20,
                    expectNextBoundary: 20,
                    expectInitialized: true,
                },
                {
                    lte: false,
                    boundary: 1234,
                    flipBoundary: 5680,
                    expectNextBoundary: 1275,
                    expectInitialized: false,
                },
                {
                    lte: false,
                    boundary: 11,
                    flipBoundary: 0,
                    expectNextBoundary: 1275,
                    expectInitialized: false,
                },
                {
                    lte: false,
                    boundary: -22,
                    flipBoundary: -10,
                    expectNextBoundary: -10,
                    expectInitialized: true,
                },
                {
                    lte: false,
                    boundary: -20,
                    flipBoundary: -10,
                    expectNextBoundary: -10,
                    expectInitialized: true,
                },
                {
                    lte: false,
                    boundary: -1234,
                    flipBoundary: -10,
                    expectNextBoundary: -10,
                    expectInitialized: true,
                },
                {
                    lte: false,
                    boundary: -12345,
                    flipBoundary: -10,
                    expectNextBoundary: -11525,
                    expectInitialized: false,
                },
            ];
            for (const test of tests) {
                it(`current boundary is ${test.boundary} and flip boundary is ${test.flipBoundary}`, async () => {
                    const {boundaryBitmapMedium} = await loadFixture(deployFixture);
                    await boundaryBitmapMedium.flipBoundary(test.flipBoundary);
                    const {next, initialized} = await boundaryBitmapMedium.nextInitializedBoundaryWithinOneWord(
                        test.boundary,
                        test.lte
                    );
                    expect(next).to.equal(test.expectNextBoundary);
                    expect(initialized).to.equal(test.expectInitialized);
                });
            }
        });
    });
});
