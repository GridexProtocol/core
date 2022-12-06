// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/FeeMath.sol";

contract FeeMathTest {
    function computeFees(
        uint128 takerFeeAmount,
        int24 takerFeePips,
        int24 makerFeePips
    ) external pure returns (uint128 takerFeeForMakerAmount, uint128 takerFeeForProtocolAmount) {
        return FeeMath.computeFees(takerFeeAmount, takerFeePips, makerFeePips);
    }
}
