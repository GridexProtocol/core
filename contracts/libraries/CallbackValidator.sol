// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./GridAddress.sol";

library CallbackValidator {
    function validate(address gridFactory, GridAddress.GridKey memory gridKey) internal view {
        // CV_IC: invalid caller
        require(GridAddress.computeAddress(gridFactory, gridKey) == msg.sender, "CV_IC");
    }
}
