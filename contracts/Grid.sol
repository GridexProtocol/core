// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.9;
pragma abicoder v2;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IGrid.sol";
import "./interfaces/IWETHMinimum.sol";
import "./interfaces/callback/IGridSwapCallback.sol";
import "./interfaces/callback/IGridPlaceMakerOrderCallback.sol";
import "./interfaces/callback/IGridFlashCallback.sol";
import "./interfaces/IGridEvents.sol";
import "./interfaces/IGridStructs.sol";
import "./interfaces/IGridParameters.sol";
import "./interfaces/IGridDeployer.sol";
import "./interfaces/IPriceOracle.sol";
import "./libraries/BoundaryMath.sol";
import "./libraries/BoundaryBitmap.sol";
import "./libraries/BundleMath.sol";
import "./libraries/Uint128Math.sol";
import "./libraries/Uint160Math.sol";
import "./libraries/SwapMath.sol";

/// @title The implementation of a Gridex grid
contract Grid is IGrid, IGridStructs, IGridEvents, IGridParameters, Context {
    using SafeCast for uint256;
    using BoundaryBitmap for mapping(int16 => uint256);
    using BundleMath for Bundle;

    address public immutable override token0;
    address public immutable override token1;
    int24 public immutable override resolution;

    address private immutable weth9;
    address private immutable priceOracle;

    int24 public immutable takerFee;

    Slot0 public override slot0;

    mapping(int24 => Boundary) public override boundaries0;
    mapping(int24 => Boundary) public override boundaries1;
    mapping(int16 => uint256) public override boundaryBitmaps0;
    mapping(int16 => uint256) public override boundaryBitmaps1;

    uint256 private _orderId;
    mapping(uint256 => Order) public override orders;

    uint64 private _bundleId;
    mapping(uint64 => Bundle) public override bundles;

    mapping(address => TokensOwed) public override tokensOweds;

    /// @dev Used to receive Ether when settling and collecting orders
    receive() external payable {}

    constructor() {
        (token0, token1, resolution, takerFee, priceOracle, weth9) = IGridDeployer(_msgSender()).parameters();
    }

    modifier lock() {
        // G_PL: Grid locked
        require(slot0.unlocked, "G_GL");
        slot0.unlocked = false;
        _;
        slot0.unlocked = true;
    }

    /// @inheritdoc IGrid
    function initialize(
        InitializeParameters memory parameters,
        bytes calldata data
    ) external override returns (uint256[] memory orderIds0, uint256[] memory orderIds1) {
        // G_GAI: grid already initialized
        require(slot0.priceX96 == 0, "G_GAI");
        // G_POR: price out of range
        require(BoundaryMath.isPriceX96InRange(parameters.priceX96), "G_POR");
        // G_T0OE: token0 orders must be non-empty
        require(parameters.orders0.length > 0, "G_ONE");
        // G_T1OE: token1 orders must be non-empty
        require(parameters.orders1.length > 0, "G_ONE");

        IPriceOracle(priceOracle).register(token0, token1, resolution);

        int24 boundary = BoundaryMath.getBoundaryAtPriceX96(parameters.priceX96);
        slot0 = Slot0({
            priceX96: parameters.priceX96,
            boundary: boundary,
            blockTimestamp: uint32(block.timestamp),
            unlocked: false // still keep the grid locked to prevent reentrancy
        });
        // emits an Initialize event before placing orders
        emit Initialize(parameters.priceX96, boundary);

        // places orders for token0 and token1
        uint256 amount0Total;
        (orderIds0, amount0Total) = _placeMakerOrderInBatch(parameters.recipient, true, parameters.orders0);
        uint256 amount1Total;
        (orderIds1, amount1Total) = _placeMakerOrderInBatch(parameters.recipient, false, parameters.orders1);
        (uint256 balance0Before, uint256 balance1Before) = (_balance0(), _balance1());

        IGridPlaceMakerOrderCallback(_msgSender()).gridexPlaceMakerOrderCallback(amount0Total, amount1Total, data);

        (uint256 balance0After, uint256 balance1After) = (_balance0(), _balance1());
        // G_TPF: token pay failed
        require(
            balance0After - balance0Before >= amount0Total && balance1After - balance1Before >= amount1Total,
            "G_TPF"
        );

        slot0.unlocked = true;
    }

    /// @inheritdoc IGrid
    function placeMakerOrder(
        PlaceOrderParameters memory parameters,
        bytes calldata data
    ) external override lock returns (uint256 orderId) {
        orderId = _nextOrderId();

        _processPlaceOrder(orderId, parameters.recipient, parameters.zero, parameters.boundaryLower, parameters.amount);

        _processPlaceOrderReceiveAndCallback(parameters.zero, parameters.amount, data);
    }

    /// @inheritdoc IGrid
    function placeMakerOrderInBatch(
        PlaceOrderInBatchParameters memory parameters,
        bytes calldata data
    ) external override lock returns (uint256[] memory orderIds) {
        uint256 amountTotal;
        (orderIds, amountTotal) = _placeMakerOrderInBatch(parameters.recipient, parameters.zero, parameters.orders);
        _processPlaceOrderReceiveAndCallback(parameters.zero, amountTotal, data);
    }

    function _placeMakerOrderInBatch(
        address recipient,
        bool zero,
        BoundaryLowerWithAmountParameters[] memory parameters
    ) private returns (uint256[] memory orderIds, uint256 amountTotal) {
        orderIds = new uint256[](parameters.length);
        uint256 orderId = _nextOrderIdInBatch(parameters.length);

        for (uint256 i = 0; i < parameters.length; ) {
            BoundaryLowerWithAmountParameters memory each = parameters[i];

            _processPlaceOrder(orderId, recipient, zero, each.boundaryLower, each.amount);
            orderIds[i] = orderId;

            unchecked {
                // next order id
                orderId++;
                i++;
            }

            amountTotal += each.amount;
        }
    }

    function _processPlaceOrder(
        uint256 orderId,
        address recipient,
        bool zero,
        int24 boundaryLower,
        uint128 amount
    ) private {
        // G_OAZ: order amount is zero
        require(amount > 0, "G_OAZ");
        // G_IBL: invalid boundary lower
        require(
            boundaryLower >= BoundaryMath.MIN_BOUNDARY &&
                boundaryLower + resolution <= BoundaryMath.MAX_BOUNDARY &&
                BoundaryMath.isValidBoundary(boundaryLower, resolution),
            "G_IBL"
        );

        // updates the boundary
        Boundary storage boundary = _boundaryAt(boundaryLower, zero);
        Bundle storage bundle;
        uint64 bundleId = boundary.bundle1Id;
        // 1. If bundle1 has been initialized, add the order to bundle1 directly
        // 2. If bundle0 is not initialized, add the order to bundle0 after initialization
        // 3. If bundle0 has been initialized, and bundle0 has been used,
        //    then bundle1 is initialized and the order is added to bundle1, otherwise, it is added to bundle0
        if (bundleId > 0) {
            bundle = bundles[bundleId];
            bundle.addLiquidity(amount);
        } else {
            uint64 bundle0Id = boundary.bundle0Id;
            if (bundle0Id == 0) {
                // initializes new bundle
                (bundleId, bundle) = _nextBundle(boundaryLower, zero);
                boundary.bundle0Id = bundleId;

                bundle.makerAmountTotal = amount;
                bundle.makerAmountRemaining = amount;
            } else {
                bundleId = bundle0Id;
                bundle = bundles[bundleId];

                uint128 makerAmountTotal = bundle.makerAmountTotal;
                uint128 makerAmountRemaining = bundle.makerAmountRemaining;

                if (makerAmountRemaining < makerAmountTotal) {
                    // initializes new bundle
                    (bundleId, bundle) = _nextBundle(boundaryLower, zero);
                    boundary.bundle1Id = bundleId;

                    bundle.makerAmountTotal = amount;
                    bundle.makerAmountRemaining = amount;
                } else {
                    bundle.addLiquidityWithAmount(makerAmountTotal, makerAmountRemaining, amount);
                }
            }
        }

        // saves order
        orders[orderId] = Order({owner: recipient, bundleId: bundleId, amount: amount});
        emit PlaceMakerOrder(orderId, recipient, bundleId, zero, boundaryLower, amount);

        // If the current boundary has no liquidity, it must be flipped
        uint128 makerAmountRemainingForBoundary = boundary.makerAmountRemaining;

        if (makerAmountRemainingForBoundary == 0) _flipBoundary(boundaryLower, zero);

        boundary.makerAmountRemaining = makerAmountRemainingForBoundary + amount;
    }

    function _processPlaceOrderReceiveAndCallback(bool zero, uint256 amount, bytes calldata data) private {
        // tokens to be received
        (address tokenToReceive, uint256 amount0, uint256 amount1) = zero
            ? (token0, amount, uint256(0))
            : (token1, uint256(0), amount);
        uint256 balanceBefore = IERC20(tokenToReceive).balanceOf(address(this));
        IGridPlaceMakerOrderCallback(_msgSender()).gridexPlaceMakerOrderCallback(amount0, amount1, data);
        uint256 balanceAfter = IERC20(tokenToReceive).balanceOf(address(this));
        // G_TPF: token pay failed
        require(balanceAfter - balanceBefore >= amount, "G_TPF");
    }

    /// @inheritdoc IGrid
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 priceLimitX96,
        bytes calldata data
    ) external override returns (int256 amount0, int256 amount1) {
        // G_ASZ: amount specified cannot be zero
        require(amountSpecified != 0, "G_ASZ");

        Slot0 memory slot0Cache = slot0;
        // G_PL: Grid locked
        require(slot0Cache.unlocked, "G_GL");
        // G_PLO: price limit over range
        require(zeroForOne ? priceLimitX96 < slot0Cache.priceX96 : priceLimitX96 > slot0Cache.priceX96, "G_PLO");

        // we lock the grid before swap
        slot0.unlocked = false;

        SwapState memory state = SwapState({
            zeroForOne: zeroForOne,
            amountSpecifiedRemaining: amountSpecified,
            amountInputCalculated: 0,
            feeAmountInputCalculated: 0,
            amountOutputCalculated: 0,
            priceX96: slot0Cache.priceX96,
            priceLimitX96: priceLimitX96,
            boundary: slot0Cache.boundary,
            boundaryLower: BoundaryMath.getBoundaryLowerAtBoundary(slot0Cache.boundary, resolution),
            initializedBoundaryLowerPriceX96: 0,
            initializedBoundaryUpperPriceX96: 0,
            stopSwap: false
        });

        mapping(int16 => uint256) storage counterBoundaryBitmap = _boundaryBitmaps(!zeroForOne);
        mapping(int24 => Boundary) storage counterBoundaries = _boundaries(!zeroForOne);
        while (state.amountSpecifiedRemaining != 0 && !state.stopSwap) {
            int24 boundaryNext;
            bool initialized;
            (
                boundaryNext,
                initialized,
                state.initializedBoundaryLowerPriceX96,
                state.initializedBoundaryUpperPriceX96
            ) = counterBoundaryBitmap.nextInitializedBoundary(
                state.boundary,
                state.priceX96,
                counterBoundaries[state.boundaryLower].makerAmountRemaining > 0,
                resolution,
                state.boundaryLower,
                state.zeroForOne
            );
            if (!initialized) break;

            // swap for boundary
            state.stopSwap = _processSwapForBoundary(counterBoundaryBitmap, counterBoundaries, boundaryNext, state);
        }

        // updates slot0
        if (state.priceX96 != slot0Cache.priceX96) {
            state.boundary = BoundaryMath.getBoundaryAtPriceX96(state.priceX96);
            uint32 blockTimestamp;
            // We only update the oracle in the first transaction of each block, using only the boundary
            // before the update to improve the security of the oracle
            if (
                slot0Cache.boundary != state.boundary &&
                slot0Cache.blockTimestamp != (blockTimestamp = uint32(block.timestamp))
            ) {
                IPriceOracle(priceOracle).update(slot0Cache.boundary, blockTimestamp);
                slot0.blockTimestamp = blockTimestamp;
            }

            (slot0.priceX96, slot0.boundary) = (state.priceX96, state.boundary);
        }

        (amount0, amount1) = _processTransferForSwap(state, recipient, data);
        emit Swap(_msgSender(), recipient, amount0, amount1, state.priceX96, state.boundary);

        // we unlock the grid after swap
        slot0.unlocked = true;
    }

    /// @dev Process swap for a given boundary
    /// @param counterBoundaryBitmap The boundary bitmap of the opposite side. When zeroForOne is true,
    /// it is the boundary bitmap of token1, otherwise it is the boundary bitmap of token0
    /// @param counterBoundaries The boundary of the opposite side. When zeroForOne is true,
    /// it is the boundary of token1, otherwise it is the boundary of token0
    /// @param boundaryNext The next boundary where liquidity exists
    /// @param state The state of the swap
    /// @return stopSwap stopSwap = true if the amount of swapped out is 0,
    /// or when the specified price limit is reached
    function _processSwapForBoundary(
        mapping(int16 => uint256) storage counterBoundaryBitmap,
        mapping(int24 => Boundary) storage counterBoundaries,
        int24 boundaryNext,
        SwapState memory state
    ) private returns (bool stopSwap) {
        SwapForBoundaryState memory swapForBoundaryState = SwapForBoundaryState({
            boundaryLowerPriceX96: state.initializedBoundaryLowerPriceX96,
            boundaryUpperPriceX96: state.initializedBoundaryUpperPriceX96,
            boundaryPriceX96: 0,
            priceX96: 0
        });
        // resets the current priceX96 to the price range
        (swapForBoundaryState.boundaryPriceX96, swapForBoundaryState.priceX96) = state.zeroForOne
            ? (
                swapForBoundaryState.boundaryLowerPriceX96,
                Uint160Math.minUint160(swapForBoundaryState.boundaryUpperPriceX96, state.priceX96)
            )
            : (
                swapForBoundaryState.boundaryUpperPriceX96,
                Uint160Math.maxUint160(swapForBoundaryState.boundaryLowerPriceX96, state.priceX96)
            );

        // when the price has reached the specified price limit, swapping stops
        if (
            (state.zeroForOne && swapForBoundaryState.priceX96 <= state.priceLimitX96) ||
            (!state.zeroForOne && swapForBoundaryState.priceX96 >= state.priceLimitX96)
        ) {
            return true;
        }

        Boundary storage boundary = counterBoundaries[boundaryNext];
        SwapMath.ComputeSwapStep memory step = SwapMath.computeSwapStep(
            swapForBoundaryState.priceX96,
            swapForBoundaryState.boundaryPriceX96,
            state.priceLimitX96,
            state.amountSpecifiedRemaining,
            boundary.makerAmountRemaining,
            takerFee
        );
        // when the amount of swapped out tokens is 0, swapping stops
        if (step.amountOut == 0) return true;

        // updates taker amount input and fee amount input
        state.amountInputCalculated = state.amountInputCalculated + step.amountIn;
        state.feeAmountInputCalculated = state.feeAmountInputCalculated + step.feeAmount;
        state.amountOutputCalculated = state.amountOutputCalculated + step.amountOut;
        state.amountSpecifiedRemaining = state.amountSpecifiedRemaining < 0
            ? state.amountSpecifiedRemaining + int256(uint256(step.amountOut))
            : state.amountSpecifiedRemaining - step.amountIn.toInt256() - int256(uint256(step.feeAmount));

        {
            Bundle storage bundle0 = bundles[boundary.bundle0Id];
            UpdateBundleForTakerParameters memory parameters = bundle0.updateForTaker(
                step.amountIn,
                step.amountOut,
                step.feeAmount
            );
            emit ChangeBundleForSwap(
                boundary.bundle0Id,
                -int256(uint256(parameters.amountOutUsed)),
                parameters.amountInUsed,
                parameters.takerFeeForMakerAmountUsed
            );

            // bundle0 has been fully filled
            if (bundle0.makerAmountRemaining == 0) {
                _activateBundle1(boundary);

                if (parameters.amountOutRemaining > 0) {
                    Bundle storage bundle1 = bundles[boundary.bundle0Id];
                    parameters = bundle1.updateForTaker(
                        parameters.amountInRemaining,
                        parameters.amountOutRemaining,
                        parameters.takerFeeForMakerAmountRemaining
                    );
                    emit ChangeBundleForSwap(
                        boundary.bundle0Id,
                        -int256(uint256(parameters.amountOutUsed)),
                        parameters.amountInUsed,
                        parameters.takerFeeForMakerAmountUsed
                    );
                    // bundle1 has been fully filled
                    if (bundle1.makerAmountRemaining == 0) {
                        _activateBundle1(boundary);
                    }
                }
            }
        }

        // updates remaining maker amount
        uint128 makerAmountRemaining;
        unchecked {
            makerAmountRemaining = boundary.makerAmountRemaining - step.amountOut;
        }
        boundary.makerAmountRemaining = makerAmountRemaining;
        // this boundary has been fully filled
        if (makerAmountRemaining == 0) counterBoundaryBitmap.flipBoundary(boundaryNext, resolution);

        state.priceX96 = step.priceNextX96;
        // when the price has reached the specified lower price, the boundary should equal to boundaryNext,
        // otherwise swapping stops and the boundary is recomputed
        state.boundary = boundaryNext;
        state.boundaryLower = boundaryNext;

        return false;
    }

    function _processTransferForSwap(
        SwapState memory state,
        address recipient,
        bytes calldata data
    ) private returns (int256 amount0, int256 amount1) {
        uint256 amountInputTotal = state.amountInputCalculated + state.feeAmountInputCalculated;
        uint256 amountOutputTotal = state.amountOutputCalculated;
        address tokenToPay;
        address tokenToReceive;
        (tokenToPay, tokenToReceive, amount0, amount1) = state.zeroForOne
            ? (token1, token0, SafeCast.toInt256(amountInputTotal), -SafeCast.toInt256(amountOutputTotal))
            : (token0, token1, -SafeCast.toInt256(amountOutputTotal), SafeCast.toInt256(amountInputTotal));

        // pays token to recipient
        SafeERC20.safeTransfer(IERC20(tokenToPay), recipient, amountOutputTotal);

        uint256 balanceBefore = IERC20(tokenToReceive).balanceOf(address(this));
        // receives token
        IGridSwapCallback(_msgSender()).gridexSwapCallback(amount0, amount1, data);
        uint256 balanceAfter = IERC20(tokenToReceive).balanceOf(address(this));
        // G_TRF: token to receive failed
        require(balanceAfter - balanceBefore >= amountInputTotal, "G_TRF");
    }

    /// @inheritdoc IGrid
    function settleMakerOrder(uint256 orderId) external override lock returns (uint128 amount0, uint128 amount1) {
        (amount0, amount1) = _settleMakerOrder(orderId);

        TokensOwed storage tokensOwed = tokensOweds[_msgSender()];
        if (amount0 > 0) tokensOwed.token0 = tokensOwed.token0 + amount0;
        if (amount1 > 0) tokensOwed.token1 = tokensOwed.token1 + amount1;
    }

    function _settleMakerOrder(uint256 orderId) private returns (uint128 amount0, uint128 amount1) {
        (bool zero, uint128 makerAmountOut, uint128 takerAmountOut, uint128 takerFeeAmountOut) = _processSettleOrder(
            orderId
        );
        (amount0, amount1) = zero
            ? (makerAmountOut, takerAmountOut + takerFeeAmountOut)
            : (takerAmountOut + takerFeeAmountOut, makerAmountOut);
    }

    /// @inheritdoc IGrid
    function settleMakerOrderAndCollect(
        address recipient,
        uint256 orderId,
        bool unwrapWETH9
    ) external override lock returns (uint128 amount0, uint128 amount1) {
        (amount0, amount1) = _settleMakerOrder(orderId);

        _collect(recipient, amount0, amount1, unwrapWETH9);
    }

    /// @inheritdoc IGrid
    function settleMakerOrderAndCollectInBatch(
        address recipient,
        uint256[] memory orderIds,
        bool unwrapWETH9
    ) external override lock returns (uint128 amount0Total, uint128 amount1Total) {
        (amount0Total, amount1Total) = _settleMakerOrderInBatch(orderIds);

        _collect(recipient, amount0Total, amount1Total, unwrapWETH9);
    }

    function _settleMakerOrderInBatch(
        uint256[] memory orderIds
    ) private returns (uint128 amount0Total, uint128 amount1Total) {
        for (uint256 i = 0; i < orderIds.length; i++) {
            (
                bool zero,
                uint128 makerAmountOut,
                uint128 takerAmountOut,
                uint128 takerFeeAmountOut
            ) = _processSettleOrder(orderIds[i]);
            (amount0Total, amount1Total) = zero
                ? (amount0Total + makerAmountOut, amount1Total + takerAmountOut + takerFeeAmountOut)
                : (amount0Total + takerAmountOut + takerFeeAmountOut, amount1Total + makerAmountOut);
        }
    }

    function _processSettleOrder(
        uint256 orderId
    ) private returns (bool zero, uint128 makerAmountOut, uint128 takerAmountOut, uint128 takerFeeAmountOut) {
        Order memory order = orders[orderId];
        // G_COO: caller is not the order owner
        require(order.owner == _msgSender(), "G_COO");

        // deletes order from storage
        delete orders[orderId];

        Bundle storage bundle = bundles[order.bundleId];
        zero = bundle.zero;

        uint128 makerAmountTotalNew;
        (makerAmountOut, takerAmountOut, takerFeeAmountOut, makerAmountTotalNew) = bundle.removeLiquidity(order.amount);

        emit ChangeBundleForSettleOrder(
            order.bundleId,
            -int256(uint256(order.amount)),
            -int256(uint256(makerAmountOut))
        );

        // removes liquidity from boundary
        Boundary storage boundary = _boundaryAt(bundle.boundaryLower, zero);
        uint64 bundle0Id = boundary.bundle0Id;
        if (bundle0Id == order.bundleId || boundary.bundle1Id == order.bundleId) {
            uint128 makerAmountRemaining = boundary.makerAmountRemaining - makerAmountOut;
            boundary.makerAmountRemaining = makerAmountRemaining;
            // all bundle liquidity is removed
            if (makerAmountTotalNew == 0) {
                // when the liquidity of bundle0 is fully removed:
                // 1. Activate directly when bundle1 has been initialized
                // 2. Reuse bundle0 to save gas
                if (bundle0Id == order.bundleId && boundary.bundle1Id > 0) _activateBundle1(boundary);
                if (makerAmountRemaining == 0) _flipBoundary(bundle.boundaryLower, zero);
            }
        }

        emit SettleMakerOrder(orderId, makerAmountOut, takerAmountOut, takerFeeAmountOut);
    }

    function _collect(address recipient, uint128 amount0, uint128 amount1, bool unwrapWETH9) private {
        if (amount0 > 0) {
            _collectSingle(recipient, token0, amount0, unwrapWETH9);
        }
        if (amount1 > 0) {
            _collectSingle(recipient, token1, amount1, unwrapWETH9);
        }
        emit Collect(_msgSender(), recipient, amount0, amount1);
    }

    function _collectSingle(address recipient, address token, uint128 amount, bool unwrapWETH9) private {
        if (unwrapWETH9 && token == weth9) {
            IWETHMinimum(token).withdraw(amount);
            Address.sendValue(payable(recipient), amount);
        } else {
            SafeERC20.safeTransfer(IERC20(token), recipient, amount);
        }
    }

    /// @inheritdoc IGrid
    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external override lock {
        uint256 balance0Before;
        uint256 balance1Before;

        if (amount0 > 0) {
            balance0Before = _balance0();
            SafeERC20.safeTransfer(IERC20(token0), recipient, amount0);
        }
        if (amount1 > 0) {
            balance1Before = _balance1();
            SafeERC20.safeTransfer(IERC20(token1), recipient, amount1);
        }

        IGridFlashCallback(_msgSender()).gridexFlashCallback(data);

        uint128 paid0;
        uint128 paid1;
        if (amount0 > 0) {
            uint256 balance0After = _balance0();
            paid0 = (balance0After - balance0Before).toUint128();
        }
        if (amount1 > 0) {
            uint256 balance1After = _balance1();
            paid1 = (balance1After - balance1Before).toUint128();
        }

        emit Flash(_msgSender(), recipient, amount0, amount1, paid0, paid1);
    }

    /// @inheritdoc IGrid
    function collect(
        address recipient,
        uint128 amount0Requested,
        uint128 amount1Requested
    ) external override lock returns (uint128 amount0, uint128 amount1) {
        (amount0, amount1) = _collectOwed(tokensOweds[_msgSender()], recipient, amount0Requested, amount1Requested);

        emit Collect(_msgSender(), recipient, amount0, amount1);
    }

    function _collectOwed(
        TokensOwed storage tokensOwed,
        address recipient,
        uint128 amount0Requested,
        uint128 amount1Requested
    ) private returns (uint128 amount0, uint128 amount1) {
        if (amount0Requested > 0) {
            amount0 = Uint128Math.minUint128(amount0Requested, tokensOwed.token0);
            unchecked {
                tokensOwed.token0 = tokensOwed.token0 - amount0;
            }

            SafeERC20.safeTransfer(IERC20(token0), recipient, amount0);
        }
        if (amount1Requested > 0) {
            amount1 = Uint128Math.minUint128(amount1Requested, tokensOwed.token1);
            unchecked {
                tokensOwed.token1 = tokensOwed.token1 - amount1;
            }
            SafeERC20.safeTransfer(IERC20(token1), recipient, amount1);
        }
    }

    function _balance0() private view returns (uint256) {
        return IERC20(token0).balanceOf(address(this));
    }

    function _balance1() private view returns (uint256) {
        return IERC20(token1).balanceOf(address(this));
    }

    /// @dev Returns the next order id
    function _nextOrderId() private returns (uint256 orderId) {
        orderId = ++_orderId;
    }

    /// @dev Returns the next order id in a given batch
    function _nextOrderIdInBatch(uint256 batch) private returns (uint256 orderId) {
        orderId = _orderId;
        _orderId = orderId + batch;
        unchecked {
            return orderId + 1;
        }
    }

    /// @dev Returns the next bundle id
    function _nextBundleId() private returns (uint64 bundleId) {
        bundleId = ++_bundleId;
    }

    /// @dev Creates and returns the next bundle and its corresponding id
    function _nextBundle(int24 boundaryLower, bool zero) private returns (uint64 bundleId, Bundle storage bundle) {
        bundleId = _nextBundleId();
        bundle = bundles[bundleId];
        bundle.boundaryLower = boundaryLower;
        bundle.zero = zero;
    }

    /// @dev Returns a mapping of the boundaries of either token0 or token1
    function _boundaries(bool zero) private view returns (mapping(int24 => Boundary) storage) {
        return zero ? boundaries0 : boundaries1;
    }

    /// @dev Returns the boundary of token0 or token1
    function _boundaryAt(int24 boundary, bool zero) private view returns (Boundary storage) {
        return zero ? boundaries0[boundary] : boundaries1[boundary];
    }

    /// @dev Flip the boundary of token0 or token1
    function _flipBoundary(int24 boundary, bool zero) private {
        _boundaryBitmaps(zero).flipBoundary(boundary, resolution);
    }

    /// @dev Returns the boundary bitmap of token0 or token1
    function _boundaryBitmaps(bool zero) private view returns (mapping(int16 => uint256) storage) {
        return zero ? boundaryBitmaps0 : boundaryBitmaps1;
    }

    /// @dev Closes bundle0 and activates bundle1
    function _activateBundle1(Boundary storage self) internal {
        self.bundle0Id = self.bundle1Id;
        self.bundle1Id = 0;
    }
}
