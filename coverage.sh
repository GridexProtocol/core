#!/bin/bash
# This script is used to generate coverage reports for the project.
# Because our GridAddress.sol contract relies on the compiled bytecode hash of the Grid.sol contract,
# and the coverage tool will automatically weave some code, so we need to re-modify the GRID_BYTES_CODE_HASH
# of GridAddress.sol after weaving

echo "pre instrument..."
npx hardhat coverage --solcoverjs .solcover.pre.js >> /dev/null

hash=`echo "const bytecode = require(\"./artifacts/contracts/Grid.sol/Grid.json\").bytecode; \
      const hash = require(\"ethers\").utils.keccak256(bytecode); \
      console.log(hash);" |node`

echo "recomputed byte code hash:${hash}"

originalCode=`cat ./contracts/libraries/GridAddress.sol`

name=`uname`
if [ "${name}" = "Darwin" ]; then
  sed -i "" "s/0x.*;/${hash};/" ./contracts/libraries/GridAddress.sol
else
  sed -i "s/0x.*;/${hash};/" ./contracts/libraries/GridAddress.sol
fi

echo "replace GridAddress.sol success"

echo "execute coverage..."
npx hardhat coverage

echo "${originalCode}" > ./contracts/libraries/GridAddress.sol

echo "recover GridAddress.sol success"
