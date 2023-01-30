import {BigNumber, BigNumberish} from "ethers";
import {PromiseOrValue} from "../../typechain-types/common";
import {Grid} from "../../typechain-types";

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
    return boundaryValue - (((boundaryValue % resolution) + resolution) % resolution);
}

export {
    RESOLUTION_X96,
    MAX_UINT_128,
    MIN_BOUNDARY,
    MAX_BOUNDARY,
    MIN_RATIO,
    MAX_RATIO,
    Resolution,
    position,
    expectBoundaryInitialized,
    formatBoundaryToBoundaryLower,
};
