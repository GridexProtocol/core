// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "./AbstractPayFacade.sol";
import "../interfaces/IGrid.sol";
import "../interfaces/callback/IGridSwapCallback.sol";
import "../libraries/GridAddress.sol";
import "../libraries/CallbackValidator.sol";

contract SwapTest is IGridSwapCallback, AbstractPayFacade, Context {
    struct SwapCalldata {
        address tokenA;
        address tokenB;
        int24 resolution;
        address recipient;
        bool zeroForOne;
        int256 amountSpecified;
        uint160 priceLimitX96;
        address payer;
    }

    constructor(address _factory, address _weth9) AbstractPayFacade(_factory, _weth9) {}

    /// @inheritdoc IGridSwapCallback
    function gridexSwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata _data) external override {
        SwapCalldata memory decodeData = abi.decode(_data, (SwapCalldata));
        GridAddress.GridKey memory gridKey = GridAddress.gridKey(
            decodeData.tokenA,
            decodeData.tokenB,
            decodeData.resolution
        );
        CallbackValidator.validate(gridFactory, gridKey);
        if (amount0Delta > 0) {
            pay(gridKey.token0, decodeData.payer, _msgSender(), uint256(amount0Delta));
        }

        if (amount1Delta > 0) {
            pay(gridKey.token1, decodeData.payer, _msgSender(), uint256(amount1Delta));
        }
    }

    function output(SwapCalldata calldata data, uint256 times) external payable {
        GridAddress.GridKey memory gridKey = GridAddress.gridKey(data.tokenA, data.tokenB, data.resolution);
        IGrid grid = IGrid(GridAddress.computeAddress(gridFactory, gridKey));
        for (uint256 i = 0; i < times; ++i) {
            grid.swap(
                data.recipient,
                data.zeroForOne,
                data.amountSpecified,
                data.priceLimitX96,
                abi.encode(data)
            );
        }
    }

    function input(SwapCalldata calldata data) external payable {
        GridAddress.GridKey memory gridKey = GridAddress.gridKey(data.tokenA, data.tokenB, data.resolution);
        IGrid grid = IGrid(GridAddress.computeAddress(gridFactory, gridKey));
        grid.swap(
            data.recipient,
            data.zeroForOne,
            data.amountSpecified,
            data.priceLimitX96,
            abi.encode(data)
        );
    }
}
