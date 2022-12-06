// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Test is ERC20 {
    uint8 private _decimals;

    receive() external payable {}

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;

        _mint(_msgSender(), initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}

contract NonStandardERC20 is ERC20 {
    constructor() ERC20("NonStandardERC20", "NonStandardERC20") {
        _mint(_msgSender(), 1e8 << 18);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 tax = 1;
        _transfer(from, to, amount - tax);
        return true;
    }
}
