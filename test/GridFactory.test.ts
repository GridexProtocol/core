import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {Resolution} from "./shared/util";
import {deployGridFactory, deployWETH} from "./shared/deployer";
import {computeAddress, sortedToken} from "./shared/GridAddress";
import {ethers} from "hardhat";

describe("GridFactory", () => {
    async function deployFixture() {
        const weth = await deployWETH();
        const  {gridFactory} =  await deployGridFactory(weth.address);
        return {weth, gridFactory};
    }

    describe("#resolutions", () => {
        describe("should return the fee", () => {
            const tests = [
                {
                    name: "resolution for 1",
                    resolution: 1,
                    expectTakerFee: 0.0001,
                    expectMakerFee: -0.00008,
                },
                {
                    name: "resolution for 5",
                    resolution: 5,
                    expectTakerFee: 0.0005,
                    expectMakerFee: -0.0004,
                },
                {
                    name: "resolution for 30",
                    resolution: 30,
                    expectTakerFee: 0.003,
                    expectMakerFee: -0.0024,
                },
                {
                    name: "resolution for 100",
                    resolution: 100,
                    expectTakerFee: 0,
                    expectMakerFee: 0,
                },
            ];
            tests.forEach(async (test) => {
                it(test.name, async () => {
                    const {gridFactory} = await loadFixture(deployFixture);
                    const {takerFee, makerFee} = await gridFactory.resolutions(test.resolution);
                    expect(takerFee / 1e6).to.equal(test.expectTakerFee);
                    expect(makerFee / 1e6).to.equal(test.expectMakerFee);
                });
            });
        });
    });

    describe("#createGrid", () => {
        it("should reverted with the right error if tokenA is not a contract", async () => {
            const {gridFactory} = await loadFixture(deployFixture);
            await expect(
                gridFactory.createGrid(
                    "0x1000000000000000000000000000000000000000",
                    gridFactory.address,
                    Resolution.LOW
                )
            ).to.be.revertedWith("GF_NC");
        });

        it("should reverted with the right error if tokenB is not a contract", async () => {
            const {gridFactory} = await loadFixture(deployFixture);
            await expect(
                gridFactory.createGrid(
                    gridFactory.address,
                    "0x1000000000000000000000000000000000000000",
                    Resolution.LOW
                )
            ).to.be.revertedWith("GF_NC");
        });

        it("should reverted with the right error if tokenA is the same as tokenB", async () => {
            const {gridFactory} = await loadFixture(deployFixture);
            await expect(
                gridFactory.createGrid(gridFactory.address, gridFactory.address, Resolution.LOW)
            ).to.be.revertedWith("GF_TAD");
        });

        it("should reverted with the right error if resolution is not enabled", async () => {
            const {gridFactory, weth} = await loadFixture(deployFixture);
            await expect(gridFactory.createGrid(gridFactory.address, weth.address, 1000)).to.be.revertedWith(
                "GF_RNE"
            );
        });

        describe("should success", async () => {
            const tests = [
                {
                    name: "resolution for low",
                    resolution: Resolution.LOW,
                },
                {
                    name: "resolution for medium",
                    resolution: Resolution.MEDIUM,
                },
                {
                    name: "resolution for high",
                    resolution: Resolution.HIGH,
                },
            ];
            tests.forEach((test) => {
                it(test.name, async () => {
                    const {gridFactory, weth} = await loadFixture(deployFixture);
                    const {token0, token1} = await sortedToken(gridFactory.address, weth.address);
                    await expect(gridFactory.createGrid(token0, token1, test.resolution))
                        .to.emit(gridFactory, "GridCreated")
                        .withArgs(
                            token0,
                            token1,
                            test.resolution,
                            await computeAddress(gridFactory.address, token0, token1, test.resolution)
                        );

                    const gridAddress0 = await gridFactory.grids(token0, token1, test.resolution);
                    const gridAddress1 = await gridFactory.grids(token1, token0, test.resolution);
                    expect(gridAddress0).to.equal(gridAddress1);
                    expect(gridAddress0).to.not.equal(ethers.constants.AddressZero);
                });
            });
        });

        it("should reverted with the right error if the grid already exists", async () => {
            const {gridFactory, weth} = await loadFixture(deployFixture);
            await expect(gridFactory.createGrid(gridFactory.address, weth.address, Resolution.HIGH)).to.emit(
                gridFactory,
                "GridCreated"
            );

            await expect(
                gridFactory.createGrid(gridFactory.address, weth.address, Resolution.HIGH)
            ).to.be.revertedWith("GF_PAE");
        });
    });
});
