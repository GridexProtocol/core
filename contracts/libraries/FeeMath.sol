// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

library FeeMath {
    using SafeCast for uint256;

    /// @notice Computes the fees
    /// @param takerFeeAmount The amount of the input that will be taken as a taker fee
    /// @param takerFeePips The fee taken from the input amount, expressed in hundredths of a bip
    /// @param makerFeePips The fee taken from the taker fee amount (makerFeePips < 0)
    /// @return takerFeeForMakerAmount The amount of the taker fee paid to the maker (makerFeePips < 0)
    /// @return takerFeeForProtocolAmount The amount of the taker fee paid to the protocol
    function computeFees(
        uint128 takerFeeAmount,
        int24 takerFeePips,
        int24 makerFeePips
    ) internal pure returns (uint128 takerFeeForMakerAmount, uint128 takerFeeForProtocolAmount) {
        uint24 makerFeePipsAbs = uint24(-makerFeePips);
        takerFeeForMakerAmount = uint128(uint256(takerFeeAmount) * makerFeePipsAbs / uint24(takerFeePips));
        unchecked {
            takerFeeForProtocolAmount = takerFeeAmount - takerFeeForMakerAmount;
        }
    }
}
