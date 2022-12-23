// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

library Uint128Math {
    /// @dev Returns the minimum of the two values
    /// @param a The first value
    /// @param b The second value
    /// @return min The minimum of the two values
    function minUint128(uint128 a, uint128 b) internal pure returns (uint128 min) {
        return a < b ? a : b;
    }

    /// @dev Returns the maximum of the two values
    /// @param a The first value
    /// @param b The second value
    /// @return max The maximum of the two values
    function maxUint128(uint128 a, uint128 b) internal pure returns (uint128 max) {
        return a > b ? a : b;
    }
}
