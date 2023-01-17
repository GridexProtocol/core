// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IGridDeployer.sol";

contract GridDeployer is IGridDeployer {
    bytes public override gridCreationCode;
    Parameters public override parameters;

    function _changeGridCreationCode(bytes memory creationCode) internal {
        gridCreationCode = creationCode;
    }

    function _concatGridCreationCode(bytes memory code) internal {
        gridCreationCode = bytes.concat(gridCreationCode, code);
    }

    /// @dev Deploys a grid with desired parameters and clears these parameters after the deployment is complete
    /// @param token0 The first token in the grid, after sorting by address
    /// @param token1 The second token in the grid, after sorting by address
    /// @param resolution The step size in initialized boundaries for a grid created with a given fee
    /// @param takerFee The taker fee, denominated in hundredths of a bip (i.e. 1e-6)
    /// @param makerFee The maker fee, denominated in hundredths of a bip (i.e. 1e-6)
    /// @param priceOracle The address of the price oracle contract
    /// @param weth9 The address of the WETH9 contract
    /// @return grid The address of the deployed grid
    function deploy(
        address token0,
        address token1,
        int24 resolution,
        int24 takerFee,
        int24 makerFee,
        address priceOracle,
        address weth9
    ) internal returns (address grid) {
        parameters = Parameters(token0, token1, resolution, takerFee, makerFee, priceOracle, weth9);
        grid = Create2.deploy(0, keccak256(abi.encode(token0, token1, resolution)), gridCreationCode);
        delete parameters;
    }
}
