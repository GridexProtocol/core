import {ethers} from "hardhat";
import {expect} from "./shared/expect";
import {BigNumber} from "ethers";
import {
    encodePriceWithBaseAndQuote,
    expectBoundaryInitialized,
    formatBoundaryToBoundaryLower,
    MAX_BOUNDARY,
    MAX_RATIO,
    MIN_BOUNDARY,
    MIN_RATIO,
    position,
    Resolution,
    RESOLUTION_X96,
} from "./shared/util";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {
    deployERC20,
    deployFlashTest,
    deployGridFactory,
    deployGridTestHelper,
    deploySwapMath,
    deploySwapTest,
    deployWETH,
} from "./shared/deployer";
import {computeAddress, sortedToken} from "./shared/GridAddress";
import {
    BoundaryMathTest,
    FlashTest,
    Grid,
    GridFactory,
    GridTestHelper,
    IERC20,
    IWETHMinimum,
    SwapMathTest,
} from "../typechain-types";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {IGridParameters} from "../typechain-types/contracts/interfaces/IGrid";

describe("Grid", () => {
    const startOrderId = 3;
    const startBundleId = 3;

    async function deployNonStandardERC20() {
        const nonStandardERC20Factory = await ethers.getContractFactory("NonStandardERC20");
        const token0 = await nonStandardERC20Factory.deploy();
        await token0.deployed();
        const token1 = await nonStandardERC20Factory.deploy();
        await token1.deployed();
        return {token0, token1};
    }

    async function deployBaseFixture() {
        const [signer, otherAccount] = await ethers.getSigners();

        const contractFactory = await ethers.getContractFactory("BoundaryMathTest");
        const boundaryMath = await contractFactory.deploy();
        await boundaryMath.deployed();

        const weth = await deployWETH();
        const {gridFactory} = await deployGridFactory(weth.address);

        const usdc = await deployERC20("USDC", "USDC", 6, 10n ** 18n * 10000n);

        const gridTestHelper = await deployGridTestHelper(gridFactory.address, weth.address);

        const swapMath = await deploySwapMath();

        return {
            signer,
            otherAccount,
            boundaryMath,
            gridFactory,
            gridTestHelper,
            swapMath,
            weth,
            usdc,
        };
    }

    async function deployAndCreateGridFixture() {
        const {signer, otherAccount, boundaryMath, gridFactory, gridTestHelper, swapMath, weth, usdc} =
            await deployBaseFixture();
        await gridFactory.createGrid(weth.address, usdc.address, Resolution.MEDIUM);

        const grid = await ethers.getContractAt(
            "Grid",
            await computeAddress(gridFactory.address, weth.address, usdc.address, Resolution.MEDIUM),
            signer
        );
        await Promise.all([
            weth.approve(grid.address, 10n ** 18n * 10000n),
            weth.approve(gridTestHelper.address, 10n ** 18n * 10000n),
            usdc.approve(grid.address, 10n ** 18n * 10000n),
            usdc.approve(gridTestHelper.address, 10n ** 18n * 10000n),
        ]);
        return {
            signer,
            otherAccount,
            boundaryMath,
            gridFactory,
            gridTestHelper,
            swapMath,
            grid,
            weth,
            usdc,
        };
    }

    async function createGridAndInitializeGridFixture() {
        const {signer, otherAccount, boundaryMath, gridFactory, gridTestHelper, swapMath, grid, weth, usdc} =
            await deployAndCreateGridFixture();
        const priceX96 = encodePriceWithBaseAndQuote(weth.address, 1, usdc.address, 1644);
        await gridTestHelper.initialize(
            {
                tokenA: weth.address,
                tokenB: usdc.address,
                resolution: Resolution.MEDIUM,
                recipient: signer.address,
                priceX96: priceX96,
                orders0: [
                    {
                        boundaryLower: 220000,
                        amount: 1n,
                    },
                ],
                orders1: [
                    {
                        boundaryLower: 220000,
                        amount: 1n,
                    },
                ],
            },
            {value: 1n}
        );
        await grid.settleMakerOrderAndCollectInBatch(signer.address, [1n, 2n], true);
        return {
            signer,
            otherAccount,
            boundaryMath,
            gridFactory,
            gridTestHelper,
            swapMath,
            grid,
            weth,
            usdc,
        };
    }

    describe("#initialize", () => {
        it("should revert with right error if not initialized", async () => {
            const {grid} = await loadFixture(deployAndCreateGridFixture);
            await expect(grid.collect(grid.address, BigNumber.from(0), BigNumber.from(0))).to.be.revertedWith("G_GL");
        });

        it("should revert with right error if price not in range", async () => {
            const {grid} = await loadFixture(deployAndCreateGridFixture);
            await expect(
                grid.initialize(
                    {
                        recipient: ethers.constants.AddressZero,
                        priceX96: MIN_RATIO - 1n,
                        orders0: [],
                        orders1: [],
                    },
                    []
                )
            ).to.be.revertedWith("G_POR");
            await expect(
                grid.initialize(
                    {
                        recipient: ethers.constants.AddressZero,
                        priceX96: MAX_RATIO + 1n,
                        orders0: [],
                        orders1: [],
                    },
                    []
                )
            ).to.be.revertedWith("G_POR");
        });

        it("should revert with right error if orders0 is empty", async () => {
            const {grid} = await loadFixture(deployAndCreateGridFixture);
            await expect(
                grid.initialize(
                    {
                        recipient: ethers.constants.AddressZero,
                        priceX96: RESOLUTION_X96,
                        orders0: [],
                        orders1: [
                            {
                                boundaryLower: 0n,
                                amount: 1n,
                            },
                        ],
                    },
                    []
                )
            ).to.be.revertedWith("G_ONE");
        });

        it("should revert with right error if orders0 is empty", async () => {
            const {grid} = await loadFixture(deployAndCreateGridFixture);
            await expect(
                grid.initialize(
                    {
                        recipient: ethers.constants.AddressZero,
                        priceX96: RESOLUTION_X96,
                        orders0: [
                            {
                                boundaryLower: 0n,
                                amount: 1n,
                            },
                        ],
                        orders1: [],
                    },
                    []
                )
            ).to.be.revertedWith("G_ONE");
        });

        it("should revert with right error if repeated initialize", async () => {
            const {grid, weth, usdc, gridTestHelper} = await loadFixture(deployAndCreateGridFixture);
            const parameters = {
                tokenA: weth.address,
                tokenB: usdc.address,
                resolution: Resolution.MEDIUM,
                recipient: ethers.constants.AddressZero,
                priceX96: RESOLUTION_X96,
                orders0: [
                    {
                        boundaryLower: 0n,
                        amount: 1n,
                    },
                ],
                orders1: [
                    {
                        boundaryLower: 0n,
                        amount: 1n,
                    },
                ],
            };
            await expect(gridTestHelper.initialize(parameters, {value: 1n}))
                .to.emit(grid, "Initialize")
                .withArgs(RESOLUTION_X96, 0);
            await expect(gridTestHelper.initialize(parameters, {value: 1n})).to.be.revertedWith("G_GAI");
        });

        it("should revert with right error if non standard erc20", async () => {
            const {gridFactory, usdc, gridTestHelper} = await loadFixture(deployAndCreateGridFixture);
            const {token0, token1} = await deployNonStandardERC20();

            await token0.approve(gridTestHelper.address, 1n << 18n);
            await token1.approve(gridTestHelper.address, 1n << 18n);

            await gridFactory.createGrid(usdc.address, token0.address, Resolution.MEDIUM);
            await gridFactory.createGrid(usdc.address, token1.address, Resolution.MEDIUM);

            const parameters = {
                tokenA: usdc.address,
                tokenB: token0.address,
                resolution: Resolution.MEDIUM,
                recipient: ethers.constants.AddressZero,
                priceX96: RESOLUTION_X96,
                orders0: [
                    {
                        boundaryLower: 0n,
                        amount: 1n,
                    },
                ],
                orders1: [
                    {
                        boundaryLower: 0n,
                        amount: 1n,
                    },
                ],
            };

            await expect(gridTestHelper.initialize(parameters)).to.revertedWith("G_TPF");

            parameters.tokenB = token1.address;
            await expect(gridTestHelper.initialize(parameters)).to.revertedWith("G_TPF");
        });

        describe("table tests", () => {
            const tests = [
                {
                    expectBoundary: -527400,
                    expectBoundaryLower: -527400,
                },
                {
                    expectBoundary: -527392,
                    expectBoundaryLower: -527390,
                },
                {
                    expectBoundary: 1,
                    expectBoundaryLower: 0,
                },
                {
                    expectBoundary: 0,
                    expectBoundaryLower: 0,
                },
                {
                    expectBoundary: 100,
                    expectBoundaryLower: 100,
                },
                {
                    expectBoundary: MAX_BOUNDARY,
                    expectBoundaryLower: MAX_BOUNDARY - (MAX_BOUNDARY % 10),
                },
            ];
            for (const test of tests) {
                it(`initialize priceX96 at ${test.expectBoundary}`, async () => {
                    const {grid, boundaryMath, weth, usdc, gridTestHelper} = await loadFixture(
                        deployAndCreateGridFixture
                    );
                    const expectPriceX96 = await boundaryMath.getPriceX96AtBoundary(test.expectBoundary);
                    await expect(
                        gridTestHelper.initialize(
                            {
                                tokenA: weth.address,
                                tokenB: usdc.address,
                                resolution: Resolution.MEDIUM,
                                recipient: ethers.constants.AddressZero,
                                priceX96: expectPriceX96,
                                orders0: [
                                    {
                                        boundaryLower: 0n,
                                        amount: 1n,
                                    },
                                ],
                                orders1: [
                                    {
                                        boundaryLower: 0n,
                                        amount: 1n,
                                    },
                                ],
                            },
                            {value: 1n}
                        )
                    )
                        .to.emit(grid, "Initialize")
                        .withArgs(expectPriceX96, test.expectBoundary);
                    const {priceX96, boundary} = await grid.slot0();
                    expect(priceX96).to.equal(expectPriceX96);
                    expect(boundary).to.equal(test.expectBoundary);
                });
            }
        });
    });

    describe("#swap", () => {
        it("should revert with right error if not initialized", async () => {
            const {grid} = await loadFixture(deployAndCreateGridFixture);
            await expect(grid.swap(ethers.constants.AddressZero, false, 1n, 0, [])).to.revertedWith("G_GL");
        });

        it("should revert with right error if amount specified is zero", async () => {
            const {grid} = await loadFixture(createGridAndInitializeGridFixture);
            await expect(grid.swap(ethers.constants.AddressZero, true, 0, 0, [])).to.revertedWith("G_ASZ");
        });

        it("should success if exact in too small", async () => {
            const {otherAccount, grid, gridFactory, gridTestHelper, weth, usdc} = await deployAndCreateGridFixture();
            const {token0} = await sortedToken(weth.address, usdc.address);
            await gridTestHelper.initialize(
                {
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    recipient: ethers.constants.AddressZero,
                    priceX96: RESOLUTION_X96,
                    orders0: [
                        {
                            boundaryLower: -Resolution.MEDIUM,
                            amount: 10n ** 18n,
                        },
                    ],
                    orders1: [
                        {
                            boundaryLower: -Resolution.MEDIUM,
                            amount: 1n,
                        },
                    ],
                },
                {value: token0.toLowerCase() == weth.address.toLowerCase() ? 10n ** 18n : 1n}
            );

            const swapTest = await deploySwapTest(gridFactory.address, weth.address);

            await expect(
                swapTest.input({
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    recipient: otherAccount.address,
                    zeroForOne: false,
                    amountSpecified: -1n,
                    priceLimitX96: MAX_RATIO,
                    payer: swapTest.address,
                })
            )
                .to.emit(grid, "Swap")
                .withArgs(swapTest.address, otherAccount.address, 0, 0, RESOLUTION_X96, 0);
        });

        it("should success if exact in - zero for one", async () => {
            const {signer, grid, gridTestHelper, weth, usdc} = await deployAndCreateGridFixture();

            const {token0, token1} = await sortedToken(weth.address, usdc.address);

            await gridTestHelper.initialize(
                {
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    recipient: ethers.constants.AddressZero,
                    priceX96: RESOLUTION_X96,
                    orders0: [
                        {
                            boundaryLower: -Resolution.MEDIUM,
                            amount: 1n,
                        },
                    ],
                    orders1: [
                        {
                            boundaryLower: -Resolution.MEDIUM,
                            amount: 10n ** 18n,
                        },
                    ],
                },
                {
                    value: token1.toLowerCase() == weth.address.toLowerCase() ? 10n ** 18n : 1n,
                }
            );

            await expect(
                gridTestHelper.exactInput(
                    {
                        recipient: signer.address,
                        tokenIn: token0,
                        tokenOut: token1,
                        resolution: Resolution.MEDIUM,
                        amountIn: 10n ** 18n * 2n,
                        amountOutMinimum: 10n ** 18n,
                        priceLimitX96: 79038250506172963152230696873n,
                    },
                    {
                        value: token0.toLowerCase() == weth.address.toLowerCase() ? 10n ** 18n * 2n : 0n,
                    }
                )
            )
                .to.emit(grid, "Swap")
                .withArgs(
                    gridTestHelper.address,
                    signer.address,
                    (v: any) => {
                        return v > 0n;
                    },
                    10n ** 18n * -1n,
                    79188560314459151373725315960n,
                    -Resolution.MEDIUM
                );
        });

        describe("price limit over range", () => {
            it("zeroForOne == true", async () => {
                const {signer, gridTestHelper, weth, usdc} = await loadFixture(createGridAndInitializeGridFixture);

                const {token0, token1} = await sortedToken(weth.address, usdc.address);
                await expect(
                    gridTestHelper.exactOutput({
                        tokenIn: token0,
                        tokenOut: token1,
                        resolution: Resolution.MEDIUM,
                        recipient: signer.address,
                        amountOut: 1,
                        amountInMaximum: 1,
                        priceLimitX96: encodePriceWithBaseAndQuote(weth.address, 1, usdc.address, 1644).add(1),
                    })
                ).to.revertedWith("G_PLO");
            });

            it("zeroForOne == false", async () => {
                const {signer, gridTestHelper, weth, usdc} = await loadFixture(createGridAndInitializeGridFixture);

                const {token0, token1} = await sortedToken(weth.address, usdc.address);
                await expect(
                    gridTestHelper.exactOutput({
                        tokenIn: token1,
                        tokenOut: token0,
                        resolution: Resolution.MEDIUM,
                        recipient: signer.address,
                        amountOut: 1,
                        amountInMaximum: 1,
                        priceLimitX96: encodePriceWithBaseAndQuote(weth.address, 1, usdc.address, 1644).sub(1),
                    })
                ).to.revertedWith("G_PLO");
            });
        });

        describe("zero liquidity", () => {
            it("zeroForOne == true", async () => {
                const {signer, gridTestHelper, weth, usdc} = await loadFixture(createGridAndInitializeGridFixture);

                const {token0, token1} = await sortedToken(weth.address, usdc.address);

                await expect(
                    gridTestHelper.exactOutput({
                        tokenIn: token0,
                        tokenOut: token1,
                        resolution: Resolution.MEDIUM,
                        recipient: signer.address,
                        amountOut: 1,
                        amountInMaximum: 1,
                        priceLimitX96: encodePriceWithBaseAndQuote(weth.address, 1, usdc.address, 1644).sub(1),
                    })
                ).to.revertedWith("amount0Delta or amount1Delta must be positive");
            });

            it("zeroForOne == false", async () => {
                const {signer, gridTestHelper, weth, usdc} = await loadFixture(createGridAndInitializeGridFixture);

                const {token0, token1} = await sortedToken(weth.address, usdc.address);

                await expect(
                    gridTestHelper.exactOutput({
                        tokenIn: token1,
                        tokenOut: token0,
                        resolution: Resolution.MEDIUM,
                        recipient: signer.address,
                        amountOut: 1,
                        amountInMaximum: 1,
                        priceLimitX96: encodePriceWithBaseAndQuote(weth.address, 1, usdc.address, 1644).add(1),
                    })
                ).to.revertedWith("amount0Delta or amount1Delta must be positive");
            });
        });

        describe("initialize only one boundary", () => {
            describe("zeroForOne == true", () => {
                it("fully filled", async () => {
                    const {signer, gridTestHelper, swapMath, boundaryMath, grid, weth, usdc} = await loadFixture(
                        createGridAndInitializeGridFixture
                    );

                    const {boundary: boundaryBefore} = await grid.slot0();
                    const boundaryLowerBefore = await formatBoundaryToBoundaryLower(boundaryBefore, Resolution.MEDIUM);
                    const {token0, token1} = await sortedToken(weth.address, usdc.address);

                    await gridTestHelper.placeMakerOrderInBatch(
                        {
                            zero: false,
                            recipient: signer.address,
                            tokenA: token0,
                            tokenB: token1,
                            resolution: Resolution.MEDIUM,
                            orders: [
                                {
                                    boundaryLower: boundaryLowerBefore - Resolution.MEDIUM,
                                    amount: 499,
                                },
                                {
                                    boundaryLower: boundaryLowerBefore - Resolution.MEDIUM,
                                    amount: 501,
                                },
                            ],
                        },
                        {
                            value: token0.toLowerCase() == weth.address.toLowerCase() ? 0 : 1000,
                        }
                    );

                    const priceMaxX96 = boundaryMath.getPriceX96AtBoundary(boundaryLowerBefore - Resolution.MEDIUM);
                    const {amountIn, feeAmount} = await swapMath.computeSwapStep(
                        await boundaryMath.getPriceX96AtBoundary(boundaryLowerBefore),
                        priceMaxX96,
                        MIN_RATIO,
                        -1000,
                        1000,
                        500
                    );
                    const amount0OrAmount1 = (amount: any) => {
                        if (BigNumber.from(-1000).eq(amount)) {
                            return true;
                        }
                        return amountIn.add(feeAmount).eq(amount);
                    };
                    await expect(
                        gridTestHelper.exactOutput(
                            {
                                recipient: signer.address,
                                tokenIn: token0,
                                tokenOut: token1,
                                resolution: Resolution.MEDIUM,
                                amountOut: 1000,
                                amountInMaximum: amountIn.add(feeAmount),
                                priceLimitX96: 0,
                            },
                            {
                                value: token0.toLowerCase() == weth.address.toLowerCase() ? amountIn.add(feeAmount) : 0,
                            }
                        )
                    )
                        .to.emit(grid, "ChangeBundleForSwap")
                        .withArgs(startBundleId, -1000, amountIn, feeAmount)
                        .to.emit(grid, "Swap")
                        .withArgs(
                            gridTestHelper.address,
                            signer.address,
                            amount0OrAmount1,
                            amount0OrAmount1,
                            await priceMaxX96,
                            boundaryLowerBefore - Resolution.MEDIUM
                        );
                    // check slot0
                    {
                        const {priceX96: priceX96After, boundary: boundaryAfter} = await grid.slot0();
                        expect(priceX96After).to.equal(await priceMaxX96);
                        expect(boundaryAfter).to.equal(await boundaryMath.getBoundaryAtPriceX96(priceX96After));
                    }

                    // check bundle
                    {
                        const {makerAmountTotal, makerAmountRemaining, takerAmountRemaining, takerFeeAmountRemaining} =
                            await grid.bundles(startBundleId);
                        expect(makerAmountTotal).to.equal(1000);
                        expect(makerAmountRemaining).to.equal(0);
                        expect(takerAmountRemaining).to.equal(amountIn);
                        expect(takerFeeAmountRemaining).to.equal(feeAmount);
                    }
                    // check boundary
                    {
                        const {bundle0Id, bundle1Id, makerAmountRemaining} = await grid.boundaries1(
                            boundaryLowerBefore - Resolution.MEDIUM
                        );
                        expect(bundle0Id).to.equal(0);
                        expect(bundle1Id).to.equal(0);
                        expect(makerAmountRemaining).to.equal(0);
                    }
                    // check boundary bitmap
                    {
                        const word = await grid.boundaryBitmaps1(
                            ((boundaryLowerBefore - Resolution.MEDIUM) / Resolution.MEDIUM) >> 8
                        );
                        expect(word).to.equal(0);
                    }
                });

                it("partial filled", async () => {
                    const {signer, gridTestHelper, swapMath, boundaryMath, grid, weth, usdc} = await loadFixture(
                        createGridAndInitializeGridFixture
                    );

                    const {boundary: boundaryBefore} = await grid.slot0();
                    const boundaryLowerBefore = await formatBoundaryToBoundaryLower(boundaryBefore, Resolution.MEDIUM);
                    const {token0, token1} = await sortedToken(weth.address, usdc.address);

                    await gridTestHelper.placeMakerOrderInBatch(
                        {
                            zero: false,
                            recipient: signer.address,
                            tokenA: token0,
                            tokenB: token1,
                            resolution: Resolution.MEDIUM,
                            orders: [
                                {
                                    boundaryLower: boundaryLowerBefore - Resolution.MEDIUM,
                                    amount: 499,
                                },
                                {
                                    boundaryLower: boundaryLowerBefore - Resolution.MEDIUM,
                                    amount: 501,
                                },
                            ],
                        },
                        {
                            value: token0.toLowerCase() == weth.address.toLowerCase() ? 0 : 1000,
                        }
                    );

                    const priceMaxX96 = boundaryMath.getPriceX96AtBoundary(boundaryLowerBefore - Resolution.MEDIUM);
                    const {priceNextX96, amountIn, feeAmount} = await swapMath.computeSwapStep(
                        boundaryMath.getPriceX96AtBoundary(boundaryLowerBefore),
                        priceMaxX96,
                        priceMaxX96,
                        -499,
                        1000,
                        500
                    );
                    const boundaryNextPromise = boundaryMath.getBoundaryAtPriceX96(priceNextX96);

                    const amount0OrAmount1 = (amount: any) => {
                        if (BigNumber.from(-499).eq(amount)) {
                            return true;
                        }
                        return amountIn.add(feeAmount).eq(amount);
                    };
                    await expect(
                        gridTestHelper.exactOutput(
                            {
                                recipient: signer.address,
                                tokenIn: token0,
                                tokenOut: token1,
                                resolution: Resolution.MEDIUM,
                                amountOut: 499,
                                amountInMaximum: amountIn.add(feeAmount),
                                priceLimitX96: 0,
                            },
                            {
                                value: token0.toLowerCase() == weth.address.toLowerCase() ? amountIn.add(feeAmount) : 0,
                            }
                        )
                    )
                        .to.emit(grid, "ChangeBundleForSwap")
                        .withArgs(startBundleId, -499, amountIn, feeAmount)
                        .to.emit(grid, "Swap")
                        .withArgs(
                            gridTestHelper.address,
                            signer.address,
                            amount0OrAmount1,
                            amount0OrAmount1,
                            priceNextX96,
                            await boundaryNextPromise
                        );
                    // check slot0
                    {
                        const {priceX96: priceX96After, boundary: boundaryAfter} = await grid.slot0();
                        expect(priceX96After).to.equal(priceNextX96);
                        expect(boundaryAfter).to.equal(await boundaryNextPromise);
                    }

                    // check bundle
                    {
                        const {makerAmountTotal, makerAmountRemaining, takerAmountRemaining, takerFeeAmountRemaining} =
                            await grid.bundles(startBundleId);
                        expect(makerAmountTotal).to.equal(1000);
                        expect(makerAmountRemaining).to.equal(1000 - 499);
                        expect(takerAmountRemaining).to.equal(amountIn);
                        expect(takerFeeAmountRemaining).to.equal(feeAmount);
                    }
                    // check boundary
                    {
                        const {bundle0Id, bundle1Id, makerAmountRemaining} = await grid.boundaries1(
                            boundaryLowerBefore - Resolution.MEDIUM
                        );
                        expect(bundle0Id).to.equal(startBundleId);
                        expect(bundle1Id).to.equal(0);
                        expect(makerAmountRemaining).to.equal(1000 - 499);
                    }
                    // check boundary bitmap
                    {
                        const word = await grid.boundaryBitmaps1(
                            ((boundaryLowerBefore - Resolution.MEDIUM) / Resolution.MEDIUM) >> 8
                        );
                        expect(word).to.not.equal(0);
                    }
                });
            });

            describe("zeroForOne == false", () => {
                it("fully filled", async () => {
                    const {signer, gridTestHelper, swapMath, boundaryMath, grid, weth, usdc} = await loadFixture(
                        createGridAndInitializeGridFixture
                    );

                    const {boundary: boundaryBefore} = await grid.slot0();
                    const boundaryLowerBefore = await formatBoundaryToBoundaryLower(boundaryBefore, Resolution.MEDIUM);
                    const {token0, token1} = await sortedToken(weth.address, usdc.address);

                    await gridTestHelper.placeMakerOrderInBatch(
                        {
                            zero: true,
                            recipient: signer.address,
                            tokenA: token0,
                            tokenB: token1,
                            resolution: Resolution.MEDIUM,
                            orders: [
                                {
                                    boundaryLower: boundaryLowerBefore + Resolution.MEDIUM,
                                    amount: 499,
                                },
                                {
                                    boundaryLower: boundaryLowerBefore + Resolution.MEDIUM,
                                    amount: 501,
                                },
                            ],
                        },
                        {
                            value: token0.toLowerCase() == weth.address.toLowerCase() ? 1000 : 0,
                        }
                    );

                    const priceCurrentX96 = boundaryMath.getPriceX96AtBoundary(boundaryLowerBefore + Resolution.MEDIUM);
                    const priceMaxX96 = boundaryMath.getPriceX96AtBoundary(
                        boundaryLowerBefore + Resolution.MEDIUM + Resolution.MEDIUM
                    );
                    const {amountIn, feeAmount} = await swapMath.computeSwapStep(
                        priceCurrentX96,
                        priceMaxX96,
                        priceMaxX96,
                        -1000,
                        1000,
                        500
                    );
                    const amount0OrAmount1 = (amount: any) => {
                        if (BigNumber.from(-1000).eq(amount)) {
                            return true;
                        }
                        return amountIn.add(feeAmount).eq(amount);
                    };
                    await expect(
                        gridTestHelper.exactOutput(
                            {
                                recipient: signer.address,
                                tokenIn: token1,
                                tokenOut: token0,
                                resolution: Resolution.MEDIUM,
                                amountOut: 1000,
                                amountInMaximum: amountIn.add(feeAmount),
                                priceLimitX96: 0,
                            },
                            {
                                value: token0.toLowerCase() == weth.address.toLowerCase() ? 0 : amountIn.add(feeAmount),
                            }
                        )
                    )
                        .to.emit(grid, "ChangeBundleForSwap")
                        .withArgs(startBundleId, -1000, amountIn, feeAmount)
                        .to.emit(grid, "Swap")
                        .withArgs(
                            gridTestHelper.address,
                            signer.address,
                            amount0OrAmount1,
                            amount0OrAmount1,
                            await priceMaxX96,
                            boundaryLowerBefore + Resolution.MEDIUM + Resolution.MEDIUM
                        );
                    // check slot0
                    {
                        const {priceX96: priceX96After, boundary: boundaryAfter} = await grid.slot0();
                        expect(priceX96After).to.equal(await priceMaxX96);
                        expect(boundaryAfter).to.equal(boundaryLowerBefore + Resolution.MEDIUM + Resolution.MEDIUM);
                    }

                    // check bundle
                    {
                        const {makerAmountTotal, makerAmountRemaining, takerAmountRemaining, takerFeeAmountRemaining} =
                            await grid.bundles(startBundleId);
                        expect(makerAmountTotal).to.equal(1000);
                        expect(makerAmountRemaining).to.equal(0);
                        expect(takerAmountRemaining).to.equal(amountIn);
                        expect(takerFeeAmountRemaining).to.equal(feeAmount);
                    }
                    // check boundary
                    {
                        const {bundle0Id, bundle1Id, makerAmountRemaining} = await grid.boundaries0(
                            boundaryLowerBefore + Resolution.MEDIUM
                        );
                        expect(bundle0Id).to.equal(0);
                        expect(bundle1Id).to.equal(0);
                        expect(makerAmountRemaining).to.equal(0);
                    }
                    // check boundary bitmap
                    {
                        const word = await grid.boundaryBitmaps0(
                            ((boundaryLowerBefore + Resolution.MEDIUM) / Resolution.MEDIUM) >> 8
                        );
                        expect(word).to.equal(0);
                    }
                });
            });
        });

        describe("more boundary", () => {
            describe("zeroForOne == true", () => {
                let ctx: {
                    signer: SignerWithAddress;
                    otherAccount: SignerWithAddress;
                    gridTestHelper: GridTestHelper;
                    usdc: IERC20;
                    weth: IWETHMinimum;
                    grid: Grid;
                    swapMath: SwapMathTest;
                    boundaryMath: BoundaryMathTest;
                    gridFactory: GridFactory;
                };
                let boundaryLowerBefore: number;
                let token0: string;
                let token1: string;

                beforeEach("place maker order for token1", async () => {
                    ctx = await createGridAndInitializeGridFixture();
                    const {boundary: boundaryBefore} = await ctx.grid.slot0();
                    boundaryLowerBefore = await formatBoundaryToBoundaryLower(boundaryBefore, Resolution.MEDIUM);

                    const {token0: _token0, token1: _token1} = await sortedToken(ctx.weth.address, ctx.usdc.address);
                    token0 = _token0;
                    token1 = _token1;

                    await ctx.gridTestHelper.placeMakerOrderInBatch(
                        {
                            zero: false,
                            recipient: ctx.signer.address,
                            tokenA: token0,
                            tokenB: token1,
                            resolution: Resolution.MEDIUM,
                            orders: [
                                {
                                    boundaryLower: boundaryLowerBefore - Resolution.MEDIUM * 2,
                                    amount: 1000,
                                },
                                {
                                    boundaryLower: boundaryLowerBefore - Resolution.MEDIUM,
                                    amount: 1000,
                                },
                                {
                                    boundaryLower: boundaryLowerBefore,
                                    amount: 1000,
                                },
                                {
                                    boundaryLower: boundaryLowerBefore + Resolution.MEDIUM,
                                    amount: 1000,
                                },
                                {
                                    boundaryLower: boundaryLowerBefore + Resolution.MEDIUM * 2,
                                    amount: 1000,
                                },
                            ],
                        },
                        {
                            value: token0.toLowerCase() == ctx.weth.address.toLowerCase() ? 0 : 5000,
                        }
                    );
                });

                describe("exactOutput", () => {
                    let amountInTotal: BigNumber;
                    let feeAmountTotal: BigNumber;
                    let protocolAmountTotal: BigNumber;
                    let priceX96After: BigNumber;
                    let boundaryLowerBefore: number;
                    describe("exact output once", () => {
                        beforeEach("exactOutputSingle", async () => {
                            const {priceX96: priceX96Before, boundary: boundaryBefore} = await ctx.grid.slot0();
                            boundaryLowerBefore = await formatBoundaryToBoundaryLower(
                                boundaryBefore,
                                Resolution.MEDIUM
                            );

                            // current boundary range
                            const priceMax1X96 = await ctx.boundaryMath.getPriceX96AtBoundary(boundaryLowerBefore);
                            const {
                                amountIn: amountIn1,
                                feeAmount: feeAmount1,
                                priceNextX96: priceNextX961,
                            } = await ctx.swapMath.computeSwapStep(
                                priceX96Before,
                                priceMax1X96,
                                MIN_RATIO,
                                -2500,
                                1000,
                                500
                            );

                            const priceMax2X96 = await ctx.boundaryMath.getPriceX96AtBoundary(
                                boundaryLowerBefore - Resolution.MEDIUM
                            );
                            const {
                                amountIn: amountIn2,
                                feeAmount: feeAmount2,
                                priceNextX96: priceNextX962,
                            } = await ctx.swapMath.computeSwapStep(
                                priceNextX961,
                                priceMax2X96,
                                MIN_RATIO,
                                -1500,
                                1000,
                                500
                            );

                            const priceMax3X96 = await ctx.boundaryMath.getPriceX96AtBoundary(
                                boundaryLowerBefore - Resolution.MEDIUM * 2
                            );
                            const {
                                amountIn: amountIn3,
                                feeAmount: feeAmount3,
                                priceNextX96: _priceX96After,
                            } = await ctx.swapMath.computeSwapStep(
                                priceNextX962,
                                priceMax3X96,
                                MIN_RATIO,
                                -500,
                                1000,
                                500
                            );
                            priceX96After = _priceX96After;

                            amountInTotal = amountIn1.add(amountIn2).add(amountIn3);
                            feeAmountTotal = feeAmount1.add(feeAmount2).add(feeAmount3);

                            const amount0OrAmount1 = (amount: any) => {
                                if (BigNumber.from(-2500).eq(amount)) {
                                    return true;
                                }
                                return amountInTotal.add(feeAmountTotal).eq(amount);
                            };
                            await expect(
                                ctx.gridTestHelper.exactOutput(
                                    {
                                        recipient: ctx.otherAccount.address,
                                        tokenIn: token0,
                                        tokenOut: token1,
                                        resolution: Resolution.MEDIUM,
                                        amountOut: 2500,
                                        amountInMaximum: amountInTotal.add(feeAmountTotal),
                                        priceLimitX96: 0,
                                    },
                                    {
                                        value:
                                            token0.toLowerCase() == ctx.weth.address.toLowerCase()
                                                ? amountInTotal.add(feeAmountTotal)
                                                : 0,
                                    }
                                )
                            )
                                .to.emit(ctx.grid, "Swap")
                                .withArgs(
                                    ctx.gridTestHelper.address,
                                    ctx.otherAccount.address,
                                    amount0OrAmount1,
                                    amount0OrAmount1,
                                    priceX96After,
                                    await ctx.boundaryMath.getBoundaryAtPriceX96(priceX96After)
                                )
                                .to.emit(ctx.grid, "ChangeBundleForSwap")
                                .withArgs(startBundleId + 2, -1000, amountIn1, feeAmount1)
                                .to.emit(ctx.grid, "ChangeBundleForSwap")
                                .withArgs(startBundleId + 1, -1000, amountIn2, feeAmount2)
                                .to.emit(ctx.grid, "ChangeBundleForSwap")
                                .withArgs(startBundleId, -500, amountIn3, feeAmount3);
                        });

                        it("slot0 should be update", async () => {
                            // check slot0
                            const {priceX96, boundary} = await ctx.grid.slot0();
                            expect(priceX96).to.equal(priceX96After);
                            const boundaryAfter = await ctx.boundaryMath.getBoundaryAtPriceX96(priceX96After);
                            expect(boundary).to.equal(boundaryAfter);
                        });

                        it("grid balance", async () => {
                            if (token0.toLowerCase() == ctx.weth.address.toLowerCase()) {
                                expect(await ctx.usdc.balanceOf(ctx.grid.address)).to.equal(2500);
                                expect(await ctx.weth.balanceOf(ctx.grid.address)).to.equal(
                                    amountInTotal.add(feeAmountTotal)
                                );
                            } else {
                                expect(await ctx.weth.balanceOf(ctx.grid.address)).to.equal(2500);
                                expect(await ctx.usdc.balanceOf(ctx.grid.address)).to.equal(
                                    amountInTotal.add(feeAmountTotal)
                                );
                            }
                        });

                        describe("boundary and boundary bitmap should be update", () => {
                            const tests = [
                                {
                                    boundaryLowerDelta: -Resolution.MEDIUM * 2,
                                    expectBundle0Id: startBundleId,
                                    expectBundle1Id: 0,
                                    expectRemaining: 500,
                                },
                                {
                                    boundaryLowerDelta: -Resolution.MEDIUM,
                                    expectBundle0Id: 0,
                                    expectBundle1Id: 0,
                                    expectRemaining: 0,
                                },
                                {
                                    boundaryLowerDelta: 0,
                                    expectBundle0Id: 0,
                                    expectBundle1Id: 0,
                                    expectRemaining: 0,
                                },
                                {
                                    boundaryLowerDelta: Resolution.MEDIUM,
                                    expectBundle0Id: 6,
                                    expectBundle1Id: 0,
                                    expectRemaining: 1000,
                                },
                                {
                                    boundaryLowerDelta: Resolution.MEDIUM * 2,
                                    expectBundle0Id: 7,
                                    expectBundle1Id: 0,
                                    expectRemaining: 1000,
                                },
                            ];
                            tests.forEach((test) => {
                                it(`boundary lower delta is ${test.boundaryLowerDelta}`, async () => {
                                    const {bundle0Id, bundle1Id, makerAmountRemaining} = await ctx.grid.boundaries1(
                                        boundaryLowerBefore + test.boundaryLowerDelta
                                    );
                                    expect(bundle0Id).to.equal(test.expectBundle0Id);
                                    expect(bundle1Id).to.equal(test.expectBundle1Id);
                                    expect(makerAmountRemaining).to.equal(test.expectRemaining);
                                    const [wordPos, bitPos] = position(
                                        boundaryLowerBefore + test.boundaryLowerDelta,
                                        Resolution.MEDIUM
                                    );
                                    const word = await ctx.grid.boundaryBitmaps1(wordPos);
                                    const mask = 1n << BigInt(bitPos);
                                    if (test.expectRemaining == 0) {
                                        expect(mask & word.toBigInt()).to.equal(0n);
                                    } else {
                                        expect(mask & word.toBigInt()).to.equal(mask);
                                    }
                                });
                            });
                        });

                        describe("bundle should be update", () => {
                            const tests = [
                                {
                                    bundleId: startBundleId,
                                    expectMakerAmountTotal: 1000,
                                    expectMakerAmountRemaining: 500,
                                    expectUnfilledAccumulateRateX128: computeUnfilledAccumulateRateX128(
                                        1n << 128n,
                                        500n,
                                        1000n
                                    ),
                                },
                                {
                                    bundleId: 1 + startBundleId,
                                    expectMakerAmountTotal: 1000,
                                    expectMakerAmountRemaining: 0,
                                    expectUnfilledAccumulateRateX128: 0,
                                },
                                {
                                    bundleId: 2 + startBundleId,
                                    expectMakerAmountTotal: 1000,
                                    expectMakerAmountRemaining: 0,
                                    expectUnfilledAccumulateRateX128: 0,
                                },
                                {
                                    bundleId: 3 + startBundleId,
                                    expectMakerAmountTotal: 1000,
                                    expectMakerAmountRemaining: 1000,
                                    expectUnfilledAccumulateRateX128: 1n << 128n,
                                },
                                {
                                    bundleId: 4 + startBundleId,
                                    expectMakerAmountTotal: 1000,
                                    expectMakerAmountRemaining: 1000,
                                    expectUnfilledAccumulateRateX128: 1n << 128n,
                                },
                            ];
                            tests.forEach((test) => {
                                it(`bundle id is ${test.bundleId}`, async () => {
                                    const {makerAmountTotal, makerAmountRemaining} = await ctx.grid.bundles(
                                        test.bundleId
                                    );
                                    expect(makerAmountTotal).to.equal(test.expectMakerAmountTotal);
                                    expect(makerAmountRemaining).to.equal(test.expectMakerAmountRemaining);
                                });
                            });
                        });

                        it("exact output multiple times", async () => {
                            for (let i = 0; i <= 5; i++) {
                                const {priceX96: priceX96Before, boundary: boundaryBefore} = await ctx.grid.slot0();
                                const boundaryLowerBefore = await formatBoundaryToBoundaryLower(
                                    boundaryBefore,
                                    Resolution.MEDIUM
                                );
                                const priceMaxX96 = await ctx.boundaryMath.getPriceX96AtBoundary(boundaryLowerBefore);
                                const {amountIn, feeAmount, priceNextX96, amountOut} =
                                    i < 5
                                        ? await ctx.swapMath.computeSwapStep(
                                              priceX96Before,
                                              priceMaxX96,
                                              MIN_RATIO,
                                              -100,
                                              500 - i * 100,
                                              500
                                          )
                                        : {
                                              amountIn: BigNumber.from(0),
                                              feeAmount: BigNumber.from(0),
                                              priceNextX96: MIN_RATIO,
                                              amountOut: 0,
                                          };
                                expect(amountOut).to.equal(i < 5 ? 100 : 0);

                                const assertion = await expect(
                                    ctx.gridTestHelper.exactOutput(
                                        {
                                            recipient: ctx.otherAccount.address,
                                            tokenIn: token0,
                                            tokenOut: token1,
                                            resolution: Resolution.MEDIUM,
                                            amountOut: 100,
                                            amountInMaximum: amountIn.add(feeAmount),
                                            priceLimitX96: 0,
                                        },
                                        {
                                            value:
                                                token0.toLowerCase() == ctx.weth.address.toLowerCase()
                                                    ? amountIn.add(feeAmount)
                                                    : 0,
                                        }
                                    )
                                );
                                const amount0OrAmount1 = (amount: any) => {
                                    if (BigNumber.from(-100).eq(amount)) {
                                        return true;
                                    }
                                    return amountIn.add(feeAmount).eq(amount);
                                };
                                if (i < 5) {
                                    assertion.to
                                        .emit(ctx.grid, "Swap")
                                        .withArgs(
                                            ctx.gridTestHelper.address,
                                            ctx.otherAccount.address,
                                            amount0OrAmount1,
                                            amount0OrAmount1,
                                            priceNextX96,
                                            await ctx.boundaryMath.getBoundaryAtPriceX96(priceNextX96)
                                        );
                                } else {
                                    assertion.to.revertedWith("SR_IAD");
                                }
                            }
                        });
                    });
                });
            });
        });

        describe("should swap liquidity from bundle1", () => {
            let ctx: {
                signer: SignerWithAddress;
                otherAccount: SignerWithAddress;
                usdc: IERC20;
                weth: IWETHMinimum;
                grid: Grid;
                swapMath: SwapMathTest;
                boundaryMath: BoundaryMathTest;
                gridFactory: GridFactory;
                gridTestHelper: GridTestHelper;
            };
            beforeEach(async () => {
                ctx = await deployAndCreateGridFixture();

                const {token0, token1} = await sortedToken(ctx.weth.address, ctx.usdc.address);
                await ctx.gridTestHelper.initialize(
                    {
                        tokenA: ctx.weth.address,
                        tokenB: ctx.usdc.address,
                        resolution: Resolution.MEDIUM,
                        recipient: ctx.signer.address,
                        priceX96: RESOLUTION_X96,
                        orders0: [
                            {
                                boundaryLower: -Resolution.MEDIUM,
                                amount: 1n,
                            },
                        ],
                        orders1: [
                            {
                                boundaryLower: -Resolution.MEDIUM,
                                amount: 10n ** 18n,
                            },
                        ],
                    },
                    {
                        value: token1.toLowerCase() == ctx.weth.address.toLowerCase() ? 10n ** 18n : 1n,
                    }
                );

                await ctx.grid.settleMakerOrderAndCollect(ctx.signer.address, 1, true);

                await expect(
                    ctx.gridTestHelper.exactOutput(
                        {
                            recipient: ethers.constants.AddressZero,
                            tokenIn: token0,
                            tokenOut: token1,
                            resolution: Resolution.MEDIUM,
                            amountOut: 10n ** 18n / 2n,
                            amountInMaximum: 10n ** 18n,
                            priceLimitX96: 0,
                        },
                        {
                            value: token0.toLowerCase() == ctx.weth.address.toLowerCase() ? 10n ** 18n : 0n,
                        }
                    )
                ).to.emit(ctx.grid, "Swap");

                const placeMakerOrder = async function () {
                    await expect(
                        ctx.gridTestHelper.placeMakerOrder(
                            {
                                recipient: ethers.constants.AddressZero,
                                tokenA: ctx.weth.address,
                                tokenB: ctx.usdc.address,
                                resolution: Resolution.MEDIUM,
                                zero: false,
                                boundaryLower: -Resolution.MEDIUM,
                                amount: 10n ** 18n,
                            },
                            {
                                value: token1.toLowerCase() == ctx.weth.address.toLowerCase() ? 10n ** 18n : 0n,
                            }
                        )
                    ).to.emit(ctx.grid, "PlaceMakerOrder");
                };

                await placeMakerOrder();
            });

            const tests = [
                {
                    name: "all liquidity from bundle0",
                    amountOut: 10n ** 18n / 2n,
                    expectBundle1AmountOut: 0n,
                },
                {
                    name: "partially filled for bundle1",
                    amountOut: 10n ** 18n,
                    expectBundle1AmountOut: 10n ** 18n / 2n,
                },
                {
                    name: "fully filled for bundle1",
                    amountOut: 10n ** 18n + 10n ** 18n / 2n, // 10^18 * 1.5
                    expectBundle1AmountOut: 10n ** 18n,
                },
            ];

            tests.forEach((test) => {
                it(`${test.name}`, async () => {
                    const {token0, token1} = await sortedToken(ctx.weth.address, ctx.usdc.address);
                    const txPromise = ctx.gridTestHelper.exactOutput(
                        {
                            recipient: ethers.constants.AddressZero,
                            tokenIn: token0,
                            tokenOut: token1,
                            resolution: Resolution.MEDIUM,
                            amountOut: test.amountOut,
                            amountInMaximum: 10n ** 18n * 2n,
                            priceLimitX96: 0,
                        },
                        {
                            value: token0.toLowerCase() == ctx.weth.address.toLowerCase() ? 10n ** 18n * 2n : 0n,
                        }
                    );
                    await expect(txPromise).to.emit(ctx.grid, "ChangeBundleForSwap");
                    const {makerAmountTotal, makerAmountRemaining, takerAmountRemaining, takerFeeAmountRemaining} =
                        await ctx.grid.bundles(3);
                    expect(makerAmountTotal).to.equal(10n ** 18n);
                    if (test.expectBundle1AmountOut != 0n) {
                        await expect(txPromise).to.emit(ctx.grid, "ChangeBundleForSwap");

                        const bundle1AmountOut = test.amountOut - 10n ** 18n / 2n;
                        expect(makerAmountRemaining).to.equal(makerAmountTotal.toBigInt() - bundle1AmountOut);
                        expect(takerAmountRemaining).to.greaterThan(0n);
                        expect(takerFeeAmountRemaining).to.greaterThan(0n);

                        // check boundary
                        {
                            const {bundle0Id, bundle1Id, makerAmountRemaining} = await ctx.grid.boundaries1(
                                -Resolution.MEDIUM
                            );
                            expect(bundle0Id).to.equal(makerAmountRemaining.isZero() ? 0 : 3); // should active bundle1
                            expect(bundle1Id).to.equal(0);
                            expect(makerAmountRemaining).to.equal(makerAmountTotal.toBigInt() - bundle1AmountOut);
                        }

                        expect(
                            await expectBoundaryInitialized(
                                ctx.grid,
                                false,
                                -Resolution.MEDIUM,
                                Resolution.MEDIUM,
                                !makerAmountRemaining.isZero()
                            )
                        ).to.true;
                    } else {
                        expect(makerAmountRemaining).to.equal(makerAmountTotal);
                        expect(takerAmountRemaining).to.equal(0);
                        expect(takerFeeAmountRemaining).to.equal(0);
                        expect(
                            await expectBoundaryInitialized(
                                ctx.grid,
                                false,
                                -Resolution.MEDIUM,
                                Resolution.MEDIUM,
                                true
                            )
                        ).to.true;
                    }
                });
            });
        });

        describe("search next initialized boundary", () => {
            const initializedFn = async function (priceX96: bigint, _: boolean) {
                let ctx = await deployAndCreateGridFixture();
                const orders = [
                    {
                        boundaryLower: -Resolution.MEDIUM,
                        amount: 10n ** 18n * 2n,
                    },
                    {
                        boundaryLower: 0,
                        amount: 10n ** 18n,
                    },
                    {
                        boundaryLower: Resolution.MEDIUM,
                        amount: 10n ** 18n * 2n,
                    },
                ];
                await ctx.gridTestHelper.initialize(
                    {
                        tokenA: ctx.weth.address,
                        tokenB: ctx.usdc.address,
                        resolution: Resolution.MEDIUM,
                        recipient: ctx.signer.address,
                        priceX96: priceX96,
                        orders0: orders,
                        orders1: orders,
                    },
                    {value: 10n ** 18n * 5n}
                );

                return ctx;
            };
            const swapPriceToBoundaryUpperFn = async function (priceX96: bigint, priceCrossFromLeftToRight: boolean) {
                let ctx = await initializedFn(priceX96, priceCrossFromLeftToRight);
                const {token0, token1} = await sortedToken(ctx.weth.address, ctx.usdc.address);
                await expect(
                    ctx.gridTestHelper.exactOutput(
                        {
                            recipient: ethers.constants.AddressZero,
                            tokenIn: token1,
                            tokenOut: token0,
                            resolution: Resolution.MEDIUM,
                            amountOut: 10n ** 18n,
                            amountInMaximum: 10n ** 18n * 2n,
                            priceLimitX96: 0n,
                        },
                        {
                            value: token1.toLowerCase() == ctx.weth.address.toLowerCase() ? 10n ** 18n * 2n : 0n,
                        }
                    )
                ).to.emit(ctx.grid, "Swap");
                return ctx;
            };
            const tests = [
                {
                    name: "current price is equal to the boundary lower price",
                    prepareFn: initializedFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: 1n << 96n,
                    priceCrossFromLeftToRight: true,
                    expectAmountOut: 10n ** 18n,
                    expectPriceX96: 79267784519130042428790663799n,
                },
                {
                    name: "current price is greater than the boundary lower price",
                    prepareFn: initializedFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: (1n << 96n) + 1n,
                    priceCrossFromLeftToRight: true,
                    expectAmountOut: 10n ** 18n,
                    expectPriceX96: 79267784519130042428790663799n,
                },
                {
                    name: "current price is less than the boundary upper price",
                    prepareFn: initializedFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: 79267784519130042428790663799n - 1n,
                    priceCrossFromLeftToRight: true,
                    expectAmountOut: 10n ** 18n,
                    expectPriceX96: 79267784519130042428790663799n,
                },
                {
                    name: "current price is equal to the boundary upper price",
                    prepareFn: swapPriceToBoundaryUpperFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: 1n << 96n,
                    priceCrossFromLeftToRight: true,
                    expectAmountOut: 10n ** 18n * 2n,
                    expectPriceX96: 79307426338960776842885539845n,
                },

                {
                    name: "current price is equal to the boundary lower price",
                    prepareFn: initializedFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: 1n << 96n,
                    priceCrossFromLeftToRight: false,
                    expectAmountOut: 10n ** 18n * 2n,
                    expectPriceX96: 79188560314459151373725315960n,
                },
                {
                    name: "current price is greater than the boundary lower price",
                    prepareFn: initializedFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: (1n << 96n) + 1n,
                    priceCrossFromLeftToRight: false,
                    expectAmountOut: 10n ** 18n,
                    expectPriceX96: 1n << 96n,
                },
                {
                    name: "current price is less than the boundary upper price",
                    prepareFn: initializedFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: 79267784519130042428790663799n - 1n,
                    priceCrossFromLeftToRight: false,
                    expectAmountOut: 10n ** 18n,
                    expectPriceX96: 1n << 96n,
                },
                {
                    name: "current price is equal to the boundary upper price",
                    prepareFn: swapPriceToBoundaryUpperFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: 1n << 96n,
                    priceCrossFromLeftToRight: false,
                    expectAmountOut: 10n ** 18n,
                    expectPriceX96: 79228162514264337593543950336n,
                },
            ];

            tests.forEach((test) => {
                it(`${test.name} - ${test.priceCrossFromLeftToRight ? "left to right" : "right to left"}`, async () => {
                    let ctx = await test.prepareFn(test.priceX96, test.priceCrossFromLeftToRight);

                    const {token0, token1} = await sortedToken(ctx.weth.address, ctx.usdc.address);
                    const tokenIn = test.priceCrossFromLeftToRight ? token1 : token0;
                    const tokenOut = test.priceCrossFromLeftToRight ? token0 : token1;

                    const balanceOf = async function (token: string, address: string) {
                        if (token.toLowerCase() == ctx.usdc.address.toLowerCase()) {
                            return ctx.usdc.balanceOf(address);
                        }
                        return ctx.weth.balanceOf(address);
                    };

                    const balanceBefore = await balanceOf(tokenOut, ctx.signer.address);

                    await expect(
                        ctx.gridTestHelper.exactOutput(
                            {
                                recipient: ctx.signer.address,
                                tokenIn: tokenIn,
                                tokenOut: tokenOut,
                                resolution: test.resolution,
                                amountOut: test.expectAmountOut,
                                amountInMaximum: 10n ** 18n * 5n,
                                priceLimitX96: 0n,
                            },
                            {
                                value: tokenIn.toLowerCase() == ctx.weth.address.toLowerCase() ? 10n ** 18n * 5n : 0n,
                            }
                        )
                    ).to.emit(ctx.grid, "Swap");

                    const balanceAfter = await balanceOf(tokenOut, ctx.signer.address);
                    expect(balanceAfter.sub(balanceBefore)).to.equal(test.expectAmountOut);

                    {
                        const {priceX96} = await ctx.grid.slot0();
                        expect(priceX96).to.equal(test.expectPriceX96);
                    }
                });
            });
        });

        describe("swap with price limit", () => {
            const initializedFn = async function (priceX96: bigint, _: boolean) {
                let ctx = await deployAndCreateGridFixture();
                const orders = [
                    {
                        boundaryLower: -Resolution.MEDIUM * 10,
                        amount: 10n ** 18n * 3n,
                    },
                    {
                        boundaryLower: -Resolution.MEDIUM,
                        amount: 10n ** 18n * 2n,
                    },
                    {
                        boundaryLower: 0,
                        amount: 10n ** 18n,
                    },
                    {
                        boundaryLower: Resolution.MEDIUM,
                        amount: 10n ** 18n * 2n,
                    },
                    {
                        boundaryLower: Resolution.MEDIUM * 10,
                        amount: 10n ** 18n * 3n,
                    },
                ];
                await ctx.gridTestHelper.initialize(
                    {
                        tokenA: ctx.weth.address,
                        tokenB: ctx.usdc.address,
                        resolution: Resolution.MEDIUM,
                        recipient: ctx.signer.address,
                        priceX96: priceX96,
                        orders0: orders,
                        orders1: orders,
                    },
                    {value: 10n ** 18n * 11n}
                );

                return ctx;
            };
            const tests = [
                {
                    name: "price limit is equal to the boundary upper price",
                    prepareFn: initializedFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: 1n << 96n,
                    priceX96Limit: 79267784519130042428790663799n,
                    priceCrossFromLeftToRight: true,
                    amountOut: 10n ** 18n * 2n,
                    expectPriceX96: 79267784519130042428790663799n,
                    expectPriceX96Fn: function (priceX96: bigint, _: bigint) {
                        expect(priceX96).to.equal(79267784519130042428790663799n);
                    },
                    expectAmountOutFn: function (amountOut: bigint, recipientBalanceDiff: bigint) {
                        expect(recipientBalanceDiff).to.equal(amountOut / 2n);
                    },
                },
                {
                    name: "price limit is between boundary lower and boundary upper",
                    prepareFn: initializedFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: 1n << 96n,
                    priceX96Limit: 79251933339942720485266405666n,
                    priceCrossFromLeftToRight: true,
                    amountOut: 10n ** 18n * 2n,
                    expectPriceX96: 79251933339942720485266405666n,
                    expectPriceX96Fn: function (priceX96: bigint, priceLimitX96: bigint) {
                        expect(priceX96).to.greaterThanOrEqual(priceLimitX96);
                        expect(priceX96).to.lessThanOrEqual(79251933339942720485305964272n);
                    },
                    expectAmountOutFn: function (amountOut: bigint, recipientBalanceDiff: bigint) {
                        expect(recipientBalanceDiff).to.greaterThanOrEqual(10n ** 18n / 2n);
                        expect(recipientBalanceDiff).to.lessThan(10n ** 18n);
                    },
                },
                {
                    name: "price limit is not within the range of liquidity",
                    prepareFn: initializedFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: 1n << 96n,
                    priceX96Limit: 79386769463160146968577785966n,
                    priceCrossFromLeftToRight: true,
                    amountOut: 10n ** 18n * 6n,
                    expectPriceX96: 79307426338960776842885539845n,
                    expectPriceX96Fn: function (priceX96: bigint, _: bigint) {
                        expect(priceX96).to.equal(79307426338960776842885539845n);
                    },
                    expectAmountOutFn: function (amountOut: bigint, recipientBalanceDiff: bigint) {
                        expect(recipientBalanceDiff).to.equal(10n ** 18n * 3n);
                    },
                },

                {
                    name: "price limit is equal to the boundary lower price",
                    prepareFn: initializedFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: 79267784519130042428790663799n,
                    priceX96Limit: 1n << 96n,
                    priceCrossFromLeftToRight: false,
                    amountOut: 10n ** 18n * 2n,
                    expectPriceX96: 1n << 96n,
                    expectPriceX96Fn: function (priceX96: bigint, _: bigint) {
                        expect(priceX96).to.equal(1n << 96n);
                    },
                    expectAmountOutFn: function (amountOut: bigint, recipientBalanceDiff: bigint) {
                        expect(recipientBalanceDiff).to.equal(amountOut / 2n);
                    },
                },
                {
                    name: "price limit is between boundary lower and boundary upper",
                    prepareFn: initializedFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: 79267784519130042428790663799n,
                    priceX96Limit: 79244008939048815603706035062n,
                    priceCrossFromLeftToRight: false,
                    amountOut: 10n ** 18n * 2n,
                    expectPriceX96: 79244008939048815603706035062n,
                    expectPriceX96Fn: function (priceX96: bigint, priceLimitX96: bigint) {
                        expect(priceX96).to.lessThanOrEqual(priceLimitX96);
                        expect(priceX96).to.greaterThanOrEqual(79244008939048815603705924123n);
                    },
                    expectAmountOutFn: function (amountOut: bigint, recipientBalanceDiff: bigint) {
                        expect(recipientBalanceDiff).to.greaterThanOrEqual(10n ** 18n / 2n);
                        expect(recipientBalanceDiff).to.lessThan(10n ** 18n);
                    },
                },
                {
                    name: "price limit is not within the range of liquidity",
                    prepareFn: initializedFn,
                    resolution: Resolution.MEDIUM,
                    priceX96: 1n << 96n,
                    priceX96Limit: 79069872446435841478293012703n,
                    priceCrossFromLeftToRight: false,
                    amountOut: 10n ** 18n * 6n,
                    expectPriceX96: 79188560314459151373725315960n,
                    expectPriceX96Fn: function (priceX96: bigint, _: bigint) {
                        expect(priceX96).to.equal(79188560314459151373725315960n);
                    },
                    expectAmountOutFn: function (amountOut: bigint, recipientBalanceDiff: bigint) {
                        expect(recipientBalanceDiff).to.equal(10n ** 18n * 2n);
                    },
                },
            ];

            tests.forEach((test) => {
                it(`${test.name} - ${test.priceCrossFromLeftToRight ? "left to right" : "right to left"}`, async () => {
                    let ctx = await test.prepareFn(test.priceX96, test.priceCrossFromLeftToRight);

                    const {token0, token1} = await sortedToken(ctx.weth.address, ctx.usdc.address);

                    const tokenIn = test.priceCrossFromLeftToRight ? token1 : token0;
                    const tokenOut = test.priceCrossFromLeftToRight ? token0 : token1;

                    const balanceOf = async function (token: string, address: string) {
                        if (token.toLowerCase() == ctx.usdc.address.toLowerCase()) {
                            return ctx.usdc.balanceOf(address);
                        }
                        return ctx.weth.balanceOf(address);
                    };
                    const balanceBefore = await balanceOf(tokenOut, ctx.signer.address);

                    await expect(
                        ctx.gridTestHelper.exactOutput(
                            {
                                recipient: ctx.signer.address,
                                tokenIn: tokenIn,
                                tokenOut: tokenOut,
                                resolution: test.resolution,
                                amountOut: test.amountOut,
                                amountInMaximum: 10n ** 18n * 5n,
                                priceLimitX96: test.priceX96Limit,
                            },
                            {
                                value: tokenIn.toLowerCase() == ctx.weth.address.toLowerCase() ? 10n ** 18n * 5n : 0n,
                            }
                        )
                    ).to.emit(ctx.grid, "Swap");

                    const {priceX96} = await ctx.grid.slot0();
                    if (test.priceCrossFromLeftToRight) {
                        expect(priceX96).to.greaterThanOrEqual(test.expectPriceX96);
                    } else {
                        expect(priceX96).to.lessThanOrEqual(test.expectPriceX96);
                    }
                    test.expectPriceX96Fn(priceX96.toBigInt(), test.priceX96Limit);

                    const balanceAfter = await balanceOf(tokenOut, ctx.signer.address);
                    test.expectAmountOutFn(test.amountOut, balanceAfter.sub(balanceBefore).toBigInt());
                });
            });
        });
    });

    describe("#flash", () => {
        let ctx: {
            signer: SignerWithAddress;
            otherAccount: SignerWithAddress;
            gridTestHelper: GridTestHelper;
            usdc: IERC20;
            weth: IWETHMinimum;
            grid: Grid;
            swapMath: SwapMathTest;
            boundaryMath: BoundaryMathTest;
            gridFactory: GridFactory;
        };
        let flash: FlashTest;

        beforeEach("deploy flash contract", async () => {
            ctx = await loadFixture(createGridAndInitializeGridFixture);

            flash = await deployFlashTest(ctx.gridFactory.address, ctx.weth.address);

            await Promise.all([
                ctx.usdc.transfer(ctx.grid.address, 10n ** 18n * 2n),
                ctx.weth.deposit({value: 10n ** 18n * 2000n}),
                ctx.usdc.transfer(flash.address, 10n ** 18n * 1000n),
            ]);
            await ctx.weth.transfer(ctx.grid.address, 10n ** 18n * 2n);
            await ctx.weth.transfer(flash.address, 10n ** 18n * 1000n);
        });

        it("should revert with right error if not initialized", async () => {
            const {grid} = await deployAndCreateGridFixture();
            await expect(grid.flash(ethers.constants.AddressZero, 0, 0, [])).to.be.revertedWith("G_GL");
        });

        const tests = [
            {
                name: "insufficient balance of token0",
                recipient: "0x1000000000000000000000000000000000000000",
                amount0: 10n ** 18n * 10n,
                amount1: 0n,
                payAmount0: true,
                payAmount1: true,
                payMore: true,
                expectRevertWithInsufficientBalance: true,
                expectRevertWith: undefined,
                expectRevertWithCode: undefined as any,
            },
            {
                name: "insufficient balance of token1",
                recipient: "0x1000000000000000000000000000000000000000",
                amount0: 0n,
                amount1: 10n ** 18n * 10n,
                payAmount0: true,
                payAmount1: true,
                payMore: true,
                expectRevertWithInsufficientBalance: true,
                expectRevertWith: undefined,
                expectRevertWithCode: undefined,
            },

            {
                name: "just pay enough token0",
                amount0: 10n ** 18n,
                amount1: 0n,
                payAmount0: true,
                payAmount1: true,
                payMore: false,
                expectRevertWithInsufficientBalance: false,
                expectRevertWith: undefined,
                expectRevertWithCode: undefined,
            },
            {
                name: "just pay enough token1",
                amount0: 0n,
                amount1: 10n ** 18n,
                payAmount0: true,
                payAmount1: true,
                payMore: false,
                expectRevertWithInsufficientBalance: false,
                expectRevertWith: undefined,
                expectRevertWithCode: undefined,
            },
            {
                name: "just pay enough token0 and token1",
                amount0: 10n ** 18n,
                amount1: 10n ** 18n,
                payAmount0: true,
                payAmount1: true,
                payMore: false,
                expectRevertWithInsufficientBalance: false,
                expectRevertWith: undefined,
                expectRevertWithCode: undefined,
            },
            {
                name: "pay more token0 and token1",
                amount0: 10n ** 18n,
                amount1: 10n ** 18n,
                payAmount0: true,
                payAmount1: true,
                payMore: true,
                expectRevertWithInsufficientBalance: false,
                expectRevertWith: undefined,
                expectRevertWithCode: undefined,
            },
            {
                name: "not pay enough token0",
                amount0: 11n ** 18n,
                amount1: 0n,
                payAmount0: true,
                payAmount1: true,
                payMore: false,
                expectRevertWithInsufficientBalance: true,
                expectRevertWith: undefined,
                expectRevertWithCode: undefined,
            },
            {
                name: "not pay enough token0 with underflow",
                amount0: 10n ** 18n * 2n,
                amount1: 0n,
                payAmount0: false,
                payAmount1: true,
                payMore: false,
                expectRevertWithInsufficientBalance: false,
                expectRevertWith: undefined,
                expectRevertWithCode: 0x11,
            },
            {
                name: "not pay enough token1",
                amount0: 0n,
                amount1: 11n ** 18n,
                payAmount0: true,
                payAmount1: true,
                payMore: false,
                expectRevertWithInsufficientBalance: true,
                expectRevertWith: undefined,
                expectRevertWithCode: undefined,
            },
            {
                name: "not pay enough token1 with underflow",
                amount0: 0n,
                amount1: 10n ** 18n * 2n,
                payAmount0: true,
                payAmount1: false,
                payMore: false,
                expectRevertWithInsufficientBalance: false,
                expectRevertWith: undefined,
                expectRevertWithCode: 0x11,
            },
        ];

        tests.forEach((test) => {
            it(`${test.name}`, async () => {
                const recipient = "0x1000000000000000000000000000000000000000";
                const balanceOf = async function (token: string, address: string) {
                    if (token.toLowerCase() == ctx.usdc.address.toLowerCase()) {
                        return ctx.usdc.balanceOf(address);
                    }
                    return ctx.weth.balanceOf(address);
                };

                const {token0, token1} = await sortedToken(ctx.weth.address, ctx.usdc.address);

                const [gridToken0Before, gridToken1Before] = [
                    await balanceOf(token0, ctx.grid.address),
                    await balanceOf(token1, ctx.grid.address),
                ];

                const txPromise = flash.flash({
                    tokenA: ctx.usdc.address,
                    tokenB: ctx.weth.address,
                    resolution: Resolution.MEDIUM,
                    recipient: recipient,
                    payer: flash.address,
                    amount0: test.amount0,
                    amount1: test.amount1,
                    payAmount0: test.payAmount0,
                    payAmount1: test.payAmount1,
                    payMore: test.payMore,
                });
                if (test.expectRevertWithInsufficientBalance) {
                    if (
                        (test.amount0 > 0n && token0.toLowerCase() == ctx.weth.address.toLowerCase()) ||
                        (test.amount1 > 0n && token1.toLowerCase() == ctx.weth.address.toLowerCase())
                    ) {
                        await expect(txPromise).to.revertedWith("SafeERC20: low-level call failed");
                    } else {
                        await expect(txPromise).to.revertedWith("ERC20: transfer amount exceeds balance");
                    }
                } else if (test.expectRevertWith != undefined) {
                    await expect(txPromise).to.revertedWith(test.expectRevertWith);
                } else if (test.expectRevertWithCode != undefined) {
                    await expect(txPromise).to.revertedWithPanic(test.expectRevertWithCode);
                } else {
                    const payMoreAdjustment = test.payMore ? 1n : 0n;
                    const payMore0 = BigNumber.from("1000000000000000000").mul(payMoreAdjustment);
                    const payMore1 = BigNumber.from("1000000000000000000").mul(payMoreAdjustment);

                    await expect(txPromise)
                        .to.emit(ctx.grid, "Flash")
                        .withArgs(flash.address, recipient, test.amount0, test.amount1, payMore0, payMore1);

                    const [gridToken0After, gridToken1After] = [
                        await balanceOf(token0, ctx.grid.address),
                        await balanceOf(token1, ctx.grid.address),
                    ];

                    expect(gridToken0After.sub(gridToken0Before)).to.equal(payMore0);
                    expect(gridToken1After.sub(gridToken1Before)).to.equal(payMore1);

                    expect(await balanceOf(token0, recipient)).to.equal(test.amount0);
                    expect(await balanceOf(token1, recipient)).to.equal(test.amount1);
                }
            });
        });
    });

    describe("#placeMakerOrder", () => {
        it("should revert with right error if not initialized", async () => {
            const {gridFactory, weth, gridTestHelper} = await loadFixture(createGridAndInitializeGridFixture);
            const usdc = await deployERC20("USDC", "USDC", 6, BigNumber.from(1).shl(18));

            const {token0, token1} = await sortedToken(usdc.address, weth.address);
            await expect(gridFactory.createGrid(usdc.address, weth.address, Resolution.MEDIUM))
                .to.emit(gridFactory, "GridCreated")
                .withArgs(token0, token1, Resolution.MEDIUM, async (it: string) => {
                    const offChain = await computeAddress(
                        gridFactory.address,
                        usdc.address,
                        weth.address,
                        Resolution.MEDIUM
                    );
                    return offChain == it;
                });

            await expect(
                gridTestHelper.placeMakerOrder({
                    recipient: ethers.constants.AddressZero,
                    tokenA: usdc.address,
                    tokenB: weth.address,
                    resolution: Resolution.MEDIUM,
                    zero: true,
                    boundaryLower: 0n,
                    amount: 0n,
                })
            ).to.revertedWith("G_GL");
        });

        it("should revert with right error if amount is zero", async () => {
            const {weth, usdc, gridTestHelper} = await loadFixture(createGridAndInitializeGridFixture);

            await expect(
                gridTestHelper.placeMakerOrder({
                    recipient: ethers.constants.AddressZero,
                    tokenA: usdc.address,
                    tokenB: weth.address,
                    resolution: Resolution.MEDIUM,
                    zero: true,
                    boundaryLower: 0,
                    amount: 0,
                })
            ).to.revertedWith("G_OAZ");
        });

        it("should revert with right error if boundary is invalid", async () => {
            const {weth, usdc, gridTestHelper} = await loadFixture(createGridAndInitializeGridFixture);

            await expect(
                gridTestHelper.placeMakerOrder({
                    recipient: ethers.constants.AddressZero,
                    tokenA: usdc.address,
                    tokenB: weth.address,
                    resolution: Resolution.MEDIUM,
                    zero: true,
                    boundaryLower: 1,
                    amount: 1,
                })
            ).to.revertedWith("G_IBL");

            await expect(
                gridTestHelper.placeMakerOrder({
                    recipient: ethers.constants.AddressZero,
                    tokenA: usdc.address,
                    tokenB: weth.address,
                    resolution: Resolution.MEDIUM,
                    zero: true,
                    boundaryLower: MIN_BOUNDARY - 1,
                    amount: 1,
                })
            ).to.revertedWith("G_IBL");

            await expect(
                gridTestHelper.placeMakerOrder({
                    recipient: ethers.constants.AddressZero,
                    tokenA: usdc.address,
                    tokenB: weth.address,
                    resolution: Resolution.MEDIUM,
                    zero: true,
                    boundaryLower: MAX_BOUNDARY + 1,
                    amount: 1,
                })
            ).to.revertedWith("G_IBL");

            await expect(
                gridTestHelper.placeMakerOrder({
                    recipient: ethers.constants.AddressZero,
                    tokenA: usdc.address,
                    tokenB: weth.address,
                    resolution: Resolution.MEDIUM,
                    zero: true,
                    boundaryLower: MAX_BOUNDARY - (MAX_BOUNDARY % Resolution.MEDIUM),
                    amount: 1,
                })
            ).to.revertedWith("G_IBL");
        });

        it("should revert with right error if non standard erc20", async () => {
            const {gridFactory, gridTestHelper} = await loadFixture(createGridAndInitializeGridFixture);
            const {token0, token1} = await deployNonStandardERC20();

            await token0.approve(gridTestHelper.address, BigNumber.from(1).shl(18));
            await token1.approve(gridTestHelper.address, BigNumber.from(1).shl(18));

            await gridFactory.createGrid(token0.address, token1.address, Resolution.MEDIUM);
            await expect(
                gridTestHelper.initialize({
                    tokenA: token0.address,
                    tokenB: token1.address,
                    resolution: Resolution.MEDIUM,
                    recipient: ethers.constants.AddressZero,
                    priceX96: RESOLUTION_X96,
                    orders0: [
                        {
                            boundaryLower: 0,
                            amount: 1n,
                        },
                    ],
                    orders1: [
                        {
                            boundaryLower: 0,
                            amount: 1n,
                        },
                    ],
                })
            ).to.revertedWith("G_TPF");
        });

        it("should revert with right error if insufficient balance", async () => {
            const {weth, usdc, gridTestHelper} = await loadFixture(createGridAndInitializeGridFixture);
            const {token0} = await sortedToken(usdc.address, weth.address);
            const signers = await ethers.getSigners();
            await expect(
                gridTestHelper.connect(signers[2]).placeMakerOrder({
                    recipient: ethers.constants.AddressZero,
                    tokenA: usdc.address,
                    tokenB: weth.address,
                    resolution: Resolution.MEDIUM,
                    zero: token0.toLowerCase() == usdc.address.toLowerCase(),
                    boundaryLower: 0,
                    amount: 1000,
                })
            ).to.revertedWith("ERC20: insufficient allowance");

            await expect(
                gridTestHelper.connect(signers[2]).placeMakerOrder({
                    recipient: ethers.constants.AddressZero,
                    tokenA: usdc.address,
                    tokenB: weth.address,
                    resolution: Resolution.MEDIUM,
                    zero: token0.toLowerCase() == weth.address.toLowerCase(),
                    boundaryLower: 0,
                    amount: 1000,
                })
            ).to.revertedWith("SafeERC20: low-level call failed");
        });

        describe("order placed", () => {
            it("next order id should be incremented", async () => {
                const {signer, weth, usdc, gridTestHelper, grid} = await loadFixture(
                    createGridAndInitializeGridFixture
                );

                const {token0} = await sortedToken(usdc.address, weth.address);

                for (let i = 0; i < 10; i++) {
                    await expect(
                        gridTestHelper.placeMakerOrder({
                            recipient: ethers.constants.AddressZero,
                            tokenA: usdc.address,
                            tokenB: weth.address,
                            resolution: Resolution.MEDIUM,
                            zero: token0.toLowerCase() == usdc.address.toLowerCase(),
                            boundaryLower: 0,
                            amount: 1000,
                        })
                    )
                        .to.emit(grid, "PlaceMakerOrder")
                        .withArgs(
                            i + startOrderId,
                            signer.address,
                            startBundleId,
                            token0.toLowerCase() == usdc.address.toLowerCase(),
                            0,
                            1000
                        );

                    const {owner, amount, bundleId} = await grid.orders(i + startOrderId);
                    expect(owner).to.equal(signer.address);
                    expect(bundleId).to.equal(startBundleId);
                    expect(amount).to.equal(1000);
                }
            });

            describe("order owner", () => {
                const tests = [
                    {
                        recipient: ethers.constants.AddressZero,
                        expectRecipient: undefined,
                    },
                    {
                        recipient: "0x1000000000000000000000000000000000000000",
                        expectRecipient: "0x1000000000000000000000000000000000000000",
                    },
                ];
                tests.forEach((test) => {
                    it(`recipient is ${test.recipient}`, async () => {
                        const {signer, weth, usdc, gridTestHelper, grid} = await loadFixture(
                            createGridAndInitializeGridFixture
                        );

                        const {token1} = await sortedToken(usdc.address, weth.address);
                        await expect(
                            gridTestHelper.placeMakerOrder(
                                {
                                    recipient: test.recipient,
                                    tokenA: weth.address,
                                    tokenB: usdc.address,
                                    resolution: Resolution.MEDIUM,
                                    zero: false,
                                    boundaryLower: 0,
                                    amount: 10n ** 18n,
                                },
                                {
                                    value: token1.toLowerCase() == weth.address.toLowerCase() ? 10n ** 18n : 0n,
                                }
                            )
                        )
                            .to.emit(grid, "PlaceMakerOrder")
                            .withArgs(
                                startOrderId,
                                test.expectRecipient ?? signer.address,
                                startBundleId,
                                false,
                                0,
                                10n ** 18n
                            );

                        const {owner} = await grid.orders(startOrderId);
                        expect(owner).to.equal(test.expectRecipient ?? signer.address);
                    });
                });
            });

            describe("bundle", () => {
                it("next bundle id should be incremented if place an order on a different boundary", async () => {
                    const {signer, weth, usdc, gridTestHelper, grid} = await loadFixture(
                        createGridAndInitializeGridFixture
                    );

                    const {token0} = await sortedToken(usdc.address, weth.address);
                    for (let i = 0; i < 10; i++) {
                        await expect(
                            gridTestHelper.placeMakerOrder({
                                recipient: ethers.constants.AddressZero,
                                tokenA: usdc.address,
                                tokenB: weth.address,
                                resolution: Resolution.MEDIUM,
                                zero: token0.toLowerCase() == usdc.address.toLowerCase(),
                                boundaryLower: i * Resolution.MEDIUM,
                                amount: 1000,
                            })
                        )
                            .to.emit(grid, "PlaceMakerOrder")
                            .withArgs(
                                i + startOrderId,
                                signer.address,
                                i + startBundleId,
                                token0.toLowerCase() == usdc.address.toLowerCase(),
                                i * Resolution.MEDIUM,
                                1000
                            );

                        // assert bundle
                        const {
                            boundaryLower,
                            zero,
                            makerAmountTotal,
                            makerAmountRemaining,
                            takerAmountRemaining,
                            takerFeeAmountRemaining,
                        } = await grid.bundles(i + startBundleId);
                        expect(boundaryLower).to.equal(i * Resolution.MEDIUM);
                        expect(zero).to.equal(token0.toLowerCase() == usdc.address.toLowerCase());
                        expect(makerAmountTotal).to.equal(1000);
                        expect(makerAmountRemaining).to.equal(1000);
                        expect(takerAmountRemaining).to.equal(0);
                        expect(takerFeeAmountRemaining).to.equal(0);

                        // assert boundary
                        const boundaryFunc =
                            token0.toLowerCase() == usdc.address.toLowerCase() ? grid.boundaries0 : grid.boundaries1;
                        const [bundle0Id, bundle1Id, makerAmountRemainingForBoundary] = await boundaryFunc(
                            i * Resolution.MEDIUM
                        );
                        expect(bundle0Id).to.equal(i + startBundleId);
                        expect(bundle1Id).to.equal(0);
                        expect(makerAmountRemainingForBoundary).to.equal(1000);

                        // assert boundary bitmap
                        const boundaryBitmapFunc =
                            token0.toLowerCase() == usdc.address.toLowerCase()
                                ? grid.boundaryBitmaps0
                                : grid.boundaryBitmaps1;
                        const word = await boundaryBitmapFunc((i * Resolution.MEDIUM) >> 8);
                        expect(word.and(i)).to.equal(i);
                    }
                });

                it("if the order is placed in the same bundle, the makerAmountRemaining will be accumulated", async () => {
                    const {signer, weth, usdc, gridTestHelper, grid} = await loadFixture(
                        createGridAndInitializeGridFixture
                    );
                    const {token0} = await sortedToken(usdc.address, weth.address);

                    const parameters: GridTestHelper.PlaceOrderInBatchParametersStruct = {
                        recipient: ethers.constants.AddressZero,
                        tokenA: usdc.address,
                        tokenB: weth.address,
                        resolution: Resolution.MEDIUM,
                        zero: token0.toLowerCase() == usdc.address.toLowerCase(),
                        orders: [],
                    };
                    for (let i = 0; i < 10; i++) {
                        parameters.orders.push({
                            boundaryLower: 0,
                            amount: 1000,
                        });
                    }
                    await expect(gridTestHelper.placeMakerOrderInBatch(parameters)).to.emit(grid, "PlaceMakerOrder");

                    {
                        const {owner} = await grid.orders(startOrderId);
                        expect(owner).to.equal(signer.address);
                    }
                    {
                        const {owner} = await grid.orders(9 + startOrderId);
                        expect(owner).to.equal(signer.address);
                    }

                    // assert boundary
                    const boundaryFunc =
                        token0.toLowerCase() == usdc.address.toLowerCase() ? grid.boundaries0 : grid.boundaries1;
                    const [bundle0Id, bundle1Id, makerAmountRemainingForBoundary] = await boundaryFunc(0);
                    expect(bundle0Id).to.equal(startBundleId);
                    expect(bundle1Id).to.equal(0);
                    expect(makerAmountRemainingForBoundary).to.equal(1000 * 10);

                    // assert bundle
                    const {
                        boundaryLower,
                        zero,
                        makerAmountTotal,
                        makerAmountRemaining,
                        takerAmountRemaining,
                        takerFeeAmountRemaining,
                    } = await grid.bundles(startBundleId);
                    expect(boundaryLower).to.equal(0);
                    expect(zero).to.equal(token0.toLowerCase() == usdc.address.toLowerCase());
                    expect(makerAmountTotal).to.equal(1000 * 10);
                    expect(makerAmountRemaining).to.equal(1000 * 10);
                    expect(takerAmountRemaining).to.equal(0);
                    expect(takerFeeAmountRemaining).to.equal(0);
                });

                it("bundle balance overflow", async () => {
                    const {signer, gridFactory, weth, gridTestHelper} = await loadFixture(
                        createGridAndInitializeGridFixture
                    );

                    const overflowToken = await deployERC20(
                        "Overflow Token",
                        "OF",
                        18,
                        BigNumber.from(1).shl(18 + 160)
                    );
                    await overflowToken.approve(gridTestHelper.address, BigNumber.from(1).shl(18 + 160));

                    await gridFactory.createGrid(overflowToken.address, weth.address, Resolution.LOW);

                    await gridTestHelper.initialize(
                        {
                            tokenA: overflowToken.address,
                            tokenB: weth.address,
                            resolution: Resolution.LOW,
                            recipient: signer.address,
                            priceX96: RESOLUTION_X96,
                            orders0: [
                                {
                                    boundaryLower: 0,
                                    amount: 1n,
                                },
                            ],
                            orders1: [
                                {
                                    boundaryLower: 0,
                                    amount: 1n,
                                },
                            ],
                        },
                        {value: 1n}
                    );
                    const grid = await ethers.getContractAt(
                        "Grid",
                        await computeAddress(gridFactory.address, overflowToken.address, weth.address, Resolution.LOW)
                    );
                    await grid.settleMakerOrderAndCollectInBatch(signer.address, [1, 2], true);

                    const {token0} = await sortedToken(overflowToken.address, weth.address);
                    await gridTestHelper.placeMakerOrder({
                        recipient: ethers.constants.AddressZero,
                        tokenA: overflowToken.address,
                        tokenB: weth.address,
                        resolution: Resolution.LOW,
                        zero: token0.toLowerCase() == overflowToken.address.toLowerCase(),
                        boundaryLower: 0,
                        amount: BigNumber.from(1).shl(128).sub(1),
                    });

                    await expect(
                        gridTestHelper.placeMakerOrder({
                            recipient: ethers.constants.AddressZero,
                            tokenA: overflowToken.address,
                            tokenB: weth.address,
                            resolution: Resolution.LOW,
                            zero: token0.toLowerCase() == overflowToken.address.toLowerCase(),
                            boundaryLower: 0,
                            amount: 1,
                        })
                    ).to.revertedWithPanic(0x11); // Arithmetic operation underflowed or overflowed outside of an unchecked block
                });

                it("pay with native token", async () => {
                    const {weth, usdc, gridTestHelper, grid} = await loadFixture(createGridAndInitializeGridFixture);
                    const {token0} = await sortedToken(usdc.address, weth.address);

                    await expect(
                        gridTestHelper.placeMakerOrder(
                            {
                                recipient: ethers.constants.AddressZero,
                                tokenA: usdc.address,
                                tokenB: weth.address,
                                resolution: Resolution.MEDIUM,
                                zero: token0.toLowerCase() == weth.address.toLowerCase(),
                                boundaryLower: 0,
                                amount: 1000,
                            },
                            {value: 10000}
                        )
                    ).to.emit(grid, "PlaceMakerOrder");
                    expect(await weth.balanceOf(grid.address)).to.equal(1000);
                    expect(await gridTestHelper.provider.getBalance(gridTestHelper.address)).to.equal(9000);
                });

                it("reuse unfilled bundle", async () => {
                    const {weth, usdc, gridTestHelper, grid} = await loadFixture(createGridAndInitializeGridFixture);
                    const {token0} = await sortedToken(usdc.address, weth.address);
                    await expect(
                        gridTestHelper.placeMakerOrder(
                            {
                                recipient: ethers.constants.AddressZero,
                                tokenA: usdc.address,
                                tokenB: weth.address,
                                resolution: Resolution.MEDIUM,
                                zero: true,
                                boundaryLower: 0,
                                amount: 1000,
                            },
                            {
                                value: token0.toLowerCase() == weth.address.toLowerCase() ? 1000 : 0,
                            }
                        )
                    ).to.emit(grid, "PlaceMakerOrder");
                    expect(await expectBoundaryInitialized(grid, true, 0, Resolution.MEDIUM, true)).to.true;

                    // remove all liquidity
                    await expect(grid.settleMakerOrder(startOrderId))
                        .to.emit(grid, "ChangeBundleForSettleOrder")
                        .withArgs(startBundleId, -1000, -1000)
                        .to.emit(grid, "SettleMakerOrder")
                        .withArgs(startOrderId, 1000, 0, 0);
                    {
                        expect(await expectBoundaryInitialized(grid, true, 0, Resolution.MEDIUM, false)).to.true;
                        const {bundle0Id, bundle1Id, makerAmountRemaining} = await grid.boundaries0(0);
                        expect(bundle0Id).to.equal(startBundleId);
                        expect(bundle1Id).to.equal(0);
                        expect(makerAmountRemaining).to.equal(0);
                    }

                    // reuse unfilled bundle
                    await expect(
                        gridTestHelper.placeMakerOrder(
                            {
                                recipient: ethers.constants.AddressZero,
                                tokenA: usdc.address,
                                tokenB: weth.address,
                                resolution: Resolution.MEDIUM,
                                zero: true,
                                boundaryLower: 0,
                                amount: 999,
                            },
                            {
                                value: token0.toLowerCase() == weth.address.toLowerCase() ? 999 : 0,
                            }
                        )
                    ).to.emit(grid, "PlaceMakerOrder");
                    {
                        expect(await expectBoundaryInitialized(grid, true, 0, Resolution.MEDIUM, true)).to.true;
                        const {makerAmountTotal, makerAmountRemaining} = await grid.bundles(startBundleId);
                        expect(makerAmountTotal).to.equal(999);
                        expect(makerAmountRemaining).to.equal(999);
                    }
                });

                it("use new bundle when bundle 0 is partially filled", async () => {
                    const {signer, gridFactory, weth, gridTestHelper} = await loadFixture(
                        createGridAndInitializeGridFixture
                    );
                    const usdc = await deployERC20("usdc", "usdc", 6, 10n ** 18n * 10000n);
                    await usdc.approve(gridTestHelper.address, 10n ** 18n * 10000n);
                    await gridFactory.createGrid(weth.address, usdc.address, Resolution.MEDIUM);
                    await gridTestHelper.initialize(
                        {
                            tokenA: weth.address,
                            tokenB: usdc.address,
                            resolution: Resolution.MEDIUM,
                            recipient: signer.address,
                            priceX96: RESOLUTION_X96,
                            orders0: [
                                {
                                    boundaryLower: 220000,
                                    amount: 1n,
                                },
                            ],
                            orders1: [
                                {
                                    boundaryLower: 220000,
                                    amount: 1n,
                                },
                            ],
                        },
                        {value: 1n}
                    );
                    const grid = await ethers.getContractAt(
                        "Grid",
                        await computeAddress(gridFactory.address, weth.address, usdc.address, Resolution.MEDIUM)
                    );
                    await grid.settleMakerOrderAndCollectInBatch(signer.address, [1, 2], true);

                    const {token0, token1} = await sortedToken(usdc.address, weth.address);
                    const placeMakerOrder = async function () {
                        return gridTestHelper.placeMakerOrder(
                            {
                                recipient: ethers.constants.AddressZero,
                                tokenA: usdc.address,
                                tokenB: weth.address,
                                resolution: Resolution.MEDIUM,
                                zero: true,
                                boundaryLower: 0,
                                amount: 1000,
                            },
                            {
                                value: token0.toLowerCase() == weth.address.toLowerCase() ? 1000 : 0,
                            }
                        );
                    };
                    await expect(placeMakerOrder()).to.emit(grid, "PlaceMakerOrder");

                    const fullyAmountIn = 10n ** 18n;
                    await gridTestHelper.exactOutput(
                        {
                            tokenIn: token1,
                            tokenOut: token0,
                            resolution: Resolution.MEDIUM,
                            recipient: ethers.constants.AddressZero,
                            amountOut: 500,
                            amountInMaximum: fullyAmountIn,
                            priceLimitX96: 0,
                        },
                        {
                            value: token0.toLowerCase() == weth.address.toLowerCase() ? 0 : fullyAmountIn,
                        }
                    );

                    await expect(placeMakerOrder()).to.emit(grid, "PlaceMakerOrder");

                    // reuse already initialized bundle
                    await expect(placeMakerOrder()).to.emit(grid, "PlaceMakerOrder");

                    {
                        const {bundle0Id, bundle1Id, makerAmountRemaining} = await grid.boundaries0(0);
                        expect(bundle0Id).to.equal(startBundleId);
                        expect(bundle1Id).to.equal(startBundleId + 1);
                        expect(makerAmountRemaining).to.equal(2500);
                    }

                    // check bundle0
                    {
                        const {makerAmountTotal, makerAmountRemaining} = await grid.bundles(startBundleId);
                        expect(makerAmountTotal).to.equal(1000);
                        expect(makerAmountRemaining).to.equal(500);
                    }

                    // check bundle1
                    {
                        const {makerAmountTotal, makerAmountRemaining} = await grid.bundles(startBundleId + 1);
                        expect(makerAmountTotal).to.equal(2000);
                        expect(makerAmountRemaining).to.equal(2000);
                    }

                    expect(await expectBoundaryInitialized(grid, true, 0, Resolution.MEDIUM, true)).to.true;
                });
            });
        });
    });

    describe("#placeMakerOrderInBatch", () => {
        it("should revert with right error if not initialized", async () => {
            const {gridFactory, gridTestHelper} = await loadFixture(createGridAndInitializeGridFixture);
            const T6 = await deployERC20("T6", "T6", 6, 0n);
            const T18 = await deployERC20("T18", "T18", 18, 0n);

            await gridFactory.createGrid(T6.address, T18.address, Resolution.LOW);

            await expect(
                gridTestHelper.placeMakerOrderInBatch({
                    recipient: ethers.constants.AddressZero,
                    tokenA: T6.address,
                    tokenB: T18.address,
                    resolution: Resolution.LOW,
                    zero: true,
                    orders: [],
                })
            ).to.revertedWith("G_GL");
        });

        it("should not revert if orders is empty", async () => {
            const {weth, usdc, gridTestHelper} = await loadFixture(createGridAndInitializeGridFixture);
            await gridTestHelper.placeMakerOrderInBatch({
                recipient: ethers.constants.AddressZero,
                tokenA: weth.address,
                tokenB: usdc.address,
                resolution: Resolution.MEDIUM,
                zero: true,
                orders: [],
            });
        });

        it("the transfer should only be performed once", async () => {
            const {signer, weth, usdc, gridTestHelper, grid} = await loadFixture(createGridAndInitializeGridFixture);
            const {token0} = await sortedToken(usdc.address, weth.address);
            await expect(
                gridTestHelper.placeMakerOrderInBatch({
                    recipient: ethers.constants.AddressZero,
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    zero: usdc.address.toLowerCase() == token0.toLowerCase(),
                    orders: [
                        {
                            boundaryLower: 0,
                            amount: 10n ** 18n,
                        },
                        {
                            boundaryLower: 0,
                            amount: 10n ** 18n,
                        },
                        {
                            boundaryLower: 0,
                            amount: 10n ** 18n,
                        },
                    ],
                })
            )
                .to.emit(usdc, "Transfer")
                .withArgs(signer.address, grid.address, 10n ** 18n * 3n);
        });

        describe("next order id should be incremented", () => {
            const tests = [1, 2, 3, 4, 5, 7, 9, 12, 20];
            tests.forEach((test) => {
                it(`next order id should be ${test + startOrderId}`, async () => {
                    const {signer, weth, usdc, gridTestHelper, grid} = await loadFixture(
                        createGridAndInitializeGridFixture
                    );
                    const {token0} = await sortedToken(usdc.address, weth.address);
                    const orders: IGridParameters.BoundaryLowerWithAmountParametersStruct[] = [];
                    for (let i = 0; i < test; i++) {
                        orders.push({
                            boundaryLower: Resolution.MEDIUM * (i + 10),
                            amount: 10n ** 18n,
                        });
                    }
                    await gridTestHelper.placeMakerOrderInBatch(
                        {
                            recipient: ethers.constants.AddressZero,
                            tokenA: weth.address,
                            tokenB: usdc.address,
                            resolution: Resolution.MEDIUM,
                            zero: weth.address.toLowerCase() == token0.toLowerCase(),
                            orders: orders,
                        },
                        {value: 10n ** 18n * BigInt(test)}
                    );

                    await expect(
                        gridTestHelper.placeMakerOrderInBatch(
                            {
                                recipient: ethers.constants.AddressZero,
                                tokenA: weth.address,
                                tokenB: usdc.address,
                                resolution: Resolution.MEDIUM,
                                zero: weth.address.toLowerCase() == token0.toLowerCase(),
                                orders: [
                                    {
                                        boundaryLower: Resolution.MEDIUM * (test + 10),
                                        amount: 10n ** 18n,
                                    },
                                ],
                            },
                            {value: 10n ** 18n}
                        )
                    )
                        .to.emit(grid, "PlaceMakerOrder")
                        .withArgs(
                            test + startOrderId,
                            signer.address,
                            test + startOrderId,
                            weth.address.toLowerCase() == token0.toLowerCase(),
                            Resolution.MEDIUM * (test + 10),
                            10n ** 18n
                        );
                });
            });
        });
    });

    describe("#settleMakerOrder", () => {
        it("should revert with right error if not initialized", async () => {
            const {gridFactory, weth} = await loadFixture(createGridAndInitializeGridFixture);
            const T6 = await deployERC20("T6", "T6", 18, 0n);
            await gridFactory.createGrid(weth.address, T6.address, Resolution.MEDIUM);

            const address = await computeAddress(gridFactory.address, T6.address, weth.address, Resolution.MEDIUM);
            const grid = await ethers.getContractAt("Grid", address);

            await expect(grid.settleMakerOrder(1)).to.revertedWith("G_GL");
        });

        it("should revert with right error if order not found", async () => {
            const {grid} = await loadFixture(createGridAndInitializeGridFixture);
            await expect(grid.settleMakerOrder(1)).to.revertedWith("G_COO");
        });

        it("should revert with right error if caller is not the order owner", async () => {
            const {grid, gridTestHelper, weth, usdc} = await loadFixture(createGridAndInitializeGridFixture);

            const {token0} = await sortedToken(weth.address, usdc.address);
            await gridTestHelper.placeMakerOrder(
                {
                    recipient: ethers.constants.AddressZero,
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    zero: token0.toLowerCase() == weth.address.toLowerCase(),
                    boundaryLower: 0n,
                    amount: 10n ** 18n,
                },
                {value: 10n ** 18n}
            );

            const signers = await ethers.getSigners();
            await expect(grid.connect(signers[1]).settleMakerOrder(1)).to.revertedWith("G_COO");
        });

        it("should revert with right error if settle the same order multiple times", async () => {
            const {grid, gridTestHelper, weth, usdc} = await loadFixture(createGridAndInitializeGridFixture);

            const {token0} = await sortedToken(weth.address, usdc.address);
            await gridTestHelper.placeMakerOrder(
                {
                    recipient: ethers.constants.AddressZero,
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    zero: token0.toLowerCase() == weth.address.toLowerCase(),
                    boundaryLower: 0n,
                    amount: 10n ** 18n,
                },
                {value: 10n ** 18n}
            );

            await grid.settleMakerOrder(startOrderId);

            for (let i = 0; i < 2; i++) {
                await expect(grid.settleMakerOrder(startOrderId)).to.revertedWith("G_COO");
            }
        });

        it("boundary and bundle remaining should be changed", async () => {
            const {grid, gridTestHelper, weth, usdc} = await loadFixture(createGridAndInitializeGridFixture);

            await gridTestHelper.placeMakerOrderInBatch(
                {
                    recipient: ethers.constants.AddressZero,
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    zero: true,
                    orders: [
                        {
                            boundaryLower: 0n,
                            amount: 10n ** 18n,
                        },
                        {
                            boundaryLower: Resolution.MEDIUM,
                            amount: 10n ** 18n,
                        },
                        {
                            boundaryLower: Resolution.MEDIUM,
                            amount: 10n ** 18n,
                        },
                    ],
                },
                {value: 10n ** 18n * 3n}
            );

            await grid.settleMakerOrder(startOrderId);
            await grid.settleMakerOrder(1 + startOrderId);

            {
                const {bundle0Id, bundle1Id, makerAmountRemaining} = await grid.boundaries0(0);
                expect(bundle0Id).to.equal(startOrderId);
                expect(bundle1Id).to.equal(0n);
                expect(makerAmountRemaining).to.equal(0n);

                expect(await expectBoundaryInitialized(grid, true, 0, Resolution.MEDIUM, false)).to.true;

                const {
                    makerAmountTotal,
                    makerAmountRemaining: bundleMakerAmountRemaining,
                    takerAmountRemaining,
                    takerFeeAmountRemaining,
                } = await grid.bundles(startBundleId);

                expect(makerAmountTotal).to.equal(0);
                expect(bundleMakerAmountRemaining).to.equal(0);
                expect(takerAmountRemaining).to.equal(0);
                expect(takerFeeAmountRemaining).to.equal(0);
            }

            {
                const {bundle0Id, bundle1Id, makerAmountRemaining} = await grid.boundaries0(5n);
                expect(bundle0Id).to.equal(1 + startBundleId);
                expect(bundle1Id).to.equal(0n);
                expect(makerAmountRemaining).to.equal(10n ** 18n);

                expect(await expectBoundaryInitialized(grid, true, Resolution.MEDIUM, Resolution.MEDIUM, true)).to.true;

                const {
                    makerAmountTotal,
                    makerAmountRemaining: bundleMakerAmountRemaining,
                    takerAmountRemaining,
                    takerFeeAmountRemaining,
                } = await grid.bundles(1 + startBundleId);

                expect(makerAmountTotal).to.equal(10n ** 18n);
                expect(bundleMakerAmountRemaining).to.equal(10n ** 18n);
                expect(takerAmountRemaining).to.equal(0);
                expect(takerFeeAmountRemaining).to.equal(0);
            }
        });

        describe("test with more orders", () => {
            let ctx: {
                signer: SignerWithAddress;
                weth: IWETHMinimum;
                usdc: IERC20;
                grid: Grid;
                gridFactory: GridFactory;
                gridTestHelper: GridTestHelper;
            };
            beforeEach("place orders", async () => {
                ctx = await createGridAndInitializeGridFixture();
                await ctx.gridFactory.createGrid(ctx.usdc.address, ctx.weth.address, Resolution.HIGH);
                ctx.grid = await ethers.getContractAt(
                    "Grid",
                    await computeAddress(ctx.gridFactory.address, ctx.usdc.address, ctx.weth.address, Resolution.HIGH)
                );

                const {token0} = await sortedToken(ctx.usdc.address, ctx.weth.address);
                await ctx.gridTestHelper.initialize(
                    {
                        tokenA: ctx.usdc.address,
                        tokenB: ctx.weth.address,
                        resolution: Resolution.HIGH,
                        recipient: ctx.signer.address,
                        priceX96: RESOLUTION_X96,
                        orders0: [
                            {
                                boundaryLower: -Resolution.HIGH * 2,
                                amount: 10n ** 18n,
                            },
                            {
                                boundaryLower: -Resolution.HIGH,
                                amount: 10n ** 18n,
                            },
                            {
                                boundaryLower: 0,
                                amount: 10n ** 18n,
                            },
                            {
                                boundaryLower: Resolution.HIGH,
                                amount: 10n ** 18n,
                            },
                            {
                                boundaryLower: Resolution.HIGH * 2,
                                amount: 10n ** 18n,
                            },
                        ],
                        orders1: [
                            {
                                boundaryLower: 0,
                                amount: 1n,
                            },
                        ],
                    },
                    {
                        value: token0.toLowerCase() == ctx.weth.address.toLowerCase() ? 10n ** 18n * 5n : 1n,
                    }
                );
            });

            it("token oweds should be accumulated", async () => {
                for (let i = 0; i < 5; i++) {
                    await expect(ctx.grid.settleMakerOrder(i + 1))
                        .to.emit(ctx.grid, "SettleMakerOrder")
                        .withArgs(i + 1, 10n ** 18n, 0n, 0n);
                }
                const {token0, token1} = await ctx.grid.tokensOweds(ctx.signer.address);
                expect(token0).to.equal(10n ** 18n * 5n);
                expect(token1).to.equal(0n);
            });

            it("partially filled and cancelled", async () => {
                const {token0, token1} = await sortedToken(ctx.usdc.address, ctx.weth.address);
                await ctx.gridTestHelper.exactOutput(
                    {
                        recipient: ethers.constants.AddressZero,
                        tokenIn: token1,
                        tokenOut: token0,
                        resolution: Resolution.HIGH,
                        amountOut: 10n ** 18n / 2n,
                        amountInMaximum: 10n ** 18n * 2n,
                        priceLimitX96: 0n,
                    },
                    {value: 10n ** 18n * 2n}
                );

                await expect(ctx.grid.settleMakerOrder(3))
                    .to.emit(ctx.grid, "SettleMakerOrder")
                    .withArgs(3, 10n ** 18n / 2n, 500375544257842741n, 1505643563463920);

                {
                    const {makerAmountTotal, makerAmountRemaining, takerAmountRemaining, takerFeeAmountRemaining} =
                        await ctx.grid.bundles(3);

                    expect(makerAmountTotal).to.equal(0n);
                    expect(makerAmountRemaining).to.equal(0n);
                    expect(takerAmountRemaining).to.equal(0n);
                    expect(takerFeeAmountRemaining).to.equal(0n);
                }
            });

            it("bundle1 fully cancelled", async () => {
                const {token0, token1} = await sortedToken(ctx.usdc.address, ctx.weth.address);

                await ctx.gridTestHelper.exactOutput(
                    {
                        recipient: ethers.constants.AddressZero,
                        tokenIn: token1,
                        tokenOut: token0,
                        resolution: Resolution.HIGH,
                        amountOut: 10n ** 18n / 2n,
                        amountInMaximum: 10n ** 18n * 2n,
                        priceLimitX96: 0n,
                    },
                    {value: 10n ** 18n * 2n}
                );

                await expect(
                    ctx.gridTestHelper.placeMakerOrder(
                        {
                            recipient: ethers.constants.AddressZero,
                            tokenA: ctx.weth.address,
                            tokenB: ctx.usdc.address,
                            resolution: Resolution.HIGH,
                            zero: true,
                            boundaryLower: 0n,
                            amount: 10n ** 18n,
                        },
                        {value: 10n ** 18n}
                    )
                )
                    .to.emit(ctx.grid, "PlaceMakerOrder")
                    .withArgs(7, ctx.signer.address, 7, true, 0n, 10n ** 18n);

                await ctx.grid.settleMakerOrder(6);

                const {bundle0Id, bundle1Id} = await ctx.grid.boundaries0(0);
                expect(bundle0Id).to.equal(3);
                expect(bundle1Id).to.equal(7);
            });

            it("bundle1 should be activate", async () => {
                const {token0, token1} = await sortedToken(ctx.usdc.address, ctx.weth.address);

                await ctx.gridTestHelper.exactOutput(
                    {
                        recipient: ethers.constants.AddressZero,
                        tokenIn: token1,
                        tokenOut: token0,
                        resolution: Resolution.HIGH,
                        amountOut: 10n ** 18n / 2n,
                        amountInMaximum: 10n ** 18n * 2n,
                        priceLimitX96: 0n,
                    },
                    {value: 10n ** 18n * 2n}
                );

                await expect(
                    ctx.gridTestHelper.placeMakerOrder(
                        {
                            recipient: ethers.constants.AddressZero,
                            tokenA: ctx.weth.address,
                            tokenB: ctx.usdc.address,
                            resolution: Resolution.HIGH,
                            zero: true,
                            boundaryLower: 0n,
                            amount: 10n ** 18n,
                        },
                        {value: 10n ** 18n}
                    )
                )
                    .to.emit(ctx.grid, "PlaceMakerOrder")
                    .withArgs(7, ctx.signer.address, 7, true, 0n, 10n ** 18n);

                {
                    const {bundle0Id, bundle1Id} = await ctx.grid.boundaries0(0);
                    expect(bundle0Id).to.equal(3);
                    expect(bundle1Id).to.equal(7);
                }

                await ctx.grid.settleMakerOrder(3);

                {
                    const {bundle0Id, bundle1Id} = await ctx.grid.boundaries0(0);
                    expect(bundle0Id).to.equal(7);
                    expect(bundle1Id).to.equal(0);
                }
            });
        });
    });

    describe("#settleMakerOrderAndCollect", () => {
        it("should revert with right error if not initialized", async () => {
            const {signer, gridFactory, weth} = await createGridAndInitializeGridFixture();
            const T6 = await deployERC20("T6", "T6", 18, 0n);
            await gridFactory.createGrid(weth.address, T6.address, Resolution.MEDIUM);

            const address = await computeAddress(gridFactory.address, T6.address, weth.address, Resolution.MEDIUM);
            const grid = await ethers.getContractAt("Grid", address);

            await expect(grid.settleMakerOrderAndCollect(signer.address, 1, true)).to.revertedWith("G_GL");
        });

        it("token oweds should be zero", async () => {
            const {signer, otherAccount, gridTestHelper, weth, usdc, grid} = await createGridAndInitializeGridFixture();

            await gridTestHelper.placeMakerOrder(
                {
                    recipient: ethers.constants.AddressZero,
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    zero: true,
                    boundaryLower: 0n,
                    amount: 10n ** 18n,
                },
                {value: 10n ** 18n}
            );

            await grid.settleMakerOrderAndCollect(otherAccount.address, startOrderId, false);

            {
                const {token0, token1} = await grid.tokensOweds(signer.address);
                expect(token0).to.equal(0);
                expect(token1).to.equal(0);
            }

            {
                const {token0, token1} = await grid.tokensOweds(otherAccount.address);
                expect(token0).to.equal(0);
                expect(token1).to.equal(0);
            }

            const {token0} = await sortedToken(weth.address, usdc.address);
            const erc20 = await ethers.getContractAt("IERC20", token0);
            expect(await erc20.balanceOf(otherAccount.address)).to.equal(10n ** 18n);
            expect(await erc20.balanceOf(grid.address)).to.equal(0n);
        });

        it("should unwrap WETH9", async () => {
            const {gridTestHelper, weth, usdc, grid} = await createGridAndInitializeGridFixture();

            const {token0} = await sortedToken(weth.address, usdc.address);

            await gridTestHelper.placeMakerOrder(
                {
                    recipient: ethers.constants.AddressZero,
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    zero: token0.toLowerCase() == weth.address.toLowerCase(),
                    boundaryLower: 0n,
                    amount: 10n ** 18n,
                },
                {value: 10n ** 18n}
            );

            const recipient = "0x1111111111111111111111111111111111111111";
            await grid.settleMakerOrderAndCollect(recipient, startOrderId, true);
            expect(await grid.provider.getBalance(recipient)).to.equal(10n ** 18n);
            expect(await weth.balanceOf(grid.address)).to.equal(0n);
        });
    });

    describe("#settleMakerOrderAndCollectInBatch", () => {
        it("should revert with right error if not initialized", async () => {
            const {signer, gridFactory, weth} = await createGridAndInitializeGridFixture();
            const T6 = await deployERC20("T6", "T6", 18, 0n);
            await gridFactory.createGrid(weth.address, T6.address, Resolution.MEDIUM);

            const address = await computeAddress(gridFactory.address, T6.address, weth.address, Resolution.MEDIUM);
            const grid = await ethers.getContractAt("Grid", address);

            await expect(grid.settleMakerOrderAndCollectInBatch(signer.address, [1], true)).to.revertedWith("G_GL");
        });

        it("should not revert if order ids is empty", async () => {
            const {signer, grid} = await createGridAndInitializeGridFixture();

            await grid.settleMakerOrderAndCollectInBatch(signer.address, [], true);
        });

        it("token oweds should be zero", async () => {
            const {signer, otherAccount, gridTestHelper, weth, usdc, grid} = await createGridAndInitializeGridFixture();

            await gridTestHelper.placeMakerOrderInBatch(
                {
                    recipient: ethers.constants.AddressZero,
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    zero: true,
                    orders: [
                        {
                            boundaryLower: 0n,
                            amount: 10n ** 18n,
                        },
                        {
                            boundaryLower: 0n,
                            amount: 10n ** 18n,
                        },
                    ],
                },
                {value: 10n ** 18n * 2n}
            );

            await grid.settleMakerOrderAndCollectInBatch(otherAccount.address, [3, 4], false);

            {
                const {token0, token1} = await grid.tokensOweds(signer.address);
                expect(token0).to.equal(0);
                expect(token1).to.equal(0);
            }

            {
                const {token0, token1} = await grid.tokensOweds(otherAccount.address);
                expect(token0).to.equal(0);
                expect(token1).to.equal(0);
            }

            const {token0} = await sortedToken(weth.address, usdc.address);
            const erc20 = await ethers.getContractAt("IERC20", token0);
            expect(await erc20.balanceOf(otherAccount.address)).to.equal(10n ** 18n * 2n);
            expect(await erc20.balanceOf(grid.address)).to.equal(0n);
        });

        it("the transfer should only be performed once", async () => {
            const {signer, gridTestHelper, grid, weth, usdc} = await createGridAndInitializeGridFixture();

            await gridTestHelper.placeMakerOrderInBatch(
                {
                    recipient: ethers.constants.AddressZero,
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    zero: true,
                    orders: [
                        {
                            boundaryLower: 0n,
                            amount: 10n ** 18n,
                        },
                        {
                            boundaryLower: 0n,
                            amount: 10n ** 18n,
                        },
                    ],
                },
                {value: 10n ** 18n * 2n}
            );

            const {token0} = await sortedToken(weth.address, usdc.address);
            const erc20 = await ethers.getContractAt("IERC20", token0);
            await expect(grid.settleMakerOrderAndCollectInBatch(signer.address, [3, 4], false))
                .to.emit(erc20, "Transfer")
                .withArgs(grid.address, signer.address, 10n ** 18n * 2n);
        });

        it("should unwrap WETH9", async () => {
            const {gridTestHelper, weth, usdc, grid} = await createGridAndInitializeGridFixture();

            const {token0} = await sortedToken(weth.address, usdc.address);

            await gridTestHelper.placeMakerOrderInBatch(
                {
                    recipient: ethers.constants.AddressZero,
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    zero: token0.toLowerCase() == weth.address.toLowerCase(),
                    orders: [
                        {
                            boundaryLower: 0n,
                            amount: 10n ** 18n,
                        },
                        {
                            boundaryLower: 0n,
                            amount: 10n ** 18n,
                        },
                    ],
                },
                {value: 10n ** 18n * 2n}
            );

            const recipient = usdc.address;
            await grid.settleMakerOrderAndCollectInBatch(recipient, [3, 4], true);
            expect(await grid.provider.getBalance(recipient)).to.equal(10n ** 18n * 2n);
            expect(await weth.balanceOf(grid.address)).to.equal(0n);
        });
    });
});

function computeUnfilledAccumulateRateX128(
    unfilledAccumulateRateX128Before: bigint,
    amountOut: bigint,
    amountTotal: bigint
): bigint {
    return (
        (unfilledAccumulateRateX128Before * ((1n << 128n) - (amountOut * (1n << 128n)) / amountTotal)) / (1n << 128n)
    );
}
