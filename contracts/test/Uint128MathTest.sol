// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/Uint128Math.sol";

contract Uint128MathTest {
    function minUint128(uint128 a, uint128 b) external pure returns (uint160) {
        return Uint128Math.minUint128(a, b);
    }

    function maxUint128(uint128 a, uint128 b) external pure returns (uint160) {
        return Uint128Math.maxUint128(a, b);
    }
}
