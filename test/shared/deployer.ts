import {ethers} from "hardhat";
import {
    ERC20Test,
    FlashTest,
    GridFactory,
    GridTestHelper,
    IERC20,
    IWETHMinimum,
    SwapMathTest,
    SwapTest,
} from "../../typechain-types";
import {BigNumberish} from "ethers";
import {MAX_UINT_128} from "./util";
import {bytecode} from "../../artifacts/contracts/Grid.sol/Grid.json";

const WETH9 = require("../contracts/WETH9.json");

export const deployWETH = async () => {
    const [signer] = await ethers.getSigners();
    const contractFactory = await ethers.getContractFactory(WETH9.abi, WETH9.bytecode, signer);
    const weth = await contractFactory.deploy();
    await weth.deployed();
    return weth as IWETHMinimum;
};

export const deployGridFactory = async (weth9: string) => {
    const gridFactoryFactory = await ethers.getContractFactory("GridFactory");

    const gridFactory = await gridFactoryFactory.deploy(weth9, bytecode.slice(0, bytecode.length/2 + bytecode.length%2));
    await gridFactory.deployed();
    await gridFactory.concatGridCreationCode("0x" + bytecode.slice(bytecode.length/2 + bytecode.length%2));
    await gridFactory.renounceOwnership();

    return {
        gridFactory,
    };
};

export const deploySwapMath = async () => {
    const swapMathFactory = await ethers.getContractFactory("SwapMathTest");
    const swapMath = await swapMathFactory.deploy();
    await swapMath.deployed();
    return swapMath as SwapMathTest;
};

export const deployGridTestHelper = async (gridFactoryAddress: string, weth9Address: string) => {
    const contractFactory = await ethers.getContractFactory("GridTestHelper");
    const gridTestHelper = await contractFactory.deploy(gridFactoryAddress, weth9Address);
    await gridTestHelper.deployed();
    return gridTestHelper as GridTestHelper;
};

export const deployERC20 = async (
    name: string,
    symbol: string,
    decimals: number,
    initialSupply: BigNumberish | undefined
) => {
    const [signer] = await ethers.getSigners();
    const contractFactory = await ethers.getContractFactory("ERC20Test", signer);
    const erc20 = await contractFactory.deploy(name, symbol, decimals, initialSupply == undefined ? 0 : initialSupply);
    await erc20.deployed();
    return erc20 as IERC20;
};

export const deployERC20Tokens = async () => {
    const tokenFactory = await ethers.getContractFactory("ERC20Test");
    const tokens: [ERC20Test, ERC20Test, ERC20Test] = [
        (await tokenFactory.deploy("Test ERC20", "Test", 18, MAX_UINT_128.div(2))) as ERC20Test,
        (await tokenFactory.deploy("Test ERC20", "Test", 18, MAX_UINT_128.div(2))) as ERC20Test,
        (await tokenFactory.deploy("Test ERC20", "Test", 18, MAX_UINT_128.div(2))) as ERC20Test,
    ];

    const promises: Promise<ERC20Test>[] = [];
    for (let t of tokens) {
        promises.push(t.deployed());
    }
    await Promise.all(promises);

    tokens.sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1));
    return tokens;
};

export const deploySwapTest = async (gridFactory: string, weth: string) => {
    const contractFactory = await ethers.getContractFactory("SwapTest");
    const swapTest = await contractFactory.deploy(gridFactory, weth);
    await swapTest.deployed();
    return swapTest as SwapTest;
};

export const deployFlashTest = async (gridFactory: string, weth: string) => {
    const contractFactory = await ethers.getContractFactory("FlashTest");
    const flashTest = await contractFactory.deploy(gridFactory, weth);
    await flashTest.deployed();
    return flashTest as FlashTest;
};
