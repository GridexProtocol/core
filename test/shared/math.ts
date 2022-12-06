import {BigNumber, BigNumberish} from "ethers";

export enum Rounding {
    Down,
    Up,
}

export function mulDiv(x: BigNumberish, y: BigNumberish, denominator: BigNumberish, rounding?: Rounding): BigNumberish {
    const numerator = BigNumber.from(x).mul(y);
    const result = numerator.div(denominator);
    if (rounding == Rounding.Down || rounding == undefined) {
        return result;
    }
    const remainder = numerator.mod(denominator);
    return remainder.isZero() ? result : result.add(1);
}
