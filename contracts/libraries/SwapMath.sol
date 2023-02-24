// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "./Uint128Math.sol";
import "./FixedPointX96.sol";
import "./FixedPointX192.sol";

library SwapMath {
    using SafeCast for uint256;

    struct ComputeSwapStep {
        /// @dev The price after swapping the amount in/out
        uint160 priceNextX96;
        /// @dev The amount to be swapped in, of either token0 or token1, based on the direction of the swap
        uint256 amountIn;
        /// @dev The amount to be swapped out, of either token0 or token1, based on the direction of the swap
        uint128 amountOut;
        /// @dev The amount of fees paid by the taker
        uint128 feeAmount;
    }

    /// @notice Calculates the result of the swap through the given boundary parameters
    /// @param priceCurrentX96 The current price of the grid, as a Q64.96
    /// @param boundaryPriceX96 It is the upper boundary price when using token1 to exchange for token0.
    /// Otherwise, it is the lower boundary price, as a Q64.96
    /// @param priceLimitX96 The price limit of the swap, as a Q64.96
    /// @param amountRemaining The remaining amount to be swapped in (positive) or swapped out (negative)
    /// @param makerAmount The remaining amount of token0 or token1 that can be swapped out from the makers
    /// @param takerFeePips The taker fee, denominated in hundredths of a bip (i.e. 1e-6)
    /// @return step The result of the swap step
    function computeSwapStep(
        uint160 priceCurrentX96,
        uint160 boundaryPriceX96,
        uint160 priceLimitX96,
        int256 amountRemaining,
        uint128 makerAmount,
        int24 takerFeePips
    ) internal pure returns (ComputeSwapStep memory step) {
        if (amountRemaining > 0) {
            return
                computeSwapStepForExactIn(
                    priceCurrentX96,
                    boundaryPriceX96,
                    priceLimitX96,
                    uint256(amountRemaining),
                    makerAmount,
                    takerFeePips
                );
        } else {
            uint256 absAmountRemaining;
            unchecked {
                absAmountRemaining = uint256(-amountRemaining);
            }
            return
                computeSwapStepForExactOut(
                    priceCurrentX96,
                    boundaryPriceX96,
                    priceLimitX96,
                    // The converted value will not overflow. The maximum amount of liquidity
                    // allowed in each boundary is less than or equal to uint128.
                    absAmountRemaining > makerAmount ? makerAmount : uint128(absAmountRemaining),
                    makerAmount,
                    takerFeePips
                );
        }
    }

    function computeSwapStepForExactIn(
        uint160 priceCurrentX96,
        uint160 boundaryPriceX96,
        uint160 priceLimitX96,
        uint256 takerAmountInRemaining,
        uint128 makerAmount,
        int24 takerFeePips
    ) internal pure returns (ComputeSwapStep memory step) {
        if (!_priceInRange(priceCurrentX96, boundaryPriceX96, priceLimitX96)) {
            return
                _computeSwapStepForExactIn(
                    priceCurrentX96,
                    boundaryPriceX96,
                    takerAmountInRemaining,
                    makerAmount,
                    takerFeePips
                );
        } else {
            step.amountOut = _computeAmountOutForPriceLimit(
                priceCurrentX96,
                boundaryPriceX96,
                priceLimitX96,
                makerAmount
            );

            step = _computeSwapStepForExactOut(
                priceCurrentX96,
                boundaryPriceX96,
                step.amountOut,
                makerAmount,
                takerFeePips
            );
            return
                step.amountIn + step.feeAmount > takerAmountInRemaining // the remaining amount in is not enough to reach the limit price
                    ? _computeSwapStepForExactIn(
                        priceCurrentX96,
                        boundaryPriceX96,
                        takerAmountInRemaining,
                        makerAmount,
                        takerFeePips
                    )
                    : step;
        }
    }

    function _computeSwapStepForExactIn(
        uint160 priceCurrentX96,
        uint160 boundaryPriceX96,
        uint256 takerAmountInRemaining,
        uint128 makerAmount,
        int24 takerFeePips
    ) private pure returns (ComputeSwapStep memory step) {
        bool zeroForOne = priceCurrentX96 >= boundaryPriceX96;

        uint256 takerAmountInWithoutFee = Math.mulDiv(takerAmountInRemaining, 1e6 - uint256(uint24(takerFeePips)), 1e6);

        uint160 priceDeltaX96;
        unchecked {
            priceDeltaX96 = zeroForOne ? priceCurrentX96 - boundaryPriceX96 : boundaryPriceX96 - priceCurrentX96;
        }

        uint256 amountOut;
        if (zeroForOne) {
            // (2 * takerAmountIn * priceCurrent) / (2 - (priceMax - priceCurrent) * takerAmountIn / makerAmount)
            uint256 numerator = 2 * takerAmountInWithoutFee * priceCurrentX96;

            uint256 denominator = Math.mulDiv(
                priceDeltaX96,
                takerAmountInWithoutFee,
                makerAmount,
                Math.Rounding.Up // round up
            );

            amountOut = numerator / (FixedPointX96.Q_2 + denominator);
        } else {
            // ((2 * takerAmountIn * (1/priceCurrent) / (2 - (1/priceMax - 1/priceCurrent) * takerAmountIn / makerAmount))
            // Specifically divide first, then multiply to ensure that the amountOut is smaller
            uint256 numerator = 2 * takerAmountInWithoutFee * (FixedPointX192.Q / priceCurrentX96);

            uint256 reversePriceDeltaX96 = Math.ceilDiv(
                FixedPointX192.Q,
                priceCurrentX96 // round up
            ) - (FixedPointX192.Q / boundaryPriceX96);
            uint256 denominator = Math.mulDiv(
                reversePriceDeltaX96,
                takerAmountInWithoutFee,
                makerAmount,
                Math.Rounding.Up // round up
            );
            amountOut = numerator / (FixedPointX96.Q_2 + denominator);
        }

        if (amountOut > makerAmount) {
            step.priceNextX96 = boundaryPriceX96;
            step.amountOut = makerAmount;
            (step.amountIn, step.feeAmount) = _computeAmountInAndFeeAmount(
                zeroForOne,
                priceCurrentX96,
                boundaryPriceX96,
                makerAmount,
                Math.Rounding.Down,
                takerFeePips
            );
        } else {
            step.amountOut = amountOut.toUint128();
            step.priceNextX96 = _computePriceNextX96(
                zeroForOne,
                priceCurrentX96,
                priceDeltaX96,
                step.amountOut,
                makerAmount
            );
            step.amountIn = takerAmountInWithoutFee;
            unchecked {
                step.feeAmount = (takerAmountInRemaining - takerAmountInWithoutFee).toUint128();
            }
        }
    }

    function computeSwapStepForExactOut(
        uint160 priceCurrentX96,
        uint160 boundaryPriceX96,
        uint160 priceLimitX96,
        uint128 takerAmountOutRemaining,
        uint128 makerAmount,
        int24 takerFeePips
    ) internal pure returns (ComputeSwapStep memory step) {
        // if the limit price is not within the range, it will be calculated directly
        if (!_priceInRange(priceCurrentX96, boundaryPriceX96, priceLimitX96)) {
            return
                _computeSwapStepForExactOut(
                    priceCurrentX96,
                    boundaryPriceX96,
                    takerAmountOutRemaining,
                    makerAmount,
                    takerFeePips
                );
        }

        // otherwise calculate the new takerAmountRemaining value
        uint128 availableAmountOut = _computeAmountOutForPriceLimit(
            priceCurrentX96,
            boundaryPriceX96,
            priceLimitX96,
            makerAmount
        );

        return
            _computeSwapStepForExactOut(
                priceCurrentX96,
                boundaryPriceX96,
                Uint128Math.minUint128(availableAmountOut, takerAmountOutRemaining),
                makerAmount,
                takerFeePips
            );
    }

    /// @dev Checks if the price limit is within the range
    /// @param priceCurrentX96 The current price of the grid, as a Q64.96
    /// @param boundaryPriceX96 It is the upper boundary price when using token1 to exchange for token0.
    /// Otherwise, it is the lower boundary price, as a Q64.96
    /// @param priceLimitX96 The price limit of the swap, as a Q64.96
    /// @return True if the price limit is within the range
    function _priceInRange(
        uint160 priceCurrentX96,
        uint160 boundaryPriceX96,
        uint160 priceLimitX96
    ) private pure returns (bool) {
        return
            priceCurrentX96 >= boundaryPriceX96
                ? (priceLimitX96 > boundaryPriceX96 && priceLimitX96 <= priceCurrentX96)
                : (priceLimitX96 >= priceCurrentX96 && priceLimitX96 < boundaryPriceX96);
    }

    function _computeSwapStepForExactOut(
        uint160 priceCurrentX96,
        uint160 boundaryPriceX96,
        uint128 takerAmountOutRemaining,
        uint128 makerAmount,
        int24 takerFeePips
    ) private pure returns (ComputeSwapStep memory step) {
        bool zeroForOne = priceCurrentX96 >= boundaryPriceX96;

        uint160 priceDeltaX96;
        Math.Rounding priceNextRounding;
        unchecked {
            (priceDeltaX96, priceNextRounding) = zeroForOne
                ? (priceCurrentX96 - boundaryPriceX96, Math.Rounding.Down)
                : (boundaryPriceX96 - priceCurrentX96, Math.Rounding.Up);
        }

        step.priceNextX96 = _computePriceNextX96(
            zeroForOne,
            priceCurrentX96,
            priceDeltaX96,
            takerAmountOutRemaining,
            makerAmount
        );

        (step.amountIn, step.feeAmount) = _computeAmountInAndFeeAmount(
            zeroForOne,
            priceCurrentX96,
            step.priceNextX96,
            takerAmountOutRemaining,
            priceNextRounding,
            takerFeePips
        );
        step.amountOut = takerAmountOutRemaining;
    }

    function _computePriceNextX96(
        bool zeroForOne,
        uint160 priceCurrentX96,
        uint160 priceDeltaX96,
        uint160 takerAmountOut,
        uint128 makerAmount
    ) private pure returns (uint160) {
        uint256 priceDeltaX96WithRate = Math.mulDiv(priceDeltaX96, takerAmountOut, makerAmount, Math.Rounding.Up);
        unchecked {
            return
                zeroForOne
                    ? (priceCurrentX96 - priceDeltaX96WithRate).toUint160()
                    : (priceCurrentX96 + priceDeltaX96WithRate).toUint160();
        }
    }

    function _computeAmountInAndFeeAmount(
        bool zeroForOne,
        uint160 priceCurrentX96,
        uint160 priceNextX96,
        uint128 amountOut,
        Math.Rounding priceNextRounding,
        int24 takerFeePips
    ) private pure returns (uint256 amountIn, uint128 feeAmount) {
        uint160 priceAvgX96;
        unchecked {
            uint256 priceAccumulateX96 = uint256(priceCurrentX96) + priceNextX96;
            priceAccumulateX96 = priceNextRounding == Math.Rounding.Up ? priceAccumulateX96 + 1 : priceAccumulateX96;
            priceAvgX96 = uint160(priceAccumulateX96 >> 1);
        }

        amountIn = zeroForOne
            ? Math.mulDiv(amountOut, FixedPointX96.Q, priceAvgX96, Math.Rounding.Up)
            : Math.mulDiv(priceAvgX96, amountOut, FixedPointX96.Q, Math.Rounding.Up);

        // feeAmount = amountIn * takerFeePips / (1e6 - takerFeePips)
        feeAmount = Math
            .mulDiv(uint24(takerFeePips), amountIn, 1e6 - uint24(takerFeePips), Math.Rounding.Up)
            .toUint128();
    }

    function _computeAmountOutForPriceLimit(
        uint160 priceCurrentX96,
        uint160 boundaryPriceX96,
        uint160 priceLimitX96,
        uint128 makerAmount
    ) private pure returns (uint128 availableAmountOut) {
        uint160 priceLimitDeltaX96;
        uint160 priceMaxDeltaX96;
        unchecked {
            (priceLimitDeltaX96, priceMaxDeltaX96) = priceLimitX96 >= priceCurrentX96
                ? (priceLimitX96 - priceCurrentX96, boundaryPriceX96 - priceCurrentX96)
                : (priceCurrentX96 - priceLimitX96, priceCurrentX96 - boundaryPriceX96);
        }

        uint256 tempX96 = _divUpForPriceX96(priceLimitDeltaX96, priceMaxDeltaX96);
        availableAmountOut = Math.mulDiv(tempX96, makerAmount, FixedPointX96.Q, Math.Rounding.Up).toUint128();
    }

    function _divUpForPriceX96(uint160 aX96, uint160 bX96) private pure returns (uint256) {
        if (aX96 == 0) {
            return 0;
        }
        unchecked {
            // never overflows
            uint256 tempX96 = uint256(aX96) * FixedPointX96.Q;
            // (a + b - 1) / b can overflow on addition, so we distribute
            return (tempX96 - 1) / bX96 + 1;
        }
    }
}
