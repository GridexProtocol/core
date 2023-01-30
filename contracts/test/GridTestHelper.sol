// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "../interfaces/callback/IGridPlaceMakerOrderCallback.sol";
import "../interfaces/callback/IGridSwapCallback.sol";
import "../interfaces/IGrid.sol";
import "../interfaces/IGridParameters.sol";
import "./AbstractPayFacade.sol";
import "../libraries/GridAddress.sol";
import "../libraries/CallbackValidator.sol";
import "../libraries/BoundaryMath.sol";

contract GridTestHelper is IGridPlaceMakerOrderCallback, IGridSwapCallback, AbstractPayFacade, Context {
    uint256 public gasUsed;

    constructor(address _gridFactory, address _weth9) AbstractPayFacade(_gridFactory, _weth9) {}

    struct PlaceMakerOrderCalldata {
        GridAddress.GridKey gridKey;
        address payer;
    }

    function gridexPlaceMakerOrderCallback(uint256 amount0, uint256 amount1, bytes calldata data) external {
        PlaceMakerOrderCalldata memory decodeData = abi.decode(data, (PlaceMakerOrderCalldata));
        CallbackValidator.validate(gridFactory, decodeData.gridKey);

        if (amount0 > 0) {
            pay(decodeData.gridKey.token0, decodeData.payer, _msgSender(), amount0);
        }

        if (amount1 > 0) {
            pay(decodeData.gridKey.token1, decodeData.payer, _msgSender(), amount1);
        }
    }

    struct InitializeParameters {
        address tokenA;
        address tokenB;
        int24 resolution;
        uint160 priceX96;
        address recipient;
        IGridParameters.BoundaryLowerWithAmountParameters[] orders0;
        IGridParameters.BoundaryLowerWithAmountParameters[] orders1;
    }

    function initialize(InitializeParameters calldata parameters) external payable {
        uint256 gasBefore = gasleft();

        GridAddress.GridKey memory gridKey = GridAddress.gridKey(
            parameters.tokenA,
            parameters.tokenB,
            parameters.resolution
        );

        IGrid grid = IGrid(GridAddress.computeAddress(gridFactory, gridKey));
        grid.initialize(
            IGridParameters.InitializeParameters({
                priceX96: parameters.priceX96,
                recipient: parameters.recipient,
                orders0: parameters.orders0,
                orders1: parameters.orders1
            }),
            abi.encode(PlaceMakerOrderCalldata(gridKey, _msgSender()))
        );

        gasUsed = gasBefore - gasleft();
    }

    struct PlaceMakerOrderParameters {
        address tokenA;
        address tokenB;
        int24 resolution;
        address recipient;
        bool zero;
        int24 boundaryLower;
        uint128 amount;
    }

    function placeMakerOrder(PlaceMakerOrderParameters calldata parameters) external payable {
        uint256 gasBefore = gasleft();

        GridAddress.GridKey memory gridKey = GridAddress.gridKey(
            parameters.tokenA,
            parameters.tokenB,
            parameters.resolution
        );

        IGrid grid = IGrid(GridAddress.computeAddress(gridFactory, gridKey));
        address recipient = parameters.recipient == address(0) ? _msgSender() : parameters.recipient;
        grid.placeMakerOrder(
            IGridParameters.PlaceOrderParameters({
                recipient: recipient,
                zero: parameters.zero,
                boundaryLower: parameters.boundaryLower,
                amount: parameters.amount
            }),
            abi.encode(PlaceMakerOrderCalldata(gridKey, _msgSender()))
        );

        gasUsed = gasBefore - gasleft();
    }

    struct PlaceOrderInBatchParameters {
        address tokenA;
        address tokenB;
        int24 resolution;
        address recipient;
        bool zero;
        IGridParameters.BoundaryLowerWithAmountParameters[] orders;
    }

    function placeMakerOrderInBatch(PlaceOrderInBatchParameters calldata parameters) external payable {
        uint256 gasBefore = gasleft();

        GridAddress.GridKey memory gridKey = GridAddress.gridKey(
            parameters.tokenA,
            parameters.tokenB,
            parameters.resolution
        );

        IGrid grid = IGrid(GridAddress.computeAddress(gridFactory, gridKey));
        address recipient = parameters.recipient == address(0) ? _msgSender() : parameters.recipient;
        grid.placeMakerOrderInBatch(
            IGridParameters.PlaceOrderInBatchParameters({
                recipient: recipient,
                zero: parameters.zero,
                orders: parameters.orders
            }),
            abi.encode(PlaceMakerOrderCalldata(gridKey, _msgSender()))
        );

        gasUsed = gasBefore - gasleft();
    }

    struct SwapCalldata {
        GridAddress.GridKey gridKey;
        address payer;
    }

    function gridexSwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        require(amount0Delta > 0 || amount1Delta > 0, "amount0Delta or amount1Delta must be positive");

        SwapCalldata memory decodeData = abi.decode(data, (SwapCalldata));
        CallbackValidator.validate(gridFactory, decodeData.gridKey);

        if (amount0Delta > 0) {
            pay(decodeData.gridKey.token0, decodeData.payer, _msgSender(), uint256(amount0Delta));
        }
        if (amount1Delta > 0) {
            pay(decodeData.gridKey.token1, decodeData.payer, _msgSender(), uint256(amount1Delta));
        }
    }

    struct ExactInputParameters {
        address tokenIn;
        address tokenOut;
        int24 resolution;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 priceLimitX96;
    }

    function exactInput(ExactInputParameters calldata parameters) external payable {
        uint256 gasBefore = gasleft();

        GridAddress.GridKey memory gridKey = GridAddress.gridKey(
            parameters.tokenIn,
            parameters.tokenOut,
            parameters.resolution
        );

        IGrid grid = IGrid(GridAddress.computeAddress(gridFactory, gridKey));
        bool zeroForOne = parameters.tokenIn < parameters.tokenOut;
        // allow swapping to the router address with address 0
        address recipient = parameters.recipient == address(0) ? address(this) : parameters.recipient;
        (int256 amount0, int256 amount1) = grid.swap(
            recipient,
            zeroForOne,
            int256(parameters.amountIn),
            parameters.priceLimitX96 == 0
                ? (zeroForOne ? BoundaryMath.MIN_RATIO : BoundaryMath.MAX_RATIO)
                : parameters.priceLimitX96,
            abi.encode(SwapCalldata(gridKey, _msgSender()))
        );

        if (zeroForOne) {
            require(amount1 * -1 >= int256(parameters.amountOutMinimum), "amountOutMinimum not reached");
        } else {
            require(amount0 * -1 >= int256(parameters.amountOutMinimum), "amountOutMinimum not reached");
        }

        gasUsed = gasBefore - gasleft();
    }

    struct ExactOutputParameters {
        address tokenIn;
        address tokenOut;
        int24 resolution;
        address recipient;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 priceLimitX96;
    }

    function exactOutput(ExactOutputParameters calldata parameters) external payable {
        uint256 gasBefore = gasleft();

        GridAddress.GridKey memory gridKey = GridAddress.gridKey(
            parameters.tokenIn,
            parameters.tokenOut,
            parameters.resolution
        );

        IGrid grid = IGrid(GridAddress.computeAddress(gridFactory, gridKey));
        bool zeroForOne = parameters.tokenIn < parameters.tokenOut;
        // allow swapping to the router address with address 0
        address recipient = parameters.recipient == address(0) ? address(this) : parameters.recipient;
        (int256 amount0, int256 amount1) = grid.swap(
            recipient,
            zeroForOne,
            int256(parameters.amountOut) * -1,
            parameters.priceLimitX96 == 0
                ? (zeroForOne ? BoundaryMath.MIN_RATIO : BoundaryMath.MAX_RATIO)
                : parameters.priceLimitX96,
            abi.encode(SwapCalldata(gridKey, _msgSender()))
        );

        if (zeroForOne) {
            require(amount0 <= int256(parameters.amountInMaximum), "amountInMaximum exceeded");
        } else {
            require(amount1 <= int256(parameters.amountInMaximum), "amountInMaximum exceeded");
        }

        gasUsed = gasBefore - gasleft();
    }
}
