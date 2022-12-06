// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/SwapMath.sol";

contract SwapMathTest {
    function computeSwapStep(
        uint160 priceCurrentX96,
        uint160 boundaryPriceX96,
        uint160 priceLimitX96,
        int256 amountRemaining,
        uint128 makerAmount,
        int24 takerFeePips
    ) external pure returns (SwapMath.ComputeSwapStep memory step) {
        return
            SwapMath.computeSwapStep(
                priceCurrentX96,
                boundaryPriceX96,
                priceLimitX96,
                amountRemaining,
                makerAmount,
                takerFeePips
            );
    }
}
