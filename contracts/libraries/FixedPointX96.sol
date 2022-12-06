// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

library FixedPointX96 {
    uint160 internal constant RESOLUTION = 1 << 96;
    uint160 internal constant Q = 0x1000000000000000000000000;
    uint160 internal constant Q_2 = 0x2000000000000000000000000;
}
