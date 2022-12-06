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
        unchecked {
            parameters.amountOutRemaining = amountOut - parameters.amountOutUsed;

            // updates maker amount remaining
            self.makerAmountRemaining = makerAmountRemaining - parameters.amountOutUsed;
        }

        // the amount in actually paid to the maker
        parameters.amountInUsed = Math.mulDiv(parameters.amountOutUsed, amountIn, amountOut);
        unchecked {
            parameters.amountInRemaining = amountIn - parameters.amountInUsed;
        }

        self.takerAmountRemaining = self.takerAmountRemaining + (parameters.amountInUsed).toUint128();

        // the fees actually paid by the taker to the maker
        parameters.takerFeeForMakerAmountUsed = Math
            .mulDiv(parameters.amountOutUsed, takerFeeForMakerAmount, amountOut)
            .toUint128();
        unchecked {
            parameters.takerFeeForMakerAmountRemaining = takerFeeForMakerAmount - parameters.takerFeeForMakerAmountUsed;
        }

        self.takerFeeAmountRemaining = self.takerFeeAmountRemaining + parameters.takerFeeForMakerAmountUsed;
    }

    /// @notice Maker adds liquidity to the bundle
    function addLiquidity(IGridStructs.Bundle storage self, uint128 makerAmount) internal {
        self.makerAmountTotal = self.makerAmountTotal + makerAmount;
        unchecked {
            self.makerAmountRemaining = self.makerAmountRemaining + makerAmount;
        }
    }

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
    /// @param self The bundle
    /// @param makerAmountRaw The amount of liquidity added by the maker when placing an order
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

        makerAmountOut = Math.mulDiv(makerAmountRaw, makerAmountRemaining, makerAmountTotal).toUint128();

        takerAmountOut = Math.mulDiv(makerAmountRaw, takerAmountRemaining, makerAmountTotal).toUint128();
        takerFeeAmountOut = Math.mulDiv(makerAmountRaw, takerFeeAmountRemaining, makerAmountTotal).toUint128();

        makerAmountTotalNew = makerAmountTotal - makerAmountRaw;
        self.makerAmountTotal = makerAmountTotalNew;

        unchecked {
            self.makerAmountRemaining = makerAmountRemaining - makerAmountOut;

            self.takerAmountRemaining = takerAmountRemaining - takerAmountOut;

            self.takerFeeAmountRemaining = takerFeeAmountRemaining - takerFeeAmountOut;
        }
    }
}
