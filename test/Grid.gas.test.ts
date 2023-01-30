import {deployERC20, deployGridFactory, deployGridTestHelper, deployWETH} from "./shared/deployer";
import {Resolution, RESOLUTION_X96} from "./shared/util";
import {ethers} from "hardhat";
import {computeAddress, sortedToken} from "./shared/GridAddress";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "./shared/expect";

describe("Grid", () => {
    const deployFixture = async () => {
        const weth = await deployWETH();
        const {gridFactory} = await deployGridFactory(weth.address);

        const usdc = await deployERC20("USDC", "USDC", 6, 10n ** 18n * 10000n);
        const usdt = await deployERC20("USDT", "USDT", 6, 10n ** 18n * 10000n);

        const gridTestHelper = await deployGridTestHelper(gridFactory.address, weth.address);

        await Promise.all([
            weth.approve(gridTestHelper.address, 10n ** 18n * 10000n),
            usdc.approve(gridTestHelper.address, 10n ** 18n * 10000n),
            usdt.approve(gridTestHelper.address, 10n ** 18n * 10000n),
        ]);

        await gridFactory.createGrid(weth.address, usdc.address, Resolution.MEDIUM);

        await gridFactory.createGrid(usdc.address, usdt.address, Resolution.MEDIUM);

        const ETHToERC20Grid = await ethers.getContractAt(
            "Grid",
            await computeAddress(gridFactory.address, weth.address, usdc.address, Resolution.MEDIUM)
        );

        const [signer] = await ethers.getSigners();
        const parameters = {
            tokenA: weth.address,
            tokenB: usdc.address,
            resolution: Resolution.MEDIUM,
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
                    boundaryLower: 0n,
                    amount: 1n,
                },
            ],
        };
        await gridTestHelper.initialize(parameters, {value: 1n});
        await ETHToERC20Grid.settleMakerOrderAndCollectInBatch(signer.address, [1, 2], true);

        const ERC20ToERC20Grid = await ethers.getContractAt(
            "Grid",
            await computeAddress(gridFactory.address, usdc.address, usdt.address, Resolution.MEDIUM)
        );

        parameters.tokenA = usdc.address;
        parameters.tokenB = usdt.address;
        await gridTestHelper.initialize(parameters);
        await ERC20ToERC20Grid.settleMakerOrderAndCollectInBatch(signer.address, [1, 2], false);

        return {weth, usdc, usdt, gridFactory, gridTestHelper, ETHToERC20Grid, ERC20ToERC20Grid};
    };

    it("#createGrid", async () => {
        const {usdc, usdt, gridFactory} = await loadFixture(deployFixture);

        const tx = await gridFactory.createGrid(usdc.address, usdt.address, Resolution.HIGH);
        const receipt = await tx.wait();
        expect(receipt.gasUsed.toNumber()).toMatchSnapshot();
    });

    it("#initialize", async () => {
        const {usdc, usdt, gridFactory, gridTestHelper} = await loadFixture(deployFixture);

        await gridFactory.createGrid(usdc.address, usdt.address, Resolution.HIGH);

        const grid = await ethers.getContractAt(
            "Grid",
            await computeAddress(gridFactory.address, usdc.address, usdt.address, Resolution.HIGH)
        );

        await gridTestHelper.initialize({
            tokenA: usdc.address,
            tokenB: usdt.address,
            resolution: Resolution.HIGH,
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
        });
        expect((await gridTestHelper.gasUsed()).toNumber()).toMatchSnapshot();
    });

    describe("#placeMakerOrder", () => {
        it("ETH", async () => {
            const {weth, usdc, gridTestHelper} = await loadFixture(deployFixture);

            const {token0} = await sortedToken(weth.address, usdc.address);
            for (let i = 0; i < 5; i++) {
                await gridTestHelper.placeMakerOrder(
                    {
                        tokenA: weth.address,
                        tokenB: usdc.address,
                        resolution: Resolution.MEDIUM,
                        recipient: ethers.constants.AddressZero,
                        zero: weth.address.toLowerCase() == token0.toLowerCase(),
                        boundaryLower: 0,
                        amount: 10n ** 18n,
                    },
                    {value: 10n ** 18n}
                );

                expect((await gridTestHelper.gasUsed()).toNumber()).toMatchSnapshot();
            }
        });

        it("ERC20", async () => {
            const {weth, usdc, gridTestHelper} = await loadFixture(deployFixture);

            const {token0} = await sortedToken(weth.address, usdc.address);
            for (let i = 0; i < 5; i++) {
                await gridTestHelper.placeMakerOrder({
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    recipient: ethers.constants.AddressZero,
                    zero: weth.address.toLowerCase() != token0.toLowerCase(),
                    boundaryLower: 0,
                    amount: 10n ** 18n,
                });
                expect((await gridTestHelper.gasUsed()).toNumber()).toMatchSnapshot();
            }
        });
    });

    describe("#swap", () => {
        describe("exactOutput", () => {
            it("ETH", async () => {
                const {weth, usdc, gridTestHelper} = await loadFixture(deployFixture);

                const {token0} = await sortedToken(weth.address, usdc.address);

                await gridTestHelper.placeMakerOrderInBatch({
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    recipient: ethers.constants.AddressZero,
                    zero: weth.address.toLowerCase() != token0.toLowerCase(),
                    orders: [
                        {
                            boundaryLower: -Resolution.MEDIUM,
                            amount: 10n ** 18n * 10n,
                        },
                        {
                            boundaryLower: 0,
                            amount: 10n ** 18n * 10n,
                        },
                        {
                            boundaryLower: Resolution.MEDIUM,
                            amount: 10n ** 18n * 10n,
                        },
                    ],
                });

                const signers = await ethers.getSigners();
                for (let i = 0; i < 6; i++) {
                    await gridTestHelper.exactOutput(
                        {
                            tokenIn: weth.address,
                            tokenOut: usdc.address,
                            resolution: Resolution.MEDIUM,
                            recipient: signers[0].address,
                            amountOut: 10n ** 18n,
                            amountInMaximum: 10n ** 18n * 2n,
                            priceLimitX96: 0n,
                        },
                        {value: 10n ** 18n * 2n}
                    );
                    expect((await gridTestHelper.gasUsed()).toNumber()).toMatchSnapshot();
                }
            });

            it("ERC20", async () => {
                const {weth, usdc, gridTestHelper} = await loadFixture(deployFixture);

                const {token0} = await sortedToken(weth.address, usdc.address);

                await gridTestHelper.placeMakerOrderInBatch(
                    {
                        tokenA: weth.address,
                        tokenB: usdc.address,
                        resolution: Resolution.MEDIUM,
                        recipient: ethers.constants.AddressZero,
                        zero: weth.address.toLowerCase() == token0.toLowerCase(),
                        orders: [
                            {
                                boundaryLower: -Resolution.MEDIUM,
                                amount: 10n ** 18n * 10n,
                            },
                            {
                                boundaryLower: 0,
                                amount: 10n ** 18n * 10n,
                            },
                            {
                                boundaryLower: Resolution.MEDIUM,
                                amount: 10n ** 18n * 10n,
                            },
                        ],
                    },
                    {value: 10n ** 18n * 10n * 3n}
                );

                const signers = await ethers.getSigners();
                for (let i = 0; i < 6; i++) {
                    await gridTestHelper.exactOutput({
                        tokenIn: usdc.address,
                        tokenOut: weth.address,
                        resolution: Resolution.MEDIUM,
                        recipient: signers[0].address,
                        amountOut: 10n ** 18n,
                        amountInMaximum: 10n ** 18n * 2n,
                        priceLimitX96: 0n,
                    });
                    expect((await gridTestHelper.gasUsed()).toNumber()).toMatchSnapshot();
                }
            });
        });

        describe("exactInput", () => {
            it("ETH", async () => {
                const {weth, usdc, gridTestHelper} = await loadFixture(deployFixture);

                const {token0} = await sortedToken(weth.address, usdc.address);

                await gridTestHelper.placeMakerOrderInBatch({
                    tokenA: weth.address,
                    tokenB: usdc.address,
                    resolution: Resolution.MEDIUM,
                    recipient: ethers.constants.AddressZero,
                    zero: weth.address.toLowerCase() != token0.toLowerCase(),
                    orders: [
                        {
                            boundaryLower: -Resolution.MEDIUM,
                            amount: 10n ** 18n * 10n,
                        },
                        {
                            boundaryLower: 0,
                            amount: 10n ** 18n * 10n,
                        },
                        {
                            boundaryLower: Resolution.MEDIUM,
                            amount: 10n ** 18n * 10n,
                        },
                    ],
                });

                const signers = await ethers.getSigners();
                for (let i = 0; i < 6; i++) {
                    await gridTestHelper.exactInput(
                        {
                            tokenIn: weth.address,
                            tokenOut: usdc.address,
                            resolution: Resolution.MEDIUM,
                            recipient: signers[0].address,
                            amountIn: 10n ** 18n / 2n,
                            amountOutMinimum: 0n,
                            priceLimitX96: 0n,
                        },
                        {value: 10n ** 18n / 2n}
                    );
                    expect((await gridTestHelper.gasUsed()).toNumber()).toMatchSnapshot();
                }
            });

            it("ERC20", async () => {
                const {weth, usdc, gridTestHelper} = await loadFixture(deployFixture);

                const {token0} = await sortedToken(weth.address, usdc.address);

                await gridTestHelper.placeMakerOrderInBatch(
                    {
                        tokenA: weth.address,
                        tokenB: usdc.address,
                        resolution: Resolution.MEDIUM,
                        recipient: ethers.constants.AddressZero,
                        zero: weth.address.toLowerCase() == token0.toLowerCase(),
                        orders: [
                            {
                                boundaryLower: -Resolution.MEDIUM,
                                amount: 10n ** 18n * 10n,
                            },
                            {
                                boundaryLower: 0,
                                amount: 10n ** 18n * 10n,
                            },
                            {
                                boundaryLower: Resolution.MEDIUM,
                                amount: 10n ** 18n * 10n,
                            },
                        ],
                    },
                    {value: 10n ** 18n * 10n * 3n}
                );

                const signers = await ethers.getSigners();
                for (let i = 0; i < 6; i++) {
                    await gridTestHelper.exactInput({
                        tokenIn: usdc.address,
                        tokenOut: weth.address,
                        resolution: Resolution.MEDIUM,
                        recipient: signers[0].address,
                        amountIn: 10n ** 18n / 2n,
                        amountOutMinimum: 0n,
                        priceLimitX96: 0n,
                    });
                    expect((await gridTestHelper.gasUsed()).toNumber()).toMatchSnapshot();
                }
            });
        });
    });
});
