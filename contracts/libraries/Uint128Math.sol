// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

library Uint128Math {
    function minUint128(uint128 a, uint128 b) internal pure returns (uint128 min) {
        return a < b ? a : b;
    }

    function maxUint128(uint128 a, uint128 b) internal pure returns (uint128 max) {
        return a > b ? a : b;
    }
}
