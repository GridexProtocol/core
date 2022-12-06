// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ITradingConfig.sol";

/// @title The implementation of trading config
contract TradingConfig is ITradingConfig, Ownable {
    int24 constant MAX_FEE = 1e6;
    int24 constant ALLOW_MAX_FEE = 1e4;

    address public override protocolFeeCollector;
    mapping(int24 => FeeConfig) public override fees;

    constructor() {
        fees[1] = FeeConfig({takerFee: 100, makerFee: -80});
        emit ResolutionEnabled(1, 100, -80);

        fees[5] = FeeConfig({takerFee: 500, makerFee: -400});
        emit ResolutionEnabled(5, 500, -400);

        fees[30] = FeeConfig({takerFee: 3000, makerFee: -2400});
        emit ResolutionEnabled(30, 3000, -2400);

        _transferProtocolFeeCollector(_msgSender());
    }

    /// @inheritdoc ITradingConfig
    function enableResolution(int24 resolution, int24 takerFee, int24 makerFee) external override onlyOwner {
        // TC_RGZ: resolution must be greater than 0
        require(resolution > 0, "TC_RGZ");
        // TC_RAE: resolution already enabled
        require(fees[resolution].takerFee == 0, "TC_RAE");
        // TC_TFZ: taker fee must be greater than 0
        require(takerFee > 0, "TC_TFZ");
        // TC_TFL: taker fee must be less than 1e4
        require(takerFee <= ALLOW_MAX_FEE, "TC_TFL");
        // TC_IMF: invalid maker fee
        require(makerFee <= 0 && -makerFee <= takerFee, "TC_IMF");
        fees[resolution] = FeeConfig({takerFee: takerFee, makerFee: makerFee});
        emit ResolutionEnabled(resolution, takerFee, makerFee);
    }

    /// @inheritdoc ITradingConfig
    function updateResolution(int24 resolution, int24 newTakerFee, int24 newMakerFee) external override onlyOwner {
        // TC_RME: resolution must be enabled
        require(fees[resolution].takerFee > 0, "TC_RME");
        // TC_TFZ: taker fee must be greater than 0
        require(newTakerFee > 0, "TC_TFZ");
        // TC_TFL: taker fee must be less than 1e4
        require(newTakerFee <= ALLOW_MAX_FEE, "TC_TFL");
        // TC_IMF: invalid maker fee
        require(newMakerFee <= 0 && -newMakerFee <= newTakerFee, "TC_IMF");
        fees[resolution] = FeeConfig({takerFee: newTakerFee, makerFee: newMakerFee});
        emit ResolutionUpdated(resolution, newTakerFee, newMakerFee);
    }

    /// @inheritdoc ITradingConfig
    function transferProtocolFeeCollector(address newCollector) external override onlyOwner {
        _transferProtocolFeeCollector(newCollector);
    }

    function _transferProtocolFeeCollector(address newCollector) internal {
        // TC_PFCZ: protocol fee collector must be non-zero
        require(newCollector != address(0), "TC_PFCZ");
        address oldCollector = protocolFeeCollector;

        protocolFeeCollector = newCollector;
        emit ProtocolFeeCollectorTransferred(_msgSender(), oldCollector, newCollector);
    }
}
