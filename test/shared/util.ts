import {ethers} from "hardhat";
import {BigNumber, BigNumberish} from "ethers";
import {PromiseOrValue} from "../../typechain-types/common";
import {Grid, GridFactory} from "../../typechain-types";
import {expect} from "chai";
import {computeAddress} from "./GridAddress";

enum Resolution {
    LOW = 1,
    MEDIUM = 5,
    HIGH = 30,
}

const RESOLUTION_X96 = 1n << 96n;
const MAX_UINT_128 = BigNumber.from(2).pow(128).sub(1);
const MIN_BOUNDARY = -527400;
const MAX_BOUNDARY = 443635;
const MIN_RATIO = 989314n;
const MAX_RATIO = 1461300573427867316570072651998408279850435624081n;

async function createGridAndInitialize(
    gridFactory: GridFactory,
    tokenA: PromiseOrValue<string>,
    tokenB: PromiseOrValue<string>,
    resolution: PromiseOrValue<number>,
    priceX96: PromiseOrValue<BigNumberish>
): Promise<Grid> {
    await expect(gridFactory.createGrid(tokenA, tokenB, resolution)).to.emit(gridFactory, "GridCreated");
    const gridAddress = await gridFactory.grids(tokenA, tokenB, resolution);
    expect(gridAddress).to.equal(await computeAddress(gridFactory.address, tokenA, tokenB, resolution));

    const grid = (await ethers.getContractAt("Grid", gridAddress)) as Grid;
    await grid.initialize(priceX96);

    return grid;
}

export function encodePrice(reserve1: BigNumberish, reserve0: BigNumberish): BigNumber {
    return BigNumber.from(reserve1).shl(96).div(reserve0);
}

export function encodePriceWithBaseAndQuote(
    base: string,
    baseReserve1: BigNumberish,
    quote: string,
    quoteReserve0: BigNumberish
): BigNumber {
    const token0 = base.toLowerCase() < quote.toLowerCase() ? base : quote;
    if (token0 == base) {
        return encodePrice(quoteReserve0, baseReserve1);
    }
    return encodePrice(baseReserve1, quoteReserve0);
}

function position(boundary: number, resolution: number) {
    boundary = boundary / resolution;
    return [boundary >> 8, boundary % 256];
}

async function expectBoundaryInitialized(
    grid: Grid,
    zero: boolean,
    boundary: number,
    resolution: number,
    initialized: boolean
): Promise<boolean> {
    const [wordPos, bitPos] = position(boundary, resolution);
    const word = await (zero ? grid.boundaryBitmaps0(wordPos) : grid.boundaryBitmaps1(wordPos));
    const masked = (1n << BigInt(bitPos)) & word.toBigInt();
    return initialized ? masked == 1n << BigInt(bitPos) : masked == 0n;
}

async function formatBoundaryToBoundaryLower(boundary: PromiseOrValue<number>, resolution: number): Promise<number> {
    const boundaryValue = await boundary;
    const remainder = boundaryValue % resolution;
    let boundaryLower = boundaryValue - remainder;
    boundaryLower = remainder >= 0 ? boundaryLower : boundaryLower - resolution;
    return boundaryLower;
}

export {
    RESOLUTION_X96,
    MAX_UINT_128,
    MIN_BOUNDARY,
    MAX_BOUNDARY,
    MIN_RATIO,
    MAX_RATIO,
    Resolution,
    createGridAndInitialize,
    position,
    expectBoundaryInitialized,
    formatBoundaryToBoundaryLower,
};
