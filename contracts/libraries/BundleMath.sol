// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "../interfaces/IGridStructs.sol";
import "../interfaces/IGridParameters.sol";
import "./FixedPointX128.sol";

library BundleMath {
    using SafeCast for uint256;

    /// @dev Updates for a taker
    /// @param self The bundle
    /// @param amountIn The amount of swapped in token by the taker
    /// @param amountOut The amount of swapped out token by the taker. If amountOut is greater than bundle balance, the difference is transferred to bundle1
    /// @param takerFeeForMakerAmount The fee paid by the taker(excluding the protocol fee). If amountOut is greater than bundle balance, the difference is transferred to bundle1
    function updateForTaker(
        IGridStructs.Bundle storage self,
        uint256 amountIn,
        uint128 amountOut,
        uint128 takerFeeForMakerAmount
    ) internal returns (IGridParameters.UpdateBundleForTakerParameters memory parameters) {
        uint128 makerAmountRemaining = self.makerAmountRemaining;
        // the amount out actually paid to the taker
        parameters.amountOutUsed = amountOut <= makerAmountRemaining ? amountOut : makerAmountRemaining;

        if (parameters.amountOutUsed == amountOut) {
            parameters.amountInUsed = amountIn;

            parameters.takerFeeForMakerAmountUsed = takerFeeForMakerAmount;
        } else {
            parameters.amountInUsed = parameters.amountOutUsed * amountIn / amountOut; // amountOutUsed * amountIn may overflow here
            unchecked {
                parameters.amountInRemaining = amountIn - parameters.amountInUsed;

                parameters.amountOutRemaining = amountOut - parameters.amountOutUsed;

                parameters.takerFeeForMakerAmountUsed = uint128(
                    (uint256(parameters.amountOutUsed) * takerFeeForMakerAmount) / amountOut
                );
                parameters.takerFeeForMakerAmountRemaining =
                    takerFeeForMakerAmount -
                    parameters.takerFeeForMakerAmountUsed;
            }
        }

        // updates maker amount remaining
        unchecked {
            self.makerAmountRemaining = makerAmountRemaining - parameters.amountOutUsed;
        }

        self.takerAmountRemaining = self.takerAmountRemaining + (parameters.amountInUsed).toUint128();

        self.takerFeeAmountRemaining = self.takerFeeAmountRemaining + parameters.takerFeeForMakerAmountUsed;
    }

    /// @notice Maker adds liquidity to the bundle
    /// @param self The bundle to be updated
    /// @param makerAmount The amount of token to be added to the bundle
    function addLiquidity(IGridStructs.Bundle storage self, uint128 makerAmount) internal {
        self.makerAmountTotal = self.makerAmountTotal + makerAmount;
        unchecked {
            self.makerAmountRemaining = self.makerAmountRemaining + makerAmount;
        }
    }

    /// @notice Maker adds liquidity to the bundle
    /// @param self The bundle to be updated
    /// @param makerAmountTotal The total amount of token that the maker has added to the bundle
    /// @param makerAmountRemaining The amount of token that the maker has not yet swapped
    /// @param makerAmount The amount of token to be added to the bundle
    function addLiquidityWithAmount(
        IGridStructs.Bundle storage self,
        uint128 makerAmountTotal,
        uint128 makerAmountRemaining,
        uint128 makerAmount
    ) internal {
        self.makerAmountTotal = makerAmountTotal + makerAmount;
        unchecked {
            self.makerAmountRemaining = makerAmountRemaining + makerAmount;
        }
    }

    /// @notice Maker removes liquidity from the bundle
    /// @param self The bundle to be updated
    /// @param makerAmountRaw The amount of liquidity added by the maker when placing an order
    /// @return makerAmountOut The amount of token0 or token1 that the maker will receive
    /// @return takerAmountOut The amount of token1 or token0 that the maker will receive
    /// @return takerFeeAmountOut The amount of fees that the maker will receive
    /// @return makerAmountTotalNew The remaining amount of liquidity added by the maker
    function removeLiquidity(
        IGridStructs.Bundle storage self,
        uint128 makerAmountRaw
    )
        internal
        returns (uint128 makerAmountOut, uint128 takerAmountOut, uint128 takerFeeAmountOut, uint128 makerAmountTotalNew)
    {
        uint128 makerAmountTotal = self.makerAmountTotal;
        uint128 makerAmountRemaining = self.makerAmountRemaining;
        uint128 takerAmountRemaining = self.takerAmountRemaining;
        uint128 takerFeeAmountRemaining = self.takerFeeAmountRemaining;

        unchecked {
            makerAmountTotalNew = makerAmountTotal - makerAmountRaw;
            self.makerAmountTotal = makerAmountTotalNew;

            // This calculation won't overflow because makerAmountRaw divided by
            // makerAmountTotal will always have a value between 0 and 1 (excluding 0), and
            // multiplying that by a uint128 value won't result in an overflow. So the
            // calculation is designed to work within the constraints of the data types being used,
            // without exceeding their maximum values.
            makerAmountOut = uint128((uint256(makerAmountRaw) * makerAmountRemaining) / makerAmountTotal);
            self.makerAmountRemaining = makerAmountRemaining - makerAmountOut;

            takerAmountOut = uint128((uint256(makerAmountRaw) * takerAmountRemaining) / makerAmountTotal);
            self.takerAmountRemaining = takerAmountRemaining - takerAmountOut;

            takerFeeAmountOut = uint128((uint256(makerAmountRaw) * takerFeeAmountRemaining) / makerAmountTotal);
            self.takerFeeAmountRemaining = takerFeeAmountRemaining - takerFeeAmountOut;
        }
    }
}
