// @ts-ignore
import {bytecode} from "../../artifacts/contracts/Grid.sol/Grid.json";
import {utils} from "ethers";
import {PromiseOrValue} from "../../typechain-types/common";

export const GRID_BYTES_CODE_HASH = utils.keccak256(bytecode);

export async function computeAddress(
    factoryAddress: PromiseOrValue<string>,
    tokenA: PromiseOrValue<string>,
    tokenB: PromiseOrValue<string>,
    resolution: PromiseOrValue<number>
): Promise<string> {
    const {token0, token1} = await sortedToken(tokenA, tokenB);
    const encodedValue = utils.defaultAbiCoder.encode(["address", "address", "int24"], [token0, token1, resolution]);
    return utils.getCreate2Address(await factoryAddress, utils.keccak256(encodedValue), GRID_BYTES_CODE_HASH);
}

export async function sortedToken(tokenA: PromiseOrValue<string>, tokenB: PromiseOrValue<string>) {
    const ta = await tokenA;
    const tb = await tokenB;
    const [token0, token1] = ta.toLowerCase() < tb.toLowerCase() ? [ta, tb] : [tb, ta];
    return {token0, token1};
}
