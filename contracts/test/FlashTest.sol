// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/Context.sol";
import "./AbstractPayFacade.sol";
import "../interfaces/IGrid.sol";
import "../interfaces/callback/IGridFlashCallback.sol";
import "../libraries/GridAddress.sol";
import "../libraries/CallbackValidator.sol";

contract FlashTest is IGridFlashCallback, AbstractPayFacade, Context {
    struct FlashCalldata {
        address tokenA;
        address tokenB;
        int24 resolution;
        address recipient;
        address payer;
        uint256 amount0;
        uint256 amount1;
        bool payAmount0;
        bool payAmount1;
        bool payFee0;
        bool payFee1;
        bool payFeeMore;
    }

    uint256 public gasUsed;

    constructor(address _factory, address _weth9) AbstractPayFacade(_factory, _weth9) {}

    function gridexFlashCallback(uint128 fee0, uint128 fee1, bytes calldata data) external override {
        FlashCalldata memory decodeData = abi.decode(data, (FlashCalldata));
        GridAddress.GridKey memory gridKey = GridAddress.gridKey(
            decodeData.tokenA,
            decodeData.tokenB,
            decodeData.resolution
        );
        CallbackValidator.validate(gridFactory, gridKey);

        if (decodeData.payAmount0 && decodeData.amount0 > 0) {
            pay(gridKey.token0, decodeData.payer, _msgSender(), decodeData.amount0);
        }

        if (decodeData.payFee0 && fee0 > 0) {
            pay(gridKey.token0, decodeData.payer, _msgSender(), decodeData.payFeeMore ? fee0 * 2 : fee0);
        }

        if (decodeData.payAmount1 && decodeData.amount1 > 0) {
            pay(gridKey.token1, decodeData.payer, _msgSender(), decodeData.amount1);
        }

        if (decodeData.payFee1 && fee1 > 0) {
            pay(gridKey.token1, decodeData.payer, _msgSender(), decodeData.payFeeMore ? fee1 * 2 : fee1);
        }
    }

    function flash(FlashCalldata calldata data) external payable {
        GridAddress.GridKey memory gridKey = GridAddress.gridKey(data.tokenA, data.tokenB, data.resolution);
        uint256 gasBefore = gasleft();
        IGrid(GridAddress.computeAddress(gridFactory, gridKey)).flash(
            data.recipient,
            data.amount0,
            data.amount1,
            abi.encode(data)
        );
        gasUsed = gasBefore - gasleft();
    }
}
