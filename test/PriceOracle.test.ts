import {
    deployERC20Tokens,
    deployGridFactory,
    deployGridTestHelper,
    deploySwapTest,
    deployWETH,
} from "./shared/deployer";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {ethers} from "hardhat";
import {Resolution, RESOLUTION_X96} from "./shared/util";
import {computeAddress, sortedToken} from "./shared/GridAddress";
import {expect} from "./shared/expect";
import {ERC20, GridTestHelper} from "../typechain-types";

describe("PriceOracle", () => {
    async function deployFixture() {
        const weth9Address = (await deployWETH()).address;
        const {gridFactory} = await deployGridFactory(weth9Address);
        const address = await gridFactory.priceOracle();
        const oracle = await ethers.getContractAt("PriceOracle", address);

        const contractFactory = await ethers.getContractFactory("PriceOracleTestHelper");
        const oracleTestHelper = await contractFactory.deploy();
        await oracleTestHelper.deployed();

        const [token0, token1] = await deployERC20Tokens();

        await gridFactory.createGrid(token0.address, token1.address, Resolution.LOW);
        const lowGrid = await ethers.getContractAt(
            "Grid",
            await computeAddress(gridFactory.address, token0.address, token1.address, Resolution.LOW)
        );
        await gridFactory.createGrid(token0.address, token1.address, Resolution.MEDIUM);
        const mediumGrid = await ethers.getContractAt(
            "Grid",
            await computeAddress(gridFactory.address, token0.address, token1.address, Resolution.MEDIUM)
        );

        const swapTest = await deploySwapTest(gridFactory.address, weth9Address);
        const gridTestHelper = await deployGridTestHelper(gridFactory.address, weth9Address);

        await Promise.all([
            token0.approve(swapTest.address, 10n ** 18n * 1000000n),
            token0.approve(gridTestHelper.address, 10n ** 18n * 1000000n),
            token1.approve(swapTest.address, 10n ** 18n * 1000000n),
            token1.approve(gridTestHelper.address, 10n ** 18n * 1000000n),
        ]);

        await gridTestHelper.initialize({
            tokenA: token0.address,
            tokenB: token1.address,
            resolution: Resolution.MEDIUM,
            recipient: ethers.constants.AddressZero,
            priceX96: RESOLUTION_X96,
            orders0: [
                {
                    boundaryLower: -Resolution.MEDIUM * 6,
                    amount: 10n ** 18n * 1000n,
                },
                {
                    boundaryLower: -Resolution.MEDIUM * 5,
                    amount: 10n ** 18n * 1000n,
                },
                {
                    boundaryLower: -Resolution.MEDIUM * 4,
                    amount: 10n ** 18n * 1000n,
                },
                {
                    boundaryLower: -Resolution.MEDIUM * 3,
                    amount: 10n ** 18n * 1000n,
                },
                {
                    boundaryLower: -Resolution.MEDIUM * 2,
                    amount: 10n ** 18n * 1000n,
                },
                {
                    boundaryLower: -Resolution.MEDIUM,
                    amount: 10n ** 18n * 1000n,
                },
                {
                    boundaryLower: 0,
                    amount: 10n ** 18n * 1000n,
                },
                {
                    boundaryLower: Resolution.MEDIUM,
                    amount: 10n ** 18n * 1000n,
                },
                {
                    boundaryLower: Resolution.MEDIUM * 2,
                    amount: 10n ** 18n * 1000n,
                },
                {
                    boundaryLower: Resolution.MEDIUM * 3,
                    amount: 10n ** 18n * 1000n,
                },
                {
                    boundaryLower: Resolution.MEDIUM * 4,
                    amount: 10n ** 18n * 1000n,
                },
                {
                    boundaryLower: Resolution.MEDIUM * 5,
                    amount: 10n ** 18n * 1000n,
                },
                {
                    boundaryLower: Resolution.MEDIUM * 6,
                    amount: 10n ** 18n * 1000n,
                },
            ],
            orders1: [
                {
                    boundaryLower: 0,
                    amount: 10n ** 18n * 1000n,
                },
            ],
        });

        return {gridFactory, oracle, oracleTestHelper, lowGrid, mediumGrid, swapTest, gridTestHelper, token0, token1};
    }

    async function performExactOutput(token0: ERC20, token1: ERC20, gridTestHelper: GridTestHelper) {
        const {token0: sortedToken0, token1: sortedToken1} = await sortedToken(token0.address, token1.address);
        await gridTestHelper.exactOutput({
            tokenIn: sortedToken1,
            tokenOut: sortedToken0,
            resolution: Resolution.MEDIUM,
            recipient: ethers.constants.AddressZero,
            amountOut: 10n ** 18n * 500n,
            amountInMaximum: 10n ** 18n * 10000n,
            priceLimitX96: 0n,
        });
    }

    describe("#register", () => {
        it("should revert with right error if msg sender is not the grid", async () => {
            const {oracle} = await loadFixture(deployFixture);
            const [token0, token1] = await deployERC20Tokens();
            await expect(oracle.register(token0.address, token1.address, Resolution.MEDIUM)).to.be.revertedWith(
                "PO_IC"
            );
        });

        it("should be in the correct initialization state", async () => {
            const {oracle, mediumGrid} = await loadFixture(deployFixture);
            const {index, capacity, capacityNext} = await oracle.gridOracleStates(mediumGrid.address);
            expect(index).to.eq(0);
            expect(capacity).to.eq(1);
            expect(capacityNext).to.eq(1);

            {
                const {blockTimestamp, boundaryCumulative, initialized} = await oracle.gridPriceData(
                    mediumGrid.address,
                    0
                );
                expect(blockTimestamp).to.gt(0);
                const {timestamp} = await ethers.provider.getBlock("latest");
                expect(blockTimestamp).to.lte(timestamp);
                expect(boundaryCumulative).to.eq(0);
                expect(initialized).to.true;
            }

            {
                const {blockTimestamp, boundaryCumulative, initialized} = await oracle.gridPriceData(
                    mediumGrid.address,
                    1
                );
                expect(blockTimestamp).to.eq(0);
                expect(boundaryCumulative).to.eq(0);
                expect(initialized).to.false;
            }
        });
    });

    describe("#update", () => {
        it("should revert with right error if it is not written by grid", async () => {
            const {oracle} = await loadFixture(deployFixture);
            await expect(oracle.update(0, 0)).to.to.revertedWith("PO_UR");
        });

        it("should update capacity if index next equal to capacity", async () => {
            const {oracle, mediumGrid, gridTestHelper, token0, token1} = await loadFixture(deployFixture);
            await oracle.increaseCapacity(mediumGrid.address, 10);

            await performExactOutput(token0, token1, gridTestHelper);

            const {index, capacity, capacityNext} = await oracle.gridOracleStates(mediumGrid.address);
            expect(index).to.equal(1);
            expect(capacity).to.equal(10);
            expect(capacityNext).to.equal(10);
        });

        it("should not update capacity if index not equal to capacity", async () => {
            const {oracle, mediumGrid, gridTestHelper, token0, token1} = await loadFixture(deployFixture);
            await oracle.increaseCapacity(mediumGrid.address, 10);

            await performExactOutput(token0, token1, gridTestHelper);

            await oracle.increaseCapacity(mediumGrid.address, 20);

            await performExactOutput(token0, token1, gridTestHelper);

            const {index, capacity, capacityNext} = await oracle.gridOracleStates(mediumGrid.address);
            expect(index).to.equal(2);
            expect(capacity).to.equal(10);
            expect(capacityNext).to.equal(20);
        });

        describe("should update the price data if last block timestamp is changed", () => {
            it("original capacity", async () => {
                const {oracle, mediumGrid, gridTestHelper, token0, token1} = await loadFixture(deployFixture);

                for (let i = 0; i < 3; i++) {
                    const {
                        index: indexBefore,
                        capacity: capacityBefore,
                        capacityNext: capacityNextBefore,
                    } = await oracle.gridOracleStates(mediumGrid.address);
                    const {blockTimestamp: blockTimestampBefore, boundaryCumulative: boundaryCumulativeBefore} =
                        await oracle.gridPriceData(mediumGrid.address, indexBefore);
                    const {boundary: boundaryBefore} = await mediumGrid.slot0();

                    await performExactOutput(token0, token1, gridTestHelper);

                    const {index, capacity, capacityNext} = await oracle.gridOracleStates(mediumGrid.address);
                    expect(index).to.equal(0);
                    expect(capacity).to.equal(1);
                    expect(capacityNext).to.equal(1);

                    const {blockTimestamp, boundaryCumulative, initialized} = await oracle.gridPriceData(
                        mediumGrid.address,
                        0
                    );
                    const {timestamp} = await await ethers.provider.getBlock("latest");
                    expect(blockTimestamp).to.equal(timestamp);
                    expect(boundaryCumulative).to.equal(
                        boundaryCumulativeBefore.add(boundaryBefore * (blockTimestamp - blockTimestampBefore))
                    );
                    expect(initialized).to.equal(true);
                }
            });

            it("capacity is not fully used", async () => {
                const {oracle, mediumGrid, gridTestHelper, token0, token1} = await loadFixture(deployFixture);
                await oracle.increaseCapacity(mediumGrid.address, 3);

                for (let i = 0; i < 7; i++) {
                    const {
                        index: indexBefore,
                        capacity: capacityBefore,
                        capacityNext: capacityNextBefore,
                    } = await oracle.gridOracleStates(mediumGrid.address);
                    const {blockTimestamp: blockTimestampBefore, boundaryCumulative: boundaryCumulativeBefore} =
                        await oracle.gridPriceData(mediumGrid.address, indexBefore);
                    const {boundary: boundaryBefore} = await mediumGrid.slot0();

                    await performExactOutput(token0, token1, gridTestHelper);

                    const {index, capacity, capacityNext} = await oracle.gridOracleStates(mediumGrid.address);
                    expect(index).to.equal((indexBefore + 1) % capacityNextBefore);
                    expect(capacity).to.equal(3);
                    expect(capacityNext).to.equal(3);

                    const {blockTimestamp, boundaryCumulative, initialized} = await oracle.gridPriceData(
                        mediumGrid.address,
                        (indexBefore + 1) % capacityNextBefore
                    );
                    const {timestamp} = await await ethers.provider.getBlock("latest");
                    expect(blockTimestamp).to.equal(timestamp);
                    expect(boundaryCumulative).to.equal(
                        boundaryCumulativeBefore.add(boundaryBefore * (blockTimestamp - blockTimestampBefore))
                    );
                    expect(initialized).to.equal(true);
                }
            });

            it("increase capacity multiple times", async () => {
                const {oracle, mediumGrid, gridTestHelper, token0, token1} = await loadFixture(deployFixture);
                await oracle.increaseCapacity(mediumGrid.address, 3);

                await performExactOutput(token0, token1, gridTestHelper);

                await oracle.increaseCapacity(mediumGrid.address, 6);

                for (let i = 0; i < 10; i++) {
                    const {
                        index: indexBefore,
                        capacity: capacityBefore,
                        capacityNext: capacityNextBefore,
                    } = await oracle.gridOracleStates(mediumGrid.address);
                    const {blockTimestamp: blockTimestampBefore, boundaryCumulative: boundaryCumulativeBefore} =
                        await oracle.gridPriceData(mediumGrid.address, indexBefore);
                    const {boundary: boundaryBefore} = await mediumGrid.slot0();

                    await performExactOutput(token0, token1, gridTestHelper);

                    const {index, capacity, capacityNext} = await oracle.gridOracleStates(mediumGrid.address);
                    expect(index).to.equal((indexBefore + 1) % capacityNextBefore);
                    if (capacityBefore == 3 && (indexBefore + 1) % capacityNextBefore < 3) {
                        expect(capacity).to.equal(3);
                    } else {
                        expect(capacity).to.equal(6);
                    }
                    expect(capacityNext).to.equal(6);

                    const {blockTimestamp, boundaryCumulative, initialized} = await oracle.gridPriceData(
                        mediumGrid.address,
                        (indexBefore + 1) % capacityNextBefore
                    );
                    const {timestamp} = await await ethers.provider.getBlock("latest");
                    expect(blockTimestamp).to.equal(timestamp);
                    expect(boundaryCumulative).to.equal(
                        boundaryCumulativeBefore.add(boundaryBefore * (blockTimestamp - blockTimestampBefore))
                    );
                    expect(initialized).to.equal(true);
                }
            });
        });

        it("block timestamp overflow 32 bits", async () => {
            const {oracleTestHelper, mediumGrid} = await loadFixture(deployFixture);
            await oracleTestHelper["register(address)"](mediumGrid.address);
            await oracleTestHelper.increaseCapacity(mediumGrid.address, 10);

            const {blockTimestamp: blockTimestampBefore} = await oracleTestHelper.gridPriceData(mediumGrid.address, 0);

            await oracleTestHelper["update(address,int24,uint256)"](mediumGrid.address, 1, 1n << 32n);

            const {index} = await oracleTestHelper.gridOracleStates(mediumGrid.address);
            expect(index).to.equal(1);

            const {blockTimestamp, initialized, boundaryCumulative} = await oracleTestHelper.gridPriceData(
                mediumGrid.address,
                1
            );
            const truncatedBlockTimestamp = uint32Truncate(1n << 32n);
            expect(blockTimestamp).to.equal(truncatedBlockTimestamp);
            expect(boundaryCumulative).to.equal(uint32Sub(truncatedBlockTimestamp, BigInt(blockTimestampBefore)) * 1n);
            expect(initialized).to.true;
        });
    });

    describe("#increaseCapacity", () => {
        it("should revert with right error if the grid is not registered", async () => {
            const {lowGrid, oracle} = await loadFixture(deployFixture);
            await expect(oracle.increaseCapacity(lowGrid.address, 2)).to.revertedWith("PO_UR");
        });

        it("should not emit event if next <= current", async () => {
            const {oracle, mediumGrid} = await loadFixture(deployFixture);
            await expect(oracle.increaseCapacity(mediumGrid.address, 1)).not.to.emit(oracle, "IncreaseCapacity");
        });

        it("should emit event if next > current", async () => {
            const {oracle, mediumGrid} = await loadFixture(deployFixture);
            for (let i = 1; i < 4096; i += 800) {
                let capacityNew = i + 800;
                if (capacityNew > 65535) {
                    capacityNew = 65535;
                }

                await expect(oracle.increaseCapacity(mediumGrid.address, capacityNew))
                    .to.emit(oracle, "IncreaseCapacity")
                    .withArgs(mediumGrid.address, i, capacityNew);

                const {index, capacity, capacityNext} = await oracle.gridOracleStates(mediumGrid.address);
                expect(index).to.equal(0);
                expect(capacity).to.equal(1);
                expect(capacityNext).to.equal(capacityNew);

                const {blockTimestamp, boundaryCumulative, initialized} = await oracle.gridPriceData(
                    mediumGrid.address,
                    i + 1
                );
                expect(blockTimestamp).to.equal(1);
                expect(boundaryCumulative).to.equal(0);
                expect(initialized).to.false;

                if (capacityNew === 65535) {
                    break;
                }
            }
        });
    });

    describe("#getBoundaryCumulative", () => {
        it("should revert with right error if the grid is not registered", async () => {
            const {lowGrid, oracle} = await loadFixture(deployFixture);
            await expect(oracle.getBoundaryCumulative(lowGrid.address, 0)).to.revertedWith("PO_UR");
        });

        it("should revert with right error if the secondsAgo is too large", async () => {
            const {oracleTestHelper, mediumGrid} = await loadFixture(deployFixture);
            await oracleTestHelper["register(address)"](mediumGrid.address);

            await expect(
                oracleTestHelper["getBoundaryCumulative(address,uint32)"](mediumGrid.address, 24 * 60 * 60)
            ).to.revertedWith("PO_STL");
        });

        describe("should return the correct boundary cumulative", () => {
            describe("secondsAgo is zero", () => {
                it("boundary cumulative is zero", async () => {
                    const {oracleTestHelper, mediumGrid} = await loadFixture(deployFixture);
                    await oracleTestHelper["register(address)"](mediumGrid.address);

                    const {blockTimestamp} = await oracleTestHelper.gridPriceData(mediumGrid.address, 0);
                    expect(
                        await oracleTestHelper["getBoundaryCumulative(address,int24,uint256,uint32)"](
                            mediumGrid.address,
                            0,
                            blockTimestamp,
                            0
                        )
                    ).to.equal(0);
                });

                it("boundary cumulative is not zero and block timestamp is equal", async () => {
                    const {oracleTestHelper, mediumGrid} = await loadFixture(deployFixture);
                    await oracleTestHelper["register(address)"](mediumGrid.address);

                    await oracleTestHelper["update(address,int24)"](mediumGrid.address, 1);

                    const {blockTimestamp} = await oracleTestHelper.gridPriceData(mediumGrid.address, 0);
                    expect(
                        await oracleTestHelper["getBoundaryCumulative(address,int24,uint256,uint32)"](
                            mediumGrid.address,
                            1n,
                            blockTimestamp,
                            0
                        )
                    ).to.equal(1);
                });

                it("boundary cumulative is not zero", async () => {
                    const {oracleTestHelper, mediumGrid} = await loadFixture(deployFixture);
                    await oracleTestHelper["register(address)"](mediumGrid.address);

                    await oracleTestHelper["update(address,int24)"](mediumGrid.address, 1);

                    const {blockTimestamp} = await oracleTestHelper.gridPriceData(mediumGrid.address, 0);
                    const blockTimestampNext = blockTimestamp + 60;
                    expect(
                        await oracleTestHelper["getBoundaryCumulative(address,int24,uint256,uint32)"](
                            mediumGrid.address,
                            2n,
                            blockTimestampNext,
                            0
                        )
                    ).to.equal(1n + 2n * BigInt(blockTimestampNext - blockTimestamp));
                });
            });

            describe("secondsAgo is not zero", () => {
                it("target timestamp is greater than newest price data", async () => {
                    const {oracleTestHelper, mediumGrid} = await loadFixture(deployFixture);
                    await oracleTestHelper["register(address)"](mediumGrid.address);

                    await oracleTestHelper["update(address,int24)"](mediumGrid.address, 1);
                    const {blockTimestamp} = await oracleTestHelper.gridPriceData(mediumGrid.address, 0);
                    const blockTimestampNext = blockTimestamp + 60 * 10;
                    expect(
                        await oracleTestHelper["getBoundaryCumulative(address,int24,uint256,uint32)"](
                            mediumGrid.address,
                            2n,
                            blockTimestampNext,
                            60 * 5 /* 5m */
                        )
                    ).to.equal(1n + 2n * BigInt(blockTimestampNext - 60 * 5 - blockTimestamp));
                });

                it("target timestamp is equal to some price data", async () => {
                    const {oracleTestHelper, mediumGrid} = await loadFixture(deployFixture);
                    await oracleTestHelper["register(address)"](mediumGrid.address);
                    await oracleTestHelper.increaseCapacity(mediumGrid.address, 6);

                    for (let i = 0; i < 9; i++) {
                        const blockTimestamp1 = nextBlockTimestamp();
                        await oracleTestHelper["update(address,int24,uint256)"](
                            mediumGrid.address,
                            0n,
                            blockTimestamp1 + 60 * 10 * i
                        );
                    }

                    const {index} = await oracleTestHelper.gridOracleStates(mediumGrid.address);
                    const {blockTimestamp: newestBlockTimestamp} = await oracleTestHelper.gridPriceData(
                        mediumGrid.address,
                        index
                    );
                    for (let i = index - 2; i <= index + 2; i++) {
                        const {blockTimestamp, boundaryCumulative} = await oracleTestHelper.gridPriceData(
                            mediumGrid.address,
                            i
                        );
                        expect(
                            await oracleTestHelper["getBoundaryCumulative(address,int24,uint256,uint32)"](
                                mediumGrid.address,
                                0,
                                newestBlockTimestamp,
                                newestBlockTimestamp - blockTimestamp
                            )
                        ).to.equal(boundaryCumulative);
                    }
                });

                it("target timestamp is between two price data", async () => {
                    const {oracleTestHelper, mediumGrid} = await loadFixture(deployFixture);
                    await oracleTestHelper["register(address)"](mediumGrid.address);
                    await oracleTestHelper.increaseCapacity(mediumGrid.address, 6);

                    for (let i = 0; i < 9; i++) {
                        const blockTimestamp1 = nextBlockTimestamp();
                        await oracleTestHelper["update(address,int24,uint256)"](
                            mediumGrid.address,
                            0n,
                            blockTimestamp1 + 60 * 10 * i
                        );
                    }

                    const {index} = await oracleTestHelper.gridOracleStates(mediumGrid.address);

                    const {blockTimestamp: blockTimestampBefore, boundaryCumulative: boundaryCumulativeBefore} =
                        await oracleTestHelper.gridPriceData(mediumGrid.address, index - 1);

                    const {blockTimestamp: blockTimestampAfter, boundaryCumulative: boundaryCumulativeAfter} =
                        await oracleTestHelper.gridPriceData(mediumGrid.address, index);

                    const targetTimestamp = blockTimestampBefore + (blockTimestampAfter - blockTimestampBefore) / 2;

                    expect(
                        await oracleTestHelper["getBoundaryCumulative(address,int24,uint256,uint32)"](
                            mediumGrid.address,
                            0n,
                            targetTimestamp + 60 * 10,
                            60 * 10
                        )
                    ).to.equal(
                        boundaryCumulativeBefore.add(
                            boundaryCumulativeAfter
                                .sub(boundaryCumulativeBefore)
                                .div(blockTimestampAfter - blockTimestampBefore)
                                .mul(targetTimestamp - blockTimestampBefore)
                        )
                    );
                });
            });
        });
    });

    it("#getBoundaryCumulatives", async () => {
        const {mediumGrid, oracleTestHelper} = await loadFixture(deployFixture);
        await oracleTestHelper["register(address)"](mediumGrid.address);
        await oracleTestHelper.increaseCapacity(mediumGrid.address, 6);

        const {timestamp} = await ethers.provider.getBlock("latest");
        for (let i = 0; i < 6; i++) {
            await oracleTestHelper["update(address,int24,uint256)"](mediumGrid.address, i % 2, timestamp + i * 60);
        }

        const boundaryCumulatives = await oracleTestHelper.getBoundaryCumulatives(
            mediumGrid.address,
            [0, 60, 120, 180, 240]
        );
        expect(boundaryCumulatives.length).to.equal(5);
    });
});

function nextBlockTimestamp() {
    return Math.floor(Date.now() / 1000);
}

function uint32Truncate(n: bigint) {
    return n & ((1n << 32n) - 1n);
}

function uint32Sub(x: bigint, y: bigint) {
    return uint32Operation(x, y, (x, y) => x - y);
}

function uint32Operation(x: bigint, y: bigint, op: (x: bigint, y: bigint) => bigint) {
    return (op(x, y) + (1n << 32n)) & ((1n << 32n) - 1n);
}
