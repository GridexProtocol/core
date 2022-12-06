// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

library FixedPointX192 {
    uint256 internal constant RESOLUTION = 1 << 192;
    uint256 internal constant Q = 0x1000000000000000000000000000000000000000000000000;
}
