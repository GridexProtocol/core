// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../interfaces/IGridStructs.sol";
import "../interfaces/IGridParameters.sol";
import "../libraries/BundleMath.sol";

contract BundleMathTest {
    IGridStructs.Bundle public bundle;

    // remove liquidity
    uint128 public makerAmountOut;
    uint128 public takerAmountOut;
    uint128 public takerFeeAmountOut;

    // update for taker
    IGridParameters.UpdateBundleForTakerParameters public parameters;

    function setBundle(IGridStructs.Bundle calldata _bundle) external {
        bundle = IGridStructs.Bundle({
            boundaryLower: _bundle.boundaryLower,
            zero: _bundle.zero,
            makerAmountTotal: _bundle.makerAmountTotal,
            makerAmountRemaining: _bundle.makerAmountRemaining,
            takerAmountRemaining: _bundle.takerAmountRemaining,
            takerFeeAmountRemaining: _bundle.takerFeeAmountRemaining
        });
    }

    function addLiquidity(uint128 makerAmount) external {
        BundleMath.addLiquidity(bundle, makerAmount);
    }

    function removeLiquidity(uint128 makerAmountRaw) external {
        (makerAmountOut, takerAmountOut, takerFeeAmountOut, ) = BundleMath.removeLiquidity(bundle, makerAmountRaw);
    }

    function updateForTaker(uint256 amountIn, uint128 amountOut, uint128 takerFeeForMakerAmount) external {
        IGridParameters.UpdateBundleForTakerParameters memory _parameters = BundleMath.updateForTaker(
            bundle,
            amountIn,
            amountOut,
            takerFeeForMakerAmount
        );
        parameters = IGridParameters.UpdateBundleForTakerParameters({
            amountInUsed: _parameters.amountInUsed,
            amountInRemaining: _parameters.amountInRemaining,
            amountOutUsed: _parameters.amountOutUsed,
            amountOutRemaining: _parameters.amountOutRemaining,
            takerFeeForMakerAmountUsed: _parameters.takerFeeForMakerAmountUsed,
            takerFeeForMakerAmountRemaining: _parameters.takerFeeForMakerAmountRemaining
        });
    }
}
