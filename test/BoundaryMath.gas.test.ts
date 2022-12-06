import {ethers} from "hardhat";
import {MAX_BOUNDARY, MAX_RATIO, MIN_BOUNDARY, MIN_RATIO, Resolution} from "./shared/util";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "./shared/expect";

describe("BoundaryMath", () => {
    const deployFixture = async function () {
        const boundaryMathFactory = await ethers.getContractFactory("BoundaryMathTest");
        const boundaryMath = await boundaryMathFactory.deploy();
        await boundaryMath.deployed();
        return {boundaryMath};
    };

    describe("#getPriceX96AtBoundary", () => {
        const boundaries = [
            MIN_BOUNDARY,
            -500000,
            -400000,
            -300000,
            -200000,
            -100000,
            0,
            100000,
            200000,
            300000,
            400000,
            MAX_BOUNDARY,
        ];

        for (const boundary of boundaries) {
            it(`boundary = ${boundary}`, async () => {
                const {boundaryMath} = await loadFixture(deployFixture);
                const {priceX96, gasUsed} = await boundaryMath.getPriceX96AtBoundaryWithGasUsed(boundary);
                const cmpObj = {
                    priceX96: priceX96.toBigInt(),
                    gasUsed: gasUsed.toNumber(),
                };
                expect(cmpObj).toMatchSnapshot();
            });
        }
    });

    describe("#getBoundaryAtPriceX96", () => {
        const priceX96s = [
            MIN_RATIO,
            15319379n,
            337263108622n,
            7425001144658883n,
            163464786360687385626n,
            3598751819609688046946419n,
            79228162514264337593543950336n,
            1744244129640337381386292603617838n,
            38400329974042030913961448288742562464n,
            845400776793423922697130608897531771147615n,
            18611883644907511909590774894315720731532604461n,
            MAX_RATIO,
        ];
        for (const priceX96 of priceX96s) {
            it(`priceX96 = ${priceX96}`, async () => {
                const {boundaryMath} = await loadFixture(deployFixture);
                const {boundary, gasUsed} = await boundaryMath.getBoundaryAtPriceX96WithGasUsed(priceX96);
                const cmpObj = {
                    boundary: boundary,
                    gasUsed: gasUsed.toNumber(),
                };
                expect(cmpObj).toMatchSnapshot();
            });
        }
    });

    describe("#getBoundaryLowerAtBoundary", () => {
        const tests = [
            {
                boundary: MIN_BOUNDARY,
                resolution: Resolution.LOW,
            },
            {
                boundary: 0,
                resolution: Resolution.LOW,
            },
            {
                boundary: MAX_BOUNDARY,
                resolution: Resolution.LOW,
            },

            {
                boundary: 3,
                resolution: Resolution.LOW,
            },
            {
                boundary: 3,
                resolution: Resolution.MEDIUM,
            },
            {
                boundary: 3,
                resolution: Resolution.HIGH,
            },
        ];

        for (const test of tests) {
            it(`boundary = ${test.boundary}, resolution = ${test.resolution}`, async () => {
                const {boundaryMath} = await loadFixture(deployFixture);
                const {boundaryLower, gasUsed} = await boundaryMath.getBoundaryLowerAtBoundaryWithGasUsed(
                    test.boundary,
                    test.resolution
                );
                const cmpObj = {
                    boundaryLower: boundaryLower,
                    gasUsed: gasUsed.toNumber(),
                };
                expect(cmpObj).toMatchSnapshot();
            });
        }
    });
});
